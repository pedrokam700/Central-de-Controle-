import {formatFactoryDateTime} from './data/time-display.mjs';
import {escapeHtml as esc} from './evidence-view.mjs';

const text=value=>String(value??'').trim();
const lang=()=>globalThis.document?.documentElement?.lang||'pt-BR';
const t=(pt,en)=>lang().startsWith('en')?en:pt;

export function materialBindingEvidence(item={},currentPcba=''){
  const seen=new Set(),rows=[];
  for(const binding of item.bindings||[]){
    const pcba=text(binding?.pcba_sn),bindRaw=text(binding?.bind_time),unbindRaw=text(binding?.unbind_time),offset=text(binding?.offset)||undefined;
    if(!pcba||(!bindRaw&&!unbindRaw))continue;
    const key=JSON.stringify([pcba,bindRaw,unbindRaw,offset,binding?.event_count||1]);if(seen.has(key))continue;seen.add(key);
    const eventCount=Math.max(1,Number(binding?.event_count)||1);
    rows.push({
      pcba_sn:pcba,
      role:pcba===text(currentPcba)?'current':'previous',
      bind_raw:bindRaw||null,
      unbind_raw:unbindRaw||null,
      bind_display:bindRaw?formatFactoryDateTime(bindRaw,{seconds:false,naiveOffset:offset}):'—',
      unbind_display:unbindRaw?formatFactoryDateTime(unbindRaw,{seconds:false,naiveOffset:offset}):'—',
      source:binding?.source||'3074',
      event_count:eventCount,
      aggregated:eventCount>1,
    });
  }
  return rows;
}

function bindingMarkup(row){
  const role=row.role==='current'?t('PCBA atual','Current PCBA'):t('PCBA anterior','Previous PCBA');
  const aggregate=row.aggregated?`<small>${esc(`${row.event_count} ${t('eventos agregados','aggregated events')}`)}</small>`:'';
  return `<div class="ames-sn-repair-story ames-sn-binding-story"><div><small>${esc(role)}</small><b>${esc(row.pcba_sn)}</b></div><div><small>${t('Vínculo 3074','3074 bind')}</small><b title="${esc(row.bind_raw||'')}">${esc(row.bind_display)}</b></div><div><small>${t('Desvínculo 3074','3074 unbind')}</small><b title="${esc(row.unbind_raw||'')}">${esc(row.unbind_display)}</b></div><div><small>${t('Fonte','Source')}</small><b>${esc(row.source)}</b>${aggregate}</div></div>`;
}

export function decorateSnMaterialBindings(root,model={}){
  const articles=[...root.querySelectorAll('.ames-sn-material-story')];
  articles.forEach((article,index)=>{
    article.querySelector('[data-sn-material-bindings]')?.remove();
    const item=model.materials?.[index];if(!item)return;
    const rows=materialBindingEvidence(item,model.current_pcba);
    const block=article.ownerDocument.createElement('section');block.dataset.snMaterialBindings='1';block.className='ames-sn-binding-evidence';
    block.innerHTML=`<div class="ames-sn-binding-title"><b>${t('Vínculos reais do material · 3074','Actual material bindings · 3074')}</b><small>${t('Horários de vínculo/desvínculo do material. Não são Defect Time nem prova de causa da falha.','Material bind/unbind times. They are not Defect Time or proof of failure cause.')}</small></div>${rows.length?rows.map(bindingMarkup).join(''):`<div class="ames-sn-forensic-empty">${t('A 3074 confirmou o material, mas não retornou horário de vínculo/desvínculo nesta resposta.','3074 confirmed the material but did not return a bind/unbind time in this response.')}</div>`}`;
    const head=article.querySelector('.ames-sn-material-head');head?.insertAdjacentElement('afterend',block);
  });
}
