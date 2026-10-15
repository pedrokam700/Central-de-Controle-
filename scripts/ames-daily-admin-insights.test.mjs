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
    linkedFailureIds:['firestore-f1'],
    linkedActivityIds:['firestore-a1'],
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
    {id:'F-001',docId:'firestore-f1',originRoutineExecutionId:'exec-1',description:'Receiver noise'},
    {id:'F-OUT',docId:'firestore-f-out',originRoutineExecutionId:'other',description:'Não relacionada'}
  ],
  reports:[
    {id:'r1',sourceOperationalFailureId:'firestore-f1'},
    {id:'r-out',sourceOperationalFailureId:'firestore-f-out'}
  ],
  activities:[
    {id:'A-001',docId:'firestore-a1',originRoutineExecutionId:'exec-1',title:'Follow-up'},
    {id:'A-OUT',docId:'firestore-a-out',originRoutineExecutionId:'other',title:'Não relacionada'}
  ],
  users:[
    {docId:'master',role:'admin',disabled:false},
    {docId:'uid-admin-secret',role:'admin',disabled:false,name:'Admin'},
    {docId:'uid-user-secret',role:'user',disabled:false,name:'Operador'},
    {docId:'uid-disabled-secret',role:'user',disabled:true,name:'Inativo'}
  ],
  adminHistory:[
    {at:'2026-10-14T09:30:00-03:00',kind:'routine',label:'Extração FPY',action:'updated',summary:'Rotina atualizada',by:'Admin'}
  ]
});

assert.equal(result.counts.failures,1,'deve contar apenas falhas ligadas às execuções filtradas');
assert.equal(result.counts.reports,1,'deve ligar report também pelo docId da falha operacional');
assert.equal(result.counts.activities,1,'deve ligar atividade também pelo docId salvo na execução');
assert.equal(result.linkedFailures[0].id,'F-001');
assert.equal(result.linkedReports[0].id,'r1');
assert.equal(result.linkedActivities[0].id,'A-001');

assert.equal(result.counts.fpyReadings,1,'FPY deve ser identificado pelo rótulo humano, não por qualquer percentual');
assert.equal(result.fpyEntries[0].value,'92');
assert.equal(result.fpyEntries[0].unit,'%');
assert.equal(result.counts.targetFailures,1,'itens de checklist fora da meta devem virar sinal administrativo');
assert.ok(result.alerts.some(item=>item.executionKey==='exec-1'&&item.reasons.includes('1 fora da meta')));
assert.ok(result.alerts.some(item=>item.executionKey==='exec-2'&&item.reasons.includes('Não cumprida')&&item.reasons.includes('Resultado NG')));

assert.equal(result.governance.activeUsers,2,'conta técnica master não deve inflar equipe ativa');
assert.equal(result.governance.disabledUsers,1);
assert.equal(result.governance.activeAdmins,1);
assert.equal(result.governance.activeOperators,1);
assert.equal(result.governance.systemAccounts,1);
assert.equal(result.counts.adminChanges,1);
assert.equal(result.history[0].timestamp,'2026-10-14T09:30:00-03:00');
assert.equal(result.history[0].title,'Rotina atualizada');
assert.equal(result.history[0].detail,'Extração FPY');
assert.equal(result.history[0].actor,'Admin');

const governanceJson=JSON.stringify(result.governance);
assert.ok(!governanceJson.includes('uid-admin-secret'),'governança não deve expor UID interno');
assert.ok(!governanceJson.includes('uid-user-secret'),'governança não deve expor UID interno');

console.log('ames-daily-admin-insights: ok');
