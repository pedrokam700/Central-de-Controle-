import {createAdvancedTable} from './advanced-table.mjs';
import {REPAIR_COLUMNS} from './console-fastlane-sn-reuse.mjs';
import { AGENT_URL } from './data/agent-contract.mjs';
import { escapeHtml as esc } from './evidence-view.mjs';

const TOKEN_KEY='central.ames.agentToken.v1';
const fmt=v=>v===null||v===undefined||v===''?'—':String(v);
const t=(pt,en)=>document.documentElement.lang.startsWith('en')?en:pt;
function token(){try{return window.sessionStorage?.getItem(TOKEN_KEY)||'';}catch{return '';}}
async function request(path,body){
  const headers={};const auth=token();if(auth)headers['X-Central-Agent-Token']=auth;if(body!==undefined)headers['Content-Type']='application/json';
  const r=await fetch(AGENT_URL+path,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(35000)});
  const data=await r.json().catch(()=>({}));if(r.status===401)throw new Error(t('Abra a Central pelo launcher deste posto.','Open Work Center using this workstation launcher.'));if(!r.ok)throw new Error(data.message||data.error||`HTTP ${r.status}`);return data;
}
function isoDate(date){return date.toISOString().slice(0,10);}
export function create3012FastlaneView(root,store){
  let mounted=false,pollTimer=null,rows=[],statusText=t('Pronto','Ready'),capability=null,amesStartDate='',startDateDirty=false,lastLang='';
  function formValues(){
    const f=root.querySelector('[data-3012-form]'),data=new FormData(f),sn=String(data.get('sn')||'').trim(),fullHistory=Boolean(sn&&root.querySelector('[data-3012-full-history]')?.checked);
    const start=fullHistory?(amesStartDate||String(data.get('start_at')||'')):String(data.get('start_at')||'');
    return {sn,start_at:start?start+'T00:00:00':'',end_at:String(data.get('end_at')||'')+'T23:59:59',line:String(data.get('line')||''),model:String(data.get('model')||''),defect_code:String(data.get('defect_code')||''),repair_code:String(data.get('repair_code')||''),defect_type:String(data.get('defect_type')||''),chunk_days:sn?90:31};
  }
  function preserveForm(){
    if(!mounted)return null;
    const f=root.querySelector('[data-3012-form]');if(!f)return null;
    const data=Object.fromEntries(new FormData(f));
    return {...data,fullHistory:Boolean(root.querySelector('[data-3012-full-history]')?.checked),amesStartDateInput:String(root.querySelector('[data-ames-start-date]')?.value||'')};
  }
  function syncHistoryMode(){
    const sn=String(root.querySelector('[name="sn"]')?.value||'').trim(),box=root.querySelector('[data-3012-full-history]'),start=root.querySelector('[name="start_at"]'),hint=root.querySelector('[data-3012-history-hint]');
    if(box)box.disabled=!sn;
    if(sn&&box?.checked&&amesStartDate&&!startDateDirty&&start)start.value=amesStartDate;
    if(hint)hint.textContent=sn&&box?.checked?t(`SN exata: consulta desde ${amesStartDate||'AMES_START_DATE'} e usa o SQLite como cache; somente lacunas temporais voltam ao MES.`,`Exact SN: queries from ${amesStartDate||'AMES_START_DATE'} and uses SQLite as cache; only temporal gaps return to MES.`):t('Período manual: a consulta respeita as datas informadas.','Manual period: the query follows the selected dates.');
  }
  async function loadLocal(){
    const v=formValues(),q=new URLSearchParams({sn:v.sn,start_at:v.start_at,end_at:v.end_at,line:v.line,defect_code:v.defect_code,limit:'10000'});const out=await request('/3012/history?'+q);rows=out.rows||[];statusText=t(`Base local: ${rows.length} registro(s)`,`Local database: ${rows.length} record(s)`);renderBody();
  }
  async function poll(id){
    clearTimeout(pollTimer);
    try{const job=await request('/jobs/'+encodeURIComponent(id));statusText=`${job.status} · ${job.stage||''} · ${job.message||''}`;renderBody();if(['done','error','cancelled','skipped'].includes(job.status)){if(job.status==='done')await loadLocal();return;}pollTimer=setTimeout(()=>poll(id),900);}catch(error){statusText=t('Falha ao acompanhar 3012: ','Failed to track 3012: ')+error.message;renderBody();}
  }
  async function collect(){
    const button=root.querySelector('[data-3012-run]');button.disabled=true;statusText=t('Enviando consulta 3012…','Submitting 3012 query…');renderBody();
    try{const job=await request('/3012/query',formValues());poll(job.id);}catch(error){statusText='3012: '+error.message;renderBody();}finally{button.disabled=false;}
  }
  async function saveStartDate(){
    const input=root.querySelector('[data-ames-start-date]'),value=String(input?.value||'').trim();
    try{const out=await request('/config',{ames_start_date:value});amesStartDate=String(out.config?.ames_start_date||value);statusText=t(`Início histórico A-MES salvo: ${amesStartDate||'não definido'}`,`A-MES historical start saved: ${amesStartDate||'not set'}`);startDateDirty=false;syncHistoryMode();renderBody();}
    catch(error){statusText=t('Não foi possível salvar AMES_START_DATE: ','Could not save AMES_START_DATE: ')+error.message;renderBody();}
  }
  function renderBody(){
    const body=root.querySelector('[data-3012-body]');if(!body)return;
    body.innerHTML=`<div class="ames-job-strip"><b>${esc(statusText)}</b><span>${capability?.factory_validated?t('3012 validada fisicamente','3012 physically validated'):t('implementada · gate físico ainda pendente','implemented · physical gate still pending')}</span></div><div data-repair-configurable></div>`;
    createAdvancedTable(body.querySelector('[data-repair-configurable]'),{rows,columns:REPAIR_COLUMNS,key:'process-repair-3012',presets:[{id:'repair',label:'Reparo 3012',en:'3012 repair'}]});
  }
  async function readCapability(){try{capability=await request('/3012/capability');amesStartDate=String(capability.ames_start_date||'');const input=root.querySelector('[data-ames-start-date]');if(input&&!input.value)input.value=amesStartDate;syncHistoryMode();renderBody();}catch(error){capability={implemented:false,factory_validated:false,error:error.message};renderBody();}}
  function render(){
    const lang=document.documentElement.lang||'pt-BR';let preserved=null;
    if(mounted&&lang!==lastLang){preserved=preserveForm();root.replaceChildren();mounted=false;}
    if(!mounted){
      const now=new Date(),from=new Date(now);from.setDate(from.getDate()-7);
      root.innerHTML=`<section class="mes-context-panel ames-fastlane-panel ames-3012-panel"><div class="section-head"><div><h3>3012 · Defect Repair Inquiry</h3><p>${t('Defeito + reparo + análise/Repair Comment. A coleta lê a grid ExtJS diretamente; exportação Excel não é requisito.','Defect + repair + analysis/Repair Comment. Collection reads the ExtJS grid directly; Excel export is not required.')}</p></div><span class="status warn">${t('GATE FÍSICO','PHYSICAL GATE')}</span></div>
        <div class="ames-3012-history-config"><label>${t('Início histórico A-MES','A-MES historical start')}<input type="date" data-ames-start-date></label><button type="button" class="button secondary" data-ames-start-save>${t('Salvar data-base','Save start date')}</button><small>${t('Usado por padrão em consultas de SN exata. É configuração do posto, não um ano fixo no código.','Used by default for exact-SN queries. This is a workstation setting, not a year hardcoded in code.')}</small></div>
        <form data-3012-form class="ames-3012-form"><label>SN / PCBA<input name="sn" placeholder="${t('opcional · por SN pode usar histórico total','optional · exact SN can use full history')}"></label><label>${t('Início','Start')}<input type="date" name="start_at" value="${isoDate(from)}"></label><label>${t('Fim','End')}<input type="date" name="end_at" value="${isoDate(now)}"></label><label>${t('Linha','Line')}<input name="line" placeholder="${t('opcional','optional')}"></label><label>${t('Modelo','Model')}<input name="model" placeholder="CPH..."></label><label>Defect Code<input name="defect_code" placeholder="${t('opcional','optional')}"></label><label>Repair Code<input name="repair_code" placeholder="${t('opcional','optional')}"></label><label>Defect Type<input name="defect_type" placeholder="${t('opcional','optional')}"></label><label class="ames-3012-history-option"><input type="checkbox" data-3012-full-history checked disabled> ${t('SN exata: histórico desde AMES_START_DATE','Exact SN: history from AMES_START_DATE')}</label><div class="ames-3012-actions"><button type="button" class="button primary" data-3012-run>${t('Coletar 3012','Collect 3012')}</button><button type="button" class="button secondary" data-3012-local>${t('Consultar SQLite','Query SQLite')}</button></div></form><p class="mes-context" data-3012-history-hint>${t('Sem SN, períodos grandes são divididos em blocos com checkpoint.','Without an SN, large periods use checkpointed chunks.')}</p><div data-3012-body></div></section>`;
      if(preserved){
        for(const name of ['sn','start_at','end_at','line','model','defect_code','repair_code','defect_type']){const el=root.querySelector(`[name="${name}"]`);if(el&&preserved[name]!==undefined)el.value=String(preserved[name]);}
        const full=root.querySelector('[data-3012-full-history]');if(full)full.checked=Boolean(preserved.fullHistory);
        const startInput=root.querySelector('[data-ames-start-date]');if(startInput)startInput.value=preserved.amesStartDateInput||amesStartDate;
      }
      root.querySelector('[data-3012-run]').addEventListener('click',collect);root.querySelector('[data-3012-local]').addEventListener('click',()=>loadLocal().catch(error=>{statusText=error.message;renderBody();}));root.querySelector('[data-ames-start-save]').addEventListener('click',saveStartDate);root.querySelector('[name="sn"]').addEventListener('input',syncHistoryMode);root.querySelector('[name="start_at"]').addEventListener('input',()=>{startDateDirty=true;});root.querySelector('[data-3012-full-history]').addEventListener('change',syncHistoryMode);mounted=true;lastLang=lang;
      if(capability){const input=root.querySelector('[data-ames-start-date]');if(input&&!input.value)input.value=amesStartDate;syncHistoryMode();renderBody();}else readCapability();
    }
    syncHistoryMode();renderBody();
  }
  return {render,clear(){clearTimeout(pollTimer);root.replaceChildren();mounted=false;rows=[];lastLang='';}};
}