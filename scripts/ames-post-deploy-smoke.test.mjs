import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchBounded,waitForPreview} from './post-deploy-smoke.mjs';

const headers=value=>new Headers(value);

test('post-deploy smoke detects redirect cycles before browser ERR_TOO_MANY_REDIRECTS',async()=>{
  const fetcher=async url=>{
    const value=String(url);
    if(value.endsWith('/a'))return new Response('',{status:302,headers:headers({location:'/b'})});
    if(value.endsWith('/b'))return new Response('',{status:302,headers:headers({location:'/a'})});
    throw Error('unexpected '+value);
  };
  await assert.rejects(fetchBounded('https://preview.test/a',{fetcher,maxRedirects:4}),/redirect_loop/);
});

test('post-deploy smoke accepts exact SHA and real Central HTML',async()=>{
  const sha='1'.repeat(40);
  const fetcher=async url=>{
    const value=String(url);
    if(value.includes('/release-build.json'))return new Response(JSON.stringify({sha}),{status:200,headers:headers({'content-type':'application/json'})});
    if(value.endsWith('/Central-de-Controle-/'))return new Response('<!doctype html><script type="module" src="offline-bootstrap.mjs"></script><div id="authLogin">Entrar na central</div>',{status:200,headers:headers({'content-type':'text/html; charset=utf-8'})});
    throw Error('unexpected '+value);
  };
  const result=await waitForPreview(['https://preview.test'],sha,{fetcher,waitMs:0,log:()=>{}});
  assert.equal(result.sha,sha);
  assert.equal(result.pageRedirects,0);
});

test('post-deploy smoke fails closed on stale deployment SHA',async()=>{
  const expected='2'.repeat(40),stale='3'.repeat(40);
  const fetcher=async url=>{
    if(String(url).includes('/release-build.json'))return new Response(JSON.stringify({sha:stale}),{status:200,headers:headers({'content-type':'application/json'})});
    throw Error('page must not be read after SHA mismatch');
  };
  await assert.rejects(waitForPreview(['https://preview.test'],expected,{fetcher,waitMs:0,log:()=>{}}),/sha_mismatch/);
});
