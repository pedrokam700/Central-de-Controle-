import test from 'node:test';
import assert from 'node:assert/strict';
import {DATASETS,normalizeCanonical} from '../ames/data/canonical.mjs';
import {projectCanonicalForCloud,CLOUD_PROJECTION_SCHEMA} from '../ames/data/cloud-projection.mjs';
import {sanitizeSnapshot} from '../ames/sync.mjs';

function fixture(){
  const line='TAN10101',snapshotId='9',revision=3,collected='2026-10-11T12:00:00Z';
  const base={
    schema:'central-ames-v2',schema_version:2,source_id:'source-1',snapshot_id:snapshotId,snapshot_revision:revision,
    content_hash:'local-content-hash',line_id:line,collected_at:collected,source_view:'3028',source_timestamp:null,
    summary:{line,snapshot_id:snapshotId,collected_at:collected,fpy:98.5,check_fpy:99.1,quantity:500,defect_rows:1},
    datasets:Object.fromEntries(DATASETS.map(name=>[name,[]])),coverage:{},capabilities:{process_timeline:true},
  };
  const common={
    line,line_id:line,snapshot_id:snapshotId,snapshot_revision:revision,pcba_sn:'002527SAFE',product:'CPH2859V',
    product_candidates:['CPH2859V'],source_timestamp:collected,collected_at:collected,
    provenance:{identity_scope:'agent_snapshot_observation',source_id:'source-1',line_candidates:[line],line_ambiguous:false,contexts:[{line_id:line,product:'CPH2859V',pcba_sn:'002527SAFE',kind:'current_observation',defect_key:'DKEY',unknown_context:'DROP'}],unknown_provenance:'DROP'}
  };
  base.datasets.defects=[{...common,record_id:'D1',occurrence_id:'O1',product_model:'CPH2859V',defect_key:'DKEY',defect_code:'D01',defect_desc:'Falha',defect_time:collected,raw_ref:'sqlite:private-ref',password:'DROP',innocent_new_field:'DROP'}];
  base.datasets.pcba_history=[{...common,record_id:'H1',source_view:'2114',hist_seq:'1',defect_code:'D00',defect_desc:'Anterior',unexpected_history_field:'DROP'}];
  base.datasets.material_reuse=[{...common,record_id:'M1',source_view:'3074',item_sn:'MAT01',material_sn:'MAT01',item_type:'SUB_BOARD',usage_status:'2nd',previous_pcba_count:1,total_pcba_count_known_now:2,unknown_material_field:'DROP'}];
  base.datasets.history_contexts=[{...common,record_id:'C1',source_view:'2114',context_kind:'historical',context_key:'CTX1',historical_pcba:'OLDPCBA',current_pcba:'002527SAFE'}];
  base.datasets.process_timeline=[{...common,record_id:'P1',source_view:'3022',event_id:'E1',process:'A5700',station:'TEST',event_time:collected,valid:true,raw_ref:'sqlite:process-private',provenance:{...common.provenance,adapter:{defect_contexts:[{line,pcba_sn:'002527SAFE',defect_key:'DKEY',defect_time:collected,defect_code:'D01',reference_station_code:'A5700',secret_future_context:'DROP'}],raw_payload:{secret:'DROP'},browser_session:'DROP'}}}];
  for(const name of DATASETS)base.coverage[name]={status:'partial',stored_total:base.datasets[name].length,unassigned_rows:0,ambiguous_context_rows:0,transport_complete:true,source_complete:false,scope:'stored_snapshot_line_context',reason:'test',unknown_coverage:'DROP'};
  base.insights={schema:'ames-insights-v1',line,snapshot_id:snapshotId,ready:true,
    rate_kpis:[['Taxa',12.3]],pcba_kpis:[['PCBA 2º+',1]],material_kpis:[['Material 2º+',1]],correlation_kpis:[['Mesma falha',1]],overview_kpis:[['DROP',999]],
    component_types:[{'Tipo material':'SUB_BOARD','Materiais únicos no lote':1,'Reutilizados únicos':1,'internal_debug':'DROP'}],
    drilldowns:{
      pcba_analysis:[{'PCBA':'002527SAFE','Modelo':'CPH2859V','Defect Code':'D01','unexpected':'DROP'}],
      material_analysis:[{'Material SN':'MAT01','Tipo material':'SUB_BOARD','unexpected':'DROP'}],
      material_history:[{'Material SN':'MAT01','PCBA desvinculada':'OLDPCBA','Relação desta ocorrência':'MESMA FALHA','unexpected':'DROP'}],
      raw_debug:[{secret:'DROP'}]
    },
    internal_runtime:{secret:'DROP'}
  };
  base.password='DROP';base.cookie='DROP';base.harmless_future_top_level='DROP';
  return base;
}

test('typed cloud projection remains a valid canonical snapshot',()=>{
  const cloud=projectCanonicalForCloud(fixture());
  assert.equal(CLOUD_PROJECTION_SCHEMA,'central-ames-cloud-v1');
  assert.doesNotThrow(()=>normalizeCanonical(cloud));
  assert.equal(cloud.line_id,'TAN10101');
  assert.equal(cloud.datasets.defects[0].occurrence_id,'O1');
  assert.equal(cloud.datasets.material_reuse[0].material_sn,'MAT01');
  assert.equal(cloud.datasets.process_timeline[0].event_id,'E1');
  assert.equal(cloud.datasets.process_timeline[0].provenance.adapter.defect_contexts[0].reference_station_code,'A5700');
});

test('unknown fields are denied by default at every cloud boundary',()=>{
  const cloud=sanitizeSnapshot(fixture());
  const text=JSON.stringify(cloud);
  for(const marker of ['harmless_future_top_level','innocent_new_field','unexpected_history_field','unknown_material_field','unknown_coverage','unknown_context','unknown_provenance','secret_future_context','raw_payload','browser_session','raw_debug','internal_runtime','password','cookie','sqlite:private-ref','sqlite:process-private']){
    assert.equal(text.includes(marker),false,`cloud projection leaked unknown/private marker: ${marker}`);
  }
  assert.equal('raw_ref' in cloud.datasets.defects[0],false);
  assert.equal('raw_ref' in cloud.datasets.process_timeline[0],false);
});

test('approved reuse insights survive while unregistered insight fields are dropped',()=>{
  const cloud=projectCanonicalForCloud(fixture());
  assert.deepEqual(cloud.insights.rate_kpis,[['Taxa',12.3]]);
  assert.equal(cloud.insights.component_types[0]['Tipo material'],'SUB_BOARD');
  assert.equal(cloud.insights.drilldowns.pcba_analysis[0].PCBA,'002527SAFE');
  assert.equal(cloud.insights.drilldowns.material_analysis[0]['Material SN'],'MAT01');
  assert.equal(cloud.insights.drilldowns.material_history[0]['PCBA desvinculada'],'OLDPCBA');
  assert.equal('overview_kpis' in cloud.insights,false);
  assert.equal('raw_debug' in cloud.insights.drilldowns,false);
  assert.equal('internal_debug' in cloud.insights.component_types[0],false);
});

test('projection is deterministic and does not mutate local canonical evidence',()=>{
  const local=fixture(),before=structuredClone(local);
  const one=projectCanonicalForCloud(local),two=projectCanonicalForCloud(local);
  assert.deepEqual(one,two);
  assert.deepEqual(local,before);
});
