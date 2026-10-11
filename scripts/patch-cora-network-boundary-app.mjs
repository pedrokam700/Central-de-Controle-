import fs from 'node:fs';

const APP='app.js';
const TEST='scripts/ames-cora-network-boundary-app.test.mjs';
let app=fs.readFileSync(APP,'utf8');

const importAnchor="    import {legacyAccountMigrationInventory,legacyMigrationProgress} from './core/legacy-account-migration.mjs';\n";
const importLine="    import {prepareCoraNetworkRequest} from './core/cora-network-boundary.mjs';\n";
if((app.split(importAnchor).length-1)!==1)throw new Error('legacy migration import anchor changed');
if(app.includes(importLine))throw new Error('CORA network boundary import already present');
app=app.replace(importAnchor,importAnchor+importLine);

const marker='    async function aiPostJSON(url, payload){';
const start=app.indexOf(marker);
if(start<0)throw new Error('aiPostJSON marker missing');
if(app.indexOf(marker,start+marker.length)>=0)throw new Error('aiPostJSON marker duplicated');
const open=app.indexOf('{',start);
let depth=0,end=-1,state='code';
for(let i=open;i<app.length;i++){
  const ch=app[i],next=app[i+1];
  if(state==='single'){
    if(ch==='\\')i++;
    else if(ch==="'")state='code';
    continue;
  }
  if(state==='double'){
    if(ch==='\\')i++;
    else if(ch==='"')state='code';
    continue;
  }
  if(state==='template'){
    if(ch==='\\')i++;
    else if(ch==='`')state='code';
    continue;
  }
  if(state==='lineComment'){
    if(ch==='\n')state='code';
    continue;
  }
  if(state==='blockComment'){
    if(ch==='*'&&next==='/'){state='code';i++;}
    continue;
  }
  if(ch==="'"){state='single';continue;}
  if(ch==='"'){state='double';continue;}
  if(ch==='`'){state='template';continue;}
  if(ch==='/'&&next==='/'){state='lineComment';i++;continue;}
  if(ch==='/'&&next==='*'){state='blockComment';i++;continue;}
  if(ch==='{')depth++;
  else if(ch==='}'){
    depth--;
    if(depth===0){end=i+1;break;}
  }
}
if(end<0)throw new Error('could not locate aiPostJSON function end');
const original=app.slice(start,end);
if(!original.includes('await fetch(url'))throw new Error('aiPostJSON no longer uses expected direct fetch');
if(!original.includes('headers.Authorization=`Bearer ${token}`'))throw new Error('aiPostJSON auth header anchor changed');

const replacement=`    async function aiPostJSON(url, payload){
      const token=auth?.currentUser?await auth.currentUser.getIdToken():null;
      const headers={'Content-Type':'application/json'}; if(token)headers.Authorization=\`Bearer \${token}\`;
      const prepared=prepareCoraNetworkRequest({
        url,
        origin:window.location.origin,
        method:'POST',
        payload,
        sanitized:false,
        approvedExternalOrigins:[],
        headers
      });
      const res=await fetch(prepared.url,{method:'POST',headers:prepared.headers,body:JSON.stringify(prepared.payload)});
      const data=await res.json().catch(()=>({}));
      if(!res.ok)throw new Error(data?.error||\`HTTP \${res.status}\`);
      return data;
    }`;
app=app.slice(0,start)+replacement+app.slice(end);
fs.writeFileSync(APP,app);

fs.writeFileSync(TEST,`import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('app.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');

function functionText(name){
  const marker='async function '+name+'(';
  const start=app.indexOf(marker);
  assert.ok(start>=0,name+' missing');
  const next=app.indexOf('\\n    async function ',start+marker.length);
  const nextSync=app.indexOf('\\n    function ',start+marker.length);
  const candidates=[next,nextSync].filter(x=>x>start);
  return app.slice(start,candidates.length?Math.min(...candidates):start+3000);
}

test('aiPostJSON routes requests through destination boundary before fetch',()=>{
  assert.match(app,/import \\{prepareCoraNetworkRequest\\} from ['\"]\\.\\/core\\/cora-network-boundary\\.mjs['\"]/);
  const fn=functionText('aiPostJSON');
  assert.match(fn,/prepareCoraNetworkRequest\\(\\{/);
  assert.match(fn,/origin:window\\.location\\.origin/);
  assert.match(fn,/method:['\"]POST['\"]/);
  assert.match(fn,/approvedExternalOrigins:\[\]/);
  assert.match(fn,/headers\\.Authorization=`Bearer \\$\\{token\\}`/);
  assert.match(fn,/fetch\\(prepared\\.url,\\{method:['\"]POST['\"],headers:prepared\\.headers,body:JSON\\.stringify\\(prepared\\.payload\\)\\}\\)/);
  assert.doesNotMatch(fn,/fetch\\(url,/);
});

test('no mutable browser config can approve an external provider through aiPostJSON',()=>{
  const fn=functionText('aiPostJSON');
  assert.match(fn,/approvedExternalOrigins:\[\]/);
  assert.doesNotMatch(fn,/CORA_EXTERNAL_ORIGINS|FAILURE_AI_ENDPOINT|localStorage|sessionStorage/);
});

test('offline shell contains destination boundary module',()=>{
  assert.match(sw,/core\\/cora-network-boundary\\.mjs/);
});
`);

console.log(JSON.stringify({aiPostJSON_boundary:true,external_origins_from_runtime_config:false},null,2));
