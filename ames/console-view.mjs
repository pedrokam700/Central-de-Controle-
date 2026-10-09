import { createAgentClient } from './agent-client.mjs';
import { createAutomationView } from './automation-view.mjs';
import { createOccurrenceView } from './occurrence-view.mjs';
import {
  createSnConsoleView, createTraceConsoleView, createReuseConsoleView,
  createProcessConsoleView, createBaseConsoleView, createKnowledgeConsoleView
} from './console-specialized-views.mjs';

const VIEWS = Object.freeze([
  ['monitor','Monitoramento'],
  ['top3','Top 3 & FPY'],
  ['failures','Falhas'],
  ['sn','Consulta por SN'],
  ['trace','Rastreabilidade'],
  ['reuse','Dashboards de reuso'],
  ['process','Processo / 3022 & AT'],
  ['base','Base local'],
  ['knowledge','CORA conhecimento']
]);

// Console MES nativo: mesma sessão/state.ames/Auth/agente. Nenhum iframe ou segundo produto.
export function createConsoleView(root, store, { locale, onChange = () => {}, transport = {} } = {}) {
  let active='monitor', mounted=false, disposed=false;
  const views=new Map();
  const client=createAgentClient(store,{...transport,changed(){if(disposed)return;renderActive();paintHeader();onChange();}});

  function mount(){
    root.innerHTML=`<style>
      .ames-console-native{display:grid;grid-template-columns:210px minmax(0,1fr);gap:18px;align-items:start}
      .ames-console-subnav{position:sticky;top:16px;display:grid;gap:5px;padding:9px;background:#111;border-radius:11px}
      .ames-console-subnav button{border:0;background:transparent;color:#bbb;text-align:left;padding:10px 11px;border-radius:7px;font-size:12px;cursor:pointer}
      .ames-console-subnav button:hover,.ames-console-subnav button.active{background:#fff;color:#111;font-weight:700}
      .ames-console-main{min-width:0;display:grid;gap:14px}.ames-console-pane[hidden]{display:none!important}
      .ames-console-head{display:flex;justify-content:space-between;gap:12px;align-items:center;border:1px solid var(--line);background:var(--surface);border-radius:10px;padding:12px 14px;margin-bottom:14px}
      .ames-console-head strong{display:block}.ames-console-head small{color:var(--muted)}
      .ames-view-intro{margin-bottom:14px}.ames-view-intro h2{margin:0 0 4px;font-size:18px}.ames-view-intro p{margin:0;color:var(--muted)}
      .ames-console-form{padding:0;margin:0 0 14px}.ames-console-form fieldset{border:1px solid var(--line);border-radius:9px;margin:0 0 12px;padding:12px;display:flex;gap:10px;flex-wrap:wrap}.ames-console-form legend{padding:0 6px;font-weight:700}
      .ames-summary-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:12px 0}.ames-kv{border:1px solid var(--line);border-radius:9px;padding:11px;background:var(--surface)}.ames-kv small,.ames-kv b{display:block}.ames-kv small{color:var(--muted);margin-bottom:4px}
      .ames-evidence-card{border:1px solid var(--line);border-radius:9px;padding:12px;margin:8px 0;background:#fff}.ames-evidence-card-head{display:flex;justify-content:space-between;gap:10px}.ames-evidence-card-head div span{display:block;color:var(--muted);font-size:12px}.ames-prior-pcba{margin-top:7px;padding:8px;border-left:3px solid #111;background:#f7f7f5}
      .ames-reuse-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.ames-kpi-button{text-align:left;cursor:pointer}.ames-kpi-button.active{outline:2px solid #111}.ames-selected-evidence{scroll-margin-top:20px;border-width:2px}.ames-evidence-hit{background:#fff7c2!important}
      .ames-console-native .mes-context-panel{margin:10px 0}.ames-console-native .mes-context-panel h3{margin-top:0}.ames-console-native .info-note{margin:10px 0;padding:11px;border-left:3px solid #111;background:#f3f3f0}
      @media(max-width:900px){.ames-console-native{grid-template-columns:1fr}.ames-console-subnav{position:static;display:flex;overflow:auto}.ames-console-subnav button{white-space:nowrap}.ames-summary-grid,.ames-reuse-kpis{grid-template-columns:1fr 1fr}}
      @media(max-width:560px){.ames-summary-grid,.ames-reuse-kpis{grid-template-columns:1fr}}
    </style>
    <div class="ames-console-head"><div><strong>Console MES</strong><small data-console-status>Agente local ainda não conectado.</small></div><span class="status" data-console-build>MES local</span></div>
    <div class="ames-console-native"><nav class="ames-console-subnav" aria-label="Views da automação A-MES">${VIEWS.map(([id,label])=>`<button type="button" data-console-view="${id}"${id===active?' class="active"':''}>${label}</button>`).join('')}</nav><main class="ames-console-main">${VIEWS.map(([id])=>`<section class="ames-console-pane" data-console-pane="${id}"${id===active?'':' hidden'}></section>`).join('')}</main></div>`;
    for(const button of root.querySelectorAll('[data-console-view]'))button.addEventListener('click',()=>switchView(button.dataset.consoleView));
    mounted=true;paintHeader();
  }

  function ensure(id){
    if(views.has(id))return views.get(id);
    const pane=root.querySelector(`[data-console-pane="${id}"]`);let view;
    if(id==='monitor')view=createAutomationView(pane,store,client);
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
    if(!mounted)return;const a=store.agent(),status=root.querySelector('[data-console-status]'),build=root.querySelector('[data-console-build]');
    if(status)status.textContent=a.status==='connected'?`Agente conectado · ${a.capabilities?.schema==='central-r12-local'?'modo local R12+':'contrato canônico'} · scheduler FIFO`:'Agente local ainda não conectado. Abra Monitoramento para conectar.';
    if(build)build.textContent=a.agent_build||a.capabilities?.agent_build||'MES local';
  }

  function switchView(id){
    if(!VIEWS.some(([key])=>key===id))return;active=id;
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
