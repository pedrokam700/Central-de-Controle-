import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {filterRows} from '../ames/advanced-table.mjs';
import {reuseLinks,aggregatePcbas} from '../ames/data/reuse-analysis.mjs';
import {configuredShiftAt} from '../ames/console-shift-summary.mjs';

test('exact CPH and shift filters before PCBA aggregation',()=>{
 const rows=[{product:'CPH2819',production_shift:'1st Shift'},{product:'CPH2819V',production_shift:'1st Shift'},{product:'CPH2819',production_shift:'2nd Shift'}];
 assert.deepEqual(filterRows(rows,{filters:{product:'CPH2819',production_shift:'1st Shift'}}),[rows[0]]);
});

test('automatic shift uses factory timezone, never browser timezone',()=>{
 const config={timezone:'America/Sao_Paulo',work_shifts:{'1':{start:'07:30',end:'17:30'},'2':{start:'17:30',end:'07:30'}}};
 assert.equal(configuredShiftAt(config,new Date('2026-10-14T10:29:59Z')),'2nd Shift');
 assert.equal(configuredShiftAt(config,new Date('2026-10-14T10:30:00Z')),'1st Shift');
 assert.equal(configuredShiftAt(config,new Date('2026-10-14T20:29:59Z')),'1st Shift');
 assert.equal(configuredShiftAt(config,new Date('2026-10-14T20:30:00Z')),'2nd Shift');
});

test('3012 mapped V2 uses real load records contract and refuses unconfirmed stale response',()=>{
 const py=fs.readFileSync('ames/agent/ames_3012_live.py','utf8');
 const js=py.split('QUERY_3012_JS = r"""')[1].split('"""')[0];
 assert.match(py,/QUERY_CONTRACT = "3012-home-mapped-v2"/);
 assert.match(js,/state\.loadFn=\(_store,_records,success\)/);
 assert.match(js,/store\.on\?\.\('load',state\.loadFn\)/);
 assert.match(js,/STORE_LOAD_CONFIRMED/);
 assert.match(js,/STORE_DATASET_EVENT/);
 assert.match(js,/STORE_REBOUND_AFTER_VIEW/);
 assert.match(js,/3012_RESPONSE_NOT_CONFIRMED/);
 assert.match(js,/3012_VIEW_NOT_EXECUTED/);
 assert.match(js,/byItemId\('grdDefectRepair'/);
 assert.match(js,/byItemId\('btnView'/);
});