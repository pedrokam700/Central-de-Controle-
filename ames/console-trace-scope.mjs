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
  let wired=false;
  function syncChecks(panel,input){
    const selected=new Set(String(input.value||'').split(',').map(x=>x.trim()).filter(Boolean));
    for(const check of panel.querySelectorAll('[data-trace-code]'))check.checked=selected.has(check.value);
    panel.querySelector('[data-trace-scope-mode="all"]').checked=selected.size===0;
    panel.querySelector('[data-trace-scope-mode="selected"]').checked=selected.size>0;
  }
  function rebuild(){
    const form=root.querySelector('[data-trace-form]'),input=form?.querySelector('[name=codes]');if(!form||!input)return;
    let panel=form.querySelector('[data-trace-code-helper]');
    if(!panel){
      panel=document.createElement('details');panel.dataset.traceCodeHelper='1';panel.className='ames-trace-code-helper';
      input.closest('label')?.insertAdjacentElement('beforebegin',panel);
    }
    const codes=loadedCodes(store,form),current=input.value;
    panel.innerHTML=`<summary>Falhas carregadas · selecionar sem digitar código</summary><p>Atalho visual para o mesmo filtro de Defect Code. <b>Todas</b> deixa o campo vazio; <b>Selecionadas</b> envia somente os códigos marcados. A lista usa apenas códigos já presentes nos snapshots das linhas escolhidas.</p><div class="ames-trace-scope-mode"><label><input type="radio" name="trace_code_mode_helper" data-trace-scope-mode="all"> Todas</label><label><input type="radio" name="trace_code_mode_helper" data-trace-scope-mode="selected"> Selecionadas</label></div><div class="ames-trace-code-grid">${codes.length?codes.map(code=>`<label><input type="checkbox" value="${esc(code)}" data-trace-code> ${esc(code)}</label>`).join(''):'<span>Nenhum Defect Code carregado nas linhas selecionadas.</span>'}</div>`;
    input.value=current;syncChecks(panel,input);
    panel.onchange=e=>{
      const mode=e.target.closest('[data-trace-scope-mode]');
      if(mode?.dataset.traceScopeMode==='all'){input.value='';syncChecks(panel,input);return;}
      if(mode?.dataset.traceScopeMode==='selected'&&!input.value){panel.querySelector('[data-trace-code]')?.focus();return;}
      if(e.target.matches('[data-trace-code]')){
        input.value=[...panel.querySelectorAll('[data-trace-code]:checked')].map(x=>x.value).join(', ');
        syncChecks(panel,input);
      }
    };
  }
  function wire(){
    const form=root.querySelector('[data-trace-form]');if(!form||wired)return;wired=true;
    form.addEventListener('change',e=>{if(e.target.matches('[name=lines]'))rebuild();});
    form.querySelector('[name=codes]')?.addEventListener('input',()=>{const panel=form.querySelector('[data-trace-code-helper]');if(panel)syncChecks(panel,form.querySelector('[name=codes]'));});
  }
  return Object.freeze({render(){view.render();wire();rebuild();},clear(){view.clear?.();wired=false;}});
}
