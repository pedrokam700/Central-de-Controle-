import fs from 'node:fs';

let app=fs.readFileSync('app.js','utf8');
let sw=fs.readFileSync('sw.js','utf8');

if((app.match(/\bfetch\(/g)||[]).length!==2)throw new Error('expected two reviewed raw fetch primitives before transport extraction');
if((app.match(/\bcoraAppFetch\(/g)||[]).length!==12)throw new Error('expected 11 guarded call sites plus coraAppFetch declaration');
const oldImport="    import {prepareCoraNetworkRequest} from './core/cora-network-boundary.mjs';";
if((app.split(oldImport).length-1)!==1)throw new Error('network boundary import anchor changed');
app=app.replace(oldImport,"    import {createCoraBrowserTransport} from './core/cora-browser-transport.mjs';");

const authAnchor='    const auth = getAuth(app);';
if((app.split(authAnchor).length-1)!==1)throw new Error('auth initialization anchor changed');
app=app.replace(authAnchor,`${authAnchor}\n    const coraBrowserTransport=createCoraBrowserTransport({\n      fetcher:globalThis.fetch.bind(globalThis),\n      getOrigin:()=>window.location.origin,\n      getToken:async()=>auth?.currentUser?await auth.currentUser.getIdToken():null\n    });`);

function functionRange(source,name){
  const marker=`    async function ${name}(`;
  const start=source.indexOf(marker);
  if(start<0)throw new Error(`${name} missing`);
  const open=source.indexOf('{',start);
  let depth=0,state='code';
  for(let i=open;i<source.length;i++){
    const ch=source[i],next=source[i+1];
    if(state==='single'){if(ch==='\\')i++;else if(ch==="'")state='code';continue;}
    if(state==='double'){if(ch==='\\')i++;else if(ch==='"')state='code';continue;}
    if(state==='template'){if(ch==='\\')i++;else if(ch==='`')state='code';continue;}
    if(state==='lineComment'){if(ch==='\n')state='code';continue;}
    if(state==='blockComment'){if(ch==='*'&&next==='/'){state='code';i++;}continue;}
    if(ch==="'"){state='single';continue;} if(ch==='"'){state='double';continue;} if(ch==='`'){state='template';continue;}
    if(ch==='/'&&next==='/'){state='lineComment';i++;continue;} if(ch==='/'&&next==='*'){state='blockComment';i++;continue;}
    if(ch==='{')depth++; else if(ch==='}'&&--depth===0)return {start,end:i+1};
  }
  throw new Error(`${name} end missing`);
}

for(const [name,replacement] of [
  ['aiPostJSON',"    async function aiPostJSON(url,payload){ return coraBrowserTransport.postJSON(url,payload); }"],
  ['coraAppFetch',"    async function coraAppFetch(url,options={}){ return coraBrowserTransport.fetch(url,options); }"]
]){
  const range=functionRange(app,name);
  app=app.slice(0,range.start)+replacement+app.slice(range.end);
}

if((app.match(/\bfetch\(/g)||[]).length!==0)throw new Error('app.js must not retain raw fetch primitives after transport extraction');
if((app.match(/\bcoraAppFetch\(/g)||[]).length!==12)throw new Error('CORA guarded call topology changed during extraction');
if(app.includes('prepareCoraNetworkRequest'))throw new Error('app.js still depends on boundary implementation details');

const swAnchor="BASE+'core/cora-network-boundary.mjs',";
if((sw.split(swAnchor).length-1)!==1)throw new Error('service worker network boundary cache anchor changed');
sw=sw.replace(swAnchor,`${swAnchor}BASE+'core/cora-browser-transport.mjs',`);

fs.writeFileSync('app.js',app);
fs.writeFileSync('sw.js',sw);

fs.writeFileSync('scripts/ames-cora-network-boundary-app.test.mjs',`import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport fs from 'node:fs';\n\nconst app=fs.readFileSync('app.js','utf8');\nconst sw=fs.readFileSync('sw.js','utf8');\n\nfunction fn(name){\n  const marker='async function '+name+'(';\n  const start=app.indexOf(marker);\n  assert.ok(start>=0,name+' missing');\n  const next=app.indexOf('\\n    async function ',start+marker.length);\n  const nextSync=app.indexOf('\\n    function ',start+marker.length);\n  const candidates=[next,nextSync].filter(x=>x>start);\n  return app.slice(start,candidates.length?Math.min(...candidates):start+1200);\n}\n\ntest('app delegates CORA browser networking to extracted transport',()=>{\n  assert.match(app,/import \\{createCoraBrowserTransport\\} from ['\"]\\.\\/core\\/cora-browser-transport\\.mjs['\"]/);\n  assert.doesNotMatch(app,/import \\{prepareCoraNetworkRequest\\}/);\n  assert.match(app,/createCoraBrowserTransport\\(\\{/);\n  assert.match(app,/fetcher:globalThis\\.fetch\\.bind\\(globalThis\\)/);\n  assert.match(app,/getOrigin:\(\)=>window\\.location\\.origin/);\n  assert.match(app,/getToken:async\(\)=>auth\\?\\.currentUser\\?await auth\\.currentUser\\.getIdToken\\(\\):null/);\n});\n\ntest('aiPostJSON and coraAppFetch are thin delegates, not duplicate policy implementations',()=>{\n  assert.match(fn('aiPostJSON'),/return coraBrowserTransport\\.postJSON\\(url,payload\\)/);\n  assert.match(fn('coraAppFetch'),/return coraBrowserTransport\\.fetch\\(url,options\\)/);\n  assert.doesNotMatch(app,/prepareCoraNetworkRequest/);\n});\n\ntest('offline shell caches both destination boundary and browser transport modules',()=>{\n  assert.match(sw,/core\\/cora-network-boundary\\.mjs/);\n  assert.match(sw,/core\\/cora-browser-transport\\.mjs/);\n});\n`);

fs.writeFileSync('scripts/ames-cora-direct-fetch-boundary-app.test.mjs',`import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport fs from 'node:fs';\n\nconst app=fs.readFileSync('app.js','utf8');\n\nfunction fn(name){\n  const marker='async function '+name+'(';\n  const start=app.indexOf(marker);\n  assert.ok(start>=0,name+' missing');\n  const next=app.indexOf('\\n    async function ',start+marker.length);\n  const nextSync=app.indexOf('\\n    function ',start+marker.length);\n  const candidates=[next,nextSync].filter(x=>x>start);\n  return app.slice(start,candidates.length?Math.min(...candidates):start+3000);\n}\n\ntest('app.js contains no raw fetch primitive after transport extraction',()=>{\n  assert.equal((app.match(/\\bfetch\\(/g)||[]).length,0);\n  assert.equal((app.match(/\\bcoraAppFetch\\(/g)||[]).length,12);\n});\n\ntest('mutable FAILURE_AI_ENDPOINT remains behind coraAppFetch',()=>{\n  const run=fn('aiRun');\n  assert.match(run,/window\\.FAILURE_AI_ENDPOINT\\|\\|['\"]\\/api\\/failure-analysis['\"]/);\n  assert.match(run,/coraAppFetch\\(endpoint,/);\n  assert.doesNotMatch(run,/\\bfetch\\(endpoint,/);\n});\n\ntest('reviewed CORA routes remain present but cannot bypass the extracted transport',()=>{\n  for(const route of ['/api/ai-audit','/api/ai-metrics','/api/investigation-artifact','/api/generate-slides','/api/generate-image','/api/failure-intake','/api/failure-analysis/stream','/api/chat-cognitive','/api/transcribe-audio'])assert.ok(app.includes(route),route+' missing');\n  assert.doesNotMatch(app,/fetch\\(['\"]\\/api\\//);\n  assert.doesNotMatch(app,/prepareCoraNetworkRequest/);\n});\n`);

console.log(JSON.stringify({module:'core/cora-browser-transport.mjs',app_raw_fetches:0,guarded_call_sites:11,behavior_change:false},null,2));
