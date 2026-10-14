import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Rastreabilidade oferece seleção visual usando somente Defect Codes carregados',()=>{
  const view=fs.readFileSync('ames/console-view.mjs','utf8');
  const helper=fs.readFileSync('ames/console-trace-scope.mjs','utf8');
  const sw=fs.readFileSync('sw.js','utf8');
  assert.match(view,/withTraceSelectionHelper/);
  assert.match(helper,/\[name=lines\]:checked/);
  assert.match(helper,/snapshot\?\.occurrences/);
  assert.match(helper,/row\.defect_code/);
  assert.match(helper,/Todas/);
  assert.match(helper,/Selecionadas/);
  assert.match(helper,/\[name=codes\]/);
  assert.match(helper,/join\(', '\)/);
  assert.doesNotMatch(helper,/client\.|collect\(|fetch\(|auxiliary\(/);
  assert.match(sw,/ames\/console-trace-scope\.mjs/);
});

test('modo Selecionadas nunca cai silenciosamente em todas as falhas',()=>{
  const helper=fs.readFileSync('ames/console-trace-scope.mjs','utf8');
  assert.match(helper,/codeMode==='selected'/);
  assert.match(helper,/\[data-trace-run\]/);
  assert.match(helper,/selectedCodes\(inputRef\)\.length/);
  assert.match(helper,/stopImmediatePropagation\(\)/);
  assert.match(helper,/Nenhuma coleta foi enviada/);
  assert.match(helper,/exige ao menos um código antes de iniciar/);
  assert.match(helper,/root\.addEventListener\('click',runGuard,true\)/);
  assert.match(helper,/root\.removeEventListener\('click',runGuard,true\)/);
});


test('seleção agrupa códigos e soma ocorrências só das linhas selecionadas sem alterar dados',async()=>{
  const {loadedFailures}=await import('../ames/console-trace-scope.mjs');
  const {defectDescription}=await import('../ames/defect-label.mjs');
  const rows={A:[{defect_code:'GN01',defect_desc:'Undefined error'},{defect_code:'GN01',defect_desc:'Receiver noise'}],B:[{defect_code:'GN01',defect_desc:'Receiver noise'},{defect_code:'GN02',defect_desc:''}]};
  const before=JSON.stringify(rows),store={read:line=>({snapshot:{occurrences:rows[line]}})};
  assert.deepEqual(loadedFailures(store,['A']),[{code:'GN01',description:'Receiver noise',count:2}]);
  assert.deepEqual(loadedFailures(store,['A','B']),[{code:'GN01',description:'Receiver noise',count:3},{code:'GN02',description:'',count:1}]);
  assert.equal(JSON.stringify(rows),before);
  assert.equal(defectDescription('Undefined error'),'Descrição não informada');
  assert.equal(defectDescription(null,'en-US'),'Description not provided');
});
