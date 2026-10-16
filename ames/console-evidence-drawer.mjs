import {escapeHtml as esc} from './evidence-view.mjs';

const t=(pt,en)=>document.documentElement.lang.startsWith('en')?en:pt;
const value=v=>v===null||v===undefined||v===''?'—':String(v);

export function createEvidenceDrawer(root){
  let payload=null,host=null,disposed=false;
  const onKey=e=>{if(e.key==='Escape'&&payload)close();};
  document.addEventListener('keydown',onKey);

  function ensure(){
    if(host||disposed)return;
    host=document.createElement('div');
    host.className='ames-evidence-layer';
    host.hidden=true;
    host.setAttribute('data-no-i18n','');
    root.append(host);
  }

  function close(){
    payload=null;
    if(host){host.hidden=true;host.replaceChildren();}
  }

  function render(){
    ensure();if(!host||!payload)return;
    const fields=Array.isArray(payload.fields)?payload.fields:[];
    const lines=Array.isArray(payload.lines)?payload.lines:[];
    const notes=Array.isArray(payload.notes)?payload.notes:[];
    host.hidden=false;
    host.innerHTML=`<button type="button" class="ames-evidence-backdrop" data-evidence-close aria-label="${t('Fechar evidência','Close evidence')}"></button><aside class="ames-evidence-drawer" role="dialog" aria-modal="true" aria-label="${esc(payload.title||t('Evidência','Evidence'))}"><div class="ames-evidence-drawer-head"><div><span>${t('EVIDÊNCIA AUDITÁVEL','AUDITABLE EVIDENCE')}</span><h2>${esc(payload.title||t('Evidência','Evidence'))}</h2>${payload.description?`<p>${esc(payload.description)}</p>`:''}</div><button type="button" class="button secondary" data-evidence-close>${t('Fechar','Close')}</button></div>${fields.length?`<div class="ames-evidence-fields">${fields.map(([label,v])=>`<div><span>${esc(label)}</span><b>${esc(value(v))}</b></div>`).join('')}</div>`:''}${lines.length?`<section><h3>${t('Escopo por linha','Scope by line')}</h3><div class="ames-evidence-lines">${lines.map(line=>`<div><b>${esc(line.label||line.line||'—')}</b><span>${esc(value(line.snapshot))}</span><span>${esc(value(line.freshness||line.status))}</span><span>${esc(value(line.detail))}</span></div>`).join('')}</div></section>`:''}${notes.length?`<section><h3>${t('Observações','Notes')}</h3>${notes.map(note=>`<p class="ames-evidence-note">${esc(note)}</p>`).join('')}</section>`:''}</aside>`;
    host.querySelectorAll('[data-evidence-close]').forEach(button=>button.addEventListener('click',close));
    queueMicrotask(()=>host?.querySelector('.ames-evidence-drawer [data-evidence-close]')?.focus());
  }

  function open(next){payload=next&&typeof next==='object'?next:{};render();}

  return {open,close,clear(){disposed=true;document.removeEventListener('keydown',onKey);host?.remove();host=null;payload=null;}};
}
