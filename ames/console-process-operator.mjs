const t=(pt,en)=>document.documentElement.lang.startsWith('en')?en:pt;

const HEADER_RENAMES=new Map([
  ['Defect Time',['Registro da falha (MES)','Failure record (MES)']],
  ['Posto relevante',['Posto de referência (3022)','Reference station (3022)']],
  ['Relevant station',['Posto de referência (3022)','Reference station (3022)']],
  ['Horário relevante',['Horário de geração (3022)','Generation time (3022)']],
  ['Relevant time',['Horário de geração (3022)','Generation time (3022)']],
  ['Turno de produção',['Turno comprovado (3022)','Proven shift (3022)']],
  ['Production shift',['Turno comprovado (3022)','Proven shift (3022)']],
  ['Data operacional',['Dia de produção (3022)','Production day (3022)']],
  ['Operational date',['Dia de produção (3022)','Production day (3022)']],
  ['Processo anterior',['Última passagem antes do registro','Last passage before record']],
  ['Previous process',['Última passagem antes do registro','Last passage before record']],
  ['Horário anterior',['Horário da passagem anterior','Previous passage time']],
  ['Previous time',['Horário da passagem anterior','Previous passage time']],
  ['Retorno A5201',['Retorno legado A5201','Legacy A5201 return']],
]);
const PRIMARY_HEADERS=new Set(['PCBA','Falha','Failure','Registro da falha (MES)','Failure record (MES)','Manual/Automatic','Posto de referência (3022)','Reference station (3022)','Horário de geração (3022)','Generation time (3022)','Turno comprovado (3022)','Proven shift (3022)','Dia de produção (3022)','Production day (3022)','AT / ação','AT / action','Status']);

function renameOperationalHeaders(section){
  for(const th of section?.querySelectorAll('thead th')||[]){
    const rename=HEADER_RENAMES.get(th.textContent.trim());
    if(rename)th.textContent=t(rename[0],rename[1]);
  }
}
function markOperationalColumns(section,technical){
  const table=section?.querySelector('table');if(!table)return;
  renameOperationalHeaders(section);
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
  note.textContent=t('A visão diária separa registro da falha no MES de evidência 3022. Horário de geração, turno e dia só são considerados comprovados quando ligados à passagem real no posto de referência; a passagem anterior é apenas contexto.','The daily view separates the MES failure record from 3022 evidence. Generation time, shift and production day are only treated as proven when linked to a real passage at the reference station; the previous passage is context only.');
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
