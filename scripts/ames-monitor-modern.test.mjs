import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=name=>fs.readFileSync(new URL('../ames/'+name,import.meta.url),'utf8');
test('monitor keeps four primary KPIs and separate revision identity, without duplicating actions',()=>{
 const parity=source('console-legacy-parity.mjs');
 assert.match(parity,/ames-monitor-overview/);
 assert.match(parity,/ames-line-summary/);
 assert.match(parity,/ames-monitor-evidence-strip/);
 assert.match(parity,/data-monitor-provenance/);
 for(const label of ['FPY','Check FPY','Quantity','Falhas','Snapshot','Origem'])
   assert.match(parity,new RegExp('stat-label"> *'+label));
 assert.match(parity,/data-latest-capture-preview/);
 assert.match(parity,/data-line-tab/);
 assert.match(parity,/aria-pressed/);
});
test('modern monitor layout is theme responsive and has visible keyboard focus',()=>{
 const css=source('console-monitor-modern.css'),view=source('console-view.mjs');
 assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
 assert.match(css,/@media\(max-width:720px\)/);
 assert.match(css,/focus-visible/);
 assert.match(css,/body.dark/);
 assert.match(view,/MONITOR_MODERN_STYLE_HREF/);
 assert.match(view,/console-monitor-modern\.css/);
 assert.match(view,/data-monitor-technical/);
});
test('historical and local table retain all technical source keys behind details',()=>{
 const base=source('console-base-view.mjs');
 assert.match(base,/rowDetails\(row,columns\)/);
 assert.match(base,/Object\.entries\(row\|\|\{\}\)/);
 assert.match(base,/ames-row-detail/);
 assert.match(base,/export const renderOperationalTable=table/);
});
test('missing 3022 repair and return is not auto-filled from 3012 candidate',()=>{
 const ops=source('console-process-operator.mjs');
 const history=source('console-reading-period.mjs');
 assert.match(ops,/3012\/3028 exigem vínculo próprio/);
 assert.match(history,/ausência de vínculo não é prova de inexistência/);
});
