const t=(pt,en)=>document.documentElement.lang.startsWith('en')?en:pt;

export function withKnowledgeArchitecture(view,root){
  function decorate(){
    if(root.querySelector('[data-knowledge-architecture]'))return;
    const aside=document.createElement('details');
    aside.dataset.knowledgeArchitecture='1';
    aside.className='mes-context-panel ames-knowledge-architecture';
    aside.innerHTML=`<summary><b>${t('Como a CORA usa os dados','How CORA uses the data')}</b><span>${t('Fonte local, proveniência e limites da análise','Local source, provenance and analysis limits')}</span></summary><div class="ames-knowledge-architecture-body"><div class="section-head"><div><h3>${t('Arquitetura de dados','Data architecture')}</h3><p>${t('CORA consulta a mesma base operacional; ela não vira um segundo banco.','CORA queries the same operational database; it does not become a second database.')}</p></div></div><div class="ames-knowledge-architecture-grid"><article><b>${t('Fonte de verdade local','Local source of truth')}</b><span>${t('SQLite mantém snapshots, vínculos e evidências estruturadas.','SQLite stores snapshots, links and structured evidence.')}</span></article><article><b>${t('Índice CORA','CORA index')}</b><span>${t('Busca documentos compactos derivados da base, preservando proveniência.','Searches compact documents derived from the database while preserving provenance.')}</span></article><article><b>${t('Por linha','By line')}</b><span>${t('Line Id acompanha as entidades; análises operacionais não misturam linhas por padrão.','Line Id follows each entity; operational analyses keep lines separate by default.')}</span></article><article><b>${t('Contexto sob demanda','Context on demand')}</b><span>${t('Só o recorte relevante entra na consulta; fato, correlação, hipótese e causa confirmada continuam separados.','Only relevant context enters the query; facts, correlations, hypotheses and confirmed causes remain separate.')}</span></article></div></div>`;
    const search=root.querySelector('.ames-knowledge-search');
    if(search)search.after(aside);else root.append(aside);
  }
  return Object.freeze({render(){view.render();decorate();},clear(){view.clear?.();}});
}
