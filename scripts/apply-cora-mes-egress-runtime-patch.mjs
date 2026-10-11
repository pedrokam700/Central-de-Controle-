import fs from 'node:fs';

function replaceExactly(source,oldText,newText,label){
  const first=source.indexOf(oldText);
  if(first<0)throw new Error(`${label}: anchor not found`);
  if(source.indexOf(oldText,first+oldText.length)>=0)throw new Error(`${label}: anchor is not unique`);
  return source.slice(0,first)+newText+source.slice(first+oldText.length);
}

let app=fs.readFileSync('app.js','utf8');
app=replaceExactly(
  app,
  "    import { MES_REASONING_RULES } from './ames/data/cora.mjs';",
  "    import { MES_REASONING_RULES } from './ames/data/cora.mjs';\n    import {projectCoraMesExternalContext} from './ames/data/cora-external.mjs';",
  'CORA external projection import'
);

const localContext=`    function currentCoraMesContext() {\n      return currentAuthUser ? coraMesView?.context() || { status: 'not_selected' } : { status: 'signed_out' };\n    }`;
const localAndExternal=`    function currentCoraMesContext() {\n      return currentAuthUser ? coraMesView?.context() || { status: 'not_selected' } : { status: 'signed_out' };\n    }\n    function aiBuildExternalCentralContext(){\n      const local=aiBuildDynamicCentralContext();\n      return {...local,mes:projectCoraMesExternalContext(local?.mes||{status:'not_selected'})};\n    }`;
app=replaceExactly(app,localContext,localAndExternal,'external central context helper');

const artifactOld=`    function aiArtifactRequestPayload(){\n      return {kind:'8d',context:aiPilot.context,result:aiPilot.lastResult||{},images:aiPilot.images.map(x=>({name:x.name,type:x.type,dataUrl:x.dataUrl})),currentReport:aiBuildDynamicCentralContext().currentReport,currentOperationalFailure:aiBuildDynamicCentralContext().currentOperationalFailure,activeProduct:aiBuildDynamicCentralContext().activeProduct,centralData:aiBuildDynamicCentralContext(),conversation:(aiPilot.conversation||[]).slice(-20)};\n    }`;
const artifactNew=`    function aiArtifactRequestPayload(){\n      const centralData=aiBuildExternalCentralContext();\n      return {kind:'8d',context:aiPilot.context,result:aiPilot.lastResult||{},images:aiPilot.images.map(x=>({name:x.name,type:x.type,dataUrl:x.dataUrl})),currentReport:centralData.currentReport,currentOperationalFailure:centralData.currentOperationalFailure,activeProduct:centralData.activeProduct,centralData,conversation:(aiPilot.conversation||[]).slice(-20)};\n    }`;
app=replaceExactly(app,artifactOld,artifactNew,'artifact MES boundary');

app=replaceExactly(
  app,
  `    function aiBuildPayload(){\n      const memory=aiBuildMemoryContext(aiPilot.context);\n      const centralData=aiBuildDynamicCentralContext();`,
  `    function aiBuildPayload(){\n      const memory=aiBuildMemoryContext(aiPilot.context);\n      const centralData=aiBuildExternalCentralContext();`,
  'LLM MES boundary'
);

for(const required of [
  "projectCoraMesExternalContext",
  "function aiBuildExternalCentralContext()",
  "mes:projectCoraMesExternalContext(local?.mes||{status:'not_selected'})",
  "const centralData=aiBuildExternalCentralContext();"
]) if(!app.includes(required))throw new Error('runtime integration missing: '+required);
fs.writeFileSync('app.js',app);

let sw=fs.readFileSync('sw.js','utf8');
sw=replaceExactly(
  sw,
  "BASE+'core/legacy-account-migration.mjs',BASE+'ames/data/store.mjs'",
  "BASE+'core/legacy-account-migration.mjs',BASE+'core/cora-egress-policy.mjs',BASE+'core/cora-egress-transport.mjs',BASE+'ames/data/cora-external.mjs',BASE+'ames/data/store.mjs'",
  'CORA egress offline dependencies'
);
fs.writeFileSync('sw.js',sw);

const test=`import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport fs from 'node:fs';\n\nconst app=fs.readFileSync('app.js','utf8');\nconst sw=fs.readFileSync('sw.js','utf8');\n\ntest('contexto MES interno continua local e separado da projeção externa',()=>{\n  assert.match(app,/import \\{projectCoraMesExternalContext\\} from '\\.\\/ames\\/data\\/cora-external\\.mjs';/);\n  assert.match(app,/function currentCoraMesContext\\(\\) \\{[\\s\\S]*coraMesView\\?\\.context\\(\\)/);\n  assert.match(app,/function aiBuildExternalCentralContext\\(\\)\\{[\\s\\S]*const local=aiBuildDynamicCentralContext\\(\\);[\\s\\S]*mes:projectCoraMesExternalContext\\(local\\?\\.mes\\|\\|\\{status:'not_selected'\\}\\)/);\n});\n\ntest('builders externos não anexam o bloco MES bruto de aiBuildDynamicCentralContext',()=>{\n  assert.match(app,/function aiBuildPayload\\(\\)\\{[\\s\\S]*const centralData=aiBuildExternalCentralContext\\(\\);/);\n  assert.match(app,/function aiArtifactRequestPayload\\(\\)\\{[\\s\\S]*const centralData=aiBuildExternalCentralContext\\(\\);/);\n  assert.doesNotMatch(app,/function aiArtifactRequestPayload\\(\\)\\{[\\s\\S]{0,900}centralData:aiBuildDynamicCentralContext\\(\\)/);\n});\n\ntest('projeção externa troca somente o MES e preserva o contexto local como fonte',()=>{\n  assert.match(app,/return \\{\\.\\.\\.local,mes:projectCoraMesExternalContext/);\n  assert.match(app,/mes: currentCoraMesContext\\(\\)/);\n});\n\ntest('dependências de egress ficam disponíveis no shell offline',()=>{\n  for(const path of ['core/cora-egress-policy.mjs','core/cora-egress-transport.mjs','ames/data/cora-external.mjs'])assert.ok(sw.includes(path),path);\n});\n\ntest('integração não declara enforcement global de rotas ainda',()=>{\n  assert.equal(app.includes('assertCoraExternalRequest({path:url'),false);\n});\n`;
fs.writeFileSync('scripts/ames-cora-mes-egress-app.test.mjs',test);
console.log('PASS deterministic CORA MES egress runtime patch');
