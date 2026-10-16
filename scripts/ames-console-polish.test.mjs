import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Console MES keeps native architecture while matching the original A-MES shell', () => {
  const source = fs.readFileSync('ames/console-view.mjs', 'utf8');
  assert.match(source, /console-r12-polish\.css/);
  assert.match(source, /data-console-back>Voltar à Central</);
  assert.match(source, /Abrir A-MES/);
  assert.match(source, /Configurar posto/);
  assert.match(source, /Verificar/);
  assert.doesNotMatch(source, /ames-shell-banner|data-console-process|ames-console-home/);
  assert.doesNotMatch(source, /mountV0523|new Function\(|<iframe/i);
});

test('visual fidelity uses the exact V0.5.22 desktop proportions instead of adding decoration', () => {
  const css = fs.readFileSync('ames/console-r12-polish.css', 'utf8');
  assert.match(css, /grid-template-columns:238px minmax\(0,1fr\)/);
  assert.match(css, /\.ames-legacy-topbar\{[\s\S]*?min-height:76px/);
  assert.match(css, /\.ames-legacy-title\{font-size:20px/);
  assert.match(css, /\.ames-legacy-shell \.ames-monitor-actions\{[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /\.ames-legacy-shell \.ames-monitor-actions \.stat\{[\s\S]*?min-height:142px/);
  assert.match(css, /\.ames-line-summary\{[\s\S]*?repeat\(6,minmax\(0,1fr\)\)/);
  assert.match(css, /\.ames-shell-banner\{display:none!important\}/);
});

test('advanced and factory-only information remains available but collapsed by default', () => {
  const automation = fs.readFileSync('ames/automation-view.mjs', 'utf8');
  const runtime = fs.readFileSync('ames/console-monitor-runtime.mjs', 'utf8');
  assert.match(automation, /<details class="mes-context-panel ames-monitor-config"><summary>Execução avançada e filtros<\/summary>/);
  assert.match(runtime, /Progresso da execução/);
  assert.match(runtime, /Estado do motor/);
  assert.match(runtime, /<details class="ames-runtime-diagnostics"><summary>Diagnóstico técnico e gate físico<\/summary>/);
  assert.match(runtime, /Informações de validação ficam recolhidas para não poluir a operação diária/);
});
