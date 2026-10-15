import fs from 'node:fs';
import crypto from 'node:crypto';

const APP_PATH='app.js';
const SW_PATH='sw.js';
const EXPECTED_APP_BLOB='49642d84b6a70f79d430a8f9ba9f58640e0c55ca';
const EXPECTED_SW_BLOB='50a4453e2cf543434229902d602b6c967662b45a';

function gitBlobSha(content){
  const body=Buffer.from(content,'utf8');
  return crypto.createHash('sha1').update(`blob ${body.length}\0`).update(body).digest('hex');
}

function assertBlob(path,content,expected){
  const actual=gitBlobSha(content);
  if(actual!==expected) throw new Error(`${path} divergiu do blob auditado: ${actual} != ${expected}`);
}

let app=fs.readFileSync(APP_PATH,'utf8');
let sw=fs.readFileSync(SW_PATH,'utf8');
assertBlob(APP_PATH,app,EXPECTED_APP_BLOB);
assertBlob(SW_PATH,sw,EXPECTED_SW_BLOB);

const importAnchor="import {sessionAmes} from './core/ames-session.mjs';";
const importLine="import { buildDailyAdminInsights } from './core/daily-admin-insights.mjs';";
if(!app.includes(importAnchor)) throw new Error('Âncora de importação do app.js não encontrada.');
app=app.replace(importAnchor,`${importAnchor}\n${importLine}`);

const dashboardAnchor="      document.querySelector('#dailyDashNg').textContent=ng;";
if(!app.includes(dashboardAnchor)) throw new Error('Âncora do Dashboard Administrativo não encontrada.');

const dashboardBlock=`

      const insightExecutions=rows.map(x=>({...x,dashboardTimingState:dailyExecutionTiming(x).state}));
      const insightHistory=dailyAdminHistoryItems().filter(item=>{
        const stamp=new Date(item.at||0);
        if(Number.isNaN(stamp.getTime()))return false;
        const key=localDateKey(stamp);
        return key>=from&&key<=to;
      });
      const insightUsers=userId?users.filter(user=>user.docId===userId):users;
      const insights=buildDailyAdminInsights({
        executions:insightExecutions,
        operationalFailures:state.operationalFailures,
        reports:dashboardProductReports(),
        activities:state.activities,
        users:insightUsers,
        adminHistory:insightHistory
      });
      const insightText=(pt,en)=>currentLanguage==='en-US'?en:pt;
      const insightReason=reason=>{
        if(currentLanguage!=='en-US')return reason;
        if(reason==='Não cumprida')return 'Missed';
        if(reason==='Atrasada')return 'Overdue';
        if(reason==='Resultado NG')return 'NG result';
        return String(reason||'').replace(' fora da meta',' out of target');
      };
      let insightHost=document.querySelector('#dailyDashInsights');
      if(!insightHost){
        insightHost=document.createElement('section');
        insightHost.id='dailyDashInsights';
        insightHost.className='panel daily-dashboard-panel';
        document.querySelector('#dailyDashRows')?.closest('.daily-execution-panel')?.before(insightHost);
      }
      if(insightHost){
        const fpyRows=insights.fpyEntries.slice(0,6).map(item=>\`<div class="daily-admin-item"><div><strong>\${esc(item.label||'FPY')}</strong><span>\${esc([item.routineName,item.scopeName,item.dateKey].filter(Boolean).join(' · '))}</span></div><div><strong>\${esc(item.value)}\${item.unit?\` \${esc(item.unit)}\`:''}</strong></div></div>\`).join('');
        const alertRows=insights.alerts.slice(0,8).map(item=>\`<div class="daily-admin-item"><div><strong>\${esc(item.routineName||insightText('Rotina','Routine'))}</strong><span>\${esc([item.scopeName,item.dateKey].filter(Boolean).join(' · '))}</span></div><div><span>\${esc(item.reasons.map(insightReason).join(' · '))}</span></div></div>\`).join('');
        const traceItems=[
          ...insights.linkedFailures.slice(0,4).map(item=>({kind:insightText('Falha','Failure'),title:item.id||item.docId||insightText('Falha vinculada','Linked failure'),detail:item.issue||item.description||item.category||''})),
          ...insights.linkedReports.slice(0,3).map(item=>({kind:'Report',title:item.id||item.docId||'Report',detail:item.issue||item.component||item.material||''})),
          ...insights.linkedActivities.slice(0,3).map(item=>({kind:insightText('Atividade','Activity'),title:item.title||item.id||item.docId||insightText('Atividade vinculada','Linked activity'),detail:item.area||item.description||''}))
        ];
        const traceRows=traceItems.map(item=>\`<div class="daily-admin-item"><div><strong>\${esc(item.kind)} · \${esc(item.title)}</strong><span>\${esc(item.detail||'—')}</span></div></div>\`).join('');
        const historyRows=insights.history.slice(0,6).map(item=>\`<div class="daily-admin-item"><div><strong>\${esc(item.title||insightText('Alteração administrativa','Administrative change'))}</strong><span>\${esc([item.actor,item.timestamp?formatDate(item.timestamp):''].filter(Boolean).join(' · '))}</span></div></div>\`).join('');
        insightHost.innerHTML=\`
          <div class="section-head compact"><div><h3>\${esc(insightText('Leitura cruzada da operação','Cross-operational view'))}</h3><p>\${esc(insightText('Conecta execução, dados coletados, falhas, Reports, atividades e governança sem criar um segundo dashboard.','Connects execution, collected data, failures, Reports, activities and governance without creating a second dashboard.'))}</p></div></div>
          <div class="stats daily-admin-stats" aria-label="\${esc(insightText('Indicadores cruzados','Cross indicators'))}">
            <article class="stat daily-stat"><div class="stat-label">\${esc(insightText('Falhas vinculadas','Linked failures'))}</div><div class="stat-value">\${insights.counts.failures}</div><div class="stat-note">\${esc(insightText('Originadas nas execuções filtradas','Originated from filtered executions'))}</div></article>
            <article class="stat daily-stat"><div class="stat-label">Reports</div><div class="stat-value">\${insights.counts.reports}</div><div class="stat-note">\${esc(insightText('Reports ligados às mesmas evidências','Reports linked to the same evidence'))}</div></article>
            <article class="stat daily-stat"><div class="stat-label">\${esc(insightText('Atividades','Activities'))}</div><div class="stat-value">\${insights.counts.activities}</div><div class="stat-note">\${esc(insightText('Follow-ups criados a partir da rotina','Follow-ups created from the routine'))}</div></article>
            <article class="stat daily-stat daily-stat-alert"><div class="stat-label">\${esc(insightText('Fora da meta','Out of target'))}</div><div class="stat-value">\${insights.counts.targetFailures}</div><div class="stat-note">\${esc(insightText('Itens coletados com avaliação NG','Collected items assessed as NG'))}</div></article>
            <article class="stat daily-stat"><div class="stat-label">\${esc(insightText('Equipe ativa','Active team'))}</div><div class="stat-value">\${insights.governance.activeUsers}</div><div class="stat-note">\${insights.governance.activeAdmins} \${esc(insightText('admin','admin'))} · \${insights.governance.activeOperators} \${esc(insightText('usuários','users'))}</div></article>
            <article class="stat daily-stat"><div class="stat-label">\${esc(insightText('Alterações admin','Admin changes'))}</div><div class="stat-value">\${insights.counts.adminChanges}</div><div class="stat-note">\${esc(insightText('No período selecionado','In the selected period'))}</div></article>
          </div>
          <div class="daily-dashboard-grid">
            <div class="daily-config-card"><div class="section-head compact"><div><h3>\${esc(insightText('Dados coletados / FPY','Collected data / FPY'))}</h3><p>\${esc(insightText('Valores salvos no checklist; FPY só aparece quando o rótulo identifica FPY.','Saved checklist values; FPY appears only when the label identifies FPY.'))}</p></div></div><div class="daily-admin-list">\${fpyRows||\`<div class="daily-soft-empty">\${esc(insightText('Nenhuma leitura de FPY neste recorte.','No FPY reading in this selection.'))}</div>\`}</div></div>
            <div class="daily-config-card"><div class="section-head compact"><div><h3>\${esc(insightText('Alertas operacionais','Operational alerts'))}</h3><p>\${esc(insightText('Não cumpridas, atrasadas, NG e valores fora da meta.','Missed, overdue, NG and out-of-target values.'))}</p></div></div><div class="daily-admin-list">\${alertRows||\`<div class="daily-soft-empty">\${esc(insightText('Nenhum alerta neste recorte.','No alerts in this selection.'))}</div>\`}</div></div>
            <div class="daily-config-card"><div class="section-head compact"><div><h3>\${esc(insightText('Rastreabilidade vinculada','Linked traceability'))}</h3><p>\${esc(insightText('Evidências que nasceram das execuções exibidas acima.','Evidence originating from the executions shown above.'))}</p></div></div><div class="daily-admin-list">\${traceRows||\`<div class="daily-soft-empty">\${esc(insightText('Nenhuma evidência vinculada neste recorte.','No linked evidence in this selection.'))}</div>\`}</div></div>
            <div class="daily-config-card"><div class="section-head compact"><div><h3>\${esc(insightText('Governança e histórico','Governance and history'))}</h3><p>\${esc(insightText('Permissões agregadas e mudanças administrativas, sem expor UID interno.','Aggregate permissions and administrative changes without exposing internal UIDs.'))}</p></div></div><div class="daily-admin-item"><div><strong>\${esc(insightText('Contas','Accounts'))}</strong><span>\${insights.governance.activeUsers} \${esc(insightText('ativas','active'))} · \${insights.governance.disabledUsers} \${esc(insightText('desativadas','disabled'))}</span></div></div><div class="daily-admin-list">\${historyRows||\`<div class="daily-soft-empty">\${esc(insightText('Nenhuma alteração administrativa no período.','No administrative changes in the period.'))}</div>\`}</div></div>
          </div>\`;
      }`;
app=app.replace(dashboardAnchor,`${dashboardAnchor}${dashboardBlock}`);

const swAnchor="BASE+'app.js',BASE+'core/offline-outbox.mjs'";
if(!sw.includes(swAnchor)) throw new Error('Âncora de precache do sw.js não encontrada.');
sw=sw.replace(swAnchor,"BASE+'app.js',BASE+'core/daily-admin-insights.mjs',BASE+'core/offline-outbox.mjs'");

fs.writeFileSync(APP_PATH,app,'utf8');
fs.writeFileSync(SW_PATH,sw,'utf8');
console.log('Admin dashboard integration patch applied safely.');
