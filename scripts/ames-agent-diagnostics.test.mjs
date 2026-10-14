import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readHardeningDiagnostics,sanitizeHardeningDiagnostics} from '../ames/agent-diagnostics.mjs';

test('hardening diagnostics keep only sanitized integrity fields',()=>{
  const value=sanitizeHardeningDiagnostics({
    ok:true,
    hardening:'H1',
    integrity:'OK',
    schema_version:7,
    performance_indexes:{ok:true,expected:8,present:8,missing:[]},
    origin_policy:{ok:true,mode:'loopback-plus-explicit-https',local_origins:2,configured_entries:2,remote_origins:2,rejected_entries:0,secret_origin:'https://do-not-copy.example'},
    local_security:{token_file:'C:/secret/local_agent_token',token:'must-not-leak'},
    raw_payload:{mes_cookie:'secret'},
  });
  assert.deepEqual(value,{
    status:'ok',
    level:'H1',
    integrity:'ok',
    schemaVersion:7,
    performanceIndexes:{ok:true,expected:8,present:8,missing:[]},
    originPolicy:{ok:true,mode:'loopback-plus-explicit-https',localOrigins:2,configuredEntries:2,remoteOrigins:2,rejectedEntries:0},
  });
  const text=JSON.stringify(value);
  assert.equal(text.includes('secret'),false);
  assert.equal(text.includes('do-not-copy'),false);
  assert.equal(text.includes('token_file'),false);
  assert.equal(text.includes('raw_payload'),false);
});

test('diagnostics request uses workstation token and keeps response sanitized',async()=>{
  const calls=[];
  const result=await readHardeningDiagnostics({
    token:'paired-token',
    fetcher:async(url,options)=>{
      calls.push({url,options});
      return {ok:true,status:200,json:async()=>({
        ok:true,hardening:'H1',integrity:'ok',schema_version:3,
        performance_indexes:{ok:false,expected:8,present:7,missing:['idx_missing']},
        origin_policy:{ok:false,mode:'loopback-plus-explicit-https',local_origins:2,configured_entries:3,remote_origins:1,rejected_entries:2},
        local_security:{token:'hidden'}
      })};
    }
  });
  assert.equal(calls.length,1);
  assert.equal(calls[0].options.headers['X-Central-Agent-Token'],'paired-token');
  assert.equal(result.status,'ok');
  assert.equal(result.level,'H1');
  assert.equal(result.integrity,'ok');
  assert.deepEqual(result.performanceIndexes,{ok:false,expected:8,present:7,missing:['idx_missing']});
  assert.deepEqual(result.originPolicy,{ok:false,mode:'loopback-plus-explicit-https',localOrigins:2,configuredEntries:3,remoteOrigins:1,rejectedEntries:2});
  assert.equal(JSON.stringify(result).includes('hidden'),false);
});

test('unauthorized and unsupported diagnostics fail closed',async()=>{
  const unauthorized=await readHardeningDiagnostics({token:'bad',fetcher:async()=>({ok:false,status:401})});
  assert.deepEqual(unauthorized,{status:'unavailable',reason:'unauthorized'});
  const unsupported=await readHardeningDiagnostics({token:'paired',fetcher:async()=>({ok:false,status:404})});
  assert.deepEqual(unsupported,{status:'unavailable',reason:'unsupported'});
});

test('remote unpaired context does not probe local diagnostics',async()=>{
  let called=0;
  const result=await readHardeningDiagnostics({token:'',fetcher:async()=>{called++;throw Error('must not run');}});
  assert.equal(called,0);
  assert.equal(result.status,'unavailable');
  assert.equal(result.reason,'not_paired');
});
