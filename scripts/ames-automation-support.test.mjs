import test from 'node:test';
import assert from 'node:assert/strict';
import {
  automationLanguage,
  automationText,
  formatAutomationTime,
  formatDuration,
  sourceLabel,
  freshnessLabel,
  readinessLabel,
  formatBytes,
  diagnosticsLabel,
} from '../ames/automation-support.mjs';
import {sanitizeAgentJobs} from '../ames/agent-diagnostics.mjs';

test('automation support language follows Central PT/EN state without requiring browser globals',()=>{
  assert.equal(automationLanguage({documentRef:{documentElement:{lang:'en-US'}},storage:null}),'en-US');
  assert.equal(automationLanguage({documentRef:{documentElement:{lang:'pt-BR'}},storage:null}),'pt-BR');
  assert.equal(automationLanguage({documentRef:{documentElement:{lang:''}},storage:{getItem:()=> 'en-US'}}),'en-US');
  assert.equal(automationText('en-US','Suporte','Support'),'Support');
});

test('friendly automation time preserves technical raw values when timezone evidence is missing',()=>{
  const now=Date.parse('2026-10-16T18:00:00-03:00');
  assert.equal(formatAutomationTime('2026-10-16T17:32:00-03:00',{language:'pt-BR',timeZone:'America/Sao_Paulo',now}),'Hoje, 17:32');
  assert.equal(formatAutomationTime('2026-10-16T17:32:00-03:00',{language:'en-US',timeZone:'America/Sao_Paulo',now}),'Today, 17:32');
  assert.equal(formatAutomationTime('2026-10-16 17:32:00',{language:'pt-BR',timeZone:'America/Sao_Paulo',now}),'2026-10-16 17:32:00');
  assert.equal(formatAutomationTime('',{now}),'—');
});

test('job duration is derived only from valid ordered timestamps',()=>{
  assert.equal(formatDuration('2026-10-16T20:00:00Z','2026-10-16T20:00:45Z'),'45 s');
  assert.equal(formatDuration('2026-10-16T20:00:00Z','2026-10-16T20:02:05Z'),'2 min 5 s');
  assert.equal(formatDuration('2026-10-16T20:00:00Z','2026-10-16T21:05:00Z'),'1 h 5 min');
  assert.equal(formatDuration('2026-10-16 20:00:00','2026-10-16T21:05:00Z'),'—');
  assert.equal(formatDuration('2026-10-16T21:05:00Z','2026-10-16T20:00:00Z'),'—');
});

test('source and freshness never convert unknown or missing evidence into zero/OK',()=>{
  assert.equal(sourceLabel('local','pt-BR'),'Agente local');
  assert.equal(sourceLabel('remote','pt-BR'),'Remoto / compartilhado');
  assert.equal(sourceLabel('none','en-US'),'Not collected');
  assert.equal(freshnessLabel('unknown','pt-BR'),'Desconhecido');
  assert.equal(readinessLabel(null,'pt-BR'),'Não informado');
  assert.equal(readinessLabel(false,'en-US'),'Unavailable');
});

test('support diagnostics remain descriptive and preserve unknown values',()=>{
  assert.equal(diagnosticsLabel('ok',null,'pt-BR'),'Disponível');
  assert.equal(diagnosticsLabel('unavailable','not_paired','en-US'),'Workstation not paired');
  assert.equal(formatBytes(0),'0 B');
  assert.equal(formatBytes(1024),'1.0 KB');
  assert.equal(formatBytes(null),'—');
  assert.equal(formatBytes(undefined),'—');
});

test('job diagnostics expose only bounded operational metadata',()=>{
  const jobs=sanitizeAgentJobs({jobs:[{
    id:'job-1',kind:'deep_trace',status:'error',stage:'2114',
    created_at:'2026-10-16T20:00:00Z',started_at:'2026-10-16T20:00:01Z',finished_at:'2026-10-16T20:00:04Z',
    message:'falha controlada',error:'TimeoutError',result:{password:'must-not-leak'},scope:{cookie:'must-not-leak'}
  }]});
  assert.equal(jobs.length,1);
  assert.deepEqual(Object.keys(jobs[0]).sort(),['created_at','error','finished_at','id','kind','message','stage','started_at','status'].sort());
  assert.equal(JSON.stringify(jobs).includes('must-not-leak'),false);
  assert.equal(jobs[0].error,'TimeoutError');
});
