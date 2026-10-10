export function withKnowledgeArchitecture(view,root){
  function decorate(){
    if(root.querySelector('[data-knowledge-architecture]'))return;
    const aside=document.createElement('aside');
    aside.dataset.knowledgeArchitecture='1';
    aside.className='mes-context-panel ames-knowledge-architecture';
    aside.innerHTML=`<div class="section-head"><div><h3>Arquitetura de dados</h3><p>CORA consulta a mesma base operacional; ela não vira um segundo banco.</p></div></div><div class="ames-knowledge-architecture-grid"><article><b>Fonte de verdade local</b><span>SQLite mantém snapshots, vínculos e evidências estruturadas.</span></article><article><b>Índice CORA</b><span>Busca documentos compactos derivados da base, preservando proveniência.</span></article><article><b>Por linha</b><span>Line Id acompanha as entidades; análises operacionais não misturam linhas por padrão.</span></article><article><b>Contexto sob demanda</b><span>Só o recorte relevante entra na consulta; fato, correlação, hipótese e causa confirmada continuam separados.</span></article></div>`;
    root.append(aside);
  }
  return Object.freeze({render(){view.render();decorate();},clear(){view.clear?.();}});
}
