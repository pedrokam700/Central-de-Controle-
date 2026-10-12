import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const netlify=fs.readFileSync('netlify.toml','utf8');
const vercel=JSON.parse(fs.readFileSync('vercel.json','utf8'));
const baseline={
  'X-Content-Type-Options':'nosniff',
  'X-Frame-Options':'DENY',
  'Referrer-Policy':'no-referrer',
  'Permissions-Policy':'geolocation=(), payment=(), usb=(), serial=()'
};

function vercelHeaders(source){
  return Object.fromEntries((vercel.headers.find(rule=>rule.source===source)?.headers||[]).map(row=>[row.key,row.value]));
}

test('Netlify and Vercel publish the same conservative security baseline',()=>{
  for(const [key,value] of Object.entries(baseline)){
    assert.match(netlify,new RegExp(`${key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\s*=\\s*"${value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}"`),`Netlify missing ${key}`);
    assert.equal(vercelHeaders('/(.*)')[key],value,`Vercel missing/mismatched ${key}`);
  }
});

test('release manifests are explicitly no-store on both providers',()=>{
  const paths=['/release-build.json','/release-identity.json','/Central-de-Controle-/release-identity.json'];
  for(const path of paths){
    const escaped=path.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    assert.match(netlify,new RegExp(`for\\s*=\\s*"${escaped}"[\\s\\S]*?Cache-Control\\s*=\\s*"no-store, max-age=0"`),`Netlify cache policy missing ${path}`);
    assert.equal(vercelHeaders(path)['Cache-Control'],'no-store, max-age=0',`Vercel cache policy missing ${path}`);
  }
});

test('Service Worker remains revalidated instead of immutable-cached',()=>{
  assert.match(netlify,/for\s*=\s*"\/Central-de-Controle-\/sw\.js"[\s\S]*?Cache-Control\s*=\s*"no-cache"/);
  assert.equal(vercelHeaders('/Central-de-Controle-/sw.js')['Cache-Control'],'no-cache');
});

test('hardening does not accidentally enable a blocking CSP before source inventory is ready',()=>{
  assert.equal(/Content-Security-Policy\s*=/.test(netlify),false);
  const all=vercel.headers.flatMap(rule=>rule.headers||[]);
  assert.equal(all.some(row=>row.key==='Content-Security-Policy'),false);
});
