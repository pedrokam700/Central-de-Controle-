import {withHistoricalTrends} from './console-history-trends.mjs';
import {createStoredPeriodRecords} from './console-reading-period.mjs';
import {withFailureOccurrenceEvidence} from './console-failure-evidence.mjs';
import {withSnLiveContext} from './console-sn-live-context.mjs';
import {createSavedSnHistoryView} from './console-saved-sn-history.mjs';
import {formatFactoryDateTime as displayPeriodTime} from './data/time-display.mjs';
import {createReadingPeriodController} from './reading-period-controller.mjs';
import {readingPeriod as computeReadingPeriod} from './data/reading-period.mjs';
import { createAgentClient } from './agent-client.mjs';
import { AGENT_URL } from './data/agent-contract.mjs';
import { createAutomationView } from './automation-view.mjs';
import { createAdvancedView } from './advanced-view.mjs';
import { createLineOverview, createTrendAddon, createFailuresParityView } from './console-legacy-parity.mjs';
import { createDailyFailureSummary } from './daily-failure-summary.mjs';
import { createDailyFailureAnalytics } from './daily-failure-analytics.mjs';
import { createSnConsoleView, createTraceConsoleView, createProcessConsoleView } from './console-specialized-views.mjs';
import { createReuseConsoleView, createKnowledgeConsoleView } from './console-wave3-views.mjs';
import { createBaseConsoleView } from './console-base-view.mjs';
import { withFastlaneSnEnhancements } from './console-fastlane-sn-reuse.mjs';
import { withOfflineSnLookup } from './console-sn-offline-fastlane.mjs';
import { withOfflineSnNavigation } from './console-sn-offline-navigation.mjs';
import { createNetworkHealthView } from './console-network-fastlane.mjs';
import { create3012FastlaneView } from './console-3012-fastlane.mjs';
import { withProcessCapability, applyMonitorProcessCapability } from './console-capability-guard.mjs';
import { withProcessOperatorLayout } from './console-process-operator.mjs';
import { createMonitorRuntimeView } from './console-monitor-runtime.mjs';
import { withKnowledgeArchitecture } from './console-knowledge-architecture.mjs';
import { withAgentRefresh } from './console-refresh-decorator.mjs';
import { withReuseProvenance } from './console-reuse-provenance.mjs';
import { withTraceSelectionHelper } from './console-trace-scope.mjs';
import { createFailureProcessAddon } from './console-failure-process.mjs';
import { withBaseCatalog } from './console-base-catalog.mjs';
import { createPreparationView } from './console-preparation.mjs';
import { createConsoleTranslator } from './console-i18n.mjs';
import { createHistoryView } from './console-history.mjs';
import { createDataHealthView } from './console-data-health.mjs';
import { createShiftSummaryView } from './console-shift-summary.mjs';
import { createEvidenceDrawer } from './console-evidence-drawer.mjs';

const VIEWS = Object.freeze([
  ['monitor','◉','Monitoramento','Monitoramento A-MES','Poucos cliques na frente; coleta, snapshots e correlações por trás.'],
  ['top3','↗','Falhas do dia & FPY','Falhas do dia & FPY','Top 3 como resumo; ranking completo, ocorrências, turno e contexto de reuso no mesmo escopo.'],
  ['failures','!','Falhas','Falhas','Ocorrências atuais, estados de reparo e histórico operacional.'],
  ['sn','⌕','Consulta por SN','Consulta por SN','Investigação de PCBA ou Material SN com 3074, 2114, 3022 e 3012 quando a fonte estiver disponível.'],
  ['trace','⌘','Rastreabilidade','Rastreabilidade','Coleta seletiva full, process_only ou reuse_only sem misturar linhas e respeitando capacidades do agente.'],
  ['reuse','▥','Dashboards de reuso','Dashboards de reuso','Segundo uso de PCBA e Material SN, recorrência e vínculos históricos.'],
  ['process','≡','Processo / 3022 & AT','Processo / 3022 & AT','Timeline 3022 e histórico 3012 de defeito, reparo e análise.'],
  ['base','▦','Base local','Base local','Histórico de produção em destaque: Hoje, dia produtivo anterior, revisões AT, calendário e consultas isoladas.'],
  ['knowledge','C','CORA conhecimento','CORA · conhecimento','Busca operacional com separação entre fato, correlação, hipótese e causa confirmada.']
]);
const VIEW_GROUPS = Object.freeze([
  {id:'operation',pt:'OPERAÇÃO',en:'OPERATION',views:['monitor','top3','failures']},
  {id:'investigation',pt:'INVESTIGAÇÃO',en:'INVESTIGATION',views:['sn','trace','process']},
  {id:'analysis',pt:'ANÁLISE',en:'ANALYSIS',views:['reuse','base','knowledge']}
]);

const LOCAL_CENTRAL_HREF = new URL('/Central-de-Controle-/',AGENT_URL).href;
const STYLE_HREF = new URL('./console-legacy.css', import.meta.url).href;
const WAVE2_STYLE_HREF = new URL('./console-wave2.css', import.meta.url).href;
const WAVE3_STYLE_HREF = new URL('./console-wave3.css', import.meta.url).href;
const MOBILE_STYLE_HREF = new URL('./console-mobile-polish.css', import.meta.url).href;
const POLISH_STYLE_HREF = new URL('./console-r12-polish.css', import.meta.url).href;
const FASTLANE_STYLE_HREF = new URL('./console-fastlane.css', import.meta.url).href;
const ANALYTICS_STYLE_HREF = new URL('./console-daily-analytics.css', import.meta.url).href;
const IMPROVEMENTS_STYLE_HREF = new URL('./console-improvements.css', import.meta.url).href;
const OPERATOR_PARITY_STYLE_HREF = new URL('./console-operator-parity.css', import.meta.url).href;
const WORKSTATION_SETUP_STYLE_HREF = new URL('./console-workstation-setup.css', import.meta.url).href;

export function createConsoleView(root, store, { locale, onChange = () => {}, transport = {}, history, agentClient, verify } = {}) {
  let active='monitor', mounted=false, disposed=false;let preparation, translator, evidenceDrawer;const views=new Map();
  const client=agentClient||createAgentClient(store,{...transport,changed(){if(disposed)return;renderActive();paintHeader();onChange();}});
  const meta=()=>VIEWS.find(([id])=>id===active)||VIEWS[0];
  const viewMeta=id=>VIEWS.find(([key])=>key===id);
  function setMenu(open){const shell=root.querySelector('[data-ames-shell]'),button=root.querySelector('[data-console-menu]');shell?.classList.toggle('menu-open',!!open);button?.setAttribute('aria-expanded',String(!!open));}
  function backToCentral(){setMenu(false);document.querySelector('.main-nav [data-page="home"], [data-page="home"]')?.click();}
  function openWorkstationSetup(){preparation?.open();root.querySelector('[data-console-preparation]')?.scrollIntoView({block:'start'});}
  function navMarkup(en){
    return VIEW_GROUPS.map(group=>`<div class="ames-nav-group" data-console-nav-group="${group.id}"><span class="ames-nav-group-label" data-console-group-label="${group.id}">${en?group.en:group.pt}</span>${group.views.map(id=>{const item=viewMeta(id),icon=item?.[1]||'',label=item?.[2]||id;return `<button type="button" data-console-view="${id}"${id===active?' class="active"':''}><span class="ico">${icon}</span><span data-console-nav-label="${id}">${id==='top3'&&en?'Daily failures & FPY':label}</span></button>`;}).join('')}</div>`).join('');
  }
  function mount(){
    const en=document.documentElement.lang.startsWith('en');
    root.innerHTML=`<link rel="stylesheet" href="${STYLE_HREF}"><link rel="stylesheet" href="${WAVE2_STYLE_HREF}"><link rel="stylesheet" href="${WAVE3_STYLE_HREF}"><link rel="stylesheet" href="${MOBILE_STYLE_HREF}"><link rel="stylesheet" href="${POLISH_STYLE_HREF}"><link rel="stylesheet" href="${FASTLANE_STYLE_HREF}"><link rel="stylesheet" href="${ANALYTICS_STYLE_HREF}"><link rel="stylesheet" href="${IMPROVEMENTS_STYLE_HREF}"><link rel="stylesheet" href="${OPERATOR_PARITY_STYLE_HREF}"><link rel="stylesheet" href="${WORKSTATION_SETUP_STYLE_HREF}"><div class="ames-legacy-shell" data-ames-shell><aside class="ames-legacy-sidebar"><div class="ames-legacy-brand"><div class="ames-legacy-brand-row"><div class="ames-legacy-mark">Q</div><div><strong>Central de trabalho</strong><span>A-MES · motor local</span></div></div></div><nav class="ames-legacy-nav" aria-label="Views da automação A-MES">${navMarkup(en)}</nav><div class="ames-legacy-foot"><b>Offline por padrão.</b><br>MES e banco ficam no notebook. O Console usa o mesmo agente local, SQLite e estado da Central.<br><br><span data-console-build-foot>R12 · 9 views</span></div></aside><button type="button" class="ames-mobile-backdrop" data-console-menu-close aria-label="Fechar menu do Console MES"></button><main class="ames-legacy-main"><header class="ames-legacy-topbar"><div><h1 class="ames-legacy-title" data-console-title></h1><p class="ames-legacy-sub" data-console-sub></p></div><div class="ames-legacy-actions"><button class="button secondary ames-mobile-menu" type="button" data-console-menu aria-expanded="false" aria-label="Abrir menu do Console MES" style="display:none">☰</button><span class="ames-status-pill"><span class="ames-agent-dot" data-console-dot></span><span data-console-status>Agente local desconectado</span></span><span class="ames-status-pill" data-console-sync-status></span><button class="button secondary ames-hide-mobile" type="button" data-console-open-ames>Abrir A-MES</button><button class="button secondary" type="button" data-console-setup>Configurar posto</button><button class="button secondary ames-hide-mobile" type="button" data-console-check>Verificar</button><button class="button secondary" type="button" data-console-back>Voltar à Central</button></div></header><div class="ames-legacy-content"><section data-console-preparation></section>${VIEWS.map(([id])=>`<section class="ames-console-pane" data-console-pane="${id}"${id===active?'':' hidden'}></section>`).join('')}</div></main></div>`;
    for(const button of root.querySelectorAll('[data-console-view]'))button.addEventListener('click',()=>switchView(button.dataset.consoleView));root.querySelector('[data-console-back]')?.addEventListener('click',backToCentral);root.querySelector('[data-console-menu]')?.addEventListener('click',()=>setMenu(!root.querySelector('[data-ames-shell]')?.classList.contains('menu-open')));root.querySelector('[data-console-menu-close]')?.addEventListener('click',()=>setMenu(false));root.querySelector('[data-console-open-ames]')?.addEventListener('click',async()=>{try{if(store.agent().status!=='connected')await client.connect();await client.auxiliary('chrome');}catch(error){store.updateAgent({error:error.message});paintHeader();}});root.querySelector('[data-console-setup]')?.addEventListener('click',openWorkstationSetup);root.querySelector('[data-console-check]')?.addEventListener('click',async()=>{try{if(verify)await verify();else if(store.agent().status==='connected')await client.refresh();else await client.connect();}catch(error){store.updateAgent({error:error.message});}finally{renderActive();}});
    const theme=document.createElement('link');theme.rel='stylesheet';theme.href=new URL('./console-theme.css',import.meta.url).href;root.append(theme);evidenceDrawer=createEvidenceDrawer(root);mounted=true;translator=createConsoleTranslator(root,locale);preparation=createPreparationView(root.querySelector('[data-console-preparation]'),store,client,{verify});preparation.render();paintHeader();
  }
  const periodController=createReadingPeriodController(store,history,{changed(){if(!disposed){renderActive();onChange();}}});
  let renderedPeriod=store.periodGeneration?.();
  let renderedSession=store.sessionGeneration?.();
  let lastCompletedJobRead='';
  // Completion of a MES job makes the stored index worth re-reading, but
  // must not alter today's head or launch another MES collection.
  function refreshHistoricalOnCompletedJob(){
    const job=store.agent()?.job,period=store.readingPeriod?.();
    if(!job?.id||job.status!=='done'||!period||period.mode==='today')return;
    const key=JSON.stringify([job.id,period.mode,period.start,period.end]);
    if(key===lastCompletedJobRead)return;
    lastCompletedJobRead=key;
    queueMicrotask(()=>{
      const selected=store.readingPeriod?.();
      if(disposed||!selected||selected.mode!==period.mode||selected.start!==period.start||selected.end!==period.end)return;
      void periodController.select(period.mode,period.mode==='custom'?{start:period.start,end:period.end}:{})
        .catch(error=>{store.updateAgent({period_read:{status:'partial',errors:[{line_id:'—',error:error.message}]}});renderActive();});
    });
  }
  if(!store.readingPeriod?.())store.selectReadingPeriod?.('today');
  function ensure(id){
    if(views.has(id))return views.get(id);const pane=root.querySelector(`[data-console-pane="${id}"]`);let view;
    const historical=store.readingPeriod?.()?.mode!=='today';
    // SN is an independent, PCBA-centered investigation (MES or local SQLite).
    // Selecting an operational-day read scope must never replace that workflow
    // with an incomplete daily-snapshot search.
    if(historical&&['base','knowledge'].includes(id))view=createStoredPeriodRecords(pane,store,{kind:id,client});
    else if(id==='monitor'){pane.innerHTML='<section data-monitor-main></section><section data-monitor-lines></section><section data-monitor-tools></section><details class="mes-context-panel" data-monitor-technical><summary>Diagnósticos e informações técnicas</summary><p data-history-publication-state role="status"></p><section data-monitor-health></section><section data-monitor-runtime></section><section data-monitor-network></section><section data-history-shortcut><button type="button" class="button secondary" data-open-production-history>Abrir histórico detalhado</button><p data-local-console-access><a href="${LOCAL_CENTRAL_HREF}" target="_blank" rel="noopener noreferrer">Abrir a Central local deste computador</a></p></section></details>';pane.querySelector('[data-open-production-history]')?.addEventListener('click',()=>switchView('base'));const monitorRoot=pane.querySelector('[data-monitor-main]'),primary=createAutomationView(monitorRoot,store,client),lineBoard=createLineOverview(pane.querySelector('[data-monitor-lines]'),store,client,periodController,history),health=createDataHealthView(pane.querySelector('[data-monitor-health]'),store,{onEvidence:value=>evidenceDrawer?.open(value)}),runtime=createMonitorRuntimeView(pane.querySelector('[data-monitor-runtime]'),store),network=createNetworkHealthView(pane.querySelector('[data-monitor-network]'),store),tools=createAdvancedView(pane.querySelector('[data-monitor-tools]'),store,client);view={render(){const output=pane.querySelector('[data-history-publication-state]'),agent=store.agent(),sync=agent.sync||{};const localHelp=pane.querySelector('[data-local-console-access]');if(localHelp)localHelp.hidden=agent.status==='connected';if(output)output.textContent=agent.status==='connected'&&sync.status!=='synchronized'&&sync.status!=='shared_history_legacy_conflict'?'Coleta local disponível; envio para a equipe ainda não confirmado. Confira a sincronização abaixo.':sync.status==='shared_history_legacy_conflict'?'Há revisão imutável, mas o cabeçalho legado continua em conflito; confira a leitura no outro posto.':sync.status==='synchronized'?'Última publicação confirmada pela fila; confira a leitura no outro posto.':'O histórico pode estar somente no SQLite deste computador ou na base compartilhada.';primary.render();applyMonitorProcessCapability(monitorRoot,store);lineBoard.render();health.render();runtime.render();network.render();tools.render();},clear(){primary.clear?.();lineBoard.clear?.();health.clear?.();runtime.clear?.();network.clear?.();tools.clear?.();pane.replaceChildren();}};}
    else if(id==='top3'){pane.innerHTML='<section data-top3-main></section><section data-top3-shift></section><section data-top3-analytics data-no-i18n></section><section data-top3-trend></section>';const primary=createDailyFailureSummary(pane.querySelector('[data-top3-main]'),store),shiftSummary=createShiftSummaryView(pane.querySelector('[data-top3-shift]'),store,{onEvidence:value=>evidenceDrawer?.open(value)}),analytics=createDailyFailureAnalytics(pane.querySelector('[data-top3-analytics]'),store),trend=createTrendAddon(pane.querySelector('[data-top3-trend]'),store,client),base={render(){primary.render();shiftSummary.render();analytics.render();trend.render();},clear(){primary.clear?.();shiftSummary.clear?.();analytics.clear?.();trend.clear?.();pane.replaceChildren();}};view=withAgentRefresh(withHistoricalTrends(base,pane,store,history),pane,store,client,{label:'Atualizar'});}
    else if(id==='failures'){pane.innerHTML='<section data-failures-main></section><section data-failures-process></section>';const failureRoot=pane.querySelector('[data-failures-main]'),primary=withFailureOccurrenceEvidence(createFailuresParityView(failureRoot,store,client),failureRoot,store),process=createFailureProcessAddon(pane.querySelector('[data-failures-process]'),store,failureRoot);view={render(){primary.render();process.render();},clear(){primary.clear?.();process.clear?.();pane.replaceChildren();}};}
    else if(id==='sn'){pane.innerHTML='<section data-sn-live></section><section data-sn-saved></section>';const snRoot=pane.querySelector('[data-sn-live]');const current=withOfflineSnNavigation(withOfflineSnLookup(withProcessCapability(withSnLiveContext(withFastlaneSnEnhancements(createSnConsoleView(snRoot,store,client),snRoot,store),snRoot,store),snRoot,store,'sn'),snRoot,store),snRoot);const saved=createSavedSnHistoryView(pane.querySelector('[data-sn-saved]'),client,store);view={render(){current.render();saved.render();},clear(){current.clear?.();saved.clear();pane.replaceChildren();}};}
    else if(id==='trace'){const base=withTraceSelectionHelper(withProcessCapability(createTraceConsoleView(pane,store,client),pane,store,'trace'),pane,store);view=withAgentRefresh(base,pane,store,client,{label:'Atualizar tela'});}
    else if(id==='reuse')view=withAgentRefresh(withHistoricalTrends(withReuseProvenance(createReuseConsoleView(pane,store),pane,store),pane,store,history),pane,store,client,{label:'Atualizar'});
    else if(id==='process'){pane.innerHTML='<section data-process-main></section><section data-process-3012></section>';const processRoot=pane.querySelector('[data-process-main]'),processBase=withProcessOperatorLayout(withProcessCapability(createProcessConsoleView(processRoot,store),processRoot,store,'process'),processRoot),base=withAgentRefresh(processBase,processRoot,store,client,{label:'Atualizar'}),repair3012=historical?createStoredPeriodRecords(pane.querySelector('[data-process-3012]'),store,{kind:'repairs'}):create3012FastlaneView(pane.querySelector('[data-process-3012]'),store);view={render(){base.render();repair3012.render();},clear(){base.clear?.();repair3012.clear?.();pane.replaceChildren();}};}
    else if(id==='base'){pane.innerHTML='<section data-base-history></section><section data-base-local></section>';const local=pane.querySelector('[data-base-local]'),base=withBaseCatalog(createBaseConsoleView(local,store,client),local,store,client),periods=createHistoryView(pane.querySelector('[data-base-history]'),store,client,history);view={render(){periods.render();base.render();},clear(){periods.clear();base.clear();}};}
    else if(id==='knowledge')view=withKnowledgeArchitecture(createKnowledgeConsoleView(pane,client,store),pane);views.set(id,view);return view;
  }
  function paintHeader(){if(!mounted)return;const a=store.agent(),m=meta(),title=root.querySelector('[data-console-title]'),sub=root.querySelector('[data-console-sub]'),status=root.querySelector('[data-console-status]'),foot=root.querySelector('[data-console-build-foot]'),dot=root.querySelector('[data-console-dot]'),top3Nav=root.querySelector('[data-console-nav-label="top3"]'),en=document.documentElement.lang.startsWith('en');if(top3Nav)top3Nav.textContent=en?'Daily failures & FPY':'Falhas do dia & FPY';for(const group of VIEW_GROUPS){const el=root.querySelector(`[data-console-group-label="${group.id}"]`);if(el)el.textContent=en?group.en:group.pt;}if(title)title.textContent=en&&active==='top3'?'Daily failures & FPY':m[3];if(sub)sub.textContent=en&&active==='top3'?'Top 3 summary, full ranking, occurrences, shift and reuse context in one scope.':m[4];const connected=a.status==='connected';if(status)status.textContent=connected?`Agente local conectado${a.agent_build?' · '+a.agent_build:''}`:(a.workstation_probe?.state==='outdated'?'Agente local desatualizado · instalar CLEAN oficial':a.workstation_probe?.state==='detected'||a.connection_error?.code==='agent-unauthorized'?'Agente local detectado · conectar':'MES local não confirmado neste computador');dot?.classList.toggle('ok',connected);const shared=root.querySelector('[data-console-sync-status]'),sync=a.sync||{};if(shared)shared.textContent=sync.read_status==='error'?(en?'Shared data: error':'Dados da equipe: erro'):sync.read_status==='cached'?(en?'Shared data: cache':'Dados da equipe: cache'):sync.read_status==='ready'&&sync.remote_line_count?(en?'Team data synchronized':'Dados da equipe sincronizados'):(en?'Team data not confirmed':'Dados da equipe não confirmados');if(foot)foot.textContent=`${a.agent_build||a.capabilities?.agent_build||'MES local'} · 9 views`;}
  function switchView(id){if(!VIEWS.some(([key])=>key===id))return;active=id;setMenu(false);if(id!=='monitor')preparation?.collapse();for(const button of root.querySelectorAll('[data-console-view]'))button.classList.toggle('active',button.dataset.consoleView===id);for(const pane of root.querySelectorAll('[data-console-pane]'))pane.hidden=pane.dataset.consolePane!==id;renderActive();}
  function renderActive(){
    if(!mounted)mount();
    // During a long-running monitoring session, 07:00 changes the operational
    // date even without reload. A stale Today selection must not pin yesterday.
    const selected=store.readingPeriod?.();
    if(selected?.mode==='today'){
      const fresh=computeReadingPeriod('today',{now:store.currentTime?.()||new Date()});
      if(selected.start!==fresh.start||selected.end!==fresh.end){
        void periodController.select('today').catch(error=>{
          store.updateAgent({period_read:{status:'partial',errors:[{line_id:'—',error:error.message}]}});
          if(!disposed)renderActive();
        });
        return;
      }
    }
    if(renderedPeriod!==store.periodGeneration?.()||renderedSession!==store.sessionGeneration?.()){
      // Preserve the independent SN query/input and its saved-investigation panel
      // across period changes, but NEVER across a logout/account/session reset.
      const sameSession=renderedSession===store.sessionGeneration?.();
      const sn=sameSession?views.get('sn'):null;
      for(const [id,view] of views)if(id!=='sn'||!sameSession)view.clear?.();
      views.clear();
      if(sn)views.set('sn',sn);
      renderedPeriod=store.periodGeneration?.();
      renderedSession=store.sessionGeneration?.();
    }ensure(active)?.render();
    const pane=root.querySelector(`[data-console-pane="${active}"]`),period=store.readingPeriod?.();
    let note=pane?.querySelector('[data-shared-period]');
    if(pane&&!note){note=document.createElement('p');note.dataset.sharedPeriod='';note.setAttribute('data-no-i18n','');note.className='mes-context';pane.prepend(note);}
    if(note){const en=document.documentElement.lang.startsWith('en');
      note.textContent=active==='sn'
        ?(en?'SN investigation is independent of the monitoring period.':'Consulta por SN independente do período de monitoramento.')
        :(en?'Reading period: ':'Período de leitura: ')+displayPeriodTime(period?.start)+' → '+displayPeriodTime(period?.end)+(period?.mode!=='today'?(en?' · Read-only history':' · Histórico somente leitura'):'');
    }
    if(period?.mode!=='today'){
      // Live execution controls and last-job results describe another scope. Keep
      // historical evidence visible; mutation awaits the exact-snapshot contract.
      for(const el of pane?.querySelectorAll('[data-trace-form],.ames-trace-progress,[data-top3-trend]')||[])el.hidden=true;
      for(const button of pane?.querySelectorAll('[data-failure-repair],[data-repair-update]')||[])button.disabled=true;
    }
    refreshHistoricalOnCompletedJob();paintHeader();preparation?.render();translator?.render();}
  return Object.freeze({render(){if(!root||disposed)return;if(!mounted)mount();renderActive();},clear(){disposed=true;periodController.clear();preparation?.clear();translator?.clear();evidenceDrawer?.clear();for(const view of views.values())view?.clear?.();views.clear();if(!agentClient)client.clear();root?.replaceChildren();mounted=false;}});
}
export { VIEWS as CANONICAL_VIEWS };
