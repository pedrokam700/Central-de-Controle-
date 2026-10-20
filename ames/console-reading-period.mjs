import {escapeHtml as esc} from './evidence-view.mjs';
import {LINE_IDS} from './data/contract.mjs';
import {formatFactoryDateTime} from './data/time-display.mjs';
import {fiveSourceEvidence} from './data/source-coverage.mjs';
import {createSourceCaptureHistory} from './console-source-capture-history.mjs';
const t=(pt,en)=>document.documentElement.lang.startsWith('en')?en:pt;

export function paintReadingPeriod(root,store,controller){
  const p=store.readingPeriod(),status=store.agent().period_read;
  const loaded=LINE_IDS.filter(line=>!!store.read(line).snapshot);
  const line=store.context?.()?.line_id||store.preferredLine?.();
  const missing=p?.mode!=='today'&&status?.status!=='loading'&&!!line&&!store.read(line).snapshot;
  const selectionNeeded=status?.source_choices?.find(choice=>choice.line_id===line&&choice.options?.length);
  const sourcePicker=selectionNeeded&&status?.status!=='loading'?'<div class="mes-context" data-history-source-picker>'+
    '<label>'+t('Histórico encontrado em mais de um posto. Escolha a origem da Linha','History found on multiple workstations. Choose the source for line')+' '+esc(line)+
    '<select data-history-source-select>'+selectionNeeded.options.map(o=>'<option value="'+esc(o.source_id)+'">'+
      esc((o.history_source==='local'?t('Local neste computador','Local on this computer'):t('Compartilhado','Shared'))+' · '+o.source_id+' · '+formatFactoryDateTime(o.collected_at))+
      '</option>').join('')+'</select></label>'+
    '<button type="button" class="button secondary" data-history-source-apply>'+t('Abrir esta origem','Open this source')+'</button></div>':'';
  const note=status?.status==='loading'?t('Consultando revisões salvas…','Reading saved revisions…'):
    selectionNeeded?t('Existem revisões salvas de origens diferentes. Nenhuma foi descartada; escolha a origem para visualizar.','Saved revisions come from different workstations. None was discarded; choose one to view.') :
    missing?t('Nenhuma revisão salva disponível nesta linha e período. Não significa zero falhas. Após a coleta, use Atualizar leitura se necessário.','No saved revision for this line and period. This is not zero failures. After collection, use Refresh reading if needed.') :
    p?.mode!=='today'&&status?.status==='ready'?loaded.length+' '+t('linha(s) com revisão disponível','line(s) with saved revisions'):'';
  root.setAttribute('data-no-i18n','');
  root.innerHTML=`<nav class="ames-history-tabs" aria-label="${t('Período de leitura','Reading period')}">${[['today',t('Hoje','Today')],['previous',t('Último dia produtivo','Last production day')],['custom',t('Período…','Period…')]].map(([id,label])=>`<button type="button" class="button secondary" data-read-period="${id}" aria-pressed="${p?.mode===id}">${label}</button>`).join('')}</nav><p class="mes-context" data-reading-label>${p?esc(formatFactoryDateTime(p.start)+' → '+formatFactoryDateTime(p.end)):''} · America/Sao_Paulo · ${t('07:00 → 07:00; turnos são outra dimensão','07:00 → 07:00; shifts are a separate dimension')}${p?.mode!=='today'?' · '+t('Somente leitura do passado','Read-only history'):''}</p><form data-reading-range hidden><div class="mes-filters"><label>${t('Início','Start')}<input type="datetime-local" name="start" required value="${esc(p?.start||'')}"></label><label>${t('Fim','End')}<input type="datetime-local" name="end" required value="${esc(p?.end||'')}"></label></div><button class="button secondary" type="submit">${t('Ver dados armazenados','View stored data')}</button></form><p role="status" data-reading-status>${esc(status?.errors?.length?status.errors.map(e=>e.line_id+': '+e.error).join(' · '):note)}</p>${sourcePicker}${p?.mode!=='today'?'<button type="button" class="button secondary" data-reading-reload>'+t('Atualizar leitura','Refresh reading')+'</button>':''}`;
  for(const b of root.querySelectorAll('[data-read-period]'))b.addEventListener('click',()=>{
    if(b.dataset.readPeriod==='custom'){root.querySelector('form').hidden=false;return;}
    void controller.select(b.dataset.readPeriod);
  });
  root.querySelector('[data-history-source-apply]')?.addEventListener('click',()=>{
    const source_id=root.querySelector('[data-history-source-select]')?.value;
    if(!source_id||!line)return;
    void controller.chooseSource(line,source_id).catch(error=>{
      const el=root.querySelector('[data-reading-status]');if(el)el.textContent=error.message;
    });
  });
  root.querySelector('[data-reading-reload]')?.addEventListener('click',()=>{
    const period=store.readingPeriod();
    void controller.select(period.mode,period.mode==='custom'?{start:period.start,end:period.end}:{}).catch(error=>{
      const el=root.querySelector('[data-reading-status]');if(el)el.textContent=error.message;
    });
  });
  root.querySelector('form').addEventListener('submit',event=>{
    event.preventDefault();const fields=event.currentTarget.elements;
    void controller.select('custom',{start:fields.start.value,end:fields.end.value}).catch(error=>{root.querySelector('[data-reading-status]').textContent=error.message;});
  });
}

// Stored evidence inside the existing SN/Base/CORA/3012 views. No live job result,
// localhost query or inferred repair association can enter a historical read.
export function createStoredPeriodRecords(root,store,{kind='base',client=null}={}){
  let key='',page=0,query='',dataset=kind==='repairs'?'repairs':'defects',capturePanel=null;
  const size=25;
  function render(){
    capturePanel?.clear();capturePanel=null;
    const line=store.context().line_id||store.preferredLine(),read=store.read(line),p=read.snapshot?.canonical;
    const signature=JSON.stringify([store.contextRevision(),line,p?.source_id,p?.snapshot_id,p?.snapshot_revision,document.documentElement.lang]);
    if(signature!==key){page=0;key=signature;}
    const sets={...(p?.datasets||{}),repairs:(p?.datasets?.defects||[]).flatMap(r=>(r.repair_evidence_3012||[]).map(e=>({...e,pcba_sn:r.pcba_sn,occurrence_id:r.occurrence_id,association:t('Candidata; não confirma reparo desta falha','Candidate; does not confirm repair of this failure')})))};
    const all=sets[dataset]||[],needle=query.trim().toLowerCase();
    const rows=all.filter(r=>!needle|| (kind==='sn'?[r.pcba_sn,r.item_sn,r.material_sn].some(x=>String(x||'').toLowerCase()===needle):JSON.stringify(r).toLowerCase().includes(needle)));
    page=Math.min(page,Math.max(0,Math.ceil(rows.length/size)-1));
    const completeness=fiveSourceEvidence(p);
    const labels={3028:'3028 · FPY/falhas',3074:'3074 · materiais',2114:'2114 · PCBAs',3022:'3022 · passagens',3012:'3012 · AT'};
    const badges=completeness.map(s=>`<span data-source-view="${s.view}" data-source-status="${s.status}"><b>${labels[s.view]}</b>: ${s.status==='unknown'?t('não comprovado','not verified'):s.status==='candidate_partial'?t('candidatos parciais','partial candidates'):t('parcial','partial')}${s.count===null?'':` · ${s.count} ${t('registro(s)','row(s)')}`}</span>`).join(' · ');
    const titles={sn:t('Consultar SN nos dados armazenados','Find SN in stored data'),base:t('Base do período selecionado','Selected period database'),knowledge:t('Fatos armazenados do período','Stored facts for this period'),repairs:t('3012 · evidências candidatas armazenadas','3012 · stored candidate evidence')};
    root.setAttribute('data-no-i18n','');
    root.innerHTML=`<section class="mes-context-panel"><h3>${titles[kind]}</h3><p>${t('Somente os dados desta revisão. Cobertura ausente não significa zero; associação não confirma causa.','Only data from this revision. Missing coverage is not zero; association does not confirm cause.')}</p><p>${esc(line)} · ${esc(read.source)} · ${esc(p?.source_id||'—')} / ${esc(p?.snapshot_id||'—')} / r${esc(p?.snapshot_revision||'—')} · ${esc(formatFactoryDateTime(p?.collected_at))}</p><div data-five-source-coverage class="mes-context" role="status">${badges}<p>${t('Cobertura por fonte: linhas locais guardadas, não comprovação de extração integral do MES. 3012 somente associação candidata por PCBA.','Source coverage: stored local records, not proof that the entire MES view was queried. 3012 is a candidate PCBA association only.')}</p></div><form data-stored-search class="mes-filters"><label>${t('Fonte','Source')}<select name="dataset">${Object.keys(sets).map(n=>`<option value="${esc(n)}"${dataset===n?' selected':''}>${esc(({defects:'3028',pcba_history:'2114',material_reuse:'3074',process_timeline:'3022',repairs:'3012'})[n]||n)}</option>`).join('')}</select></label><label>${kind==='sn'?'SN':t('Buscar fatos','Search facts')}<input name="query" value="${esc(query)}"></label><button class="button secondary" type="submit">${t('Ver dados armazenados','View stored data')}</button></form><p role="status">${!p?t('Não coletado para este período/linha','Not collected for this period/line'):rows.length?`${rows.length} · ${t('registros observados','observed records')}`:t('Sem registro disponível; desfecho não comprovado','No available record; outcome unproven')}</p><ol class="mes-record-list" start="${page*size+1}">${rows.slice(page*size,(page+1)*size).map(r=>`<li><dl>${Object.entries(r).map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(typeof v==='object'?JSON.stringify(v):v)}</dd>`).join('')}</dl></li>`).join('')}</ol><div class="mes-pagination"><button class="button secondary" data-stored-prev ${page?'':'disabled'}>${t('Anterior','Previous')}</button><span>${page+1} / ${Math.max(1,Math.ceil(rows.length/size))}</span><button class="button secondary" data-stored-next ${(page+1)*size<rows.length?'':'disabled'}>${t('Próxima','Next')}</button></div>${kind==='base'&&client?'<section data-stored-captures></section>':''}</section>`;
    if(kind==='base'&&client){
      capturePanel=createSourceCaptureHistory(root.querySelector('[data-stored-captures]'),client,store);
      capturePanel.show(p,p?{history_source:read.source==='local'?'local':'shared',
        line_id:line,source_id:p.source_id,snapshot_id:p.snapshot_id,
        snapshot_revision:p.snapshot_revision}:null);
    }
    root.querySelector('form').addEventListener('submit',e=>{e.preventDefault();query=e.currentTarget.elements.query.value;dataset=e.currentTarget.elements.dataset.value;page=0;render();});
    root.querySelector('[data-stored-prev]').addEventListener('click',()=>{page--;render();});
    root.querySelector('[data-stored-next]').addEventListener('click',()=>{page++;render();});
  }
  return {render,clear(){capturePanel?.clear();capturePanel=null;root.replaceChildren();}};
}
