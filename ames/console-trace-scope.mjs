import {defectDescription,knownDescription} from './defect-label.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const t=(pt,en)=>document.documentElement.lang.startsWith('en')?en:pt;

export function loadedFailures(store,lines){
  const groups=new Map();
  for(const line of lines){
    const snapshot=store.read(line).snapshot;
    for(const row of snapshot?.occurrences||[]){
      const code=String(row.defect_code||'').trim();if(!code)continue;
      const group=groups.get(code)||{code,description:'',count:0};
      group.count++;if(!group.description)group.description=knownDescription(row.defect_desc);
      groups.set(code,group);
    }
  }
  return [...groups.values()].sort((a,b)=>b.count-a.count||a.code.localeCompare(b.code));
}

function humanTraceError(raw){
  const text=String(raw||'').trim(),low=text.toLowerCase();
  if(!text)return null;
  if(low.includes('2114')&&(low.includes('shift')||low.includes('turno')||low.includes('unconfirmed')||low.includes('não confirmado'))){
    return t('2114 aguardando confirmação de turno. A etapa não deve ser tratada como concluída enquanto o turno não estiver confirmado; as demais fontes continuam independentes quando houver evidência.','2114 is waiting for shift confirmation. The stage must not be treated as complete until the shift is confirmed; other sources remain independent when evidence is available.');
  }
  if(/playwright|locator|traceback|runtimeerror|typeerror|extjs|strict mode violation/i.test(text)){
    if(low.includes('3022'))return t('Não foi possível consultar a 3022 nesta etapa. A evidência já coletada pelas outras fontes permanece válida.','3022 could not be queried at this stage. Evidence already collected from other sources remains valid.');
    if(low.includes('2114'))return t('Não foi possível concluir a 2114 nesta etapa. A evidência já coletada pelas outras fontes permanece válida.','2114 could not be completed at this stage. Evidence already collected from other sources remains valid.');
    if(low.includes('3074'))return t('Não foi possível concluir a 3074 nesta etapa. As demais fontes continuam válidas quando houver evidência.','3074 could not be completed at this stage. Other sources remain valid when evidence is available.');
    return t('Uma fonte do A-MES não pôde ser concluída nesta etapa. O detalhe técnico foi preservado abaixo para diagnóstico.','An A-MES source could not be completed at this stage. Technical details are preserved below for diagnostics.');
  }
  return null;
}

export function withTraceSelectionHelper(view,root,store){
  let wired=false,codeMode='all',formRef=null,inputRef=null;
  function selectedCodes(input){return String(input?.value||'').split(',').map(x=>x.trim()).filter(Boolean);}
  function syncChecks(panel,input){
    const selected=new Set(selectedCodes(input));
    if(selected.size)codeMode='selected';
    for(const check of panel.querySelectorAll('[data-trace-code]'))check.checked=selected.has(check.value);
    const all=panel.querySelector('[data-trace-scope-mode="all"]'),chosen=panel.querySelector('[data-trace-scope-mode="selected"]');
    if(all)all.checked=codeMode==='all';if(chosen)chosen.checked=codeMode==='selected';
  }
  function rebuild(){
    const form=root.querySelector('[data-trace-form]'),input=form?.querySelector('[name=codes]');if(!form||!input)return;
    formRef=form;inputRef=input;
    let panel=form.querySelector('[data-trace-code-helper]');
    if(!panel){
      panel=document.createElement('section');panel.dataset.traceCodeHelper='1';panel.className='ames-trace-code-helper';
      (input.closest('details')||input.closest('label'))?.insertAdjacentElement('beforebegin',panel);
    }
    const lines=[...form.querySelectorAll('[name=lines]:checked')].map(x=>x.value);
    const codes=loadedFailures(store,lines),current=input.value;
    const total=codes.reduce((sum,item)=>sum+item.count,0),en=document.documentElement.lang.startsWith('en');
    const failureWord=en?(codes.length===1?'failure':'failures'):(codes.length===1?'falha':'falhas');
    const occurrenceWord=en?(total===1?'occurrence':'occurrences'):(total===1?'ocorrência':'ocorrências');
    panel.innerHTML=`<div class="ames-trace-code-head"><div><h4>${t('Falhas carregadas','Loaded failures')}</h4><p>${t('Selecione pela descrição. A contagem soma as ocorrências nas linhas escolhidas. Selecionadas exige ao menos um código antes de iniciar.','Select by description. Counts add occurrences across the chosen lines. Selected requires at least one code before starting.')}</p></div><span>${codes.length} ${failureWord} · ${total} ${occurrenceWord}</span></div><div class="ames-trace-scope-mode"><label><input type="radio" name="trace_code_mode_helper" data-trace-scope-mode="all"> ${t('Todas','All')}</label><label><input type="radio" name="trace_code_mode_helper" data-trace-scope-mode="selected"> ${t('Selecionadas','Selected')}</label></div><div class="ames-trace-code-grid">${codes.length?codes.map(item=>`<label class="ames-trace-failure-option"><input type="checkbox" value="${esc(item.code)}" data-trace-code><span data-no-i18n><strong>${esc(defectDescription(item.description))}</strong><small>${item.count} ${en?(item.count===1?'occurrence':'occurrences'):(item.count===1?'ocorrência':'ocorrências')}</small></span></label>`).join(''):`<span class="ames-trace-no-failures">${t('Nenhuma falha carregada nas linhas selecionadas.','No failures loaded for the selected lines.')}</span>`}</div>`;
    input.value=current;if(selectedCodes(input).length)codeMode='selected';syncChecks(panel,input);
    panel.onchange=e=>{
      const mode=e.target.closest('[data-trace-scope-mode]');
      if(mode?.dataset.traceScopeMode==='all'){codeMode='all';input.value='';syncChecks(panel,input);return;}
      if(mode?.dataset.traceScopeMode==='selected'){
        codeMode='selected';syncChecks(panel,input);
        if(!selectedCodes(input).length)panel.querySelector('[data-trace-code]')?.focus();
        return;
      }
      if(e.target.matches('[data-trace-code]')){
        codeMode='selected';
        input.value=[...panel.querySelectorAll('[data-trace-code]:checked')].map(x=>x.value).join(', ');
        syncChecks(panel,input);
      }
    };
  }
  function polishStatus(){
    const status=root.querySelector('[data-trace-status]');if(!status||status.querySelector('[data-trace-human-error]'))return;
    const raw=status.textContent?.trim()||'',friendly=humanTraceError(raw);if(!friendly)return;
    status.innerHTML=`<div class="notice warn" data-trace-human-error><b>${t('Coleta parcial','Partial collection')}</b><br><span>${esc(friendly)}</span><details class="ames-technical-detail"><summary>${t('Detalhes técnicos','Technical details')}</summary><pre>${esc(raw)}</pre></details></div>`;
  }
  const runGuard=e=>{
    const run=e.target.closest('[data-trace-run]');if(!run||codeMode!=='selected'||selectedCodes(inputRef).length)return;
    e.preventDefault();e.stopImmediatePropagation();
    const status=root.querySelector('[data-trace-status]');
    if(status)status.innerHTML=`<div class="notice warn"><b>${t('Falhas selecionadas:','Selected failures:')}</b> ${t('marque ao menos uma falha antes de iniciar. Nenhuma coleta foi enviada.','select at least one failure before starting. No collection was sent.')}</div>`;
    formRef?.querySelector('[data-trace-code]')?.focus();
  };
  function wire(){
    const form=root.querySelector('[data-trace-form]');if(!form||wired)return;wired=true;formRef=form;
    form.addEventListener('change',e=>{if(e.target.matches('[name=lines]'))rebuild();});
    const input=form.querySelector('[name=codes]');inputRef=input;
    input?.addEventListener('input',()=>{codeMode=selectedCodes(input).length?'selected':'all';const panel=form.querySelector('[data-trace-code-helper]');if(panel)syncChecks(panel,input);});
    root.addEventListener('click',runGuard,true);
  }
  return Object.freeze({render(){view.render();wire();rebuild();polishStatus();},clear(){root.removeEventListener('click',runGuard,true);view.clear?.();wired=false;formRef=null;inputRef=null;codeMode='all';}});
}
