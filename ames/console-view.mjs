import { createAgentClient } from './agent-client.mjs';
import { createAutomationView } from './automation-view.mjs';
import { createAdvancedView } from './advanced-view.mjs';
import { createLineOverview, createTrendAddon, createFailuresParityView } from './console-legacy-parity.mjs';
import { createDailyFailureSummary } from './daily-failure-summary.mjs';
import { createDailyFailureAnalytics } from './daily-failure-analytics.mjs';
import { createSnConsoleView, createTraceConsoleView, createProcessConsoleView } from './console-specialized-views.mjs';
import { createReuseConsoleView, createBaseConsoleView, createKnowledgeConsoleView } from './console-wave3-views.mjs';
import { withFastlaneSnEnhancements } from './console-fastlane-sn-reuse.mjs';
import { withOfflineSnLookup } from './console-sn-offline-fastlane.mjs';
import { createNetworkHealthView } from './console-network-fastlane.mjs';
import { create3012FastlaneView } from './console-3012-fastlane.mjs';
import { withProcessCapability, applyMonitorProcessCapability } from './console-capability-guard.mjs';
import { createMonitorRuntimeView } from './console-monitor-runtime.mjs';
import { withKnowledgeArchitecture } from './console-knowledge-architecture.mjs';
import { withAgentRefresh } from './console-refresh-decorator.mjs';
import { withTraceSelectionHelper } from './console-trace-scope.mjs';
import { createFailureProcessAddon } from './console-failure-process.mjs';
import { withBaseCatalog } from './console-base-catalog.mjs';
import { createPreparationView } from './console-preparation.mjs';
import { createConsoleTranslator } from './console-i18n.mjs';
import { createHistoryView } from './console-history.mjs';

const VIEWS = Object.freeze([
  ['monitor','◉','Monitoramento','Monitoramento A-MES','Poucos cliques na frente; coleta, snapshots e correlações por trás.'],
  ['top3','↗','Falhas do dia & FPY','Falhas do dia & FPY','Top 3 como resumo; ranking completo, ocorrências, turno e contexto de reuso no mesmo escopo.'],
  ['failures','!','Falhas','Falhas','Ocorrências atuais, estados de reparo e histórico operacional.'],
  ['sn','⌕','Consulta por SN','Consulta por SN','Investigação de PCBA ou Material SN com 3074, 2114, 3022 e 3012 quando a fonte estiver disponível.'],
  ['trace','⌘','Rastreabilidade','Rastreabilidade','Coleta seletiva full, process_only ou reuse_only sem misturar linhas e respeitando capacidades do agente.'],
  ['reuse','▥','Dashboards de reuso','Dashboards de reuso','Segundo uso de PCBA e Material SN, recorrência e vínculos históricos.'],
  ['process','≡','Processo / 3022 & AT','Processo / 3022 & AT','Timeline 3022 e histórico 3012 de defeito, reparo e análise.'],
  ['base','▦','Base local','Base local','SQLite e datasets locais preservados para consulta e auditoria.'],
  ['knowledge','C','CORA conhecimento','CORA · conhecimento','Busca operacional com separação entre fato, correlação, hipótese e causa confirmada.']
]);

const STYLE_HREF = new URL('./console-legacy.css', import.meta.url).href;
const WAVE2_STYLE_HREF = new URL('./console-wave2.css', import.meta.url).href;
const WAVE3_STYLE_HREF = new URL('./console-wave3.css', import.meta.url).href;
const MOBILE_STYLE_HREF = new URL('./console-mobile-polish.css', import.meta.url).href;
const POLISH_STYLE_HREF = new URL('./console-r12-polish.css', import.meta.url).href;
const FASTLANE_STYLE_HREF = new URL('./console-fastlane.css', import.meta.url).href;
const ANALYTICS_STYLE_HREF = new URL('./console-daily-analytics.css', import.meta.url).href;

export function createConsoleView(root, store, { locale, onChange = () => {}, transport = {}, history } = {}) {
  let active='monitor', mounted=false, disposed=false;let preparation, translator;const views=new Map();
  const client=createAgentClient(store,{...transport,changed(){if(disposed)return;renderActive();paintHeader();onChange();}});
  const meta=()=>VIEWS.find(([id])=>id===active)||VIEWS[0];
  function setMenu(open){const shell=root.querySelector('[data-ames-shell]'),button=root.querySelector('[data-console-menu]');shell?.classList.toggle('menu-open',!!open);button?.setAttribute('aria-expanded',String(!!open));}
  function backToCentral(){setMenu(false);document.querySelector('.main-nav [data-page="home"], [data-page="home"]')?.click();}
  function openWorkstationSetup(){preparation?.open();root.querySelector('[data-console-preparation]')?.scrollIntoView({block:'start'});}
  function mount(){
    const en=document.documentElement.lang.startsWith('en');
    root.innerHTML=`<link rel="stylesheet" href="${STYLE_HREF}"><link rel="stylesheet" href="${WAVE2_STYLE_HREF}"><link rel="stylesheet" href="${WAVE3_STYLE_HREF}"><link rel="stylesheet" href="${MOBILE_STYLE_HREF}"><link rel="stylesheet" href="${POLISH_STYLE_HREF}"><link rel="stylesheet" href="${FASTLANE_STYLE_HREF}"><link rel="stylesheet" href="${ANALYTICS_STYLE_HREF}"><div class="ames-legacy-shell" data-ames-shell><aside class="ames-legacy-sidebar"><div class="ames-legacy-brand"><div class="ames-legacy-brand-row"><div class="ames-legacy-mark">Q</div><div><strong>Central de trabalho</strong><span>A-MES · motor local</span></div></div></div><nav class="ames-legacy-nav" aria-label="Views da automação A-MES">${VIEWS.map(([id,icon,label])=>`<button type="button" data-console-view="${id}"${id===active?' class="active"':''}><span class="ico">${icon}</span><span data-console-nav-label="${id}">${id==='top3'&&en?'Daily failures & FPY':label}</span></button>`).join('')}</nav><div class="ames-legacy-foot"><b>Offline por padrão.</b><br>MES e banco ficam no notebook. O Console usa o mesmo agente local, SQLite e estado da Central.<br><br><span data-console-build-foot>R12 · 9 views</span></div></aside><button type="button" class="ames-mobile-backdrop" data-console-menu-close aria-label="Fechar menu do Console MES"></button><main class="ames-legacy-main"><header class="ames-legacy-topbar"><div><h1 class="ames-legacy-title" data-console-title></h1><p class="ames-legacy-sub" data-console-sub></p></div><div class="ames-legacy-actions"><button class="button secondary ames-mobile-menu" type="button" data-console-menu aria-expanded="false" aria-label="Abrir menu do Console MES" style="display:none">☰</button><span class="ames-status-pill"><span class="ames-agent-dot" data-console-dot></span><span data-console-status>Agente local desconectado</span></span><button class="button secondary ames-hide-mobile" type="button" data-console-open-ames>Abrir A-MES</button><button class="button secondary ames-hide-mobile" type="button" data-console-setup>Configurar posto</button><button class="button secondary ames-hide-mobile" type="button" data-console-check>Verificar</button><button class="button secondary" type="button" data-console-back>Voltar à Central</button></div></header><div class="ames-legacy-content"><section data-console-preparation></section>${VIEWS.map(([id])=>`<section class="ames-console-pane" data-console-pane="${id}"${id===active?'':' hidden'}></section>`).join('')}</div></main></div>`;
    for(const button of root.querySelectorAll('[data-console-view]'))button.addEventListener('click',()=>switchView(button.dataset.consoleView));root.querySelector('[data-console-back]')?.addEventListener('click',backToCentral);root.querySelector('[data-console-menu]')?.addEventListener('click',()=>setMenu(!root.querySelector('[data-ames-shell]')?.classList.contains('menu-open')));root.querySelector('[data-console-menu-close]')?.addEventListener('click',()=>setMenu(false));root.querySelector('[data-console-open-ames]')?.addEventListener('click',async()=>{try{if(store.agent().status!=='connected')await client.connect();await client.auxiliary('chrome');}catch(error){store.updateAgent({error:error.message});paintHeader();}});root.querySelector('[data-console-setup]')?.addEventListener('click',openWorkstationSetup);root.querySelector('[data-console-check]')?.addEventListener('click',async()=>{try{if(store.agent().status==='connected')await client.refresh();else await client.connect();}catch(error){store.updateAgent({error:error.message});paintHeader();}});
    const theme=document.createElement('link');theme.rel='stylesheet';theme.href=new URL('./console-theme.css',import.meta.url).href;root.append(theme);mounted=true;translator=createConsoleTranslator(root,locale);preparation=createPreparationView(root.querySelector('[data-console-preparation]'),store,client);preparation.render();paintHeader();
  }
  function ensure(id){
    if(views.has(id))return views.get(id);const pane=root.querySelector(`[data-console-pane="${id}"]`);let view;
    if(id==='monitor'){pane.innerHTML='<section data-monitor-main></section><section data-monitor-lines></section><section data-monitor-runtime></section><section data-monitor-network></section><section data-monitor-tools></section>';const monitorRoot=pane.querySelector('[data-monitor-main]'),primary=createAutomationView(monitorRoot,store,client),lineBoard=createLineOverview(pane.querySelector('[data-monitor-lines]'),store,client),runtime=createMonitorRuntimeView(pane.querySelector('[data-monitor-runtime]'),store),network=createNetworkHealthView(pane.querySelector('[data-monitor-network]'),store),tools=createAdvancedView(pane.querySelector('[data-monitor-tools]'),store,client);view={render(){primary.render();applyMonitorProcessCapability(monitorRoot,store);lineBoard.render();runtime.render();network.render();tools.render();},clear(){primary.clear?.();lineBoard.clear?.();runtime.clear?.();network.clear?.();tools.clear?.();pane.replaceChildren();}};}
    else if(id==='top3'){pane.innerHTML='<section data-top3-main></section><section data-top3-analytics data-no-i18n></section><section data-top3-trend></section>';const primary=createDailyFailureSummary(pane.querySelector('[data-top3-main]'),store),analytics=createDailyFailureAnalytics(pane.querySelector('[data-top3-analytics]'),store),trend=createTrendAddon(pane.querySelector('[data-top3-trend]'),store,client),base={render(){primary.render();analytics.render();trend.render();},clear(){primary.clear?.();analytics.clear?.();trend.clear?.();pane.replaceChildren();}};view=withAgentRefresh(base,pane,store,client,{label:'Atualizar'});}
    else if(id==='failures'){pane.innerHTML='<section data-failures-main></section><section data-failures-process></section>';const failureRoot=pane.querySelector('[data-failures-main]'),primary=createFailuresParityView(failureRoot,store,client),process=createFailureProcessAddon(pane.querySelector('[data-failures-process]'),store,failureRoot);view={render(){primary.render();process.render();},clear(){primary.clear?.();process.clear?.();pane.replaceChildren();}};}
    else if(id==='sn')view=withOfflineSnLookup(withProcessCapability(withFastlaneSnEnhancements(createSnConsoleView(pane,store,client),pane,store),pane,store,'sn'),pane,store);
    else if(id==='trace'){const base=withTraceSelectionHelper(withProcessCapability(createTraceConsoleView(pane,store,client),pane,store,'trace'),pane,store);view=withAgentRefresh(base,pane,store,client,{label:'Atualizar tela'});}
    else if(id==='reuse')view=withAgentRefresh(createReuseConsoleView(pane,store),pane,store,client,{label:'Atualizar'});
    else if(id==='process'){pane.innerHTML='<section data-process-main></section><section data-process-3012></section>';const processRoot=pane.querySelector('[data-process-main]'),base=withAgentRefresh(withProcessCapability(createProcessConsoleView(processRoot,store),processRoot,store,'process'),processRoot,store,client,{label:'Atualizar'}),repair3012=create3012FastlaneView(pane.querySelector('[data-process-3012]'),store);view={render(){base.render();repair3012.render();},clear(){base.clear?.();repair3012.clear?.();pane.replaceChildren();}};}
    else if(id==='base'){pane.innerHTML='<section data-base-history></section><section data-base-local></section>';const local=pane.querySelector('[data-base-local]'),base=withBaseCatalog(createBaseConsoleView(local,store,client),local,store,client),periods=createHistoryView(pane.querySelector('[data-base-history]'),store,client,history);view={render(){periods.render();base.render();},clear(){periods.clear();base.clear();}};}
    else if(id==='knowledge')view=withKnowledgeArchitecture(createKnowledgeConsoleView(pane,client,store),pane);views.set(id,view);return view;
  }
  function paintHeader(){if(!mounted)return;const a=store.agent(),m=meta(),title=root.querySelector('[data-console-title]'),sub=root.querySelector('[data-console-sub]'),status=root.querySelector('[data-console-status]'),foot=root.querySelector('[data-console-build-foot]'),dot=root.querySelector('[data-console-dot]'),top3Nav=root.querySelector('[data-console-nav-label="top3"]'),en=document.documentElement.lang.startsWith('en');if(top3Nav)top3Nav.textContent=en?'Daily failures & FPY':'Falhas do dia & FPY';if(title)title.textContent=en&&active==='top3'?'Daily failures & FPY':m[3];if(sub)sub.textContent=en&&active==='top3'?'Top 3 summary, full ranking, occurrences, shift and reuse context in one scope.':m[4];const connected=a.status==='connected';if(status)status.textContent=connected?`Agente local conectado${a.agent_build?' · '+a.agent_build:''}`:'MES local não disponível neste computador';dot?.classList.toggle('ok',connected);if(foot)foot.textContent=`${a.agent_build||a.capabilities?.agent_build||'MES local'} · 9 views`;}
  function switchView(id){if(!VIEWS.some(([key])=>key===id))return;active=id;setMenu(false);if(id!=='monitor')preparation?.collapse();for(const button of root.querySelectorAll('[data-console-view]'))button.classList.toggle('active',button.dataset.consoleView===id);for(const pane of root.querySelectorAll('[data-console-pane]'))pane.hidden=pane.dataset.consolePane!==id;renderActive();}
  function renderActive(){if(!mounted)mount();ensure(active)?.render();paintHeader();preparation?.render();translator?.render();}
  return Object.freeze({render(){if(!root||disposed)return;if(!mounted)mount();renderActive();},clear(){disposed=true;preparation?.clear();translator?.clear();for(const view of views.values())view?.clear?.();views.clear();client.clear();root?.replaceChildren();mounted=false;}});
}
export { VIEWS as CANONICAL_VIEWS };