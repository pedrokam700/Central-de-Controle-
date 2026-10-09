// Isolated browser smoke: real shell HTML/CSS + native renderer/store, synthetic data.
// No Firebase, authentication, service worker, collector, or production network.
// Run: node scripts/ames-dashboard.browser.mjs
// Optional: PLAYWRIGHT_MODULE (absolute module path), BROWSER_CHANNEL (chrome/msedge),
// DASHBOARD_SCREENSHOTS (directory for screenshots).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { fixture } from './ames-fixtures.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const root = process.cwd();
const app = fs.readFileSync('app.js', 'utf8');
const shellRender = app.slice(app.indexOf('    let dashboardMesView;'), app.indexOf('    function renderDashboard()'));
const harness = `
import { createAmesStore } from './ames/data/store.mjs';
import { createDashboardView } from './ames/dashboard-view.mjs';
const state = { ames: createAmesStore() };
let currentAuthUser = {uid:'synthetic-test'}, activeView = 'dashboard', currentLanguage = 'pt-BR';
${shellRender}
document.querySelector('#accountScreen').classList.add('hidden');
document.querySelectorAll('main.main > section, main.main > div > section.overview').forEach(el => el.classList.add('hidden'));
document.querySelector('#homeView').classList.add('hidden');
document.querySelector('#dashboardView').classList.remove('hidden');
window.dashboardTest = {
  replace(docs) {state.ames.replaceRemoteDocuments(docs); renderDashboardMes();},
  clear() {state.ames.clear(); dashboardMesView?.clear(); currentAuthUser = null;},
  render() {renderDashboardMes();}
};
renderDashboardMes();
`;
const html = fs.readFileSync('index.html', 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace('</html>', '<script type="module" src="./test-harness.mjs"></script></html>');
const allowed = new Set(['mobile.css', 'ames/dashboard.css', 'ames/dashboard-view.mjs', 'ames/trace-view.mjs','ames/data/trace.mjs','ames/evidence-view.mjs', 'ames/occurrence-view.mjs', 'ames/data/failures.mjs', 'ames/product.css', 'ames/data/dashboard.mjs', 'ames/data/contract.mjs', 'ames/data/store.mjs', 'icons/cora-192.svg', 'icons/cora-512.svg', 'manifest.webmanifest']);
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.replace(/^\/Central-de-Controle-\//, '');
  if (name === 'index.html') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(html); }
  if (name === 'test-harness.mjs') { res.setHeader('Content-Type', 'text/javascript; charset=utf-8'); return res.end(harness); }
  if (!allowed.has(name)) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', name.endsWith('.mjs') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'application/json');
  res.end(fs.readFileSync(path.join(root, name)));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/Central-de-Controle-/index.html`);
  await page.waitForFunction(() => window.dashboardTest);
  assert.equal(await page.locator('#dashMesRecords').isDisabled(), true);
  const a = fixture(), b = fixture('TAN10102', 10);
  a.payload.defects[0].defect_desc = '<img src=x onerror="window.INJECTED=true">';
  const replace = docs => page.evaluate(docs => window.dashboardTest.replace(docs), docs);
  await replace([a, b]);
  assert.match(await page.locator('#dashboardMes').innerText(), /Cobertura parcial.*60 registros disponíveis.*200 falhas/s);
  assert.equal(await page.locator('.mes-metrics article').count(), 4);
  await page.locator('#dashMesRecords').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('.mes-record-list li').count(), 25);
  assert.equal(await page.locator('#dashMesEvidenceTitle').evaluate(el => el === document.activeElement), true);
  assert.equal(await page.locator('.mes-record-list img').count(), 0);
  assert.equal(await page.evaluate(() => Boolean(window.INJECTED)), false);
  await page.locator('#dashMesNext').click();
  assert.match(await page.locator('.mes-record-list li').first().innerText(), /SYNTHETIC-PCBA-25/);
  await page.locator('#dashMesNext').click();
  assert.equal(await page.locator('.mes-record-list li').count(), 10);
  assert.equal(await page.locator('#dashMesNext').isDisabled(), true);
  console.log('PASS: partial coverage, exact paginated records, keyboard focus, escaped source fields');

  await page.locator('#dashMesProduct').selectOption('CPH3028');
  assert.equal(await page.locator('#dashMesRecords .stat-value').innerText(), '30');
  assert.equal(await page.locator('.mes-metrics article .stat-value').allTextContents().then(xs => xs.every(x => x === '—')), true);
  await page.locator('[data-mes-code="D2"]').click();
  assert.equal(await page.locator('.mes-record-list li').count(), 10);
  assert.equal(await page.locator('.mes-record-list dd').allTextContents().then(xs => xs.includes('CPH3028V')), false);
  await page.locator('#dashMesLine').selectOption('TAN10102');
  assert.equal(await page.locator('#dashMesProduct').inputValue(), '');
  assert.equal(await page.locator('#dashMesRecords .stat-value').innerText(), '10');
  await page.locator('#dashMesLine').selectOption('TAN10103');
  assert.equal(await page.locator('#dashMesRecords').isDisabled(), true);
  assert.equal(await page.locator('#dashMesRecords .stat-value').innerText(), '—');
  console.log('PASS: exact CPH/defect, hidden out-of-scope aggregates, line isolation, unavailable vs zero');

  await page.locator('#dashMesLine').selectOption('TAN10101');
  await page.locator('#dashMesRecords').click();
  const changed = fixture(); changed.payload.defects[0].pcba_sn = 'CORRECTED-SAME-SNAPSHOT-ID';
  await replace([changed]);
  assert.equal(await page.locator('#dashMesEvidence').isVisible(), false);
  assert.match(await page.locator('.mes-coverage').innerText(), /Dados atualizados/);
  await page.locator('#dashMesRecords').click();
  assert.match(await page.locator('.mes-record-list li').first().innerText(), /CORRECTED-SAME-SNAPSHOT-ID/);
  assert.equal(await page.evaluate(() => { const node = document.querySelector('#dashMesRecords'); window.dashboardTest.render(); return node === document.querySelector('#dashMesRecords'); }), true);
  console.log('PASS: replacement with same snapshot ID closes stale detail; unchanged read skips DOM rebuild');

  for (const width of [360, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    if (width <= 860) await page.waitForFunction(() => document.querySelector('.sidebar').getBoundingClientRect().right <= 0);
    const overflow = await page.locator('#dashboardMes').evaluate(root => [...root.querySelectorAll('*')].filter(el => {
      if (!el.getClientRects().length) return false;
      const rect = el.getBoundingClientRect();
      return rect.left < -1 || rect.right > innerWidth + 1 || el.scrollWidth > el.clientWidth + 2;
    }).map(el => el.id || el.tagName));
    assert.deepEqual(overflow, [], `Visible MES content overflow at ${width}px`);
    assert.equal(await page.locator('#dashMesLine').evaluate(el => {
      const rect = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(rect.left + 5, rect.top + rect.height / 2));
    }), true, `Line selector occluded at ${width}px`);
    if (process.env.DASHBOARD_SCREENSHOTS) {
      fs.mkdirSync(process.env.DASHBOARD_SCREENSHOTS, { recursive: true });
      await page.screenshot({ path: path.join(process.env.DASHBOARD_SCREENSHOTS, `dashboard-${width}.png`) });
    }
  }
  console.log('PASS: no clipped/overflowing MES content at 360/390/768/1280px');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  const clippedAtZoom = await page.locator('#dashboardMes').evaluate(root => [...root.querySelectorAll('*')].filter(el =>
    el.getClientRects().length && (el.getBoundingClientRect().right > innerWidth + 1 || el.scrollWidth > el.clientWidth + 2)).map(el => el.id || el.tagName));
  assert.deepEqual(clippedAtZoom, [], 'MES content clipped at CSS zoom 200%');
  await page.evaluate(() => { document.documentElement.style.zoom = ''; });
  const blankCode = fixture(); blankCode.payload.defects[0].defect_code = '';
  await replace([blankCode]);
  await page.locator('#dashMesDefect').selectOption(JSON.stringify(''));
  assert.equal(await page.locator('#dashMesRecords .stat-value').innerText(), '1');
  await page.locator('#dashMesRecords').click();
  assert.equal(await page.locator('.mes-record-list li').count(), 1);
  console.log('PASS: CSS zoom 200%; missing defect code remains an explicit exact filter');
  await replace([]);
  assert.equal(await page.locator('#dashMesRecords').isDisabled(), true);
  await replace([a]);
  await page.locator('#dashMesRecords').click();
  await page.evaluate(() => window.dashboardTest.clear());
  assert.equal(await page.locator('#dashboardMes').innerText(), '');
  assert.deepEqual(errors, []);
  console.log('PASS: deletion/logout clear visible evidence; no browser script errors');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
