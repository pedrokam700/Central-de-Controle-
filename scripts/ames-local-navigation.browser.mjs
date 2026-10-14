// Real deployed index, local entry, offline-bootstrap and full app.js.
// Firebase is a test-only network fixture; production Auth is not modified.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'central-nav-'));
execFileSync(process.execPath,['scripts/build-static.mjs'],{env:{...process.env,CENTRAL_STATIC_OUT:tmp},stdio:'pipe'});
const index=path.join(tmp,'Central-de-Controle-/index.html');
fs.writeFileSync(index,fs.readFileSync(index,'utf8').replace('src="/Central-de-Controle-/offline-bootstrap.mjs?v=15.1.13.49"','src="/Central-de-Controle-/core/local-entry.mjs"').replace(/<script id="central-runtime-boot-guard">[\s\S]*?<\/script>/,''));
const fixture=`
const user={uid:'synthetic-user',email:'synthetic@example.invalid',displayName:'Teste de navegação'};
const auth={currentUser:user},app={};
export const initializeApp=()=>app,getApps=()=>[app],getApp=()=>app,getAuth=()=>auth;
export const setPersistence=async()=>{},browserLocalPersistence={},getFirestore=()=>({}),initializeFirestore=()=>({}),persistentLocalCache=()=>({}),persistentMultipleTabManager=()=>({});
export const doc=(db,...parts)=>({parts,kind:'doc'}),collection=(db,...parts)=>({parts,kind:'collection'}),query=r=>r,where=()=>({});
const profile={name:user.displayName,email:user.email,role:'user'};
export const getDoc=async r=>({exists:()=>r.parts[0]==='users',data:()=>profile});
const empty={docs:[],empty:true,forEach:()=>{},exists:()=>false,data:()=>null};
export const getDocs=async()=>empty;
export const onSnapshot=(r,cb)=>{const t=setTimeout(()=>cb(empty),10);return ()=>clearTimeout(t);};
export const onAuthStateChanged=(a,cb)=>{setTimeout(()=>cb(user),20);return ()=>{};};
export const setDoc=async()=>{},addDoc=async()=>({id:'test'}),deleteDoc=async()=>{},updateDoc=async()=>{},writeBatch=()=>({set(){},commit:async()=>{}}),runTransaction=async(d,f)=>f({get:async()=>empty,set(){}});
export const signInWithEmailAndPassword=async()=>({user}),createUserWithEmailAndPassword=async()=>({user}),sendPasswordResetEmail=async()=>{},confirmPasswordReset=async()=>{},sendEmailVerification=async()=>{},signOut=async()=>{};
`;
const server=http.createServer((req,res)=>{const p=new URL(req.url,'http://local').pathname;let f=path.resolve(tmp,'.'+p);if(p.endsWith('/'))f=path.join(f,'index.html');if(!f.startsWith(tmp+path.sep)||!fs.existsSync(f)){res.statusCode=404;return res.end();}res.setHeader('content-type',/\.(mjs|js)$/.test(f)?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.html')?'text/html':f.endsWith('.json')?'application/json':'image/svg+xml');res.end(fs.readFileSync(f));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined});
const page=await browser.newPage({viewport:{width:1920,height:1080},serviceWorkers:'block'}),errors=[],imports=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>imports.push(r.url()));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname==='www.gstatic.com')return route.fulfill({contentType:'text/javascript',body:fixture});if(u.hostname==='127.0.0.1'&&u.port!== '8765')return route.continue();return route.abort();});
page.on('dialog',d=>d.dismiss());
const out=process.env.BROWSER_OUTPUT||'../browser-evidence';fs.mkdirSync(out,{recursive:true});
try{
 const url='http://127.0.0.1:'+server.address().port+'/Central-de-Controle-/';
 await page.goto(url);await page.waitForFunction(()=>window.__centralLocalReady===true);
 assert.equal(await page.locator('[data-console-back]').isVisible(),true);
 const localWidth=await page.locator('.app > .main').evaluate(el=>el.getBoundingClientRect().width);assert(localWidth>1800,'Local console still constrained by hidden sidebar grid');
 await page.locator('[data-console-back]').click();await page.waitForURL('**/?online=1');
 await page.waitForSelector('.app.auth-ready');await page.locator('#homeView').waitFor({state:'visible'});
 assert(imports.some(u=>u.includes('/offline-bootstrap.mjs')));assert(imports.some(u=>u.includes('/app.js')));
 assert.equal(await page.locator('.central-local-home').count(),0);
 assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('central-local-workstation')),false);
 assert.equal(await page.locator('.sidebar').isVisible(),true);assert.equal(await page.locator('.topbar').isVisible(),true);
 const layout=await page.locator('.app > .main').evaluate(el=>({width:el.getBoundingClientRect().width,left:el.getBoundingClientRect().left}));assert(layout.width>1400&&layout.left>=200,JSON.stringify(layout));
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:path.join(out,'central-complete-1920x1080.png'),fullPage:true});
 await page.locator('.main-nav [data-page=work]').click();await page.locator('#workView').waitFor({state:'visible'});
 await page.locator('.main-nav [data-page=home]').click();await page.locator('#homeView').waitFor({state:'visible'});
 await page.locator('.main-nav [data-local-console-return]').click();await page.waitForURL(url);await page.waitForFunction(()=>window.__centralLocalReady===true);
 assert.equal(await page.locator('[data-console-view=trace]').isVisible(),true);
 await page.screenshot({path:path.join(out,'console-local-return-1920x1080.png'),fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS: real local entry -> complete Central/Auth/native navigation at 1920x1080 -> explicit offline Console return; no placeholder or narrow grid.');
}catch(error){await page.screenshot({path:path.join(out,'navigation-failure.png'),fullPage:true});fs.writeFileSync(path.join(out,'navigation-failure.json'),JSON.stringify({error:error.message,errors,imports,text:await page.locator('body').innerText()},null,2));throw error;}finally{await browser.close();await new Promise(r=>server.close(r));fs.rmSync(tmp,{recursive:true,force:true});}
