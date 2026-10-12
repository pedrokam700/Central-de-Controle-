import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('app.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');

test('contexto MES interno continua local e separado da projeção externa',()=>{
  assert.match(app,/import \{projectCoraMesExternalContext\} from '\.\/ames\/data\/cora-external\.mjs';/);
  assert.match(app,/function currentCoraMesContext\(\) \{[\s\S]*coraMesView\?\.context\(\)/);
  assert.match(app,/function aiBuildExternalCentralContext\(\)\{[\s\S]*const local=aiBuildDynamicCentralContext\(\);[\s\S]*mes:projectCoraMesExternalContext\(local\?\.mes\|\|\{status:'not_selected'\}\)/);
});

test('builders externos não anexam o bloco MES bruto de aiBuildDynamicCentralContext',()=>{
  assert.match(app,/function aiBuildPayload\(\)\{[\s\S]*const centralData=aiBuildExternalCentralContext\(\);/);
  assert.match(app,/function aiArtifactRequestPayload\(\)\{[\s\S]*const centralData=aiBuildExternalCentralContext\(\);/);
  assert.doesNotMatch(app,/function aiArtifactRequestPayload\(\)\{[\s\S]{0,900}centralData:aiBuildDynamicCentralContext\(\)/);
});

test('projeção externa troca somente o MES e preserva o contexto local como fonte',()=>{
  assert.match(app,/return \{\.\.\.local,mes:projectCoraMesExternalContext/);
  assert.match(app,/mes: currentCoraMesContext\(\)/);
});

test('dependências de egress ficam disponíveis no shell offline',()=>{
  for(const path of ['core/cora-egress-policy.mjs','core/cora-egress-transport.mjs','ames/data/cora-external.mjs'])assert.ok(sw.includes(path),path);
});

test('integração não declara enforcement global de rotas ainda',()=>{
  assert.equal(app.includes('assertCoraExternalRequest({path:url'),false);
});
