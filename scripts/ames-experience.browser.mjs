import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {canonicalAgentFixture,productFixture} from './ames-fixtures.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const payload=canonicalAgentFixture(productFixture('TAN10101',3));
payload.snapshot_id='1';payload.summary.snapshot_id='1';
for(const rows of Object.values(payload.datasets))for(const row of rows)row.snapshot_id='1';
const harness=`
import {createAmesStore} from './ames/data/store.mjs';
import {createConsoleView} from './ames/console-view.mjs';
import {installLoginReturn} from './core/login-navigation.mjs';
const store=createAmesStore(); let locale='pt-BR',available=false,view,requests=[];
const payload=${JSON.stringify(payload)};
store.replaceSyncedSnapshots([payload]);
function mount(){view?.clear();view=createConsoleView(document.querySelector('#mesConsole'),store,{locale:()=>locale,transport:{fetcher:async(url,options)=>{
  requests.push({url,method:options.method});if(!available)throw Error('Failed to fetch');
  const p=new URL(url).pathname.replace('/api/v1','');
  const routes={'/health':{agent_version:'0.5.23',mes_scheduler:{policy:'fifo-monitor-skip-v1'},engine_found:true,chrome_cdp_reachable:true,ames_reachable:true,auto_3022_ready:true,preflight:{python:true,dependencies:true,playwright:true,sqlite:true}},'/v2/capabilities':{schema:'central-ames-v2',native_console:true,cursor:true,revision:true,process_timeline:true},'/config':{configured_lines:['TAN10101'],performance:'balanced'},'/monitor':{enabled:false},'/v2/snapshots':{snapshots:[]}};
  if(!routes[p])throw Error('Unexpected route '+p);return {ok:true,json:async()=>routes[p]};
}},history:{list:async()=>[{...${JSON.stringify({owner_uid:'synthetic',key:'a'.repeat(64),line_id:'TAN10101',source_id:'test-source',collected_at:payload.collected_at})},period_start:'2026-10-08T07:00',period_end:'2026-10-08T17:00',products:'CPH2859V'}],open:async()=>payload}});view.render();}
document.querySelectorAll('.page').forEach(el=>el.classList.add('hidden'));
document.querySelector('#mesConsoleView')?.classList.remove('hidden');
document.querySelector('#accountScreen').classList.add('hidden');
document.querySelector('[data-page=home]')?.addEventListener('click',()=>{document.querySelector('#mesConsole').hidden=true;});
installLoginReturn(document,location);
window.qa={mount,store,requests,lang(value){locale=value;document.documentElement.lang=value;view.render();},agent(value){available=value;mount();},theme(dark){document.body.classList.toggle('dark',dark);document.documentElement.classList.toggle('dark',dark);}};mount();
`;
const html=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')+'<script type="module" src="/Central-de-Controle-/qa.mjs"></script>';
const root=process.cwd(),server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://local').pathname);
  if(pathname==='/release-build.json'){res.setHeader('content-type','application/json');return res.end(JSON.stringify({sha:'a'.repeat(40),branch:'test'}));}
  if(pathname.endsWith('/qa.mjs')){res.setHeader('content-type','text/javascript');return res.end(harness);}
  if(pathname==='/Central-de-Controle-/'){res.setHeader('content-type','text/html');return res.end(html);}
  const file=path.resolve(root,pathname.replace(/^\/Central-de-Controle-\//,''));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.statusCode=404;return res.end();}
  res.setHeader('content-type',file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'image/svg+xml');res.end(fs.readFileSync(file));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined,channel:process.env.PLAYWRIGHT_CHANNEL||undefined});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const out=process.env.BROWSER_OUTPUT||'../browser-evidence';fs.mkdirSync(out,{recursive:true});
try{
  await page.goto('http://127.0.0.1:'+server.address().port+'/Central-de-Controle-/');await page.waitForFunction(()=>!!window.qa);
  await page.getByRole('button',{name:'Usar somente dados compartilhados',exact:true}).click();
  assert.match(await page.locator('[data-preparation]').innerText(),/MES local não disponível/);
  assert.equal(await page.evaluate(()=>qa.requests.filter(r=>r.method==='POST').length),0);
  const untranslated=new Set();
  for(const lang of ['pt-BR','en-US'])for(const dark of [false,true]){
    await page.evaluate(({lang,dark})=>{qa.lang(lang);qa.theme(dark);},{lang,dark});
    for(const id of ['monitor','top3','failures','sn','trace','reuse','process','base','knowledge']){
      await page.locator('[data-console-view="'+id+'"]').click();
      assert.equal(await page.locator('[data-console-pane="'+id+'"]').isVisible(),true);
      const colors=await page.locator('.ames-legacy-shell').evaluate(el=>({bg:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color}));
      assert.notEqual(colors.bg,colors.color);
      if(dark){const surfaces=await page.locator('[data-console-pane="'+id+'"] .mes-context-panel').evaluateAll(els=>els.map(el=>getComputedStyle(el).backgroundColor));assert(surfaces.every(c=>c!=='rgb(255, 255, 255)'),id+' has white cards in dark mode');}
      if(lang==='en-US'){
        const texts=await page.locator('[data-ames-shell]').evaluate(el=>{const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),out=[];let n;while(n=w.nextNode()){if(!n.parentElement.closest('td,pre,code,style,script,[data-no-i18n]')&&n.nodeValue.trim())out.push(n.nodeValue.trim());}return out;});
        for(const text of texts)if(/[áàãâéêíóôõúç]|\b(?:Coleta|Linha|Falhas|Nenhum|Somente|Buscar|Pronto|Indisponivel)\b/.test(text))untranslated.add(text);
      }
    }
    await page.locator('[data-console-view=monitor]').click();
    await page.screenshot({path:path.join(out,'console-'+lang+'-'+(dark?'dark':'light')+'.png'),fullPage:true});
  }
  fs.writeFileSync(path.join(out,'untranslated.json'),JSON.stringify([...untranslated].sort(),null,2));
  assert.deepEqual([...untranslated],[],'Portuguese UI text remains in the English Console');
  await page.evaluate(()=>qa.lang('en-US'));
  assert.match(await page.locator('[data-console-view=monitor]').innerText(),/^◉\s*Monitoring$/);
  await page.locator('[data-console-view=base]').click();await page.locator('[data-history-panel] summary').click();
  await page.getByRole('button',{name:'Query history',exact:true}).click();await page.getByRole('button',{name:'Open',exact:true}).click();
  await page.waitForSelector('[data-period-snapshot] table');assert.match(await page.locator('[data-period-snapshot]').innerText(),/SYNTHETIC-PCBA/);
  await page.locator('[data-console-view=knowledge]').click();await page.locator('[data-knowledge-q]').fill('SYNTHETIC-PCBA');await page.locator('[data-knowledge-run]').click();assert.match(await page.locator('[data-knowledge-result]').innerText(),/SYNTHETIC-PCBA/);
  await page.evaluate(()=>qa.agent(true));await page.waitForFunction(()=>qa.store.agent().status==='connected');
  assert.equal(await page.evaluate(()=>qa.requests.filter(r=>r.method==='POST').length),0);
  await page.locator('[data-console-setup]').click();assert.match(await page.locator('[data-preparation]').innerText(),/Not verified|Não verificado/);
  await page.getByText('Installation on a new computer is still blocked',{exact:true}).waitFor();
  const preparationText=await page.locator('[data-preparation]').innerText();
  fs.writeFileSync(path.join(out,'preparation-text.txt'),preparationText);
  assert.doesNotMatch(preparationText,/[áàãâéêíóôõúç]|\b(?:dedicado|Verificando|Pendente)\b/);
  assert.equal(await page.locator('[data-preparation]').getByText('Ready for testing',{exact:true}).count(),0);
  await page.setViewportSize({width:390,height:844});await page.locator('[data-console-menu]').click();await page.locator('[data-console-view=top3]').click();assert.equal(await page.locator('[data-console-menu]').getAttribute('aria-expanded'),'false');
  await page.waitForFunction(()=>document.querySelector('.ames-legacy-sidebar').getBoundingClientRect().right<=0);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(out,'console-mobile-dark.png'),animations:'disabled'});
  await page.locator('[data-console-back]').click();assert.equal(await page.locator('#mesConsole').isVisible(),false);
  await page.locator('#accountScreen').evaluate(el=>el.classList.remove('hidden'));
  for(const dark of [false,true]){
    await page.evaluate(d=>qa.theme(d),dark);const input=page.locator('#loginForm input[type=email]');await input.focus();
    const style=await input.evaluate(el=>({caret:getComputedStyle(el).caretColor,bg:getComputedStyle(el).backgroundColor,outline:getComputedStyle(el).outlineStyle}));
    assert.notEqual(style.caret,style.bg);assert.equal(style.outline,'solid');
  }
  assert.equal(await page.locator('[data-login-central]').getAttribute('href'),'/Central-de-Controle-/');
  assert.deepEqual(errors,[]);
  console.log('PASS: 9 views × PT/EN × light/dark; shared viewer; agent; first-run; period history; CORA; mobile; back; login focus/caret.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
