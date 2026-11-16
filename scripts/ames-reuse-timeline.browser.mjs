import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {reuseTimelineFixture} from './fixtures/reuse-timeline.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const fixture=reuseTimelineFixture();
const harness=`import {mountReuseCohorts} from '/ames/console-reuse-cohorts.mjs';
const fixture=${JSON.stringify(fixture)};window.qa={calls:{repairs:0,operators:0},fixture};
mountReuseCohorts(document.querySelector('#root'),fixture.snapshot,{
 cachedRepairHistory:async()=>{qa.calls.repairs++;return fixture.repairs;},
 cached3022Operators:async()=>{qa.calls.operators++;return fixture.operators;}});`;
const root=process.cwd(),server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://local').pathname;
 if(name==='/'){res.setHeader('content-type','text/html');return res.end('<html lang="pt-BR"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/ames/console-improvements.css"><body><main id="root"></main><script type="module" src="/qa.mjs"></script></body></html>');}
 if(name==='/qa.mjs'){res.setHeader('content-type','text/javascript');return res.end(harness);}
 const file=path.resolve(root,'.'+name);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}
 res.setHeader('content-type',file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':'text/plain');res.end(fs.readFileSync(file));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined});
const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.locator('[data-cohort-kind="pcbas"][data-cohort-metric="observed"]').click();
 const detail=page.locator('details[data-cohort-row]').first();await detail.locator('summary').first().click();
 await page.waitForFunction(()=>qa.calls.repairs===1&&qa.calls.operators===1);
 await page.waitForTimeout(50);
 assert.equal(await detail.locator('table').count(),1,'ONE operational timeline, no second 3012 table');
 assert.equal(await detail.locator('[data-reuse-timeline-row]').count(),8);
 for(const text of ['Reparadora Alfa','Reparador Beta','Operadora Gama','Autor histórico zero','Comentário completo Alfa','Comentário independente Beta <seguro>']){
  const element=detail.getByText(text,{exact:false}).first();assert.equal(await element.isVisible(),true,text);
 }
 const historical=detail.locator('[data-source-view="2114"]');
 for(const forbidden of ['Reparadora Alfa','Reparador Beta','Operadora Gama','Comentário completo Alfa'])assert.ok(!(await historical.allInnerTexts()).some(x=>x.includes(forbidden)),forbidden+' copied to 2114');
 await detail.locator('summary').first().click();await detail.locator('summary').first().click();
 await page.waitForTimeout(50);assert.deepEqual(await page.evaluate(()=>qa.calls),{repairs:1,operators:1});
 assert.deepEqual(errors,[]);
 const out=process.env.BROWSER_OUTPUT||'../issue85-browser';fs.mkdirSync(out,{recursive:true});
 await page.screenshot({path:path.join(out,'reuse-timeline-pt.png'),fullPage:true});
 console.log('U1b Chromium PASS: eight independent events, one table, visible names/comments, one cache read per board');
}finally{await browser.close();await new Promise(r=>server.close(r));}
