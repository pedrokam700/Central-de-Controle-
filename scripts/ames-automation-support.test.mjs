import test from 'node:test';
import assert from 'node:assert/strict';
import {
  automationLanguage,
  automationText,
  formatAutomationTime,
  sourceLabel,
  freshnessLabel,
  readinessLabel,
  formatBytes,
  diagnosticsLabel,
} from '../ames/automation-support.mjs';

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
