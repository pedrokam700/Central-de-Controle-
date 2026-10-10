const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function loadedCodes(store,form){
  const lines=[...form.querySelectorAll('[name=lines]:checked')].map(x=>x.value);
  const codes=new Set();
  for(const line of lines){
    const snapshot=store.read(line).snapshot;
    for(const row of snapshot?.occurrences||[])if(row.defect_code)codes.add(String(row.defect_code));
  }
  return [...codes].sort((a,b)=>a.localeCompare(b));
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
      panel=document.createElement('details');panel.dataset.traceCodeHelper='1';panel.className='ames-trace-code-helper';
      input.closest('label')?.insertAdjacentElement('beforebegin',panel);
    }
    const codes=loadedCodes(store,form),current=input.value;
    panel.innerHTML=`<summary>Falhas carregadas · selecionar sem digitar código</summary><p>Atalho visual para o mesmo filtro de Defect Code. <b>Todas</b> deixa o campo vazio; <b>Selecionadas</b> exige ao menos um código antes de iniciar. A lista usa apenas códigos já presentes nos snapshots das linhas escolhidas.</p><div class="ames-trace-scope-mode"><label><input type="radio" name="trace_code_mode_helper" data-trace-scope-mode="all"> Todas</label><label><input type="radio" name="trace_code_mode_helper" data-trace-scope-mode="selected"> Selecionadas</label></div><div class="ames-trace-code-grid">${codes.length?codes.map(code=>`<label><input type="checkbox" value="${esc(code)}" data-trace-code> ${esc(code)}</label>`).join(''):'<span>Nenhum Defect Code carregado nas linhas selecionadas.</span>'}</div>`;
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
  const runGuard=e=>{
    const run=e.target.closest('[data-trace-run]');if(!run||codeMode!=='selected'||selectedCodes(inputRef).length)return;
    e.preventDefault();e.stopImmediatePropagation();
    const status=root.querySelector('[data-trace-status]');
    if(status)status.innerHTML='<div class="notice warn"><b>Falhas selecionadas:</b> marque ou digite ao menos um Defect Code antes de iniciar. Nenhuma coleta foi enviada.</div>';
    formRef?.querySelector('[data-trace-code]')?.focus();
  };
  function wire(){
    const form=root.querySelector('[data-trace-form]');if(!form||wired)return;wired=true;formRef=form;
    form.addEventListener('change',e=>{if(e.target.matches('[name=lines]'))rebuild();});
    const input=form.querySelector('[name=codes]');inputRef=input;
    input?.addEventListener('input',()=>{codeMode=selectedCodes(input).length?'selected':'all';const panel=form.querySelector('[data-trace-code-helper]');if(panel)syncChecks(panel,input);});
    root.addEventListener('click',runGuard,true);
  }
  return Object.freeze({render(){view.render();wire();rebuild();},clear(){root.removeEventListener('click',runGuard,true);view.clear?.();wired=false;formRef=null;inputRef=null;codeMode='all';}});
}
