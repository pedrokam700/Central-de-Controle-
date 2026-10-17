import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {evidenceCountLabel,failureGroupReuseSummaries,formatFailureLastOccurrence} from '../ames/failure-group-evidence.mjs';

const addon=fs.readFileSync(new URL('../ames/console-failure-process.mjs',import.meta.url),'utf8');

test('grouped failures keep PCBA reuse and reused-item evidence separate',()=>{
  const snapshot={insights:{drilldowns:{
    pcba_second_use:[{'PCBA atual':'P1'}],pcba_3plus_use:[],
    pcba_same_failure:[{'PCBA atual':'P1'}],pcba_same_family:[],
    material_analysis:[{'PCBA atual':'P2','Material SN':'M1','PCBAs desvinculadas':'OLD1','Usos conhecidos material':2,'PCBAs com mesma falha':1}],
    correlation_same_failure:[],correlation_same_family:[],
  }}};
  const rows=[
    {pcba_sn:'P1',defect_code:'D1',defect_desc:'Falha teste'},
    {pcba_sn:'P2',defect_code:'D1',defect_desc:'Falha teste'},
    {pcba_sn:'P3',defect_code:'D1',defect_desc:'Falha teste'},
  ];
  const summary=failureGroupReuseSummaries(snapshot,rows)['Falha teste'];
  assert.deepEqual(summary.pcbaReuse,{count:1,exact:true});
  assert.deepEqual(summary.itemReuse,{count:1,exact:true});
  assert.deepEqual(summary.sameFailureOrFamily,{count:2,exact:true});
});

test('UNKNOWN is not rendered as zero and positive partial evidence is a lower bound',()=>{
  const unknown=failureGroupReuseSummaries({},[{pcba_sn:'P9',defect_code:'F1_9999'}])['F1_9999'];
  assert.equal(evidenceCountLabel(unknown.pcbaReuse),'—');
  assert.equal(evidenceCountLabel(unknown.itemReuse),'—');
  assert.equal(evidenceCountLabel(unknown.sameFailureOrFamily),'—');
  const partial=failureGroupReuseSummaries({insights:{drilldowns:{pcba_second_use:[{'PCBA atual':'P9'}]}}},[{pcba_sn:'P9',defect_code:'F1_9999'}])['F1_9999'];
  assert.equal(evidenceCountLabel(partial.pcbaReuse),'1+');
});

test('last occurrence is factory-local presentation only',()=>{
  assert.equal(formatFailureLastOccurrence('2026-10-16T01:49:14.000Z'),'15/10/2026 · 22:49');
  assert.equal(formatFailureLastOccurrence(''),'—');
  assert.match(addon,/latestCell\.dataset\.rawTime=rawLatest/);
  assert.match(addon,/formatFailureLastOccurrence\(rawLatest\)/);
});

test('grouped table removes technical-code column but detailed technical evidence is untouched',()=>{
  assert.match(addon,/head\[2\]\?\.remove\(\)/);
  assert.match(addon,/PCBAs 2º\+/);
  assert.match(addon,/C\/ item 2º\+/);
  assert.match(addon,/Mesma falha\/fam\./);
  assert.match(addon,/Fonte de reuso\/correlação não comprovada nesta leitura; não é zero\./);
});
