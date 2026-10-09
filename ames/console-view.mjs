import { createAgentClient } from './agent-client.mjs';
import { createAutomationView } from './automation-view.mjs';
import { createAdvancedView } from './advanced-view.mjs';
import { createOccurrenceView } from './occurrence-view.mjs';
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

const CSS = `
  .ames-legacy-shell{--ames-bg:#f4f4f2;--ames-surface:#fff;--ames-soft:#f0f0ee;--ames-text:#151515;--ames-muted:#696966;--ames-line:#dededb;--ames-line2:#ececea;--ames-dark:#0d0d0d;--ames-blue:#245782;--ames-ok:#197244;--ames-warn:#a96500;--ames-danger:#c7352d;position:fixed;inset:0;z-index:1200;background:var(--ames-bg);color:var(--ames-text);display:grid;grid-template-columns:238px minmax(0,1fr);font:14px/1.4 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:hidden}
  .ames-legacy-shell *{box-sizing:border-box}.ames-legacy-shell button,.ames-legacy-shell input,.ames-legacy-shell select{font:inherit}.ames-legacy-shell button{cursor:pointer}.ames-legacy-shell [hidden]{display:none!important}
  .ames-legacy-sidebar{height:100vh;background:var(--ames-dark);color:#eee;padding:22px 13px 16px;display:flex;flex-direction:column;overflow:auto}.ames-legacy-brand{padding:0 10px 18px;border-bottom:1px solid #2f2f2d}.ames-legacy-brand-row{display:flex;gap:10px;align-items:center}.ames-legacy-mark{display:grid;place-items:center;width:31px;height:31px;border-radius:8px;background:#fff;color:#111;font-weight:800}.ames-legacy-brand strong{font-size:14px}.ames-legacy-brand span{display:block;color:#989893;font-size:10px;margin-top:2px}
  .ames-legacy-nav{display:grid;gap:3px;margin:15px 0}.ames-legacy-nav button{display:flex;align-items:center;gap:9px;width:100%;border:0;background:transparent;color:#b9b9b4;border-radius:8px;padding:9px 10px;text-align:left;font-size:12px}.ames-legacy-nav button:hover,.ames-legacy-nav button.active{background:#262626;color:#fff}.ames-legacy-nav .ico{width:20px;text-align:center;color:#8d8d88}.ames-legacy-nav button.active .ico{color:#fff}.ames-legacy-foot{margin-top:auto;color:#888883;font-size:9.5px;line-height:1.5;padding:12px 10px 0}.ames-legacy-foot b{color:#bbb}
  .ames-legacy-main{min-width:0;height:100vh;overflow:auto}.ames-legacy-topbar{min-height:76px;padding:15px clamp(18px,3vw,42px);display:flex;align-items:center;justify-content:space-between;gap:18px;background:rgba(255,255,255,.96);border-bottom:1px solid var(--ames-line);position:sticky;top:0;z-index:8;backdrop-filter:blur(10px)}.ames-legacy-title{margin:0;font-size:20px;letter-spacing:-.025em}.ames-legacy-sub{margin:4px 0 0;color:var(--ames-muted);font-size:11px}.ames-legacy-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.ames-legacy-content{padding:22px clamp(18px,3vw,42px) 48px;max-width:1620px;margin:0 auto}
  .ames-legacy-shell .button{border:1px solid transparent;border-radius:8px;min-height:38px;padding:8px 12px;font-weight:680;font-size:11px;white-space:nowrap}.ames-legacy-shell .button.primary{background:#111;color:#fff}.ames-legacy-shell .button.secondary{background:#fff;border-color:var(--ames-line);color:#111}.ames-legacy-shell .button:disabled{opacity:.45;cursor:not-allowed}.ames-legacy-shell .status,.ames-status-pill{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--ames-line);border-radius:999px;background:#fff;padding:7px 10px;font-size:10px;font-weight:700}.ames-agent-dot{width:7px;height:7px;border-radius:50%;background:var(--ames-danger)}.ames-agent-dot.ok{background:var(--ames-ok)}
  .ames-legacy-shell .ames-view-intro{display:none}.ames-legacy-shell .panel,.ames-legacy-shell .mes-context-panel,.ames-legacy-shell .ames-console-form{background:var(--ames-surface);border:1px solid var(--ames-line);border-radius:12px;box-shadow:0 8px 26px rgba(0,0,0,.04);overflow:hidden}.ames-legacy-shell .mes-context-panel,.ames-legacy-shell .ames-console-form{padding:16px;margin:0 0 14px}.ames-legacy-shell .mes-context-panel h3{margin:0 0 10px;font-size:14px}.ames-legacy-shell .mes-context-panel p{font-size:10px;line-height:1.5;color:var(--ames-muted)}
  .ames-legacy-shell .ames-reuse-kpis,.ames-legacy-shell .ames-summary-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0 0 14px}.ames-legacy-shell .stat,.ames-legacy-shell .ames-kv{background:#fff;border:1px solid var(--ames-line);border-radius:11px;padding:14px}.ames-legacy-shell .stat-label,.ames-legacy-shell .ames-kv small{display:block;font-size:9.5px;color:var(--ames-muted);margin-bottom:5px}.ames-legacy-shell .stat strong,.ames-legacy-shell .stat-value,.ames-legacy-shell .ames-kv b{display:block;font-size:18px;color:#111}.ames-legacy-shell .stat-note{display:block;font-size:9px;color:var(--ames-muted);margin-top:5px}.ames-legacy-shell .ames-kpi-button{text-align:left;cursor:pointer}.ames-legacy-shell .ames-kpi-button:hover{border-color:#b9cad7;background:#fbfdff}.ames-legacy-shell .ames-kpi-button.active{outline:2px solid #111}
  .ames-legacy-shell .mes-pagination{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.ames-legacy-shell .mes-filters{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:10px 0}.ames-legacy-shell label{display:grid;gap:5px;font-size:9.5px;color:var(--ames-muted);font-weight:680}.ames-legacy-shell input,.ames-legacy-shell select{width:100%;min-height:37px;border:1px solid var(--ames-line);border-radius:8px;padding:7px 9px;background:#fff;color:#111}.ames-legacy-shell fieldset{border:1px solid var(--ames-line);border-radius:9px;margin:0 0 12px;padding:12px;display:flex;gap:10px;flex-wrap:wrap}.ames-legacy-shell legend{padding:0 6px;font-weight:700}.ames-legacy-shell .mes-opt-in{display:flex;align-items:center;gap:7px;border:1px solid var(--ames-line2);border-radius:8px;padding:8px 10px;background:#fafafa}.ames-legacy-shell .mes-opt-in input{width:auto;min-height:auto}
  .ames-legacy-shell .notice{border-left:3px solid #111;background:#fafafa;padding:11px 12px;font-size:10px;line-height:1.55}.ames-legacy-shell .notice.warn{border-left-color:var(--ames-warn);background:#fffaf2}.ames-legacy-shell .info-note{margin:10px 0;padding:11px;border-left:3px solid #111;background:#f3f3f0;font-size:10px;color:var(--ames-muted)}
  .ames-legacy-shell .table-wrap{overflow:auto;max-height:650px;border:1px solid var(--ames-line);border-radius:10px}.ames-legacy-shell table{width:100%;min-width:1000px;border-collapse:collapse;background:#fff}.ames-legacy-shell th{position:sticky;top:0;z-index:2;background:#f7f7f5;color:#666;font-size:9px;text-transform:uppercase;letter-spacing:.04em;text-align:left;padding:10px 11px;border-bottom:1px solid var(--ames-line)}.ames-legacy-shell td{padding:9px 11px;border-bottom:1px solid var(--ames-line2);font-size:10px;vertical-align:top}.ames-legacy-shell tbody tr:nth-child(even){background:#f7fbfe}.ames-legacy-shell tbody tr:hover{background:#edf5fa}.ames-legacy-shell .ames-evidence-card{border:1px solid var(--ames-line);border-radius:9px;padding:12px;margin:8px 0;background:#fff}.ames-legacy-shell .ames-evidence-card-head{display:flex;justify-content:space-between;gap:10px}.ames-legacy-shell .ames-evidence-card-head div span{display:block;color:var(--ames-muted);font-size:12px}.ames-legacy-shell .ames-prior-pcba{margin-top:7px;padding:8px;border-left:3px solid #111;background:#f7f7f5}.ames-legacy-shell .ames-evidence-hit{background:#fff7c2!important}.ames-legacy-shell .ames-selected-evidence{scroll-margin-top:95px;border-width:2px}
  .ames-legacy-shell details{margin-top:10px;border-top:1px solid var(--ames-line2);padding-top:10px}.ames-legacy-shell summary{font-size:10px;font-weight:750;cursor:pointer}.ames-legacy-shell [data-agent-status]{margin-top:12px;border-left:3px solid var(--ames-blue);background:#f5f9fc;padding:10px 12px}.ames-legacy-shell [data-agent-status] p,.ames-legacy-shell [data-trace-status] p,.ames-legacy-shell [data-sn-status] p{font-size:10px;margin:5px 0}
  .ames-console-pane{min-width:0}.ames-shell-banner{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:14px;padding:11px 13px;border:1px solid var(--ames-line);border-radius:10px;background:#fff}.ames-shell-banner div{font-size:10px;color:var(--ames-muted)}.ames-shell-banner strong{color:#111}.ames-shell-build{font-size:9px;color:var(--ames-muted)}
  @media(max-width:1100px){.ames-legacy-shell .ames-reuse-kpis,.ames-legacy-shell .ames-summary-grid{grid-template-columns:1fr 1fr}.ames-legacy-shell .mes-filters{grid-template-columns:1fr 1fr}}
  @media(max-width:760px){.ames-legacy-shell{grid-template-columns:1fr}.ames-legacy-sidebar{position:fixed;left:0;top:0;bottom:0;width:min(86vw,300px);z-index:20;transform:translateX(-105%);transition:transform .2s}.ames-legacy-shell.menu-open .ames-legacy-sidebar{transform:translateX(0)}.ames-legacy-topbar{padding:12px}.ames-legacy-content{padding:13px}.ames-legacy-actions .ames-hide-mobile{display:none}.ames-mobile-menu{display:inline-flex!important}.ames-legacy-shell .ames-reuse-kpis,.ames-legacy-shell .ames-summary-grid,.ames-legacy-shell .mes-filters{grid-template-columns:1fr}}
`;

// Console MES nativo: mesma sessão/state.ames/Auth/agente. Nenhum iframe ou segunda aplicação.
export function createConsoleView(root, store, { locale, onChange = () => {}, transport = {} } = {}) {
  let active='monitor', mounted=false, disposed=false;
  const views=new Map();
  const client=createAgentClient(store,{...transport,changed(){if(disposed)return;renderActive();paintHeader();onChange();}});

  const meta=()=>VIEWS.find(([id])=>id===active)||VIEWS[0];
  function mount(){
    root.innerHTML=`<style>${CSS}</style><div class="ames-legacy-shell" data-ames-shell>
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
      pane.innerHTML='<section data-monitor-main></section><section data-monitor-tools></section>';
      const primary=createAutomationView(pane.querySelector('[data-monitor-main]'),store,client);
      const tools=createAdvancedView(pane.querySelector('[data-monitor-tools]'),store,client);
      view={render(){primary.render();tools.render();},clear(){primary.clear?.();tools.clear?.();pane.replaceChildren();}};
    }
    else if(id==='top3')view=createOccurrenceView(pane,store,{locale,mode:'dashboard'});
    else if(id==='failures')view=createOccurrenceView(pane,store,{locale,mode:'failures'});
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
