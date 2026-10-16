import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {canonicalCentralUrl,localConsoleUrl,isMesRoundtrip,installLocalConsoleReturn} from '../core/central-roundtrip.mjs';

test('Central and Console MES stay on the same browser origin',()=>{
  const location={origin:'http://127.0.0.1:8765',search:'',href:'http://127.0.0.1:8765/Central-de-Controle-/'};
  const central=new URL(canonicalCentralUrl(location));
  const consoleUrl=new URL(localConsoleUrl(location));
  assert.equal(central.origin,location.origin);
  assert.equal(central.pathname,'/Central-de-Controle-/');
  assert.equal(consoleUrl.origin,location.origin);
  assert.equal(consoleUrl.pathname,'/Central-de-Controle-/');
  assert.equal(consoleUrl.searchParams.get('view'),'mesConsole');
  assert.doesNotMatch(canonicalCentralUrl(location),/vercel|netlify/i);
});

test('legacy MES marker and integrated view route are both recognized without cross-origin navigation',()=>{
  assert.equal(isMesRoundtrip({search:'?from_mes_local=1'}),true);
  assert.equal(isMesRoundtrip({search:'?view=mesConsole'}),true);
  assert.equal(isMesRoundtrip({search:''}),false);
});

test('legacy roundtrip opens existing internal Console MES button instead of appending a link',()=>{
  let clicks=0,creates=0;
  const button={click(){clicks++;}};
  const document={
    documentElement:{},
    querySelector(selector){return selector.includes('data-page="mesConsole"')?button:null;},
    createElement(){creates++;return {};}
  };
  const location={origin:'http://127.0.0.1:8765',search:'?from_mes_local=1',href:'http://127.0.0.1:8765/Central-de-Controle-/?from_mes_local=1'};
  assert.equal(installLocalConsoleReturn(document,location),true);
  assert.equal(clicks,1);
  assert.equal(creates,0,'unified route must not append a second-app return link');
});

test('CLEAN packager preserves integrated offline-bootstrap and cannot swap back to local-entry mini-app',()=>{
  const build=fs.readFileSync('scripts/build-integrated-candidate.py','utf8');
  assert.match(build,/Integrated Central bootstrap missing from CLEAN index/);
  assert.match(build,/CLEAN regressed to standalone local Console entry/);
  assert.doesNotMatch(build,/html=html\.replace\([^\n]*local-entry\.mjs/);
  const legacy=fs.readFileSync('core/local-entry.mjs','utf8');
  assert.match(legacy,/offline-bootstrap\.mjs/);
  assert.doesNotMatch(legacy,/local-workstation\.mjs/);
});

test('full Central already owns Console MES as an internal state/view',()=>{
  const app=fs.readFileSync('app.js','utf8');
  const html=fs.readFileSync('index.html','utf8');
  assert.match(app,/mesConsole:\s*'#mesConsoleView'/);
  assert.match(app,/createConsoleView\(document\.querySelector\('#mesConsole'\)/);
  assert.match(html,/data-page="mesConsole"/);
  assert.match(html,/id="mesConsoleView"/);
});
