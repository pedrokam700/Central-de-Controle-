import { LINE_IDS } from './data/contract.mjs';
import { escapeHtml as esc } from './evidence-view.mjs';

const fmt=v=>v===null||v===undefined||v===''?'—':String(v);

export function createFailureProcessAddon(root,store,filterRoot){
  let last='';
  const selectedLine=()=>filterRoot?.querySelector('[data-failure-line]')?.value||LINE_IDS[0];
  function render(){
    const line=selectedLine(),read=store.read(line),snapshot=read.snapshot,contexts=snapshot?.process_timeline?.contexts||[];
    const key=JSON.stringify([line,snapshot?.snapshot_id,read.source,read.freshness,contexts]);if(key===last)return;last=key;
    root.innerHTML=`<section class="mes-context-panel ames-failure-process-addon"><div class="section-head"><div><h3>Contexto 3022 das falhas</h3><p>Cruzamento temporal da mesma base. Defect Time é detecção/registro; horário de processo é evidência de passagem e nunca causa automática.</p></div><span class="ames-runtime-job">${esc(contexts.length)} contexto(s)</span></div><div class="ames-rule-strip ames-rule-strip-strong"><b>Regra temporal:</b><span>ocorrência atual → Defect Time → posto relevante → última passagem válida ≤ Defect Time</span><small>${esc(line)} · snapshot ${esc(snapshot?.snapshot_id||'não carregado')} · origem ${esc(read.source||'none')} · cobertura ${esc(snapshot?.coverage?.status||'indisponível')}</small></div>${contexts.length?`<div class="table-wrap"><table><thead><tr><th>PCBA</th><th>Defect Code</th><th>Defect Time</th><th>Manual/Automatic</th><th>Posto relevante</th><th>Horário real</th><th>Processo anterior</th><th>Horário anterior</th><th>AT / ação</th><th>Retorno A5201</th><th>Status</th></tr></thead><tbody>${contexts.slice(0,2500).map(row=>`<tr><td>${esc(fmt(row.pcba_sn))}</td><td><b>${esc(fmt(row.defect_code))}</b></td><td>${esc(fmt(row.defect_time))}</td><td>${esc(fmt(row.registration_mode||row.manual_or_auto_2114||row.manual_or_auto))}</td><td>${esc(fmt(row.reference_station_code))}</td><td>${esc(fmt(row.reference_event_time))}</td><td>${esc(fmt(row.previous_operation_code||row.previous_operation_name))}</td><td>${esc(fmt(row.previous_event_time))}</td><td>${esc(fmt(row.repair_action))}</td><td>${esc(fmt(row.return_a5201_event_time))}</td><td>${esc(fmt(row.status))}</td></tr>`).join('')}</tbody></table></div>`:`<div class="ames-empty"><span>—</span><p>3022 ainda não foi coletado para este snapshot/linha. Ausência de contexto não significa horário zero nem ausência de passagem no MES.</p></div>`}</section>`;
  }
  const onChange=e=>{if(e.target?.matches?.('[data-failure-line]')){last='';queueMicrotask(render);}};
  filterRoot?.addEventListener('change',onChange);
  return {render,clear(){filterRoot?.removeEventListener('change',onChange);root?.replaceChildren();last='';}};
}
