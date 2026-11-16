import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const run=spawnSync(process.env.PYTHON_BIN||'python3',['scripts/agent-3074-physical-classification.test.py','--fixture'],{encoding:'utf8'});
assert.equal(run.status,0,run.stderr);
const canonical=JSON.parse(run.stdout);
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const harness=`import {normalizeCanonical} from '/ames/data/canonical.mjs';
import {mountReuseCohorts} from '/ames/console-reuse-cohorts.mjs';
window.qa={show(lang,dark){document.documentElement.lang=lang;document.body.classList.toggle('dark',dark);
mountReuseCohorts(document.querySelector('#root'),normalizeCanonical(${JSON.stringify(canonical)}));}};qa.show('pt-BR',false);`;
const root=process.cwd(),server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://local').pathname;
 if(name==='/'){res.setHeader('content-type','text/html');return res.end('<html lang="pt-BR"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/ames/console-theme.css"><link rel="stylesheet" href="/ames/console-improvements.css"><body><main id="root" class="ames-legacy-shell" data-reuse-cohorts></main><script type="module" src="/qa.mjs"></script></body></html>');}
 if(name==='/qa.mjs'){res.setHeader('content-type','text/javascript');return res.end(harness);}
 const file=path.resolve(root,'.'+name);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}
 res.setHeader('content-type',file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':'text/plain');res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined});
const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
 await page.goto('http://127.0.0.1:'+server.address().port);
 for(const lang of ['pt-BR','en-US'])for(const dark of [false,true]){
  await page.evaluate(({lang,dark})=>qa.show(lang,dark),{lang,dark});
  const metric=(kind,key)=>page.locator(`[data-cohort-kind="${kind}"][data-cohort-metric="${key}"]`);
  for(const [kind,counts] of [['pcbas',{observed:4,first_use:1,reused:3,unknown_use:0}],
                             ['components',{observed:4,first_use:1,reused:2,unknown_use:1}]]){
   for(const [key,count] of Object.entries(counts))assert.equal(await metric(kind,key).locator('.stat-value').innerText(),String(count));
   assert.equal(await page.locator(`[data-reuse-partition="${kind}"]`).getAttribute('data-partition-valid'),'true');
  }
  await metric('components','reused').click();
  let summaries=await page.locator('[data-cohort-row] > summary').allTextContents();
  assert.equal(summaries.length,2);assert(summaries.some(text=>text.includes('M2')&&text.includes('2º')));
  assert(summaries.some(text=>text.includes('M3')&&text.includes('3º')));
  await metric('components','unknown_use').click();
  summaries=await page.locator('[data-cohort-row] > summary').allTextContents();
  assert.equal(summaries.length,1);assert.match(summaries[0],/M4/);
  assert.doesNotMatch(summaries[0],/[123]º\s*(?:uso|use)/);
  const out=process.env.BROWSER_OUTPUT||'../3074-browser';fs.mkdirSync(out,{recursive:true});
  await page.screenshot({path:path.join(out,`physical3074-${lang}-${dark?'dark':'light'}.png`),fullPage:true});
 }
 assert.deepEqual(errors,[]);
 console.log('3074 Chromium PASS: scanner/SQLite/canonical 1st/2nd/3rd/unknown, conserved partitions, PT/EN × themes');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
