const t=(pt,en)=>document.documentElement.lang.startsWith('en')?en:pt;

function sourceHeading(details,prefix){
  return [...(details?.querySelectorAll('h4')||[])].find(node=>node.textContent.trim().startsWith(prefix))||null;
}

function targetFor(section,kind){
  if(kind==='story')return section.querySelector('.ames-sn-local-story');
  if(kind==='history')return section.querySelector('.ames-sn-own-history')||sourceHeading(section.querySelector('.ames-sn-local-raw'),'2114');
  if(kind==='process')return section.querySelector('.ames-sn-process-story')||sourceHeading(section.querySelector('.ames-sn-local-raw'),'3022');
  if(kind==='repair')return section.querySelector('.ames-sn-repair-story')||sourceHeading(section.querySelector('.ames-sn-local-raw'),'3012');
  if(kind==='coverage')return section.querySelector('.ames-sn-local-coverage-detail');
  return null;
}

function reveal(target){
  if(!target)return false;
  for(let node=target;node;node=node.parentElement){if(node.tagName==='DETAILS')node.open=true;}
  target.classList?.add('ames-evidence-hit');
  target.scrollIntoView?.({block:'center',behavior:'smooth'});
  setTimeout(()=>target.classList?.remove('ames-evidence-hit'),1600);
  return true;
}

function decorate(section){
  if(!section||section.dataset.offlineNavigationBound==='1')return;
  const cards=[...section.querySelectorAll(':scope > .ames-fastlane-kpis > div')];
  if(cards.length<4)return;
  section.dataset.offlineNavigationBound='1';
  const map=['story','history','process','repair'];
  cards.slice(0,4).forEach((card,index)=>{
    const kind=map[index];card.dataset.snLocalOpen=kind;card.setAttribute('role','button');card.tabIndex=0;
    card.setAttribute('aria-label',`${card.querySelector('small')?.textContent||t('Abrir evidência','Open evidence')} · ${t('abrir evidência','open evidence')}`);
  });
  const coverage=section.querySelector(':scope > .ames-local-coverage');
  if(coverage){coverage.dataset.snLocalOpen='coverage';coverage.setAttribute('role','button');coverage.tabIndex=0;coverage.setAttribute('aria-label',t('Abrir cobertura e atualização da base local','Open local database coverage and freshness'));}
  const open=target=>{const kind=target?.dataset?.snLocalOpen;if(!kind)return;reveal(targetFor(section,kind));};
  section.addEventListener('click',event=>open(event.target.closest('[data-sn-local-open]')));
  section.addEventListener('keydown',event=>{if(!['Enter',' '].includes(event.key))return;const target=event.target.closest('[data-sn-local-open]');if(!target)return;event.preventDefault();open(target);});
}

export function withOfflineSnNavigation(base,root){
  let disposed=false;
  const scan=()=>{if(disposed)return;decorate(root.querySelector('[data-sn-local-result]'));};
  const observer=typeof MutationObserver!=='undefined'?new MutationObserver(()=>queueMicrotask(scan)):null;
  observer?.observe(root,{childList:true,subtree:true});
  return Object.freeze({
    render(){base.render();scan();},
    clear(){disposed=true;observer?.disconnect();base.clear?.();}
  });
}
