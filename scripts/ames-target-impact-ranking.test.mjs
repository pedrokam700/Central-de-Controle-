import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {targetRankingExclusion,targetRankingRows,targetRankingCoverage,TARGET_RANKING_POLICY} from '../ames/data/target-impact.mjs';
import {rankDailyFailures} from '../ames/daily-failure-analytics.mjs';

const row=(defect_code,defect_desc,pcba='PCB-1')=>({
 defect_code,defect_desc,pcba,line:'TAN10103',production_shift:null,
 reuse_with_failure:false,component_history_links:[]
});
const all=[
 row('9999','standard error','PCB-1'),
 row('F1_9999','Auto station issue','PCB-2'),
 row('F1.9999','F1 9999','PCB-3'),
 row('P-ROUTE','Process: Skip station','PCB-4'),
 row('P-SETUP','Process: Inconsistent scheme/work order/version','PCB-5'),
 row('CAMERA-01','Camera scratched','PCB-6'),
 row('CAMERA-01','Camera scratched','PCB-7'),
 row('GN08-CG03','Sensor Light perception test failed','PCB-8')
];

test('target ranking excludes the four specific non-target categories, keeping real faults',()=>{
 const count=targetRankingCoverage(all);
 assert.equal(count.policy,TARGET_RANKING_POLICY);
 assert.equal(count.total,8);
 assert.equal(count.eligible,3);
 assert.equal(count.excluded,5);
 assert.deepEqual(count.excluded_by_reason,{STANDARD_ERROR:1,F1_9999:2,PROCESS_SKIP_STATION:1,PROCESS_SETUP_INCONSISTENT:1});
 assert.deepEqual(targetRankingRows(all).map(r=>r.pcba),['PCB-6','PCB-7','PCB-8']);
 assert.deepEqual(all.map(r=>r.pcba).slice(0,2),['PCB-1','PCB-2'],'raw occurrence array unchanged');
 const rank=rankDailyFailures(all);
 assert.deepEqual(rank.map(x=>[x.code,x.count]),[['CAMERA-01',2],['GN08-CG03',1]]);
 assert.equal(Math.round(rank.at(-1).cumulative),100,'Pareto denominator is only target-eligible defects');
 assert.equal(rank[0].pcbas,2);
});

test('fails conservatively closed to exclusion when a label or code is only superficially similar',()=>{
 for(const [code,desc] of [
 ['D100','Inconsistent current detected on board'],
 ['SKIP100','Station was skipped in manual retest'],
 ['9999','Camera scratched'],
 ['XX1','Process: Inconsistent scheme/work order/version on housing alert'],
 ['XX2','Standard error on receiver measurement'],
 ['REAL-F1','F1_9999: Actual RF issue'],
 ['GN08-CG03','Sensor Light perception test failed'],
 ])assert.equal(targetRankingExclusion(row(code,desc)),null,`${code} / ${desc}`);
 for(const [code,desc] of [
 ['X',' Process:   Skip-Station '],
 ['X','PROCESS: inconsistent scheme / work order / version'],
 ['F1_9999',null],
 ['X','Standard Error — 9999']
 ])assert.ok(targetRankingExclusion(row(code,desc)));
});

test('only ranking transforms rows: Top 3 uses ranking policy, Falhas and FPY remain unscreened',()=>{
 const summary=fs.readFileSync(new URL('../ames/daily-failure-summary.mjs',import.meta.url),'utf8');
 const analytics=fs.readFileSync(new URL('../ames/daily-failure-analytics.mjs',import.meta.url),'utf8');
 const shift=fs.readFileSync(new URL('../ames/console-shift-summary.mjs',import.meta.url),'utf8');
 assert.match(summary,/for\(const row of targetRankingRows\(rows\)\)/);
 assert.match(summary,/occurrences=scopedDailyRows\(allOccurrences,context\)/);
 assert.match(analytics,/const eligible=targetRankingRows\(rows\)/);
 assert.match(analytics,/const total=eligible\.length\|\|1/);
 assert.match(analytics,/const filtered=filterDailyFailureRows\(base,state\)/);
 assert.match(analytics,/state\.mode==='occurrences'\?.*?renderOccurrences\(filtered\)/s);
 assert.match(summary,/metric\(model,'fpy'\)/);
 assert.match(summary,/metric\(model,'quantity'\)/);
 assert.match(shift,/rankDailyFailures\(filtered\)/);
});
