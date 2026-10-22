import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=path=>fs.readFileSync(path,'utf8');
const site='https://pedrokam700.github.io/Central-de-Controle-/';
test('single official GitHub Pages base path agrees across frontend agent and publishing',()=>{
 const frontend=read('ames/agent-client.mjs');
 const backend=read('ames/agent/workstation_pairing.py');
 const publish=read('.github/workflows/publish-github-pages.yml');
 assert.match(frontend,/pathname\.startsWith\('\/Central-de-Controle-\/'\)/);
 assert.match(frontend,/new URL\('https:\/\/pedrokam700\.github\.io\/Central-de-Controle-\/'\)/);
 assert.match(backend,/OFFICIAL_CENTRAL = "https:\/\/pedrokam700\.github\.io\/Central-de-Controle-\/"/);
 assert.ok(publish.includes('root="'+site+'"'));
 assert.ok(publish.includes('url="'+site+'release-build.json"'));
 assert.doesNotMatch(frontend,/pedrokam700\.github\.io\/Central-de-Controle\//);
 assert.doesNotMatch(backend,/pedrokam700\.github\.io\/Central-de-Controle\//);
 assert.match(backend,/TTL_SECONDS = 300/);
 assert.match(frontend,/ames_agent_token/);
});
