// Standalone independent audit. Expected RED on fddc754. No HTTP, MES or writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {provenRepairUserName,projectRepairTechnicianNames} from '../../ames/console-sn-repair-evidence.mjs';
import {productionEvidenceForOccurrence} from '../../ames/data/production-evidence.mjs';
import {mountReuseCohorts} from '../../ames/console-reuse-cohorts.mjs';

const repair={pcba_sn:'AUDIT-PCBA-A',repair_user:'AUDIT-ID-1',raw:{raw:{repairUserName:'Pessoa sintética A'}}};
test('N1: same explicit 3012 name survives both existing name projections',()=>{
  const story=provenRepairUserName(repair,{sn:repair.pcba_sn});
  assert.equal(story,'Pessoa sintética A');
  const table=projectRepairTechnicianNames([repair],[])[0].repair_technician_name;
  assert.equal(table,story,'raw explicit name must not disappear in the table resolver');
});
test('N2 control: absent name and different PCBA stay unknown',()=>{
  const r={pcba_sn:repair.pcba_sn,repair_user:repair.repair_user};
  const other={pcba_sn:'AUDIT-PCBA-B',operator_id:repair.repair_user,operator_name:'Outra pessoa sintética'};
  assert.equal(provenRepairUserName(r,{trace_3022:{rows:[other]}}),null);
  assert.equal(projectRepairTechnicianNames([r],[other])[0].repair_technician_name,null);
});
test('N3: canonical explicit source conflict cannot authenticate a repair name',()=>{
  const r={pcba_sn:repair.pcba_sn,repair_user:repair.repair_user,source_id:'AUDIT-SOURCE-A'};
  const foreign={pcba_sn:r.pcba_sn,operator_id:r.repair_user,operator_name:'Pessoa de outra origem',
    provenance:{source_id:'AUDIT-SOURCE-B'}};
  assert.equal(projectRepairTechnicianNames([r],[foreign])[0].repair_technician_name,null);
});
const occurrence={pcba_sn:repair.pcba_sn,defect_key:'AUDIT-K',defect_code:'AUDIT-D',
  defect_time:'2026-11-15 10:00:00',source_id:'AUDIT-SOURCE-A',line:'TAN10101',
  snapshot_id:'11',snapshot_revision:16,period:'2026-11-15'};
const context={...occurrence,production_shift_source:'3022',production_shift_basis:'reference_process',
  reference_station_code:'A5162',reference_event_time:'2026-11-15 09:00:00',
  production_shift:'T1',production_operational_date:'2026-11-15'};
test('S0 control: exact context is trusted; future context is rejected',()=>{
  assert.equal(productionEvidenceForOccurrence(occurrence,[context]).trusted,true);
  assert.equal(productionEvidenceForOccurrence(occurrence,[{...context,reference_event_time:'2026-11-15 11:00:00'}]).trusted,false);
});
for(const [field,value] of Object.entries({source_id:'AUDIT-SOURCE-B',line:'TAN10103',snapshot_id:'13',snapshot_revision:1,period:'2026-11-14'})){
  test(`S1 ${field}: explicit scope conflict must not become trusted 3022 timing`,()=>{
    assert.equal(productionEvidenceForOccurrence(occurrence,[{...context,[field]:value}]).trusted,false);
  });
}
test('U1: opening a PCBA does not render its 2114 history twice',()=>{
  globalThis.document={documentElement:{lang:'pt-BR'}};
  const detail={innerHTML:'',querySelectorAll:()=>[],scrollIntoView(){}};
  const buttons=['observed','first_use','reused'].map(metric=>({
    dataset:{cohortKind:'pcbas',cohortMetric:metric},classList:{toggle(){}},
    querySelector:()=>({textContent:''}),setAttribute(){},
    addEventListener(type,fn){if(type==='click')this.click=fn;}
  }));
  const root={innerHTML:'',querySelector(selector){
    if(selector==='form')return {addEventListener(){}};
    if(selector==='[data-cohort-detail]')return detail;
    return null;
  },querySelectorAll(){return buttons;}};
  mountReuseCohorts(root,{source_id:'AUDIT-SOURCE-A',snapshot_id:'11',revision:16,line_id:'TAN10101',
    occurrences:[occurrence],pcba_history:{records:[{...occurrence,record_id:'AUDIT-H',
      defect_time:null,hist_seq:0,defect_desc:'AUDIT-HISTORY-2114',source_view:'2114'}]}});
  buttons[0].click();
  assert.match(detail.innerHTML,/data-board-failure-row/,'the primary comparison already contains 2114');
  assert.doesNotMatch(detail.innerHTML,/data-board-2114-timeline/,
    'the same 2114 record must not also appear in a second full timeline');
});
