import fs from 'node:fs';

const APP='app.js';
const TEST='scripts/ames-cora-direct-fetch-boundary-app.test.mjs';
let app=fs.readFileSync(APP,'utf8');

const directFetchCount=(app.match(/\bfetch\(/g)||[]).length;
if(directFetchCount!==10)throw new Error(`expected 10 fetch() calls before CORA direct-fetch hardening, found ${directFetchCount}`);
if(app.includes('async function coraAppFetch('))throw new Error('coraAppFetch already present');
if((app.match(/\bcoraAppFetch\(/g)||[]).length)throw new Error('coraAppFetch calls already present');

function functionRange(name){
  const marker=`    async function ${name}(`;
  const start=app.indexOf(marker);
  if(start<0)throw new Error(`${name} marker missing`);
  const open=app.indexOf('{',start);
  let depth=0,end=-1,state='code';
  for(let i=open;i<app.length;i++){
    const ch=app[i],next=app[i+1];
    if(state==='single'){if(ch==='\\')i++;else if(ch==="'")state='code';continue;}
    if(state==='double'){if(ch==='\\')i++;else if(ch==='"')state='code';continue;}
    if(state==='template'){if(ch==='\\')i++;else if(ch==='`')state='code';continue;}
    if(state==='lineComment'){if(ch==='\n')state='code';continue;}
    if(state==='blockComment'){if(ch==='*'&&next==='/'){state='code';i++;}continue;}
    if(ch==="'"){state='single';continue;}
    if(ch==='"'){state='double';continue;}
    if(ch==='`'){state='template';continue;}
    if(ch==='/'&&next==='/'){state='lineComment';i++;continue;}
    if(ch==='/'&&next==='*'){state='blockComment';i++;continue;}
    if(ch==='{')depth++;
    else if(ch==='}'&&--depth===0){end=i+1;break;}
  }
  if(end<0)throw new Error(`${name} end not found`);
  return {start,end};
}

const aiPost=functionRange('aiPostJSON');
const aiPostText=app.slice(aiPost.start,aiPost.end);
if((aiPostText.match(/\bfetch\(/g)||[]).length!==1)throw new Error('aiPostJSON raw fetch contract changed');
const protectedAiPost=aiPostText.replace('fetch(','__CORA_AI_POST_RAW_FETCH__(');
app=app.slice(0,aiPost.start)+protectedAiPost+app.slice(aiPost.end);

const remaining=(app.match(/\bfetch\(/g)||[]).length;
if(remaining!==9)throw new Error(`expected 9 remaining direct CORA fetches, found ${remaining}`);
app=app.replace(/\bfetch\(/g,'coraAppFetch(');
app=app.replace('__CORA_AI_POST_RAW_FETCH__(','fetch(');

const updatedAiPostStart=app.indexOf('    async function aiPostJSON(');
const updatedAiPostEnd=(()=>{
  const marker='    async function aiPostJSON(';
  const start=updatedAiPostStart,open=app.indexOf('{',start);let depth=0,state='code';
  for(let i=open;i<app.length;i++){
    const ch=app[i],next=app[i+1];
    if(state==='single'){if(ch==='\\')i++;else if(ch==="'")state='code';continue;}
    if(state==='double'){if(ch==='\\')i++;else if(ch==='"')state='code';continue;}
    if(state==='template'){if(ch==='\\')i++;else if(ch==='`')state='code';continue;}
    if(state==='lineComment'){if(ch==='\n')state='code';continue;}
    if(state==='blockComment'){if(ch==='*'&&next==='/'){state='code';i++;}continue;}
    if(ch==="'"){state='single';continue;} if(ch==='"'){state='double';continue;} if(ch==='`'){state='template';continue;}
    if(ch==='/'&&next==='/'){state='lineComment';i++;continue;} if(ch==='/'&&next==='*'){state='blockComment';i++;continue;}
    if(ch==='{')depth++; else if(ch==='}'&&--depth===0)return i+1;
  }
  throw new Error('updated aiPostJSON end not found');
})();

const helper=`\n    async function coraAppFetch(url, options={}){\n      const method=String(options.method||'GET').toUpperCase();\n      let payload;\n      if(Object.prototype.hasOwnProperty.call(options,'body')){\n        if(typeof options.body!=='string')throw new Error('CORA request body must be JSON text.');\n        try{payload=JSON.parse(options.body);}catch{throw new Error('CORA request body must contain valid JSON.');}\n      }\n      const prepared=prepareCoraNetworkRequest({\n        url,\n        origin:window.location.origin,\n        method,\n        payload,\n        sanitized:false,\n        approvedExternalOrigins:[],\n        headers:options.headers||{}\n      });\n      const request={...options,method,headers:prepared.headers};\n      if(payload===undefined)delete request.body;\n      else request.body=JSON.stringify(prepared.payload);\n      return fetch(prepared.url,request);\n    }`;
app=app.slice(0,updatedAiPostEnd)+helper+app.slice(updatedAiPostEnd);

const rawFetchAfter=(app.match(/\bfetch\(/g)||[]).length;
const guardedCalls=(app.match(/\bcoraAppFetch\(/g)||[]).length;
if(rawFetchAfter!==2)throw new Error(`expected only aiPostJSON + coraAppFetch raw fetches, found ${rawFetchAfter}`);
if(guardedCalls!==10)throw new Error(`expected helper definition plus 9 guarded calls, found ${guardedCalls}`);
if(!app.includes("const endpoint=window.FAILURE_AI_ENDPOINT||'/api/failure-analysis';"))throw new Error('mutable failure endpoint compatibility anchor changed');

fs.writeFileSync(APP,app);

fs.writeFileSync(TEST,`import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport fs from 'node:fs';\n\nconst app=fs.readFileSync('app.js','utf8');\n\nfunction fn(name){\n  const marker='async function '+name+'(';\n  const start=app.indexOf(marker);\n  assert.ok(start>=0,name+' missing');\n  const next=app.indexOf('\\n    async function ',start+marker.length);\n  const nextSync=app.indexOf('\\n    function ',start+marker.length);\n  const candidates=[next,nextSync].filter(x=>x>start);\n  return app.slice(start,candidates.length?Math.min(...candidates):start+5000);\n}\n\ntest('all CORA direct requests use coraAppFetch and only boundary helpers retain raw fetch',()=>{\n  assert.equal((app.match(/\\bfetch\\(/g)||[]).length,2);\n  assert.equal((app.match(/\\bcoraAppFetch\\(/g)||[]).length,10);\n  const helper=fn('coraAppFetch');\n  assert.match(helper,/prepareCoraNetworkRequest\\(\\{/);\n  assert.ok(helper.includes('approvedExternalOrigins:[]'));\n  assert.match(helper,/origin:window\\.location\\.origin/);\n  assert.match(helper,/return fetch\\(prepared\\.url,request\\)/);\n});\n\ntest('mutable FAILURE_AI_ENDPOINT cannot bypass the destination boundary',()=>{\n  const run=fn('aiRun');\n  assert.match(run,/window\\.FAILURE_AI_ENDPOINT\\|\\|['\"]\\/api\\/failure-analysis['\"]/);\n  assert.match(run,/coraAppFetch\\(endpoint,/);\n  assert.doesNotMatch(run,/\\bfetch\\(endpoint,/);\n  const helper=fn('coraAppFetch');\n  assert.ok(helper.includes('approvedExternalOrigins:[]'));\n  assert.doesNotMatch(helper,/FAILURE_AI_ENDPOINT|localStorage|sessionStorage|CORA_EXTERNAL_ORIGINS/);\n});\n\ntest('local-only CORA features remain same-origin boundary calls with original routes',()=>{\n  for(const route of ['/api/ai-audit','/api/ai-metrics','/api/investigation-artifact','/api/generate-slides','/api/generate-image','/api/failure-intake','/api/failure-analysis/stream','/api/chat-cognitive','/api/transcribe-audio']){\n    assert.ok(app.includes(route),route+' missing');\n  }\n  assert.doesNotMatch(app,/fetch\\(['\"]\\/api\\//);\n});\n\ntest('coraAppFetch preserves GET-without-body and POST JSON semantics',()=>{\n  const helper=fn('coraAppFetch');\n  assert.match(helper,/method=String\\(options\\.method\\|\\|['\"]GET['\"]\\)\\.toUpperCase\\(\\)/);\n  assert.match(helper,/JSON\\.parse\\(options\\.body\\)/);\n  assert.match(helper,/if\\(payload===undefined\\)delete request\\.body/);\n  assert.match(helper,/request\\.body=JSON\\.stringify\\(prepared\\.payload\\)/);\n});\n`);

console.log(JSON.stringify({raw_fetches_before:10,guarded_direct_requests:9,raw_fetches_after:2,external_runtime_approval:false},null,2));
