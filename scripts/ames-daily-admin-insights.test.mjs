import assert from 'node:assert/strict';
import { buildDailyAdminInsights } from '../core/daily-admin-insights.mjs';

const executions=[
  {
    id:'e1',
    executionKey:'exec-1',
    dateKey:'2026-10-14',
    routineName:'Extração FPY',
    scopeName:'Linha 3',
    status:'completed',
    result:'ok',
    dashboardTimingState:'completed',
    linkedFailureIds:['f1'],
    linkedActivityIds:['a1'],
    checklistSchema:{items:[
      {id:'fpy',label:'FPY (%)',unit:'%'},
      {id:'limit',label:'Falhas por linha'}
    ]},
    checklist:[
      {itemId:'fpy',value:'92',assessment:'pass'},
      {itemId:'limit',value:'7',assessment:'fail'}
    ]
  },
  {
    id:'e2',
    executionKey:'exec-2',
    dateKey:'2026-10-14',
    routineName:'Patrulha',
    scopeName:'Linha 2',
    status:'open',
    result:'ng',
    dashboardTimingState:'missed',
    checklist:[]
  }
];

const result=buildDailyAdminInsights({
  executions,
  operationalFailures:[
    {id:'f1',originRoutineExecutionId:'exec-1',description:'Receiver noise'},
    {id:'f-out',originRoutineExecutionId:'other',description:'Não relacionada'}
  ],
  reports:[
    {id:'r1',originRoutineExecutionId:'exec-1',sourceOperationalFailureId:'f1'},
    {id:'r-out',originRoutineExecutionId:'other',sourceOperationalFailureId:'f-out'}
  ],
  activities:[
    {id:'a1',originRoutineExecutionId:'exec-1',title:'Follow-up'},
    {id:'a-out',originRoutineExecutionId:'other',title:'Não relacionada'}
  ],
  users:[
    {id:'master',role:'admin',disabled:false},
    {id:'uid-admin-secret',role:'admin',disabled:false,displayName:'Admin'},
    {id:'uid-operator-secret',role:'operator',disabled:false,displayName:'Operador'},
    {id:'uid-disabled-secret',role:'operator',disabled:true,displayName:'Inativo'}
  ],
  adminHistory:[
    {timestamp:'2026-10-14T09:30:00-03:00',kind:'routine',title:'Rotina atualizada',actorName:'Admin'}
  ]
});

assert.equal(result.counts.failures,1,'deve contar apenas falhas ligadas às execuções filtradas');
assert.equal(result.counts.reports,1,'deve contar apenas reports ligados por origem/falha operacional');
assert.equal(result.counts.activities,1,'deve contar apenas atividades ligadas às execuções filtradas');
assert.equal(result.linkedFailures[0].id,'f1');
assert.equal(result.linkedReports[0].id,'r1');
assert.equal(result.linkedActivities[0].id,'a1');

assert.equal(result.counts.fpyReadings,1,'FPY deve ser identificado pelo rótulo humano, não por qualquer percentual');
assert.equal(result.fpyEntries[0].value,'92');
assert.equal(result.fpyEntries[0].unit,'%');
assert.equal(result.counts.targetFailures,1,'itens de checklist fora da meta devem virar sinal administrativo');
assert.ok(result.alerts.some(item=>item.executionKey==='exec-1'&&item.reasons.includes('1 fora da meta')));
assert.ok(result.alerts.some(item=>item.executionKey==='exec-2'&&item.reasons.includes('Não cumprida')&&item.reasons.includes('Resultado NG')));

assert.equal(result.governance.activeUsers,2,'conta master do sistema não deve inflar equipe ativa');
assert.equal(result.governance.disabledUsers,1);
assert.equal(result.governance.activeAdmins,1);
assert.equal(result.governance.activeOperators,1);
assert.equal(result.governance.systemAccounts,1);
assert.equal(result.counts.adminChanges,1);
assert.equal(result.history[0].title,'Rotina atualizada');
assert.equal(result.history[0].actor,'Admin');

const governanceJson=JSON.stringify(result.governance);
assert.ok(!governanceJson.includes('uid-admin-secret'),'governança não deve expor UID interno');
assert.ok(!governanceJson.includes('uid-operator-secret'),'governança não deve expor UID interno');

console.log('ames-daily-admin-insights: ok');
