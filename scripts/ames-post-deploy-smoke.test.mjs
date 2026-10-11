import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fetchBounded,waitForPreview} from './post-deploy-smoke.mjs';

const headers=value=>new Headers(value);
const digest=text=>crypto.createHash('sha256').update(text).digest('hex');
const identityFor=sha=>JSON.stringify({
  schema:'central-release-identity-v1',
  central_build:'15.1.13.48',
  frontend_sha:sha,
  factory_gate_required:true
});
const releaseFor=(sha,identityText)=>({
  sha,
  build:'15.1.13.48',
  release_identity_schema:'central-release-identity-v1',
  release_identity_sha256:digest(identityText)
});

test('post-deploy smoke detects redirect cycles before browser ERR_TOO_MANY_REDIRECTS',async()=>{
  const fetcher=async url=>{
    const value=String(url);
    if(value.endsWith('/a'))return new Response('',{status:302,headers:headers({location:'/b'})});
    if(value.endsWith('/b'))return new Response('',{status:302,headers:headers({location:'/a'})});
    throw Error('unexpected '+value);
  };
  await assert.rejects(fetchBounded('https://preview.test/a',{fetcher,maxRedirects:4}),/redirect_loop/);
});

test('post-deploy smoke accepts exact SHA, release identity and real Central HTML',async()=>{
  const sha='1'.repeat(40);
  const identityText=identityFor(sha);
  const fetcher=async url=>{
    const value=String(url);
    if(value.includes('/release-build.json'))return new Response(JSON.stringify(releaseFor(sha,identityText)),{status:200,headers:headers({'content-type':'application/json'})});
    if(value.includes('/release-identity.json'))return new Response(identityText,{status:200,headers:headers({'content-type':'application/json'})});
    if(value.endsWith('/Central-de-Controle-/'))return new Response('<!doctype html><script type="module" src="offline-bootstrap.mjs"></script><div id="authLogin">Entrar na central</div>',{status:200,headers:headers({'content-type':'text/html; charset=utf-8'})});
    throw Error('unexpected '+value);
  };
  const result=await waitForPreview(['https://preview.test'],sha,{fetcher,waitMs:0,log:()=>{}});
  assert.equal(result.sha,sha);
  assert.equal(result.releaseIdentitySha256,digest(identityText));
  assert.equal(result.pageRedirects,0);
});

test('post-deploy smoke fails closed on stale deployment SHA',async()=>{
  const expected='2'.repeat(40),stale='3'.repeat(40);
  const identityText=identityFor(stale);
  const fetcher=async url=>{
    if(String(url).includes('/release-build.json'))return new Response(JSON.stringify(releaseFor(stale,identityText)),{status:200,headers:headers({'content-type':'application/json'})});
    throw Error('identity/page must not be read after SHA mismatch');
  };
  await assert.rejects(waitForPreview(['https://preview.test'],expected,{fetcher,waitMs:0,log:()=>{}}),/sha_mismatch/);
});

test('post-deploy smoke fails closed when release identity is not bound to expected SHA',async()=>{
  const expected='4'.repeat(40),wrong='5'.repeat(40);
  const wrongIdentity=identityFor(wrong);
  const fetcher=async url=>{
    const value=String(url);
    if(value.includes('/release-build.json'))return new Response(JSON.stringify(releaseFor(expected,wrongIdentity)),{status:200,headers:headers({'content-type':'application/json'})});
    if(value.includes('/release-identity.json'))return new Response(wrongIdentity,{status:200,headers:headers({'content-type':'application/json'})});
    throw Error('page must not be read after release identity mismatch');
  };
  await assert.rejects(waitForPreview(['https://preview.test'],expected,{fetcher,waitMs:0,log:()=>{}}),/release_identity_sha_mismatch/);
});

test('post-deploy smoke rejects identity without physical R12 gate',async()=>{
  const sha='6'.repeat(40);
  const identityText=JSON.stringify({schema:'central-release-identity-v1',central_build:'15.1.13.48',frontend_sha:sha,factory_gate_required:false});
  const fetcher=async url=>{
    const value=String(url);
    if(value.includes('/release-build.json'))return new Response(JSON.stringify(releaseFor(sha,identityText)),{status:200,headers:headers({'content-type':'application/json'})});
    if(value.includes('/release-identity.json'))return new Response(identityText,{status:200,headers:headers({'content-type':'application/json'})});
    throw Error('page must not be read after factory gate mismatch');
  };
  await assert.rejects(waitForPreview(['https://preview.test'],sha,{fetcher,waitMs:0,log:()=>{}}),/release_identity_factory_gate_missing/);
});
