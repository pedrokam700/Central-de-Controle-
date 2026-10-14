import {defectDescription,knownDescription} from './defect-label.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

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
    panel.innerHTML=`<h4>Falhas carregadas</h4><p>Selecione pela descrição. A contagem soma as ocorrências nas linhas escolhidas. Selecionadas exige ao menos um código antes de iniciar.</p><div class="ames-trace-scope-mode"><label><input type="radio" name="trace_code_mode_helper" data-trace-scope-mode="all"> Todas</label><label><input type="radio" name="trace_code_mode_helper" data-trace-scope-mode="selected"> Selecionadas</label></div><div class="ames-trace-code-grid">${codes.length?codes.map(item=>`<label><input type="checkbox" value="${esc(item.code)}" data-trace-code><span data-no-i18n>${esc(item.code)} — ${esc(defectDescription(item.description))} — ${item.count}</span></label>`).join(''):'<span>Nenhuma falha carregada nas linhas selecionadas.</span>'}</div>`;
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
    if(status)status.innerHTML='<div class="notice warn"><b>Falhas selecionadas:</b> marque ao menos uma falha antes de iniciar. Nenhuma coleta foi enviada.</div>';
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
