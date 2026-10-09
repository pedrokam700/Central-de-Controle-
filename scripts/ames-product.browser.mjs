// Isolated smoke of the real Product shell/renderers with synthetic data.
// No Firebase/Auth, collector or production network. Optional environment:
// PLAYWRIGHT_MODULE, BROWSER_CHANNEL, PRODUCT_SCREENSHOTS (same conventions as Dashboard).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { productFixture } from './ames-fixtures.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const app = fs.readFileSync('app.js', 'utf8');
const extract = (start, end) => { assert(app.includes(start) && app.includes(end)); return app.slice(app.indexOf(start), app.indexOf(end)); };
const harness = `
import { createAmesStore, clearSessionData } from './ames/data/store.mjs';
import { createProductView } from './ames/product-view.mjs';
import { escapeHtml as esc } from './ames/evidence-view.mjs';
const state = { ames:createAmesStore(), products:[{code:'CPH2859V',baseCode:'CPH2859',family:'TEST'}, {code:'CPH2859',family:'TEST'}, {code:'CPH9999',family:'TEST'}],
  reports:[{id:'MANUAL-V',product:'CPH2859V',component:'TEST',updates:[{date:'2026-10-08T12:00:00Z',text:'Manual history'}]},
    {id:'MANUAL-BASE',product:'CPH2859'}, {id:'MANUAL-FAMILY',scopeType:'family',family:'TEST'}] };
let activeProduct='CPH2859V', currentAuthUser={uid:'synthetic'}, activeView='product', currentLanguage='pt-BR';
const t=x=>x, ordered=x=>x, calculatedStatus=()=> 'pendente', formatDate=x=>String(x||''), remaining=()=>[], safeLink=()=>'', chip=x=>esc(x);
${extract('    const productBaseCode =', '    const normalizeAssignment =')}
${extract('    function setOptions(', '    function renderAll()')}
${extract("document.querySelectorAll('.product-tab').forEach(btn => {", "    document.querySelectorAll('.close-confirm')")}
document.querySelector('#accountScreen').classList.add('hidden');
document.querySelector('#homeView').classList.add('hidden');
document.querySelector('#productView').classList.remove('hidden');
window.productTest={
  replace(docs){state.ames.replaceRemoteDocuments(docs);renderProductMes();},
  replaceSilent(docs){state.ames.replaceRemoteDocuments(docs);},
  select(code){activeProduct=code;renderProduct();},
  render(){renderProductMes();},
  clear(){clearSessionData(state);productMesView?.clear();currentAuthUser=null;renderProduct();},
  reports(){return JSON.stringify(state.reports);}
};
renderProduct();
`;
const html = fs.readFileSync('index.html', 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace('</html>', '<script type="module" src="./product-test-harness.mjs"></script></html>');
const allowed = new Set(['mobile.css', 'ames/dashboard.css', 'ames/product.css', 'ames/product-view.mjs', 'ames/trace-view.mjs','ames/data/trace.mjs','ames/evidence-view.mjs', 'ames/occurrence-view.mjs', 'ames/data/failures.mjs', 'ames/data/product.mjs', 'ames/data/contract.mjs', 'ames/data/store.mjs', 'manifest.webmanifest']);
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.replace(/^\/Central-de-Controle-\//, '');
  if (name === 'index.html') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(html); }
  if (name === 'product-test-harness.mjs') { res.setHeader('Content-Type', 'text/javascript; charset=utf-8'); return res.end(harness); }
  if (!allowed.has(name)) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', name.endsWith('.mjs') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'application/json');
  res.end(fs.readFileSync(name));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = []; page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/Central-de-Controle-/index.html`);
  await page.waitForFunction(() => window.productTest);
  const a = productFixture(), b = productFixture('TAN10102', 10);
  a.payload.defects[0].defect_desc = '<img src=x onerror="window.INJECTED=true">';
  a.payload.defects[0].pcba_sn = 'LONG-SYNTHETIC-SN-'.repeat(20);
  const replace = docs => page.evaluate(docs => window.productTest.replace(docs), docs);
  const select = code => page.evaluate(code => window.productTest.select(code), code);
  const line1 = page.locator('#productMes-TAN10101'), line2 = page.locator('#productMes-TAN10102');
  const reports = await page.evaluate(() => window.productTest.reports());
  assert.equal(await page.locator('#productMes [data-product-mes-action="records"]').count(), 0);
  await replace([a, b]);
  assert.equal(await line1.locator('.product-mes-count strong').innerText(), '30');
  assert.equal(await line2.locator('.product-mes-count strong').innerText(), '5');
  assert.match(await line1.innerText(), /Cobertura parcial da linha: 60 registros carregados/);
  assert.match(await page.locator('#productMes-TAN10103').innerText(), /Dados indisponíveis/);
  assert.equal(await page.locator('#prodTotalCount').innerText(), '2');
  await page.locator('#productManualReports').click();
  assert.equal(await page.locator('#tab-falhas').isVisible(), true);
  assert.equal(await page.locator('#productRows tr').count(), 2);
  assert.match(await page.locator('#productRows').innerText(), /MANUAL-V/);
  assert.doesNotMatch(await page.locator('#productRows').innerText(), /MANUAL-BASE/);
  await page.locator('.product-tab[data-tab="historico"]').click();
  assert.match(await page.locator('#productHistoryTimeline').innerText(), /Manual history/);
  await page.locator('.product-tab[data-tab="geral"]').click();
  console.log('PASS: per-line exact CPH counts, partial/source metadata, manual report scope and history preserved');

  await line1.locator('[data-product-mes-action="records"]').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#productMes-TAN10101-title').evaluate(el => el === document.activeElement), true);
  assert.equal(await line1.locator('.mes-record-list li').count(), 25);
  assert.equal(await line1.locator('.mes-record-list img').count(), 0);
  assert.equal(await page.evaluate(() => Boolean(window.INJECTED)), false);
  assert.equal(await line1.locator('.mes-record-list dd').allTextContents().then(xs => xs.includes('CPH2859')), false);
  await line1.locator('[data-product-mes-action="next"]').click();
  assert.equal(await line1.locator('.mes-record-list li').count(), 5);
  assert.match(await line1.locator('.mes-record-list li').first().innerText(), /SYNTHETIC-PCBA-50/);
  await line2.locator('[data-product-mes-action="records"]').click();
  assert.equal(await line2.locator('.mes-record-list li').count(), 5);
  await select('CPH2859');
  assert.equal(await page.locator('.product-mes-evidence:visible').count(), 0);
  await line1.locator('[data-product-mes-action="records"]').click();
  assert.equal(await line1.locator('.mes-record-list dd').allTextContents().then(xs => xs.includes('CPH2859V')), false);
  assert.match(await page.locator('#productRows').innerText(), /MANUAL-BASE/);
  assert.doesNotMatch(await page.locator('#productRows').innerText(), /MANUAL-V/);
  console.log('PASS: keyboard, pagination, escaping, CPH2859V vs CPH2859, detail reset on product change');

  await select('CPH2859V');
  await line1.locator('[data-product-mes-action="records"]').click();
  const correction = productFixture(); correction.payload.defects[0].pcba_sn = 'CORRECTED-SAME-ID';
  await replace([correction, b]);
  assert.equal(await line1.locator('.product-mes-evidence').isVisible(), false);
  assert.equal(await page.locator('#productMes-TAN10101-records').evaluate(el=>el===document.activeElement),true);
  assert.match(await line1.locator('[role="status"]').innerText(), /Dados atualizados/);
  await line1.locator('[data-product-mes-action="records"]').click();
  assert.match(await line1.locator('.mes-record-list').innerText(), /CORRECTED-SAME-ID/);
  assert.equal(await page.evaluate(() => { const node=document.querySelector('#productMes-TAN10101-records'); window.productTest.render(); return node===document.querySelector('#productMes-TAN10101-records'); }), true);
  assert.equal(await page.evaluate(() => window.productTest.reports()), reports);
  await line1.locator('[data-product-mes-action="records"]').click();
  await page.evaluate(docs=>window.productTest.replaceSilent(docs),[a,b]);
  await line1.locator('[data-product-mes-action="records"]').click();
  assert.equal(await line1.locator('.product-mes-evidence').isVisible(),false);
  await select('CPH9999');
  assert.match(await line1.innerText(),/Nenhuma ocorrência de CPH9999 na lista disponível/);
  assert.equal(await page.locator('#productMes [data-product-mes-action="records"]').count(),0);
  await select('CPH2859V');
  await replace([a,b]);
  await line1.locator('[data-product-mes-action="records"]').click();

  for (const width of [360,390,768,1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo(0,0));
    if (width <= 860) await page.waitForFunction(() => document.querySelector('.sidebar').getBoundingClientRect().right <= 0);
    const overflow=await page.locator('#productMes').evaluate(root=>[...root.querySelectorAll('*')].filter(el=>el.getClientRects().length &&
      (el.getBoundingClientRect().left < -1 || el.getBoundingClientRect().right > innerWidth+1 || el.scrollWidth > el.clientWidth+2)).map(el=>el.id||el.tagName));
    assert.deepEqual(overflow,[],`MES overflow ${width}`);
    const tabsFit=await page.locator('.product-tab').evaluateAll(els=>els.every(el=>el.getBoundingClientRect().right<=innerWidth+1));
    assert.equal(tabsFit,true,`Product tabs clipped at ${width}`);
    if(process.env.PRODUCT_SCREENSHOTS){fs.mkdirSync(process.env.PRODUCT_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.PRODUCT_SCREENSHOTS,`product-${width}.png`)});}
  }
  await page.setViewportSize({ width:390,height:900 });
  await page.evaluate(()=>{document.documentElement.style.zoom='2';});
  assert.deepEqual(await page.locator('#productMes').evaluate(root=>[...root.querySelectorAll('*')].filter(el=>el.getClientRects().length &&
    (el.getBoundingClientRect().right > innerWidth+1 || el.scrollWidth > el.clientWidth+2)).map(el=>el.id||el.tagName)),[]);
  await page.evaluate(()=>{document.documentElement.style.zoom='';});
  console.log('PASS: update with same snapshot ID closes detail, stable read skips DOM, 360/390/768/1280px and CSS zoom 200%');

  await replace([b]);
  assert.equal(await line1.locator('[data-product-mes-action="records"]').count(),0);
  assert.match(await line1.innerText(),/Dados indisponíveis/);
  await select('UNREGISTERED');
  assert.equal(await page.locator('#productMes [data-product-mes-line]').count(),0);
  assert.match(await page.locator('#activeProductTitle').innerText(),/Selecione/);
  await select('CPH2859V');
  await page.evaluate(()=>window.productTest.clear());
  assert.equal(await page.locator('#productMes').innerText(),'');
  assert.deepEqual(errors,[]);
  console.log('PASS: deletion, missing product, logout remove stale evidence; no browser JS errors');
} finally {
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
