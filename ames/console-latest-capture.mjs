import {normalizeCanonical} from './data/canonical.mjs';
import {factoryWallMinute} from './data/history.mjs';
import {readingPeriod as computeReadingPeriod} from './data/reading-period.mjs';
import {formatFactoryDateTime} from './data/time-display.mjs';
import {escapeHtml as esc} from './evidence-view.mjs';

const t=(pt,en)=>document.documentElement.lang.startsWith('en')?en:pt;
const time=v=>Date.parse(v||'')||0;
const ordered=(a,b)=>time(b.collected_at)-time(a.collected_at)||
  Number(b.snapshot_revision||0)-Number(a.snapshot_revision||0)||
  String(b.snapshot_id||'').localeCompare(String(a.snapshot_id||''));
const identity=e=>JSON.stringify([e.line_id,e.source_id,e.snapshot_id,e.snapshot_revision,e.period_start,e.period_end]);
const metric=v=>v===null||v===undefined?'—':String(v);

/** Latest is a SEPARATE proven historical observation, never the current-day population. */
export function planLatestCapture(entries=[],line,scope=null){
 const rows=entries.filter(e=>e.line_id===line&&e.source_id&&e.snapshot_id&&
   factoryWallMinute(e.period_start)&&factoryWallMinute(e.period_end)>
   factoryWallMinute(e.period_start)&&(!scope?.end||factoryWallMinute(e.period_start)<scope.end)).sort(ordered);
 if(!rows.length)return {status:'none',candidates:[],latest:null};
 const latestPeriod=factoryWallMinute(rows[0].period_start);
 const seen=new Set();
 const candidates=rows.filter(e=>factoryWallMinute(e.period_start)===latestPeriod).filter(e=>{
   if(seen.has(e.source_id))return false;seen.add(e.source_id);return true;
 });
 const origins=[...seen];
 return {status:origins.length>1?'conflict':'available',candidates,latest:candidates[0]};
}
export function createLatestCapturePreview(root,store,history,controller){
 let line='',periodKey='',plan=null,selected='',payload=null,loading=false,error='',request=0,disposed=false;
 const context=()=>{
   const line=store.context().line_id||store.preferredLine();
   const live=store.readingPeriod()?.mode==='today'&&!!store.read(line).snapshot;
   return {line, // If today is empty/conflicted, still expose today's SAVED capture
     // separately from the empty live KPI, with its original period and origin.
     previousCutoff:live?computeReadingPeriod('today',{now:store.currentTime()}).start:null};
 };
 async function load(nextLine,scope){
  const id=++request;loading=true;plan=null;selected='';payload=null;error='';render();
  try{const entries=await history.list(nextLine);if(disposed||request!==id)return;
   plan=planLatestCapture(entries,nextLine,scope);
   const preferred=controller.preferredSource?.(nextLine);
   const selectedEntry=plan.candidates.find(e=>e.source_id===preferred)||
     (plan.status==='available'?plan.latest:null);
   if(selectedEntry)await open(selectedEntry,id);
  }catch(e){if(!disposed&&request===id)error=e.message||'Erro ao carregar histórico';}
  finally{if(!disposed&&request===id){loading=false;render();}}
 }
 async function open(entry,id=request){
  if(!entry)return;
  const raw=await history.open(entry);
  if(disposed||request!==id)return;
  const canonical=normalizeCanonical(raw);
  if(canonical.line_id!==entry.line_id||canonical.source_id!==entry.source_id||
    String(canonical.snapshot_id)!==String(entry.snapshot_id)||
    (entry.snapshot_revision!=null&&canonical.snapshot_revision!==entry.snapshot_revision)||
    factoryWallMinute(raw.summary?.period?.start_at)!==factoryWallMinute(entry.period_start)||
    factoryWallMinute(raw.summary?.period?.end_at)!==factoryWallMinute(entry.period_end)||
    (entry.content_hash&&entry.content_hash!==raw.content_hash))throw Error('Histórico divergente: identidade ou período não comprovado');
  payload={entry,canonical};selected=identity(entry);
 }
 function render(){
  if(!root||disposed)return;
  const c=context();
  root.hidden=false;
  const key=JSON.stringify([c.line,c.previousCutoff]);
  if(key!==periodKey){periodKey=key;line=c.line;void load(c.line,{end:c.previousCutoff});return;}
  const latest=payload,choices=plan?.candidates||[];
  const text=loading?t('Consultando última coleta comprovada…','Looking up last proven capture…'):
   error?t('Falha na leitura histórica: ','History read failed: ')+error:
   !plan||plan.status==='none'?t('Ainda não há coleta anterior comprovada para esta linha. Isso não representa zero falhas.','No proven previous capture for this line; this is not zero failures.'):
   plan.status==='conflict'&&!latest?t('Existem registros de origens diferentes. Escolha um posto para visualizar, sem substituir o histórico.','Multiple workstation origins exist. Choose one to view without replacing history.'): '';
  const entry=latest?.entry,summary=latest?.canonical.summary||{};
   const panelOpen=Boolean(root.querySelector('[data-last-capture-panel]')?.open);
   const advancedOpen=Boolean(root.querySelector('[data-last-capture-advanced]')?.open);
  root.innerHTML='<details class="mes-context-panel ames-last-capture-collapsible" data-last-capture-panel>'+
   '<summary><strong>'+t('Última coleta disponível · histórico preservado','Latest available capture · saved history')+'</strong>'+
   (plan?.status==='conflict'&&!latest?'<span>'+t('Origens diferentes · selecionar ao expandir','Multiple origins · expand to select')+'</span>':'')+
   '</summary><div data-last-capture-body>'+
   '<p>'+t('Revisão salva identificada pelo período e origem originais. Pode ser de hoje ou de um dia anterior; nunca substitui o FPY atual automaticamente.','Saved revision identified by its original period and origin. It may be today or a previous day; never silently replaces live FPY.')+'</p>'+
   (text?'<p role="status">'+esc(text)+'</p>':'')+
   (plan?.status==='conflict'?'<details data-last-capture-advanced><summary>'+t('Opções avançadas · escolher origem','Advanced options · choose source')+'</summary><label>'+t('Origem do histórico · trocar coleta','Historical source · switch capture')+
      '<select data-last-capture-source aria-label="'+t('Trocar última coleta','Switch latest capture')+'"><option value="">'+
      t('Escolha uma origem','Choose a source')+'</option>'+choices.map(e=>'<option value="'+esc(identity(e))+
      '"'+(selected===identity(e)?' selected':'')+'>'+esc(e.source_id+' · '+formatFactoryDateTime(e.collected_at)+
      ' · r'+(e.snapshot_revision??'—'))+'</option>').join('')+'</select></label></details>':'')+
   (latest?'<div data-last-capture-evidence><p><strong>'+t('Período original','Original period')+':</strong> '+esc(formatFactoryDateTime(entry.period_start))+' → '+esc(formatFactoryDateTime(entry.period_end))+
     ' · <strong>'+t('Coleta','Collected')+':</strong> '+esc(formatFactoryDateTime(entry.collected_at))+'</p>'+
     '<p>'+esc(entry.line_id)+' · '+t('Origem','Source')+' '+esc(entry.source_id)+' · Snapshot '+esc(entry.snapshot_id)+' / r'+esc(entry.snapshot_revision??latest.canonical.snapshot_revision)+'</p>'+
     '<div class="ames-inline-facts"><span>FPY <b>'+esc(metric(summary.fpy))+'</b></span><span>Check FPY <b>'+esc(metric(summary.check_fpy))+'</b></span><span>Quantity <b>'+esc(metric(summary.quantity))+'</b></span><span>'+t('Falhas observadas','Observed failures')+' <b>'+esc(latest.canonical.occurrences.length)+'</b></span></div>'+
     '<button type="button" class="button secondary" data-last-capture-open>'+t('Abrir período original nesta Central','Open original period in this Work Center')+'</button></div>':'')+
   '</div></details>';
  root.querySelector('[data-last-capture-panel]').open=panelOpen;
  if(root.querySelector('[data-last-capture-advanced]'))root.querySelector('[data-last-capture-advanced]').open=advancedOpen;
   root.querySelector('[data-last-capture-source]')?.addEventListener('change',async e=>{
   const target=choices.find(x=>identity(x)===e.target.value),id=++request;
   selected='';payload=null;loading=Boolean(target);render();
   if(!target)return;
   try{
     controller.rememberSource?.(target.line_id,target.source_id,choices.map(e=>e.source_id));
     await open(target,id);error='';
   }catch(err){error=err.message;}
   finally{if(!disposed&&id===request){loading=false;render();}}
  });
  root.querySelector('[data-last-capture-open]')?.addEventListener('click',async()=>{
   if(!entry)return;
   // Only a human action changes global read scope, never an automatic fallback.
   await controller.select('custom',{start:factoryWallMinute(entry.period_start),end:factoryWallMinute(entry.period_end)});
   const choices=store.agent().period_read?.source_choices||[];
   if(choices.some(x=>x.line_id===entry.line_id&&x.options.some(o=>o.source_id===entry.source_id)))await controller.chooseSource(entry.line_id,entry.source_id);
  });
 }
 return {render,reload(){if(disposed)return;const c=context();void load(c.line,{end:c.previousCutoff});},clear(){disposed=true;request++;root?.replaceChildren();}};
}
