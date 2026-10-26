import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildDataHealth,buildSecurityHealth,buildWorkstationHealth,buildSyncHealth,factorySyncEvidence,createDataHealthView} from '../ames/console-data-health.mjs';

test('the Monitor exposes a direct cross-workstation sync shortcut without mutating sync state',()=>{
  const code=fs.readFileSync(new URL('../ames/console-view.mjs',import.meta.url),'utf8');
  assert.match(code,/data-monitor-technical/);
  assert.match(code,/shortcut\.dataset\.openSyncHealth/);
  assert.match(code,/Sincronização entre postos · ver diagnóstico/);
  assert.match(code,/Cross-workstation sync · view diagnostics/);
  assert.match(code,/view\.render=function\(\.\.\.args\)/,'label refreshes when language changes');
  assert.match(code,/details\.open=true/);
});

function fakeStore(occurrences=[]){
  return {
    agent(){return {status:'connected',capabilities:{process_timeline:true}};},
    read(line){
      if(line!=='TAN10101')return {snapshot:null,freshness:'unknown',source:null};
      return {snapshot:{
        snapshot_id:'1',collected_at:'2026-10-14T09:00:00',occurrences,
        material_trace:{status:'not_collected',records:[]},
        pcba_history:{status:'not_collected',records:[]},
        process_timeline:{status:'not_collected',events:[]},
      },freshness:'fresh',source:'local'};
    }
  };
}

const repairStatus=(overrides={})=>({
  status:'ok',implemented:true,factoryValidated:false,amesStartDate:'2026-01-01',
  local:{rows:0,pcbas:0,repairUsers:0,coverageIntervals:0,coverageSns:0,firstEvent:null,lastEvent:null,...overrides}
});

test('security health exposes counts only and keeps validated policy green',()=>{
  const model=buildSecurityHealth({
    status:'ok',
    originPolicy:{ok:true,mode:'loopback-plus-explicit-https',remoteOrigins:1,rejectedEntries:0,secret:'https://hidden.example'}
  });
  assert.equal(model.tone,'ok');
  assert.equal(model.remote,1);
  assert.equal(model.rejected,0);
  assert.equal(model.mode,'loopback-plus-explicit-https');
  assert.equal(JSON.stringify(model).includes('hidden.example'),false);
});

test('legacy rejected origins are visible as partial without exposing origin values',()=>{
  const model=buildSecurityHealth({
    status:'ok',
    originPolicy:{ok:false,mode:'loopback-plus-explicit-https',remoteOrigins:1,rejectedEntries:3,origins:['https://must-not-render.example']}
  });
  assert.equal(model.tone,'partial');
  assert.equal(model.remote,1);
  assert.equal(model.rejected,3);
  assert.match(model.label,/Configuração legada|Legacy configuration/);
  assert.equal(JSON.stringify(model).includes('must-not-render'),false);
});

test('unavailable hardening diagnostics remain unknown instead of being reported safe',()=>{
  for(const value of [null,{status:'unavailable',reason:'not_paired'},{status:'error'}]){
    const model=buildSecurityHealth(value);
    assert.equal(model.tone,'unknown');
    assert.equal(model.remote,null);
    assert.equal(model.rejected,null);
  }
});

test('workstation health exposes only whitelisted version setup and readiness fields',()=>{
  const model=buildWorkstationHealth({
    status:'connected',agent_build:'0.5.25-rc1',
    runtime:{candidate_version:'0.5.26-rc1',setup_complete:true,network:{secret:'network-secret'},workstation:{hostname:'hidden-host'}},
    readiness:{engine:true,chrome:true,ames:true,sqlite:true,python:true,dependencies:true,playwright:true,process:false,session:'session-secret'}
  });
  assert.equal(model.tone,'partial');
  assert.equal(model.build,'0.5.25-rc1');
  assert.equal(model.candidate,'0.5.26-rc1');
  assert.equal(model.setup,true);
  assert.equal(model.failed,1);
  assert.equal(model.checks.find(x=>x.key==='process')?.value,false);
  assert.equal(model.checks.some(x=>x.key==='session'),false);
  const serialized=JSON.stringify(model);
  assert.equal(serialized.includes('network-secret'),false);
  assert.equal(serialized.includes('hidden-host'),false);
  assert.equal(serialized.includes('session-secret'),false);
});

test('workstation health is green only with complete setup and fully reported ready checks',()=>{
  const model=buildWorkstationHealth({
    status:'connected',agent_build:'0.5.25-rc1',runtime:{candidate_version:'0.5.25-rc1',setup_complete:true},
    readiness:{engine:true,chrome:true,ames:true,sqlite:true,python:true,dependencies:true,playwright:true,process:true}
  });
  assert.equal(model.tone,'ok');
  assert.equal(model.known,8);
  assert.equal(model.ready,8);
  assert.equal(model.failed,0);
  assert.equal(model.unknown,0);
});

test('shared sync health exposes team-latest provenance without account identity',()=>{
  const model=buildSyncHealth({sync:{
    read_status:'ready',remote_scope:'team_latest',remote_latest_collected_at:'2026-10-14T12:00:00Z',
    remote_heads:[
      {line_id:'TAN10103',source_id:'posto-3',snapshot_id:'33',snapshot_revision:2,collected_at:'2026-10-14T12:00:00Z',authority:'team_latest',owner_uid:'must-not-leak'},
      {line_id:'TAN10101',source_id:'posto-1',snapshot_id:'31',snapshot_revision:4,collected_at:'2026-10-14T11:00:00Z',authority:'team_latest'},
    ]
  }});
  assert.equal(model.tone,'partial');
  assert.equal(model.count,2);
  assert.equal(model.authority,'team_latest');
  assert.equal(model.latest,'2026-10-14T12:00:00Z');
  assert.deepEqual(model.heads.map(x=>x.line_id),['TAN10101','TAN10103']);
  assert.equal(JSON.stringify(model).includes('must-not-leak'),false);
});

test('receiver with historical access but no current heads does not misreport history as missing',()=>{
  const model=buildSyncHealth({sync:{read_status:'ready',remote_scope:'operational_day_history',remote_heads:[]}});
  assert.equal(model.tone,'unknown');
  assert.equal(model.count,0);
  assert.equal(model.authority,'operational_day_history');
  assert.match(model.label,/snapshot compartilhado atual|current shared snapshot/i);
  assert.match(model.detail,/histórico de dias anteriores|history from previous days/i);
  const code=fs.readFileSync(new URL('../ames/console-view.mjs',import.meta.url),'utf8');
  assert.match(code,/Dados atuais da equipe não confirmados/);
  assert.match(code,/Current team data not confirmed/);
});

test('shared sync read error preserves last valid provenance instead of erasing it',()=>{
  const model=buildSyncHealth({sync:{read_status:'error',read_error:'technical details',remote_scope:'team_latest',remote_heads:[{line_id:'TAN10102',source_id:'posto-2',snapshot_id:'9',snapshot_revision:1,collected_at:'2026-10-14T10:00:00Z',authority:'team_latest'}]}});
  assert.equal(model.tone,'partial');
  assert.equal(model.has_error,true);
  assert.equal(model.count,1);
  assert.equal(model.heads[0].source_id,'posto-2');
  assert.equal(JSON.stringify(model).includes('technical details'),false);
});

test('origin conflict diagnostics expose verified candidates, never Firebase account identities',()=>{
  const agent={status:'offline',sync:{read_status:'origin_conflict',origin_conflict_lines:['TAN10102'],
    origin_conflict_candidates:[{line_id:'TAN10102',installations:2,distinct_sources:1,identity_collision:true,
      owner_uid:'PRIVATE-ACCOUNT',candidates:[
        {source_id:'station-<A>',snapshot_id:'8',snapshot_revision:2,collected_at:'2026-10-23T12:00:00Z',owner_uid:'SECRET'},
        {source_id:'station-<A>',snapshot_id:'9',snapshot_revision:3,collected_at:'2026-10-23T12:30:00Z'}],
      observation_comparison:{state:'candidate_overlap',window_scope:'overlap_only',observed_defects:[5,6],outside_common_window:[0,1],coverage_complete:[false,true],candidate_matches:4,unmatched_observed:[1,2]}}]}};
  const model=buildSyncHealth(agent);
  assert.equal(model.read_status,'origin_conflict');
  assert.equal(model.conflicts[0].identity_collision,true);
  assert.deepEqual(model.conflicts[0].candidates.map(c=>c.snapshot_id),['8','9']);
  assert.equal(JSON.stringify(model).includes('PRIVATE-ACCOUNT'),false);
  assert.equal(JSON.stringify(model).includes('SECRET'),false);
  const store={agent:()=>agent,read:()=>({snapshot:null,freshness:'unknown',source:null})};
  const root={innerHTML:'',setAttribute(){},removeAttribute(){},replaceChildren(){this.innerHTML='';},querySelectorAll(){return [];}};
  createDataHealthView(root,store).render();
  assert.match(root.innerHTML,/data-sync-origin-conflicts/);
  assert.match(root.innerHTML,/station-&lt;A&gt;/);
  assert.match(root.innerHTML,/Coincidências candidatas.*4/);
  assert.match(root.innerHTML,/Comparação restrita à janela temporal comum/);
  assert.match(root.innerHTML,/Fora da janela comum.*0 \/ 1/);
  assert.match(root.innerHTML,/Cobertura 3028 reportada completa por coleta.*não \/ sim/);
  assert.doesNotMatch(root.innerHTML,/PRIVATE-ACCOUNT|SECRET/);
  const copy=factorySyncEvidence(agent);
  assert.deepEqual(copy.receiving.conflict_candidates,[{line_id:'TAN10102',installations:2,distinct_sources:1,identity_collision:true,comparison_state:'candidate_overlap',candidate_matches:4}]);
  assert.equal(JSON.stringify(copy).includes('station-'),false);
});

test('data health renders shared workstation authority and escaped source metadata',()=>{
  const agent={status:'offline',agent_build:'build-<1>',runtime:{candidate_version:'candidate-&-2',setup_complete:true,network:{secret:'must-not-render'}},readiness:{engine:true},capabilities:{process_timeline:false},sync:{
    read_status:'ready',remote_scope:'team_latest',remote_latest_collected_at:'2026-10-14T12:00:00Z',
    remote_heads:[{line_id:'TAN10101',source_id:'posto-&-1',snapshot_id:'31',snapshot_revision:4,collected_at:'2026-10-14T11:00:00Z',authority:'team_latest'}]
  }};
  const store={agent:()=>agent,read:()=>({snapshot:null,freshness:'unknown',source:null})};
  const root={innerHTML:'',setAttribute(){},removeAttribute(){},replaceChildren(){this.innerHTML='';},querySelectorAll(){return [];}};
  const view=createDataHealthView(root,store);view.render();
  assert.match(root.innerHTML,/data-workstation-health/);
  assert.match(root.innerHTML,/Posto local/);
  assert.match(root.innerHTML,/build-&lt;1&gt;/);
  assert.match(root.innerHTML,/candidate-&amp;-2/);
  assert.equal(root.innerHTML.includes('must-not-render'),false);
  assert.match(root.innerHTML,/data-sync-health/);
  assert.match(root.innerHTML,/Sincronização entre postos/);
  assert.match(root.innerHTML,/Mais recente da equipe/);
  assert.match(root.innerHTML,/posto-&amp;-1/);
  assert.equal(root.innerHTML.includes('owner_uid'),false);
  view.clear();
});

test('3012 cache coverage never becomes coverage of current PCBAs without linked evidence',()=>{
  const store=fakeStore([{pcba_sn:'P1',repair_evidence_3012:[]}]);
  const item=buildDataHealth(store,repairStatus({rows:14,coverageSns:3,coverageIntervals:5})).find(x=>x.source==='3012');
  assert.equal(item.count,0);
  assert.equal(item.state.tone,'partial');
  assert.match(item.state.label,/Sem vínculo neste snapshot|No link in this snapshot/);
  assert.match(item.state.detail,/não prova cobertura|does not prove coverage/);
  assert.equal(item.cache.coverageSns,3);
  assert.equal(item.cache.factoryValidated,false);
});

test('3012 without linked evidence and without exact cache stays unknown, never zero-covered',()=>{
  const store=fakeStore([{pcba_sn:'P1',repair_evidence_3012:[]}]);
  const item=buildDataHealth(store,repairStatus()).find(x=>x.source==='3012');
  assert.equal(item.count,0);
  assert.equal(item.state.tone,'unknown');
  assert.match(item.state.label,/Não comprovado|Not proven/);
  assert.match(item.state.detail,/não equivale a zero reparos|does not mean zero repairs/);
});

test('3012 linked evidence counts only current occurrences and does not inherit unrelated cache rows',()=>{
  const store=fakeStore([
    {pcba_sn:'P1',repair_evidence_3012:[{row_key:'R1'}]},
    {pcba_sn:'P2',repair_evidence_3012:[]},
  ]);
  const item=buildDataHealth(store,repairStatus({rows:999,coverageSns:100,coverageIntervals:120})).find(x=>x.source==='3012');
  assert.equal(item.count,1);
  assert.equal(item.state.tone,'partial');
  assert.match(item.state.detail,/1\/2/);
  assert.equal(item.cache.rows,999);
});
test('factory A/B diagnostic excludes account, installation identity, SN and raw errors',()=>{
  const sample=factorySyncEvidence({
    status:'connected',agent_build:'0.5.25-rc1',user_uid:'UID_DO_NOT_COPY',
    sync:{
      status:'shared_history_legacy_conflict',read_status:'ready',pending:0,
      source_id:'SOURCE_ID_DO_NOT_COPY',cookie:'COOKIE_DO_NOT_COPY',
      identity_blocked:['TAN10103','UNTRUSTED_DO_NOT_COPY'],
      publish_errors:[{line_id:'TAN10103',message:'PASSWORD_DO_NOT_COPY'}],
      origin_conflict_lines:[],
      last_sent:{line_id:'TAN10103',snapshot_id:'19',snapshot_revision:2,
        authority:'operational_day_history',sent_at:'2026-10-19T14:00:00Z',
        source_id:'INSTALLATION_DO_NOT_COPY'},
      last_publish_timing:{line_id:'TAN10103',parts_ms:300,head_ms:15,history_ms:40,total_ms:355},
      remote_scope:'operational_day_history',
      last_received_at:'2026-10-19T14:00:10Z',server_received_at:'2026-10-19T14:00:09Z',
      remote_heads:[{line_id:'TAN10103',snapshot_id:'19',snapshot_revision:2,
        collected_at:'2026-10-19T13:55:00Z',authority:'operational_day_history',
        owner_uid:'UID_B_DO_NOT_COPY',source_id:'INSTALLATION_B_DO_NOT_COPY',
        pcba_sn:'PCBA_DO_NOT_COPY'}],
      last_receive_timing:{read_ms:85,download_ms:63,candidates:23,downloaded:2,cache_hits:0,skipped_versions:21}
    }
  },new Date('2026-10-19T14:01:00Z'));
  assert.equal(sample.schema,'ames-pr38-factory-a-b-v1');
  assert.equal(sample.publishing.last_sent.authority,'operational_day_history');
  assert.equal(sample.receiving.skipped_versions,21);
  assert.deepEqual(sample.publishing.blocked_lines,['TAN10103']);
  const output=JSON.stringify(sample);
  for(const secret of ['UID_DO_NOT_COPY','SOURCE_ID_DO_NOT_COPY','COOKIE_DO_NOT_COPY',
    'PASSWORD_DO_NOT_COPY','INSTALLATION_DO_NOT_COPY','INSTALLATION_B_DO_NOT_COPY',
    'PCBA_DO_NOT_COPY'])assert.equal(output.includes(secret),false,secret);
  assert.equal(output.includes('TAN10103'),true);
});
