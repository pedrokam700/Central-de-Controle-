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
    if(snapshot!==next){snapshot=next;page=0;
      if(dataset==='pcba_history'&&!(snapshot?.pcba_history?.records||[]).length&&
        (snapshot?.material_investigation?.records||[]).length)dataset='material_candidates';
    }
    if(!['agent-v0.5.23-read','central-ames-v2'].includes(snapshot?.source_schema)){
      renderSnapshot=undefined;renderKey='';
      const en=root.ownerDocument?.documentElement?.lang?.startsWith('en');
      root.innerHTML='<div class="notice warn" role="status">'+(en
        ?'No verified historical revision is loaded for this line and period. In Monitoring, select this line’s source under Last production day, then return here. No MES job starts.'
        :'Esta linha não possui revisão histórica comprovada no período selecionado. Abra Monitoramento, escolha a origem desta linha em Último dia produtivo e retorne aqui. A consulta não inicia coleta MES.')+'</div>';
      return;
    }
    const key=JSON.stringify([line,dataset,page]);if(renderSnapshot===snapshot&&renderKey===key)return;renderSnapshot=snapshot;renderKey=key;
    const sets={pcba_history:snapshot.pcba_history.records,material_reuse:snapshot.material_trace.records,material_candidates:snapshot.material_investigation?.records||[],history_contexts:snapshot.history_contexts,
      component_types:snapshot.insights?.component_types||[],...Object.fromEntries(Object.entries(snapshot.insights?.drilldowns||{}).map(([key,rows])=>['insight:'+key,rows]))};
    const rows=sets[dataset]||[],coverage=(snapshot?.canonical?.source_coverage||snapshot?.coverage?.sources||{})[dataset==='pcba_history'?'2114':(dataset==='material_reuse'||dataset==='material_candidates')?'3074':dataset==='history_contexts'?'3022':'3074']||null,pages=Math.max(1,Math.ceil(rows.length/EVIDENCE_PAGE_SIZE));page=Math.min(page,pages-1);
    const names={pcba_history:'2114 · histórico PCBA',material_reuse:'3074 · reuso confirmado',material_candidates:'3074 · vínculos sob investigação',history_contexts:'Contextos históricos',component_types:'Matriz de componentes'};
    const focus=root.contains(root.ownerDocument.activeElement)?root.ownerDocument.activeElement.id:'';
    root.innerHTML=`<details class="mes-context-panel" open><summary>Históricos e reuso disponíveis · ${esc(line)}</summary><p>Origem: ${esc(read.source||"não informada")} · snapshot ${esc(snapshot.snapshot_id)} · coleta ${esc(snapshot.collected_at)}. Cobertura parcial: API sem revisão/cursor. Consulta da linha inteira, independente dos filtros de ocorrências acima. Linha histórica derivada pelo agente; PCBA histórica não implica mesmo CPH. Correlação não confirma causa.</p>
      <div class="mes-pagination ames-evidence-shortcuts"><button type="button" class="button ${dataset==='pcba_history'?'primary':'secondary'}" data-agent-dataset="pcba_history">Histórico PCBA · 2114</button><button type="button" class="button ${dataset==='material_reuse'?'primary':'secondary'}" data-agent-dataset="material_reuse">Reuso comprovado · 3074</button><button type="button" class="button ${dataset==='material_candidates'?'primary':'secondary'}" data-agent-dataset="material_candidates">Vínculos 3074 a investigar · ${sets.material_candidates.length}</button><button type="button" class="button ${dataset==='history_contexts'?'primary':'secondary'}" data-agent-dataset="history_contexts">Contextos históricos</button><button type="button" class="button ${dataset==='component_types'?'primary':'secondary'}" data-agent-dataset="component_types">Matriz de componentes</button></div>
      ${snapshot.insights?`<h3>Indicadores da fonte · PCBA e material separados</h3>${Object.entries(snapshot.insights.groups).map(([group,pairs])=>`<details><summary>${esc(group)}</summary><dl>${pairs.map(([label,value])=>`<dt>${esc(label)}</dt><dd>${INSIGHT_DRILL[label] && snapshot.insights.drilldowns[INSIGHT_DRILL[label]] ? `<button class="button secondary" data-agent-drill="${esc(INSIGHT_DRILL[label])}">${esc(value)} · registros</button>` : esc(value)}</dd>`).join('')}</dl></details>`).join('')}`:'<p>Painel de reuso indisponível: enriquecimento ainda não disponível.</p>'}
      <label>Registros disponíveis<select id="agentEvidenceDataset">${Object.keys(sets).map(key=>`<option value="${esc(key)}"${dataset===key?' selected':''}>${esc(names[key]||key.replace('insight:','Indicador · '))}</option>`).join('')}</select></label>
      ${dataset==='material_candidates'?`<div class="notice warn" data-3074-temporal-candidates><b>Vínculos históricos 3074 ainda sem associação temporal comprovada à falha da 3028</b><p>Estes materiais foram observados na consulta da PCBA e preservados da coleta bruta. Não entram em PCBA/componente de segundo uso, mesma falha ou mesma família até confirmar o vínculo e o histórico anterior. Consulte as Material SNs e as PCBAs anteriores quando disponíveis.</p></div>`:''}
      <p>${rows.length} registros armazenados nesta revisão · cobertura da fonte: ${esc(coverage?.status||"não comprovada")} · ${esc(coverage?.source_complete===true?"consulta integral comprovada":"integralidade não comprovada")}. Nenhum registro armazenado não prova ausência de histórico ou falha. Batch Count não é reuso.</p>
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
