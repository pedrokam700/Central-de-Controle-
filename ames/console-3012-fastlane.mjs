import {createAdvancedTable} from './advanced-table.mjs';
import {REPAIR_COLUMNS} from './console-fastlane-sn-reuse.mjs';
import { AGENT_URL } from './data/agent-contract.mjs';
import { escapeHtml as esc } from './evidence-view.mjs';

const TOKEN_KEY='central.ames.agentToken.v1';
const fmt=v=>v===null||v===undefined||v===''?'—':String(v);
function token(){try{return window.sessionStorage?.getItem(TOKEN_KEY)||'';}catch{return '';}}
async function request(path,body){
  const headers={};const auth=token();if(auth)headers['X-Central-Agent-Token']=auth;if(body!==undefined)headers['Content-Type']='application/json';
  const r=await fetch(AGENT_URL+path,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(35000)});
  const data=await r.json().catch(()=>({}));if(r.status===401)throw new Error('Abra a Central pelo launcher deste posto.');if(!r.ok)throw new Error(data.message||data.error||`HTTP ${r.status}`);return data;
}
function isoDate(date){return date.toISOString().slice(0,10);}
function table(rows){
  if(!rows?.length)return '<div class="ames-empty"><span>—</span><p>Nenhum registro 3012 na base para os filtros atuais.</p></div>';
  const cols=[['pcba_sn','PCBA / SN'],['line','Linha'],['product_model','Modelo'],['defect_time','Defect Time'],['defect_user','Defect User'],['defect_oper','Defect Oper'],['defect_code','Defect Code'],['defect_desc','Defect Desc'],['defect_reason_type','Reason Type'],['repair_user','Repair User'],['repair_time','Repair Time'],['repair_code','Repair Code'],['repair_desc','Repair Desc'],['repair_comment','Repair Comment']];
  return `<div class="table-wrap ames-fastlane-table ames-3012-table"><table><thead><tr>${cols.map(([,l])=>`<th>${esc(l)}</th>`).join('')}</tr></thead><tbody>${rows.slice(0,5000).map(row=>`<tr>${cols.map(([k])=>`<td>${esc(fmt(row[k]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
export function create3012FastlaneView(root,store){
  let mounted=false,pollTimer=null,rows=[],statusText='Pronto',capability=null;
  function formValues(){
    const f=root.querySelector('[data-3012-form]'),data=new FormData(f),sn=String(data.get('sn')||'').trim();
    return {sn,start_at:String(data.get('start_at')||'')+'T00:00:00',end_at:String(data.get('end_at')||'')+'T23:59:59',line:String(data.get('line')||''),model:String(data.get('model')||''),defect_code:String(data.get('defect_code')||''),repair_code:String(data.get('repair_code')||''),defect_type:String(data.get('defect_type')||''),chunk_days:sn?120:31};
  }
  async function loadLocal(){
    const v=formValues(),q=new URLSearchParams({sn:v.sn,start_at:v.start_at,end_at:v.end_at,line:v.line,defect_code:v.defect_code,limit:'10000'});const out=await request('/3012/history?'+q);rows=out.rows||[];statusText=`Base local: ${rows.length} registro(s)`;renderBody();
  }
  async function poll(id){
    clearTimeout(pollTimer);
    try{const job=await request('/jobs/'+encodeURIComponent(id));statusText=`${job.status} · ${job.stage||''} · ${job.message||''}`;renderBody();if(['done','error','cancelled','skipped'].includes(job.status)){if(job.status==='done')await loadLocal();return;}pollTimer=setTimeout(()=>poll(id),900);}catch(error){statusText='Falha ao acompanhar 3012: '+error.message;renderBody();}
  }
  async function collect(){
    const button=root.querySelector('[data-3012-run]');button.disabled=true;statusText='Enviando consulta 3012…';renderBody();
    try{const job=await request('/3012/query',formValues());poll(job.id);}catch(error){statusText='3012: '+error.message;renderBody();}finally{button.disabled=false;}
  }
  function renderBody(){
    const body=root.querySelector('[data-3012-body]');if(!body)return;
    body.innerHTML=`<div class="ames-job-strip"><b>${esc(statusText)}</b><span>${capability?.factory_validated?'3012 validada fisicamente':'implementada · gate físico ainda pendente'}</span></div><div data-repair-configurable></div>`;
    createAdvancedTable(body.querySelector('[data-repair-configurable]'),{rows,columns:REPAIR_COLUMNS,key:'process-repair-3012',presets:[{id:'repair',label:'Reparo 3012',en:'3012 repair'}]});
  }
  async function readCapability(){try{capability=await request('/3012/capability');renderBody();}catch(error){capability={implemented:false,factory_validated:false,error:error.message};renderBody();}}
  function render(){
    if(!mounted){
      const now=new Date(),from=new Date(now);from.setDate(from.getDate()-7);
      root.innerHTML=`<section class="mes-context-panel ames-fastlane-panel ames-3012-panel"><div class="section-head"><div><h3>3012 · Defect Repair Inquiry</h3><p>Defeito + reparo + análise/Repair Comment. A coleta lê a grid ExtJS diretamente; exportação Excel não é requisito.</p></div><span class="status warn">GATE FÍSICO</span></div>
        <form data-3012-form class="ames-3012-form"><label>SN / PCBA<input name="sn" placeholder="opcional · por SN pode usar período maior"></label><label>Início<input type="date" name="start_at" value="${isoDate(from)}"></label><label>Fim<input type="date" name="end_at" value="${isoDate(now)}"></label><label>Linha<input name="line" placeholder="opcional"></label><label>Modelo<input name="model" placeholder="CPH..."></label><label>Defect Code<input name="defect_code" placeholder="opcional"></label><label>Repair Code<input name="repair_code" placeholder="opcional"></label><label>Defect Type<input name="defect_type" placeholder="opcional"></label><div class="ames-3012-actions"><button type="button" class="button primary" data-3012-run>Coletar 3012</button><button type="button" class="button secondary" data-3012-local>Consultar SQLite</button></div></form><p class="mes-context">Sem SN, períodos grandes são divididos automaticamente em blocos de 31 dias. Com SN, blocos maiores são usados. Cada bloco fica checkpointado para retomada após queda de rede/Chrome.</p><div data-3012-body></div></section>`;
      root.querySelector('[data-3012-run]').addEventListener('click',collect);root.querySelector('[data-3012-local]').addEventListener('click',()=>loadLocal().catch(error=>{statusText=error.message;renderBody();}));mounted=true;readCapability();
    }
    renderBody();
  }
  return {render,clear(){clearTimeout(pollTimer);root.replaceChildren();mounted=false;rows=[];}};
}
