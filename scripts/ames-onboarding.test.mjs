import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { integrationMode, readRelease,installationDetection,sharingState } from '../ames/data/onboarding.mjs';
import {verifiedLatestRelease,discoverOfficialRelease} from '../ames/release-discovery.mjs';
const release=JSON.parse(fs.readFileSync(new URL('../ames/releases/latest/release.json',import.meta.url),'utf8'));

test('approved public GitHub CLEAN is SHA-bound and safe for new Windows computers',()=>{
  const m=readRelease({...release,password:'secret',cookies:'secret',endpoint:'invented'});
  assert.equal(m.version,'0.5.33');
  assert.equal(m.package_available,true);
  assert.equal(m.validated_sha,'4837aec803611ee231f3c7243ec2f990a23d3286');
  assert.equal(m.sha256,'e48c4f05d72a7ae841f477cb3cba605ff778c96822acfe9a55c11db914add401');
  assert.equal(m.download_url,'https://github.com/pedrokam700/Central-de-Controle-/releases/download/ames-v0.5.33-multipc-20261021/AMES_Central_CLEAN_4837aec8.zip');
  assert.equal(m.local_runtime.agent_health_url,'http://127.0.0.1:8765/api/v1/health');
  assert(!JSON.stringify(m).includes('secret'));assert.equal(m.endpoint,undefined);
  assert.equal(integrationMode('collector'),'collector');assert.equal(integrationMode('viewer'),'viewer');
  assert.equal(integrationMode('connected'),null);assert.equal(integrationMode('password'),null);
});
test('never recommend arbitrary CDN, preview, stale ZIP or unverified candidate',()=>{
  const other={...release,package_available:true};
  const invalid=[
    null,{},{...release,version:'bad'},
    {...release,package_available:false,download_url:release.download_url},
    {...other,sha256:'bad'},
    {...other,download_url:'javascript:alert(1)'},
    {...other,download_url:'https://example.com/AMES.zip'},
    {...other,download_url:'https://github.com.evil.com/pedrokam700/Central-de-Controle-/releases/download/ames-v0.5.31-multipc-20261021/AMES_Central_CLEAN_44d0b326.zip'},
    {...other,download_url:'https://user:password@github.com'+new URL(release.download_url).pathname},
    {...other,download_url:release.download_url+'?token=fake'},
    {...other,validated_candidate_sha:'1'.repeat(40)},
    {...other,package_name:'AMES_Central_CLEAN_fake0000.zip'},
    {...other,local_runtime:{...other.local_runtime,start_file:'00_INICIAR_AQUI.bat'}}
  ];
  for(const v of invalid)assert.throws(()=>readRelease(v));
});
test('not-yet-published candidate must explicitly hide its download',()=>{
 const m=readRelease({...release,package_available:false,package_name:'',download_url:'',sha256:''});
 assert.equal(m.package_available,false);assert.equal(m.download_url,'');
});

test('agent detection never confuses browser restrictions with a new PC',()=>{
 assert.equal(installationDetection({status:'connected'},false),'verified');
 assert.equal(installationDetection({status:'disconnected',connection_error:{code:'agent-unauthorized'}},false),'pairing_required');
 assert.equal(installationDetection({status:'disconnected'},true),'paired_unreachable');
 assert.equal(installationDetection({status:'disconnected',connection_error:{code:'agent-network'}},false),'not_verified');
 assert.equal(installationDetection({},false),'not_verified');
});
test('cross-PC UX differentiates local sent queue, cache, server confirmation and conflicts',()=>{
 const base={status:'connected',sync:{
  status:'synchronized',pending:0,last_sent:{sent_at:'2026-10-20T10:20:00Z'},
  read_status:'ready',server_received_at:'2026-10-20T10:21:00Z',
  remote_heads:[{line_id:'TAN10102',snapshot_id:'10'}]
 }};
 const a=sharingState(base);
 assert.equal(a.publishing,'sent');assert.equal(a.receiving,'server_confirmed');
 assert.deepEqual(a.receivedLines,['TAN10102']);
 assert.equal(sharingState({...base,sync:{...base.sync,read_status:'ready',server_received_at:null}}).receiving,'not_confirmed');
 assert.equal(sharingState({...base,sync:{...base.sync,read_status:'cached'}}).receiving,'cached');
 assert.equal(sharingState({...base,sync:{...base.sync,read_status:'origin_conflict'}}).receiving,'conflict');
 assert.equal(sharingState({...base,sync:{...base.sync,status:'pending',pending:2}}).publishing,'pending');
 assert.equal(sharingState({}).publishing,'not_confirmed');
});

test('first-login screen exposes the same public approved CLEAN without requiring MES access',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const approved=readRelease(release);
 assert.match(html,/Primeiro acesso neste computador\?/);
 assert.equal(approved.version,'0.5.33');
 assert(html.includes('id="approvedCleanLoginDownload" href="https://github.com/pedrokam700/Central-de-Controle-/releases/latest"'));
 assert(!html.includes('href="'+approved.download_url+'"'),'login fallback must use GitHub latest landing instead of a version-pinned file');
 assert.match(html,/n[aã]o precisa instalar o agente A-MES/);
 assert.match(html,/00_INICIAR_AQUI\.bat/);
});

const latest={draft:false,prerelease:false,tag_name:'ames-v0.5.30-multipc-20261021',
 target_commitish:'c'.repeat(40),
 assets:[{name:'AMES_Central_CLEAN_cccccccc.zip',size:1200000,
 state:'uploaded',digest:'sha256:'+'d'.repeat(64),
 browser_download_url:'https://github.com/pedrokam700/Central-de-Controle-/releases/download/ames-v0.5.30-multipc-20261021/AMES_Central_CLEAN_cccccccc.zip'}]};
test('only GitHub latest with exact asset, digest, tag and commit can become the download',()=>{
 const m=verifiedLatestRelease(latest,release);
 assert.equal(m.version,'0.5.30');
 assert.equal(m.validated_sha,'c'.repeat(40));
 assert.equal(m.sha256,'d'.repeat(64));
 assert.equal(m.download_url,latest.assets[0].browser_download_url);
 for(const bad of [
   {...latest,draft:true},
   {...latest,prerelease:true},
   {...latest,target_commitish:'SHORT'},
   {...latest,tag_name:'ames-v0.6.00-multipc-20261021'},
   {...latest,assets:[{...latest.assets[0],digest:null}]},
   {...latest,assets:[{...latest.assets[0],browser_download_url:'https://evil.example/z.zip'}]},
   {...latest,assets:[{...latest.assets[0],size:7}]}
 ]){
   const old=verifiedLatestRelease(bad,release);
   assert.equal(old.download_url,release.download_url);
 }
});
test('release discovery is read-only and falls back offline to exact factory-approved CLEAN',async()=>{
 const fetcher=async(url,options)=>{
   assert.equal(url,'https://api.github.com/repos/pedrokam700/Central-de-Controle-/releases/latest');
   assert.equal(options.credentials,'omit');
   return {ok:true,json:async()=>latest};
 };
 const m=await discoverOfficialRelease(undefined,fetcher,async()=>release);
 assert.equal(m.version,'0.5.30');
 const fallback=await discoverOfficialRelease(undefined,async()=>{throw Error('offline');},async()=>release);
 assert.equal(fallback.sha256,release.sha256);
});
test('auto agent probe with known response does not declare unknown HTTP server installed',()=>{
 assert.equal(installationDetection({status:'disconnected',workstation_probe:{state:'detected'}},false),'pairing_required');
 assert.equal(installationDetection({status:'disconnected',workstation_probe:{state:'outdated'}},false),'agent_outdated');
 assert.equal(installationDetection({status:'disconnected',workstation_probe:{state:'unknown'}},false),'not_verified');
});

test('validated GitHub manifest remains valid through view-level validation',()=>{
 const once=readRelease(release),twice=readRelease(once);
 assert.equal(twice.validated_sha,once.validated_sha);
 assert.equal(twice.download_url,once.download_url);
 const latestOnce=verifiedLatestRelease(latest,release);
 const latestTwice=readRelease(latestOnce);
 assert.equal(latestTwice.validated_sha,'c'.repeat(40));
 assert.equal(latestTwice.version,'0.5.30');
});

test('all static installation URLs use GitHub latest, and SHA-validated direct URL is retained only in approved manifest',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert(!html.includes('/releases/download/ames-v0.5.27-multipc-20261021/'));
 assert(!html.includes('/releases/download/ames-v0.5.28-multipc-20261021/'));
 assert.match(html,/id="approvedCleanLoginDownload" href="https:\/\/github\.com\/pedrokam700\/Central-de-Controle-\/releases\/latest"/);
 const guide=fs.readFileSync(new URL('../ames/onboarding-view.mjs',import.meta.url),'utf8');
 assert(guide.includes("'https://github.com/pedrokam700/Central-de-Controle-/releases/latest'"));
 const link=fs.readFileSync(new URL('../ames/release-login-link.mjs',import.meta.url),'utf8');
 assert(link.includes("rel.candidate_status==='github_latest_release_verified'"));
});
