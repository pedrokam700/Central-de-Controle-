const t=(pt,en)=>document.documentElement.lang.startsWith('en')?en:pt;

const PRIMARY_HEADERS=new Set(['PCBA','Falha','Failure','Defect Time','Manual/Automatic','Posto relevante','Relevant station','Horário relevante','Relevant time','Turno de produção','Production shift','AT / ação','AT / action','Status']);

function markOperationalColumns(section,technical){
  const table=section?.querySelector('table');if(!table)return;
  const headers=[...table.querySelectorAll('thead th')];
  headers.forEach((th,index)=>{
    const primary=PRIMARY_HEADERS.has(th.textContent.trim());
    th.classList.toggle('ames-process-secondary-col',!primary);
    th.hidden=!technical&&!primary;
    for(const row of table.querySelectorAll('tbody tr')){const cell=row.children[index];if(cell){cell.classList.toggle('ames-process-secondary-col',!primary);cell.hidden=!technical&&!primary;}}
  });
}

function decorateRule(root){
  const rule=root.querySelector('.ames-rule-strip-strong');if(!rule)return;
  let details=rule.querySelector('.ames-process-rule-detail');
  if(!details){
    const note=rule.querySelector('small');if(!note)return;
    details=document.createElement('details');details.className='ames-process-rule-detail';details.dataset.sourceText=note.textContent;details.innerHTML='<summary></summary><p></p>';note.replaceWith(details);
  }
  details.querySelector('summary').textContent=t('Por que esta regra existe','Why this rule exists');
  details.querySelector('p').textContent=details.dataset.sourceText||'';
}

function decorateContexts(root,state){
  const section=root.querySelector('.ames-process-contexts');if(!section)return;
  let button=section.querySelector('[data-process-columns]');
  if(!button){
    button=document.createElement('button');button.type='button';button.className='button secondary ames-process-column-toggle';button.dataset.processColumns='1';
    const head=section.querySelector('.section-head');head?.append(button);
    button.addEventListener('click',()=>{state.technical=!state.technical;decorateContexts(root,state);});
  }
  button.textContent=state.technical?t('Visão operacional','Operational view'):t('Colunas técnicas','Technical columns');
  markOperationalColumns(section,state.technical);
  let note=section.querySelector('[data-process-operator-note]');
  if(!note){note=document.createElement('p');note.dataset.processOperatorNote='1';note.className='ames-process-operator-note';section.querySelector('.section-head')?.after(note);}
  note.textContent=t('A visão diária mostra PCBA, falha, Defect Time, modo de registro, posto, horário real, turno, AT e status. As demais colunas continuam disponíveis em “Colunas técnicas”.','The daily view shows PCBA, failure, Defect Time, registration mode, station, actual time, shift, AT and status. Remaining fields stay available under “Technical columns”.');
  note.hidden=state.technical;
}

export function withProcessOperatorLayout(view,root){
  const state={technical:false};let langObserver;
  const repaint=()=>{decorateRule(root);decorateContexts(root,state);};
  return Object.freeze({
    render(){view.render();repaint();if(!langObserver){langObserver=new MutationObserver(repaint);langObserver.observe(document.documentElement,{attributes:true,attributeFilter:['lang']});}},
    clear(){langObserver?.disconnect();langObserver=null;view.clear?.();state.technical=false;}
  });
}
