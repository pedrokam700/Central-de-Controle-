import {SOURCE_STATE,normalizeSourceState,sourceStateLabel,sourceStateTone} from './data/source-provenance.mjs';
import {escapeHtml as esc} from './evidence-view.mjs';

// Pure read-only view model. A live SN response does not prove any line,
// workstation or MES collection period unless those fields are explicit.
export const SN_SOURCE_ORDER=Object.freeze(['3028','3074','2114','3022','3012']);
const own=(row,key)=>Boolean(row&&Object.prototype.hasOwnProperty.call(row,key));
const known=value=>value===null||value===undefined||String(value).trim()===''?null:String(value).trim();
const exactRevision=value=>Number.isSafeInteger(value)&&value>0?value:null;
const traces=Object.freeze({'3074':'trace_3074','2114':'trace_2114','3022':'trace_3022','3012':'trace_3012'});
const cleanMeta=(src={},state=SOURCE_STATE.NOT_COLLECTED)=>Object.freeze({
  state:normalizeSourceState(state),
  source_id:known(src.source_id),
  snapshot_id:known(src.snapshot_id),
  snapshot_revision:exactRevision(src.snapshot_revision),
  collected_at:known(src.collected_at),
  workstation_id:known(src.workstation_id),
  // Do not reinterpret dates from defects, repairs, process events, or job
  // submission as dates for the source collection.
  period_start:known(src.period?.start_at),
  period_end:known(src.period?.end_at),
});

export function snLiveSourceProvenance(result={},model={}){
  const statuses=model.source_states||{};
  return SN_SOURCE_ORDER.map(view=>{
    const raw=view==='3028'?result.local_snapshot:result[traces[view]];
    const state=normalizeSourceState(statuses[view]??(raw?SOURCE_STATE.PARTIAL:SOURCE_STATE.NOT_COLLECTED));
    return Object.freeze({view,...cleanMeta(raw&&typeof raw==='object'?raw:{},state)});
  });
}

const fmt=value=>value===null||value===undefined||value===''?'—':String(value);
const t=(locale,pt,en)=>String(locale||'pt-BR').startsWith('en')?en:pt;
export function renderSnLiveSourceProvenance(result={},model={},locale='pt-BR'){
  const sources=snLiveSourceProvenance(result,model);
  const rows=sources.map(item=>{
    const range=item.period_start||item.period_end?`${fmt(item.period_start)} → ${fmt(item.period_end)}`:'—';
    const tone=sourceStateTone(item.state);
    const css=tone==='bad'?'bad':tone==='warn'||tone==='cached'?'warn':tone==='ok'?'ok':'';
    return `<article data-sn-provenance-view="${item.view}" data-sn-provenance-state="${esc(item.state)}" class="ames-sn-repair-story"><div><small>${item.view}</small><b><span class="status ${css}">${esc(sourceStateLabel(item.state,locale))}</span></b></div>
      <div><small>${esc(t(locale,'Snapshot / revisão','Snapshot / revision'))}</small><b>${esc(fmt(item.snapshot_id))} / ${esc(fmt(item.snapshot_revision))}</b></div>
      <div><small>${esc(t(locale,'Coletado em','Collected at'))}</small><b>${esc(fmt(item.collected_at))}</b></div>
      <div><small>${esc(t(locale,'Origem / computador informado','Source / reported computer'))}</small><b>${esc(fmt(item.source_id))} / ${esc(fmt(item.workstation_id))}</b></div>
      <div><small>${esc(t(locale,'Período MES comprovado','Proven MES period'))}</small><b>${esc(range)}</b></div></article>`;
  }).join('');
  return `<details data-sn-live-provenance class="ames-sn-local-raw ames-sn-local-coverage-detail" data-no-i18n>
    <summary>${esc(t(locale,'Proveniência das fontes · consulta ao vivo','Source provenance · live lookup'))}</summary>
    <p class="mes-context">${esc(t(locale,'Cada estado se refere somente à consulta SN disponível. Não atribuímos linha, PC, período ou momento de coleta quando a fonte não os informa. Cache e ausência não significam zero no MES.','Each state describes only the available SN query. Line, PC, query period and collection time are not assumed when the source omits them. Cache and missing evidence do not mean zero in MES.'))}</p>
    <div class="ames-sn-material-history">${rows}</div>
  </details>`;
}
