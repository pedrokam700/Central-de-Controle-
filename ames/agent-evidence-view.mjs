import { escapeHtml as esc, EVIDENCE_PAGE_SIZE } from './evidence-view.mjs';

const INSIGHT_DRILL={
  'PCBA em 2º uso':'pcba_second_use','PCBA em 3º+ uso':'pcba_3plus_use','PCBAs 2º+ uso com falha anterior':'pcba_reused_with_prior_failure',
  'PCBAs que repetiram a mesma falha':'pcba_same_failure','PCBAs com recorrência da mesma família':'pcba_same_family','PCBAs em 2º uso com mesma falha anterior':'pcba_second_use_same_failure','PCBAs em 2º uso com mesma família anterior':'pcba_second_use_same_family',
  'Materiais únicos 2º+ uso':'material_analysis','Materiais em 2º uso':'material_second_use','Materiais em 3º+ uso':'material_3plus_use',
  'Reuso COM falha em PCBA desvinculada':'material_with_old_failure','Reuso com a MESMA falha':'material_same_failure','Reuso com falha da MESMA família':'material_same_family',
  'Vínculos material↔PCBA com mesma falha':'correlation_same_failure','Vínculos material↔PCBA com mesma família':'correlation_same_family'
};

// Actual loaded source fields, including original component matrix/drilldowns.
// No inferred linkage to manual reports or reinterpretation of source KPIs.
export function createAgentEvidenceView(root,store) {
  let line, snapshot, dataset='pcba_history',page=0,renderKey='',renderSnapshot;
  function render(selectedLine){
    line=selectedLine;const read=store.read(line),next=read.snapshot;
    if(snapshot!==next){snapshot=next;page=0;}
    if(!['agent-v0.5.23-read','central-ames-v2'].includes(snapshot?.source_schema)){renderSnapshot=undefined;renderKey='';root.replaceChildren();return;}
    const key=JSON.stringify([line,dataset,page]);if(renderSnapshot===snapshot&&renderKey===key)return;renderSnapshot=snapshot;renderKey=key;
    const sets={pcba_history:snapshot.pcba_history.records,material_reuse:snapshot.material_trace.records,history_contexts:snapshot.history_contexts,
      component_types:snapshot.insights?.component_types||[],...Object.fromEntries(Object.entries(snapshot.insights?.drilldowns||{}).map(([key,rows])=>['insight:'+key,rows]))};
    const rows=sets[dataset]||[],pages=Math.max(1,Math.ceil(rows.length/EVIDENCE_PAGE_SIZE));page=Math.min(page,pages-1);
    const names={pcba_history:'2114 · histórico PCBA',material_reuse:'3074 · Material SN',history_contexts:'Contextos históricos',component_types:'Matriz de componentes'};
    const focus=root.contains(root.ownerDocument.activeElement)?root.ownerDocument.activeElement.id:'';
    root.innerHTML=`<details class="mes-context-panel" open><summary>Históricos e reuso disponíveis · ${esc(line)}</summary><p>Origem: agente V0.5.23 · snapshot ${esc(snapshot.snapshot_id)} · coleta ${esc(snapshot.collected_at)}. Cobertura parcial: API sem revisão/cursor. Consulta da linha inteira, independente dos filtros de ocorrências acima. Linha histórica derivada pelo agente; PCBA histórica não implica mesmo CPH. Correlação não confirma causa.</p>
      <div class="mes-pagination ames-evidence-shortcuts"><button type="button" class="button ${dataset==='pcba_history'?'primary':'secondary'}" data-agent-dataset="pcba_history">Histórico PCBA · 2114</button><button type="button" class="button ${dataset==='material_reuse'?'primary':'secondary'}" data-agent-dataset="material_reuse">Materiais / reuso · 3074</button><button type="button" class="button ${dataset==='history_contexts'?'primary':'secondary'}" data-agent-dataset="history_contexts">Contextos históricos</button><button type="button" class="button ${dataset==='component_types'?'primary':'secondary'}" data-agent-dataset="component_types">Matriz de componentes</button></div>
      ${snapshot.insights?`<h3>Indicadores da fonte · PCBA e material separados</h3>${Object.entries(snapshot.insights.groups).map(([group,pairs])=>`<details><summary>${esc(group)}</summary><dl>${pairs.map(([label,value])=>`<dt>${esc(label)}</dt><dd>${INSIGHT_DRILL[label] && snapshot.insights.drilldowns[INSIGHT_DRILL[label]] ? `<button class="button secondary" data-agent-drill="${esc(INSIGHT_DRILL[label])}">${esc(value)} · registros</button>` : esc(value)}</dd>`).join('')}</dl></details>`).join('')}`:'<p>Painel de reuso indisponível: enriquecimento ainda não disponível.</p>'}
      <label>Registros disponíveis<select id="agentEvidenceDataset">${Object.keys(sets).map(key=>`<option value="${esc(key)}"${dataset===key?' selected':''}>${esc(names[key]||key.replace('insight:','Indicador · '))}</option>`).join('')}</select></label>
      <p>${rows.length} registros carregados · referências temporárias desta leitura. Ausência não significa zero. Batch Count não é reuso.</p>
      <ol class="mes-record-list" start="${page*EVIDENCE_PAGE_SIZE+1}">${rows.slice(page*EVIDENCE_PAGE_SIZE,(page+1)*EVIDENCE_PAGE_SIZE).map(row=>`<li><dl>${Object.entries(row).map(([key,value])=>`<dt>${esc(key)}</dt><dd>${esc(typeof value==='object'?JSON.stringify(value):value)}</dd>`).join('')}</dl></li>`).join('')}</ol>
      <div class="mes-pagination"><button class="button secondary" id="agentEvidencePrev"${page?'':' disabled'}>Anterior</button><span>Página ${page+1} de ${pages}</span><button class="button secondary" id="agentEvidenceNext"${page+1<pages?'':' disabled'}>Próxima</button></div></details>`;
    if(focus)root.querySelector('#'+focus)?.focus();
  }
  root.addEventListener('change',e=>{if(e.target.id==='agentEvidenceDataset'){dataset=e.target.value;page=0;render(line);}});
  root.addEventListener('click',e=>{
    const shortcut=e.target.closest('[data-agent-dataset]');if(shortcut){dataset=shortcut.dataset.agentDataset;page=0;render(line);return;}
    const drill=e.target.closest('[data-agent-drill]');if(drill){dataset='insight:'+drill.dataset.agentDrill;page=0;render(line);root.querySelector('#agentEvidenceDataset')?.focus();return;}
    if(e.target.id==='agentEvidencePrev')page--;else if(e.target.id==='agentEvidenceNext')page++;else return;render(line);
  });
  return {render};
}
