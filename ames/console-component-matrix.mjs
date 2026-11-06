import {componentMatrix} from './data/component-matrix.mjs';
import {componentLabel} from './data/reuse-analysis.mjs';
import {escapeHtml as esc} from './evidence-view.mjs';
import {displayValue} from './data/time-display.mjs';

const t=(pt,en)=>document.documentElement.lang.startsWith('en')?en:pt;
const metricNames=()=>({total:t('Materiais únicos observados','Unique materials observed'),reused:t('2º uso ou mais','2nd use or more'),second:t('2º uso','2nd use'),third:t('3º+ uso','3rd+ use'),links:t('Vínculos anteriores distintos','Distinct previous links'),same:t('Mesma falha anterior','Same previous failure'),similar:t('Falha similar anterior','Similar previous failure'),different:t('Outra falha anterior','Other previous failure'),unknown:t('Resultado não determinado','Undetermined result')});
const metricValue=(metric)=>metric?.value===null||metric?.value===undefined?'—':esc(metric.value);
const resultFlag=value=>value?t('Sim','Yes'):'—';
const typeTitle=(row)=>componentLabel(row.type,document.documentElement.lang)||row.type;

function provenance(row){
 return `<details class="ames-matrix-provenance"><summary>${t('Origem e divergências','Source and discrepancies')}</summary><p>${t('Classificador','Classifier')}: ${esc(row.classifier_version||t('não versionado','not versioned'))}</p><p>${esc(row.source_id||'—')} / ${esc(row.snapshot_id||'—')} / r${esc(row.revision||'—')} · ${esc(row.line_id||'—')} · ${esc(displayValue('time',row.period?.start_at))} → ${esc(displayValue('time',row.period?.end_at))}</p>${Object.entries(row.metrics).filter(([,metric])=>metric.mismatch).map(([key,metric])=>`<p class="ames-matrix-mismatch">${esc(metricNames()[key])}: ${t('agregado','aggregate')} ${esc(metric.declared)} / ${t('observado','observed')} ${esc(metric.observed)}. ${t('Divergência: valor não confirmado.','Mismatch: value unconfirmed.')}</p>`).join('')}</details>`;
}
function itemRaw(item){
 return `<details class="ames-matrix-item-raw"><summary>${t('Dados de origem','Source data')} · ${item.rows.length}</summary><div class="ames-matrix-raw-list">${item.rows.map(raw=>`<dl>${Object.entries(raw).map(([key,value])=>`<dt>${esc(key)}</dt><dd>${esc(displayValue(key,value))}</dd>`).join('')}</dl>`).join('')}</div></details>`;
}
export function renderComponentMatrixTypeDetail(row,index){
 const items=row.metrics.total.rows,names=metricNames();
 return `<section class="ames-matrix-detail" data-component-matrix-detail="${index}" hidden><div class="section-head"><div><h4>${esc(typeTitle(row))} · ${t('materiais observados','observed materials')} ${items.length}</h4><p>${t('Cada linha é um Material SN físico distinto; vínculo com PCBA defeituosa não prova defeito do componente.','Each row is a distinct physical Material SN; a link to a faulty board does not prove the component is defective.')}</p></div><button class="button secondary" type="button" data-component-matrix-close>${t('Fechar','Close')}</button></div>
 <div class="ames-matrix-metric-strip">${Object.entries(names).map(([key,label])=>`<span><small>${esc(label)}</small><b>${metricValue(row.metrics[key])}</b></span>`).join('')}</div>
 ${provenance(row)}
 <div class="table-wrap ames-matrix-items"><table><thead><tr><th>Material SN</th><th>${t('Uso observado','Observed use')}</th><th>${t('PCBAs anteriores','Previous PCBAs')}</th><th>${t('Mesma falha','Same failure')}</th><th>${t('Mesma família','Same family')}</th><th>${t('Outra falha','Other fault')}</th><th>${t('Auditoria','Audit')}</th></tr></thead><tbody>
 ${items.map(item=>`<tr><td class="ames-matrix-material">${esc(item.sn)}</td><td>${item.uses===null?'—':esc(item.uses+'º '+t('uso','use'))}</td><td class="ames-matrix-previous" title="${esc(item.previous.join('\n'))}">${esc(item.previous.join(', ')||'—')}</td><td>${resultFlag(item.same)}</td><td>${resultFlag(item.similar)}</td><td>${resultFlag(item.different)}</td><td>${itemRaw(item)}</td></tr>`).join('')}</tbody></table></div></section>`;
}

export function componentMatrixHtml(snapshot){
 const rows=componentMatrix(snapshot);
 return `<section class="mes-context-panel" data-component-matrix data-no-i18n><h3>${t('Reuso por tipo físico de componente','Reuse by physical component type')}</h3><p>${t('Resumo por tipo. Selecione uma linha para ver materiais, PCBAs anteriores e auditoria em um painel separado. Os valores são da amostra observada, sem taxa de produção comprovada.','Summary by type. Select a row to inspect materials, prior boards and evidence in a separate panel. These are observed sample counts, not proven production rates.')}</p>
 ${!rows.length?`<p>${t('Tipos e materiais ainda não comprovados nesta revisão.','Types and materials not yet proven in this revision.')}</p>`:`<div class="table-wrap ames-matrix-summary"><table><thead><tr><th>${t('Tipo físico','Physical type')}</th><th>${t('Observados','Observed')}</th><th>${t('2º uso ou mais','2nd use or more')}</th><th>${t('Mesma falha','Same fault')}</th><th>${t('Mesma família','Same family')}</th><th>${t('Vínculos anteriores','Previous links')}</th><th>${t('Detalhes','Details')}</th></tr></thead><tbody>${rows.map((row,index)=>`<tr><th>${esc(typeTitle(row))}<small>${esc(row.type)}</small></th>${['total','reused','same','similar','links'].map(key=>`<td title="${row.metrics[key].mismatch?esc(t('Agregado diferente dos itens observados','Aggregate differs from observed items')):esc(metricNames()[key])}">${metricValue(row.metrics[key])}</td>`).join('')}<td><button type="button" class="button secondary" data-component-matrix-select="${index}" aria-expanded="false">${t('Ver materiais','View materials')}</button></td></tr>`).join('')}</tbody></table></div><div class="ames-matrix-detail-host"></div>`}
 <p class="mes-context">${t('Componente fisicamente defeituoso ou comprovadamente sem falha: indisponível nesta fonte. “—” significa não comprovado, não zero.','Physically defective or proven fault-free components: unavailable in this source. “—” means unproven, not zero.')}</p></section>`;
}

export function wireComponentMatrix(root,snapshot){
 if(!root)return;
 const buttons=[...root.querySelectorAll('[data-component-matrix-select]')];
 const rows=componentMatrix(snapshot),host=root.querySelector('.ames-matrix-detail-host');
 const close=()=>{if(host)host.replaceChildren();for(const button of buttons)button.setAttribute('aria-expanded','false');};
 for(const button of buttons)button.addEventListener('click',()=>{
  const index=Number(button.dataset.componentMatrixSelect),wasOpen=button.getAttribute('aria-expanded')==='true';
  close();if(!host||wasOpen||!Number.isInteger(index)||!rows[index])return;
  host.innerHTML=renderComponentMatrixTypeDetail(rows[index],index);
  const target=host.querySelector('[data-component-matrix-detail]');
  if(!target)return;target.hidden=false;button.setAttribute('aria-expanded','true');
  target.querySelector('[data-component-matrix-close]')?.addEventListener('click',close);
  target.scrollIntoView?.({behavior:'smooth',block:'nearest'});
 });
}
