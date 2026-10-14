import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSecurityHealth} from '../ames/console-data-health.mjs';

test('security health exposes counts only and keeps validated policy green',()=>{
  const model=buildSecurityHealth({
    status:'ok',
    originPolicy:{ok:true,mode:'loopback-plus-explicit-https',remoteOrigins:1,rejectedEntries:0,secret:'https://hidden.example'}
  });
  assert.equal(model.tone,'ok');
  assert.equal(model.remote,1);
  assert.equal(model.rejected,0);
  assert.equal(model.mode,'loopback-plus-explicit-https');
  assert.equal(JSON.stringify(model).includes('hidden.example'),false);
});

test('legacy rejected origins are visible as partial without exposing origin values',()=>{
  const model=buildSecurityHealth({
    status:'ok',
    originPolicy:{ok:false,mode:'loopback-plus-explicit-https',remoteOrigins:1,rejectedEntries:3,origins:['https://must-not-render.example']}
  });
  assert.equal(model.tone,'partial');
  assert.equal(model.remote,1);
  assert.equal(model.rejected,3);
  assert.match(model.label,/Configuração legada|Legacy configuration/);
  assert.equal(JSON.stringify(model).includes('must-not-render'),false);
});

test('unavailable hardening diagnostics remain unknown instead of being reported safe',()=>{
  for(const value of [null,{status:'unavailable',reason:'not_paired'},{status:'error'}]){
    const model=buildSecurityHealth(value);
    assert.equal(model.tone,'unknown');
    assert.equal(model.remote,null);
    assert.equal(model.rejected,null);
  }
});
