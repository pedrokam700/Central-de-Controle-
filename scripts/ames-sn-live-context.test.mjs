import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {snLiveSummaryEvidence} from '../ames/console-sn-live-context.mjs';

function baseResult(){
  return {
    sn:'PCB-X',detected_type:'PCBA',
    trace_2114:{
      status:'complete',
      current_failure:{pcba_sn:'PCB-X',defect_code:'F1',defect_desc:'FAIL',defect_time:'2026-10-17 10:30:00',manual_or_auto:'Manual'}
    },
    trace_3074:{status:'complete',reused_components:[]},
    trace_3022:{status:'complete',process_passages:[]},
    local_snapshot:{process_contexts:[]},
  };
}

test('SN summary preserves live 2114 Defect Time and Manual/Automatic even without previous_failures array',()=>{
  const evidence=snLiveSummaryEvidence(baseResult());
  assert.equal(evidence.has2114,true);
  assert.equal(evidence.current.defect_time,'2026-10-17 10:30:00');
  assert.equal(evidence.current.manual_or_auto,'Manual');
  assert.equal(evidence.previous.length,0);
});

test('exact 3022 reference_process context is selected for the current failure occurrence',()=>{
  const result=baseResult();
  result.local_snapshot.process_contexts=[
    {pcba_sn:'PCB-OTHER',defect_code:'F1',defect_time:'2026-10-17 10:30:00',production_shift_source:'3022',production_shift_basis:'reference_process',reference_station_code:'WRONG',production_event_time:'2026-10-17T11:00:00-03:00',production_shift:'2nd Shift'},
    {pcba_sn:'PCB-X',defect_code:'F1',defect_time:'2026-10-17 10:30:00',production_shift_source:'3022',production_shift_basis:'reference_process',reference_station_code:'A1600',production_event_time:'2026-10-17T10:00:00-03:00',production_shift:'1st Shift'}
  ];
  const evidence=snLiveSummaryEvidence(result);
  assert.equal(evidence.production.trusted,true);
  assert.equal(evidence.production.station,'A1600');
  assert.equal(evidence.production.shift,'1st Shift');
});

test('trusted-looking 3022 context from another occurrence is not promoted',()=>{
  const result=baseResult();
  result.local_snapshot.process_contexts=[{pcba_sn:'PCB-X',defect_code:'F1',defect_time:'2026-10-17 09:00:00',production_shift_source:'3022',production_shift_basis:'reference_process',reference_station_code:'A1600',production_event_time:'2026-10-17T08:30:00-03:00',production_shift:'1st Shift'}];
  const evidence=snLiveSummaryEvidence(result);
  assert.equal(evidence.production.trusted,false);
  assert.equal(evidence.production.station,null);
  assert.equal(evidence.production.event_time,null);
});

test('absence remains unknown and materials story data survives the summary bridge',()=>{
  const result=baseResult();
  delete result.trace_2114.current_failure;
  result.trace_2114.previous_failures=[];
  result.trace_3074.reused_components=[{item_sn:'MAT-1',item_type:'CAMERA',previous_pcbas:['PCB-OLD'],relation_to_current_failure:'FALHA_DIFERENTE'}];
  const evidence=snLiveSummaryEvidence(result);
  assert.equal(evidence.has2114,true);
  assert.equal(evidence.current,null);
  assert.equal(evidence.production.trusted,false);
  assert.equal(evidence.model.materials.length,1);
  assert.equal(evidence.model.materials[0].item_sn,'MAT-1');
});

test('hardened agent installs the live SN production-context bridge and its focused Python contract passes',()=>{
  const source=fs.readFileSync(new URL('../ames/agent/agent_hardened_entry.py',import.meta.url),'utf8');
  assert.match(source,/import sn_lookup_context/);
  assert.match(source,/sn_lookup_context\.install\(entry\.a\)/);
  const python=process.env.PYTHON_BIN||(process.platform==='win32'?'python':'python3');
  const result=spawnSync(python,['scripts/agent-sn-lookup-context.test.py'],{encoding:'utf8'});
  assert.equal(result.status,0,(result.stdout||'')+(result.stderr||''));
});
