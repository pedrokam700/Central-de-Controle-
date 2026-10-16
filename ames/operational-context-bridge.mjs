const SELECTORS=[
  '[data-daily-summary-line]','[data-failure-line]','[data-top3-line]','[data-trend-line]',
  '[data-trace-line]','[data-reuse-line]','[data-knowledge-line]'
];
const BUTTON_SELECTORS=['[data-line-tab]','[data-central-mes-line]'];
const allSelector=[...SELECTORS,...BUTTON_SELECTORS].join(',');
const lineFrom=target=>target?.dataset?.lineTab||target?.dataset?.centralMesLine||target?.value||null;
const visible=element=>{
  const pane=element?.closest?.('[data-console-pane]');
  return !pane||pane.hidden===false;
};

export function installOperationalContextBridge(document,store){
  if(!document||!store?.updateContext||document.__amesOperationalContextBridge)return ()=>{};
  document.__amesOperationalContextBridge=true;
  let syncing=false,queued=false,disposed=false;

  const capture=event=>{
    const target=event.target?.closest?.(allSelector);if(!target||!visible(target))return;
    const line=lineFrom(target);if(!line)return;
    try{store.updateContext({line_id:line});}catch{}
  };

  const sync=()=>{
    queued=false;if(disposed||syncing)return;
    const line=store.context?.().line_id||store.preferredLine?.();if(!line)return;
    syncing=true;
    try{
      for(const selector of SELECTORS){
        const control=[...document.querySelectorAll(selector)].find(visible);if(!control||control.value===line)continue;
        if(![...control.options||[]].some(option=>option.value===line))continue;
        control.value=line;control.dispatchEvent(new Event('change',{bubbles:true}));return;
      }
      for(const selector of BUTTON_SELECTORS){
        const buttons=[...document.querySelectorAll(selector)].filter(visible),wanted=buttons.find(button=>lineFrom(button)===line);if(!wanted)continue;
        const active=wanted.classList?.contains('primary')||wanted.classList?.contains('active');
        if(!active){wanted.click();return;}
      }
    }finally{syncing=false;}
  };
  const schedule=()=>{if(queued||disposed)return;queued=true;queueMicrotask(sync);};
  const onChange=event=>{capture(event);schedule();};
  const onClick=event=>{capture(event);schedule();};
  document.addEventListener('change',onChange,true);
  document.addEventListener('click',onClick,true);
  const observer=typeof MutationObserver!=='undefined'?new MutationObserver(schedule):null;
  observer?.observe(document.documentElement,{childList:true,subtree:true});
  schedule();
  return ()=>{disposed=true;observer?.disconnect();document.removeEventListener('change',onChange,true);document.removeEventListener('click',onClick,true);delete document.__amesOperationalContextBridge;};
}
