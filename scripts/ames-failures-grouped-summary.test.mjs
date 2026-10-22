import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {failureGroupReuseSummaries,evidenceCountLabel,formatFailureLastOccurrence} from '../ames/failure-group-evidence.mjs';

const rows=[
 {pcba_sn:'P1',defect_code:'D1',defect_desc:'Falha teste',defect_time:'2026-10-17T10:00:00-03:00'},
 {pcba_sn:'P2',defect_code:'D1',defect_desc:'Falha teste',defect_time:'2026-10-17T10:04:00-03:00'},
 {pcba_sn:'P3',defect_code:'D2',defect_desc:'Outra falha',defect_time:'2026-10-17T10:10:00-03:00'}
];
const snapshot={occurrences:rows,insights:{drilldowns:{
 pcba_second_use:[{'PCBA atual':'P1'}],pcba_3plus_use:[],
 material_analysis:[{'PCBA atual':'P2','Material SN':'M1','PCBAs desvinculadas':'OLD1','Usos conhecidos material':2}],
 pcba_same_failure:[{'PCBA atual':'P1','Defect Code':'D1','Defect Time':'2026-10-17T13:00:00Z'}],
 pcba_same_family:[{'PCBA atual':'P2','Defect Code':'D1','Defect Time':'2026-10-16T10:04:00-03:00'}]
}}};
test('groups preserve PCBA and material distinct with only proven occurrence-level correlation',()=>{
 const by=failureGroupReuseSummaries(snapshot,rows);
 const a=by['Falha teste'];assert.deepEqual(a.pcbaReuse,{count:1,exact:false});
 assert.deepEqual(a.itemReuse,{count:1,exact:false});
 assert.deepEqual(a.sameFailureOrFamily,{count:1,exact:false});
 assert.equal(evidenceCountLabel(a.pcbaReuse),'≥ 1');
 assert.equal(evidenceCountLabel(a.itemReuse),'≥ 1');
 assert.equal(evidenceCountLabel(a.sameFailureOrFamily),'≥ 1');
 assert.equal(evidenceCountLabel(by['Outra falha'].pcbaReuse),'—');
});
test('same PCBA with different defect or event instant never borrows same-family history',()=>{
 const wrong={...snapshot,insights:{drilldowns:{pcba_same_failure:[
  {'PCBA atual':'P1','Defect Code':'D2','Defect Time':'2026-10-17T10:00:00-03:00'},
  {'PCBA atual':'P1','Defect Code':'D1','Defect Time':'2026-10-17T11:00:00-03:00'},
  {'PCBA atual':'P2','Defect Code':'D1'}]}}};
 assert.equal(failureGroupReuseSummaries(wrong,rows)['Falha teste'].sameFailureOrFamily.count,0);
 assert.equal(evidenceCountLabel(failureGroupReuseSummaries(wrong,rows)['Falha teste'].sameFailureOrFamily),'—');
});
test('missing and partial evidence never claims zero, totals or material causality',()=>{
 const unknown=failureGroupReuseSummaries({},rows);
 for(const item of Object.values(unknown))for(const metric of Object.values(item))
  assert.equal(evidenceCountLabel(metric),'—');
 assert.equal(formatFailureLastOccurrence('2026-10-16T01:49:14.000Z'),'15/10/2026 · 22:49');
 const source=fs.readFileSync(new URL('../ames/console-legacy-parity.mjs',import.meta.url),'utf8');
 assert.match(source,/failureGroupReuseSummaries\(snapshot,baseFiltered\)/);
 assert.match(source,/grupo|grupos|Falhas agrupadas/);
 assert.match(source,/número com \+/);
 assert.doesNotMatch(source,/root_cause_confirmed\s*=\s*true/);
});

test('canonical numeric and ordinal reuses work without old categorical drilldown names',()=>{
 const snap={insights:{drilldowns:{
  pcba_analysis:[{'PCBA':'P1','Uso da PCBA na falha':'2º uso'},
                 {'PCBA':'P2','Uso da PCBA na falha':'1º uso'}],
  material_analysis:[{'PCBA atual':'P2','Material SN':'M2','Uso material na falha':'3º uso'},
                     {'PCBA atual':'P3','Material SN':'M3','Uso material na falha':'1º uso'}]
 }}};
 const tally=failureGroupReuseSummaries(snap,rows)['Falha teste'];
 assert.equal(evidenceCountLabel(tally.pcbaReuse),'≥ 1');
 assert.equal(evidenceCountLabel(tally.itemReuse),'≥ 1');
 assert.equal(evidenceCountLabel(tally.sameFailureOrFamily),'—');
});
