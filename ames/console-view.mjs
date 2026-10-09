import { createAgentClient } from './agent-client.mjs';
import { createAutomationView } from './automation-view.mjs';
import { createAdvancedView } from './advanced-view.mjs';
import { createOccurrenceView } from './occurrence-view.mjs';
import { createLineOverview, createTrendAddon, createFailuresParityView } from './console-legacy-parity.mjs';
import {
  createSnConsoleView, createTraceConsoleView, createReuseConsoleView,
  createProcessConsoleView, createBaseConsoleView, createKnowledgeConsoleView
} from './console-specialized-views.mjs';

const VIEWS = Object.freeze([
  ['monitor','◉','Monitoramento','Monitoramento A-MES','Poucos cliques na frente; coleta, snapshots e correlações por trás.'],
  ['top3','↗','Top 3 & FPY','Top 3 & FPY','FPY, Check FPY, Quantity e Top 3 sempre separados por linha.'],
  ['failures','!','Falhas','Falhas','Ocorrências atuais, estados de reparo e histórico operacional.'],
  ['sn','⌕','Consulta por SN','Consulta por SN','Investigação de PCBA ou Material SN com 3074, 2114 e 3022.'],
  ['trace','⌘','Rastreabilidade','Rastreabilidade','Coleta seletiva full, process_only ou reuse_only sem misturar linhas.'],
  ['reuse','▥','Dashboards de reuso','Dashboards de reuso','Segundo uso de PCBA e Material SN, recorrência e vínculos históricos.'],
  ['process','≡','Processo / 3022 & AT','Processo / 3022 & AT','Timeline de montagem, teste, detecção, AT e retorno à linha.'],
  ['base','▦','Base local','Base local','SQLite e datasets locais preservados para consulta e auditoria.'],
  ['knowledge','C','CORA conhecimento','CORA · conhecimento','Busca operacional com separação entre fato, correlação, hipótese e causa confirmada.']
]);

const STYLE_HREF = new URL('./console-legacy.css', import.meta.url).href;

// Console MES nativo: mesma sessão/state.ames/Auth/agente. Nenhum iframe ou segunda aplicação.
export function createConsoleView(root, store, { locale, onChange = () => {}, transport = {} } = {}) {
  let active='monitor', mounted=false, disposed=false;
  const views=new Map();
  const client=createAgentClient(store,{...transport,changed(){if(disposed)return;renderActive();paintHeader();onChange();}});

  const meta=()=>VIEWS.find(([id])=>id===active)||VIEWS[0];
  function mount(){
    root.innerHTML=`<link rel="stylesheet" href="${STYLE_HREF}"><div class="ames-legacy-shell" data-ames-shell>
      <aside class="ames-legacy-sidebar">
        <div class="ames-legacy-brand"><div class="ames-legacy-brand-row"><div class="ames-legacy-mark">Q</div><div><strong>Central de trabalho</strong><span>A-MES · motor local</span></div></div></div>
        <nav class="ames-legacy-nav" aria-label="Views da automação A-MES">${VIEWS.map(([id,icon,label])=>`<button type="button" data-console-view="${id}"${id===active?' class="active"':''}><span class="ico">${icon}</span>${label}</button>`).join('')}</nav>
        <div class="ames-legacy-foot"><b>Offline por padrão.</b><br>MES e banco permanecem no notebook. A Central usa o mesmo agente local e a mesma base operacional.<br><br><span data-console-build-foot>R12 · 9 views</span></div>
      </aside>
      <main class="ames-legacy-main">
        <header class="ames-legacy-topbar"><div><h1 class="ames-legacy-title" data-console-title></h1><p class="ames-legacy-sub" data-console-sub></p></div><div class="ames-legacy-actions">
          <button class="button secondary ames-mobile-menu" type="button" data-console-menu style="display:none">☰</button>
          <span class="ames-status-pill"><span class="ames-agent-dot" data-console-dot></span><span data-console-status>Agente local desconectado</span></span>
          <button class="button secondary ames-hide-mobile" type="button" data-console-open-ames>Abrir A-MES</button>
          <button class="button secondary ames-hide-mobile" type="button" data-console-check>Verificar</button>
          <button class="button secondary" type="button" data-console-back>Voltar à Central</button>
        </div></header>
        <div class="ames-legacy-content"><div class="ames-shell-banner"><div><strong>Console MES</strong> · experiência operacional baseada na V0.5.22/V0.5.23 local, com integração R12 preservada.</div><span class="ames-shell-build" data-console-build>MES local</span></div>${VIEWS.map(([id])=>`<section class="ames-console-pane" data-console-pane="${id}"${id===active?'':' hidden'}></section>`).join('')}</div>
      </main></div>`;
    for(const button of root.querySelectorAll('[data-console-view]'))button.addEventListener('click',()=>switchView(button.dataset.consoleView));
    root.querySelector('[data-console-menu]')?.addEventListener('click',()=>root.querySelector('[data-ames-shell]')?.classList.toggle('menu-open'));
    root.querySelector('[data-console-back]')?.addEventListener('click',()=>document.querySelector('.main-nav [data-page="home"], [data-page="home"]')?.click());
    root.querySelector('[data-console-open-ames]')?.addEventListener('click',async()=>{try{if(store.agent().status!=='connected')await client.connect();await client.auxiliary('chrome');}catch(error){store.updateAgent({error:error.message});paintHeader();}});
    root.querySelector('[data-console-check]')?.addEventListener('click',async()=>{try{if(store.agent().status==='connected')await client.refresh();else await client.connect();}catch(error){store.updateAgent({error:error.message});paintHeader();}});
    mounted=true;paintHeader();
  }

  function ensure(id){
    if(views.has(id))return views.get(id);
    const pane=root.querySelector(`[data-console-pane="${id}"]`);let view;
    if(id==='monitor'){
      pane.innerHTML='<section data-monitor-main></section><section data-monitor-lines></section><section data-monitor-tools></section>';
      const primary=createAutomationView(pane.querySelector('[data-monitor-main]'),store,client);
      const lineBoard=createLineOverview(pane.querySelector('[data-monitor-lines]'),store,client);
      const tools=createAdvancedView(pane.querySelector('[data-monitor-tools]'),store,client);
      view={render(){primary.render();lineBoard.render();tools.render();},clear(){primary.clear?.();lineBoard.clear?.();tools.clear?.();pane.replaceChildren();}};
    }
    else if(id==='top3'){
      pane.innerHTML='<section data-top3-main></section><section data-top3-trend></section>';
      const primary=createOccurrenceView(pane.querySelector('[data-top3-main]'),store,{locale,mode:'dashboard'});
      const trend=createTrendAddon(pane.querySelector('[data-top3-trend]'),store,client);
      view={render(){primary.render();trend.render();},clear(){primary.clear?.();trend.clear?.();pane.replaceChildren();}};
    }
    else if(id==='failures')view=createFailuresParityView(pane,store,client);
    else if(id==='sn')view=createSnConsoleView(pane,store,client);
    else if(id==='trace')view=createTraceConsoleView(pane,store,client);
    else if(id==='reuse')view=createReuseConsoleView(pane,store);
    else if(id==='process')view=createProcessConsoleView(pane,store);
    else if(id==='base')view=createBaseConsoleView(pane,store,client);
    else if(id==='knowledge')view=createKnowledgeConsoleView(pane,client);
    views.set(id,view);return view;
  }

  function paintHeader(){
    if(!mounted)return;const a=store.agent(),m=meta();
    const title=root.querySelector('[data-console-title]'),sub=root.querySelector('[data-console-sub]'),status=root.querySelector('[data-console-status]'),build=root.querySelector('[data-console-build]'),foot=root.querySelector('[data-console-build-foot]'),dot=root.querySelector('[data-console-dot]');
    if(title)title.textContent=m[3];if(sub)sub.textContent=m[4];
    const connected=a.status==='connected';
    if(status)status.textContent=connected?`Agente local conectado${a.agent_build?' · '+a.agent_build:''}`:'Agente local desconectado';
    dot?.classList.toggle('ok',connected);
    const buildText=a.agent_build||a.capabilities?.agent_build||'MES local';if(build)build.textContent=buildText;if(foot)foot.textContent=`${buildText} · 9 views`;
  }

  function switchView(id){
    if(!VIEWS.some(([key])=>key===id))return;active=id;
    root.querySelector('[data-ames-shell]')?.classList.remove('menu-open');
    for(const button of root.querySelectorAll('[data-console-view]'))button.classList.toggle('active',button.dataset.consoleView===id);
    for(const pane of root.querySelectorAll('[data-console-pane]'))pane.hidden=pane.dataset.consolePane!==id;
    renderActive();
  }

  function renderActive(){if(!mounted)mount();ensure(active)?.render();paintHeader();}

  return Object.freeze({
    render(){if(!root||disposed)return;if(!mounted)mount();renderActive();},
    clear(){disposed=true;for(const view of views.values())view?.clear?.();views.clear();client.clear();root?.replaceChildren();mounted=false;}
  });
}
