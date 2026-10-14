import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const playwrightPath=process.env.PLAYWRIGHT_MODULE;
if(!playwrightPath)throw new Error('PLAYWRIGHT_MODULE is required');
const {chromium}=await import(pathToFileURL(playwrightPath).href);
const out=process.env.BROWSER_OUTPUT||path.resolve('.tmp-console-evidence');
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});

await page.goto(pathToFileURL(path.resolve('index.html')).href);
await page.waitForFunction(()=>window.__AMES_QA__);
const qa=await page.evaluateHandle(()=>window.__AMES_QA__);
await page.evaluate(()=>qa.login());
await page.locator('[data-open-mes-console]').click();
await page.locator('[data-ames-shell]').waitFor({state:'visible'});

const views=['monitor','top3','failures','sn','trace','reuse','process','base','knowledge'];
assert.equal(await page.locator('[data-console-view]').count(),9,'Console must keep exactly nine canonical views');
for(const id of views)assert.equal(await page.locator(`[data-console-view="${id}"]`).count(),1,`missing view ${id}`);
assert.equal(await page.locator('iframe').count(),0,'Console must remain native, not iframe-based');

await page.locator('[data-console-view=monitor]').click();
assert.equal(await page.locator('[data-console-pane=monitor]').isVisible(),true);
await page.getByText('Monitoramento',{exact:true}).waitFor();
await page.getByText('Motor local',{exact:true}).waitFor();

await page.locator('[data-console-view=sn]').click();
await page.locator('[data-sn-input]').fill('002527TEST');
await page.locator('[data-sn-submit]').click();
await page.waitForTimeout(50);
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
  if(lang==='en-US'){
    await page.locator('[data-console-view=top3]').click();
    await page.getByText('Top 3 & FPY · quick summary',{exact:true}).waitFor();
    await page.getByText('Daily failures · operational view',{exact:true}).waitFor();
    await page.locator('[data-console-view=process]').click();
    await page.getByText('Full history since the beginning of A-MES',{exact:true}).waitFor();
    await page.getByText('Manual period: the query follows the selected dates.',{exact:true}).waitFor();
    await page.getByText('Advanced filters',{exact:true}).waitFor();
    const historyConfig=page.locator('[data-console-pane=process] .ames-3012-workstation-config');
    assert.equal(await historyConfig.evaluate(el=>el.open),false,'workstation historical configuration must stay collapsed by default');
    await historyConfig.locator('summary').click();
    await page.getByText('Known A-MES start date',{exact:true}).waitFor();
    await page.getByText(/Used by .Full history. mode\. This is a workstation setting and normally only needs to be configured once\./).waitFor();
    await historyConfig.locator('summary').click();
    assert.equal(await historyConfig.evaluate(el=>el.open),false,'test must restore collapsed state between theme passes');
  }
  await page.locator('[data-console-view=monitor]').click();
  await page.screenshot({path:path.join(out,'console-'+lang+'-'+(dark?'dark':'light')+'.png'),fullPage:true});
}
fs.writeFileSync(path.join(out,'untranslated.json'),JSON.stringify([...untranslated].sort(),null,2));
assert.deepEqual([...untranslated],[],'Portuguese UI text remains in the English Console');

await page.evaluate(()=>qa.theme(false));
await page.locator('[data-console-view=top3]').click();
await page.setViewportSize({width:390,height:844});
await page.screenshot({path:path.join(out,'console-mobile-top3.png'),fullPage:true});
const overflow=await page.locator('[data-console-pane=top3]').evaluate(el=>el.scrollWidth-el.clientWidth);
assert(overflow<=2,`top3 mobile horizontal overflow: ${overflow}px`);

await browser.close();
console.log('PASS: Console experience preserves nine native views, themes, languages and mobile layout.');