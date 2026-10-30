import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {failureGroupReuseSummaries,evidenceCountLabel,formatFailureLastOccurrence} from '../ames/failure-group-evidence.mjs';

const at='2026-10-17T10:00:00-03:00';
const rows=[
 {pcba_sn:'P1',defect_code:'D1',defect_desc:'Falha teste',defect_time:at},
 {pcba_sn:'P2',defect_code:'D1',defect_desc:'Falha teste',defect_time:'2026-10-17T10:04:00-03:00'},
 {pcba_sn:'P3',defect_code:'D2',defect_desc:'Outra falha',defect_time:'2026-10-17T10:10:00-03:00'}
];
const g=snapshot=>failureGroupReuseSummaries(snapshot,rows)['Falha teste'];

test('failure mode counts distinct current PCBAs, never material row totals',()=>{
 const source={insights:{drilldowns:{pcba_second_use:[{'PCBA atual':'P1'}],
 pcba_same_failure:[{'PCBA atual':'P1','Defect Code':'D1','Defect Time':'2026-10-17T13:00:00Z'}],
 material_analysis:[1,2,3,4,5].map(i=>({'PCBA atual':'P2','Material SN':'M'+i,'Usos conhecidos material':2,
  'PCBAs desvinculadas':'OLD1','Defect Code atual':'D1','Defect Time atual':'2026-10-17T10:04:00-03:00',
  bind_time_utc:'2026-10-17T09:00:00-03:00'}))}}};
 const a=g(source);
 assert.deepEqual(a.pcbaReuse,{count:1,observed:true,population_complete:false});
 assert.equal(a.pcbaSameFailure.count,1);
 assert.equal(a.componentAffected.count,1,'5 reused materials on P2 affect one board');
 assert.equal(evidenceCountLabel(a.componentSameFailureAffected),'—','no historical SAME failure proven');
 assert.equal(evidenceCountLabel(failureGroupReuseSummaries(source,rows)['Outra falha'].pcbaReuse),'—');
});
test('same board with other code or failure instant cannot borrow recurrence',()=>{
 const source={insights:{drilldowns:{pcba_second_use:[{'PCBA atual':'P1'}],
 pcba_same_failure:[{'PCBA atual':'P1','Defect Code':'D2','Defect Time':at},
  {'PCBA atual':'P1','Defect Code':'D1','Defect Time':'2026-10-17T11:00:00-03:00'},
  {'PCBA atual':'P2','Defect Code':'D1'}]}}};
 assert.equal(evidenceCountLabel(g(source).pcbaSameFailure),'—');
});
test('incomplete coverage remains unknown, never proven no reuse',()=>{
 const unknown=g({});
 for(const metric of Object.values(unknown))assert.equal(evidenceCountLabel(metric),'—');
 assert.equal(formatFailureLastOccurrence('2026-10-16T01:49:14.000Z'),'15/10/2026 · 22:49');
 const source=fs.readFileSync(new URL('../ames/console-legacy-parity.mjs',import.meta.url),'utf8');
 assert.match(source,/failureGroupReuseSummaries\(snapshot,baseFiltered\)/);
 assert.match(source,/PCBAs c\/ material 2º\+/);
 assert.match(source,/PCBAs distintas observadas nesta falha/);
 assert.doesNotMatch(source,/root_cause_confirmed\s*=\s*true/);
});
test('ordinal use metrics include 2nd, 3rd, 4th+ and do not borrow material without exact occurrence',()=>{
 const source={insights:{drilldowns:{pcba_analysis:[{'PCBA':'P1','Uso da PCBA na falha':'4º uso'},
 {'PCBA':'P2','Uso da PCBA na falha':'1º uso'}],
 material_analysis:[{'PCBA atual':'P2','Material SN':'M2','Uso material na falha':'3º uso'},
 {'PCBA atual':'P3','Material SN':'M3','Uso material na falha':'1º uso'}]}}};
 assert.equal(g(source).pcbaReuse.count,1);
 assert.equal(evidenceCountLabel(g(source).componentAffected),'—');
});
test('duplicate component rows count board once; conflicting defect and ended binding are excluded',()=>{
 const source={insights:{drilldowns:{material_analysis:[
 {'PCBA atual':'P1','Material SN':'LCD-1','Usos conhecidos material':2,'PCBAs desvinculadas':'OLD',
  'Defect Code atual':'D1','defect_time':at,bind_time_utc:'2026-10-17T09:00:00-03:00'},
 {'PCBA atual':'P1','Material SN':'LCD-1','Usos conhecidos material':2,'PCBAs desvinculadas':'OLD',
  'Defect Code atual':'D1','defect_time':at,bind_time_utc:'2026-10-17T09:00:00-03:00'},
 {'PCBA atual':'P1','Material SN':'LCD-2','Usos conhecidos material':2,'PCBAs desvinculadas':'OLD',
  'Defect Code atual':'D2','defect_time':at,bind_time_utc:'2026-10-17T09:00:00-03:00'},
 {'PCBA atual':'P1','Material SN':'LCD-3','Usos conhecidos material':2,'PCBAs desvinculadas':'OLD',
  'Defect Code atual':'D1','defect_time':at,bind_time_utc:'2026-10-17T09:00:00-03:00',unbind_time_utc:'2026-10-17T09:30:00-03:00'}
 ]}}};
 assert.equal(g(source).componentAffected.count,1);
 assert.equal(evidenceCountLabel(g(source).componentSameFailureAffected),'—');
});
