import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalCentralUrl,localConsoleUrl,isMesRoundtrip,installLocalConsoleReturn} from '../core/central-roundtrip.mjs';

test('local MES Console always opens the canonical Central auth origin',()=>{
  const url=new URL(canonicalCentralUrl());
  assert.equal(url.origin,'https://central-cora-v2.vercel.app');
  assert.equal(url.pathname,'/Central-de-Controle-/');
  assert.equal(url.searchParams.get('from_mes_local'),'1');
  assert.notEqual(url.hostname,'127.0.0.1');
  assert.notEqual(url.hostname,'localhost');
});

test('Central return route is explicit and points only to loopback Console',()=>{
  assert.equal(localConsoleUrl(),'http://127.0.0.1:8765/Central-de-Controle-/');
  assert.equal(isMesRoundtrip({search:'?from_mes_local=1'}),true);
  assert.equal(isMesRoundtrip({search:''}),false);
});

test('roundtrip marker installs one simple return action without auth mutation',()=>{
  const appended=[];
  const host={append(node){appended.push(node);}};
  const document={
    documentElement:{lang:'pt-BR'},
    querySelector(selector){
      if(selector==='[data-local-console-return]')return appended.find(x=>x.dataset?.localConsoleReturn!==undefined)||null;
      if(selector==='.topbar .topbar-actions,.topbar-actions,.topbar,.main-nav')return host;
      return null;
    },
    createElement(){return {dataset:{},style:{},setAttribute(){}};}
  };
  assert.equal(installLocalConsoleReturn(document,{search:'?from_mes_local=1'}),true);
  assert.equal(appended.length,1);
  assert.equal(appended[0].href,localConsoleUrl());
  assert.equal(appended[0].textContent,'Voltar ao Console MES local');
  assert.equal(installLocalConsoleReturn(document,{search:'?from_mes_local=1'}),true);
  assert.equal(appended.length,1,'return action must not duplicate');
});
