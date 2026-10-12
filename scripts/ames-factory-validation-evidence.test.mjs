import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const PY=process.env.PYTHON_BIN||'python3';
const TOOL='tools/ames-workstation/factory-validation-evidence.py';
const PHYSICAL_SHA='5e45127d3b61b37968a4c2b05596919670b307cb';
const HARDENING_SHA='35d1edd4ba499b360344f486737b6b1b0fa03a11';
const VIEW_NAMES=['Monitoramento','Top 3 & FPY','Falhas','Consulta por SN','Rastreabilidade','Dashboards de reuso','Processo / 3022 & AT','Base local','CORA conhecimento'];
const FACTORY_DOC=fs.readFileSync('docs/ames/FACTORY_GATE_R12.md','utf8');

function run(args){return spawnSync(PY,[TOOL,...args],{encoding:'utf8'});}
function temp(){return fs.mkdtempSync(path.join(os.tmpdir(),'central-factory-evidence-'));}
function fillPass(doc){
  doc.physical_candidate.validation='pass';
  doc.hardening_candidate.validation='pass';
  for(const view of doc.views_9_of_9)view.status='pass';
  for(const gate of Object.values(doc.factory_gates))gate.status='pass';
  doc.r12_capture={status:'pass',sha256:'a'.repeat(64),file_count:42};
  for(const key of Object.keys(doc.multi_pc_hardening))doc.multi_pc_hardening[key]='pass';
  for(const key of Object.keys(doc.local_origin_hardening))doc.local_origin_hardening[key]='pass';
  doc.performance_ms={3028:1000,3074:2000,2114:3000,3022:4000,full:10000};
  doc.human_approval='approved';
}

test('factory evidence template is canonical, sanitized and pending by default',()=>{
  const dir=temp(),file=path.join(dir,'evidence.json');
  const result=run(['template',file,'--hardening-sha',HARDENING_SHA]);
  assert.equal(result.status,0,result.stderr||result.stdout);
  const doc=JSON.parse(fs.readFileSync(file,'utf8'));
  assert.equal(doc.schema,'central-factory-validation-evidence-v1');
  assert.equal(doc.physical_candidate.branch,'v2/console-parity-r12');
  assert.equal(doc.physical_candidate.sha,PHYSICAL_SHA);
  assert.equal(doc.hardening_candidate.sha,HARDENING_SHA);
  assert.deepEqual(doc.views_9_of_9.map(v=>v.name),VIEW_NAMES);
  assert.equal(doc.views_9_of_9.length,9);
  assert.ok(doc.views_9_of_9.every(v=>v.status==='pending'));
  assert.equal(doc.overall,'pending');
  assert.deepEqual(Object.values(doc.privacy),[false,false,false,false,false]);
  assert.equal(Object.hasOwn(doc,'notes'),false);
});

test('validated all-pass evidence yields review state, never automatic GREEN',()=>{
  const dir=temp(),source=path.join(dir,'source.json'),out=path.join(dir,'normalized.json');
  assert.equal(run(['template',source,'--hardening-sha',HARDENING_SHA]).status,0);
  const doc=JSON.parse(fs.readFileSync(source,'utf8'));fillPass(doc);
  fs.writeFileSync(source,JSON.stringify(doc));
  const result=run(['validate',source,'--output',out]);
  assert.equal(result.status,0,result.stderr||result.stdout);
  const normalized=JSON.parse(fs.readFileSync(out,'utf8'));
  assert.equal(normalized.overall,'ready_for_promotion_review');
  assert.notEqual(normalized.overall,'green');
  assert.ok(!JSON.stringify(normalized).match(/password|cookie|authorization|raw_mes_payload\":true/i));
});

test('unknown/sensitive-shaped fields fail closed',()=>{
  const dir=temp(),file=path.join(dir,'evidence.json');
  assert.equal(run(['template',file,'--hardening-sha',HARDENING_SHA]).status,0);
  const doc=JSON.parse(fs.readFileSync(file,'utf8'));
  doc.raw_mes={pcba_sn:'should-never-be-accepted'};
  fs.writeFileSync(file,JSON.stringify(doc));
  const result=run(['validate',file]);
  assert.notEqual(result.status,0);
  assert.match(result.stderr+result.stdout,/chaves inválidas/i);
});

test('canonical 9-view identity and frozen physical candidate cannot drift',()=>{
  const dir=temp(),file=path.join(dir,'evidence.json');
  assert.equal(run(['template',file,'--hardening-sha',HARDENING_SHA]).status,0);
  let doc=JSON.parse(fs.readFileSync(file,'utf8'));
  doc.views_9_of_9[0].name='Outra tela';
  fs.writeFileSync(file,JSON.stringify(doc));
  let result=run(['validate',file]);
  assert.notEqual(result.status,0);
  assert.match(result.stderr+result.stdout,/requisito canônico/i);

  assert.equal(run(['template',path.join(dir,'second.json'),'--hardening-sha',HARDENING_SHA]).status,0);
  doc=JSON.parse(fs.readFileSync(path.join(dir,'second.json'),'utf8'));
  doc.physical_candidate.sha='b'.repeat(64);
  fs.writeFileSync(path.join(dir,'second.json'),JSON.stringify(doc));
  result=run(['validate',path.join(dir,'second.json')]);
  assert.notEqual(result.status,0);
  assert.match(result.stderr+result.stdout,/candidata física congelada/i);
});

test('R12 capture PASS requires only sanitized hash/count evidence',()=>{
  const dir=temp(),file=path.join(dir,'evidence.json');
  assert.equal(run(['template',file,'--hardening-sha',HARDENING_SHA]).status,0);
  const doc=JSON.parse(fs.readFileSync(file,'utf8'));
  doc.r12_capture.status='pass';
  fs.writeFileSync(file,JSON.stringify(doc));
  const result=run(['validate',file]);
  assert.notEqual(result.status,0);
  assert.match(result.stderr+result.stdout,/captura R12 PASS exige sha256 e file_count/i);
});

test('hardening cannot become promotion-review-ready without an exact SHA',()=>{
  const dir=temp(),file=path.join(dir,'evidence.json'),out=path.join(dir,'out.json');
  assert.equal(run(['template',file]).status,0);
  const doc=JSON.parse(fs.readFileSync(file,'utf8'));fillPass(doc);
  fs.writeFileSync(file,JSON.stringify(doc));
  const result=run(['validate',file,'--output',out]);
  if(result.status===0){
    const normalized=JSON.parse(fs.readFileSync(out,'utf8'));
    assert.notEqual(normalized.overall,'ready_for_promotion_review','hardening SHA missing must block review-ready state');
  }else{
    assert.match(result.stderr+result.stdout,/hardening|sha/i);
  }
});


test('factory gate documentation ships the sanitized evidence tool without replacing the frozen physical baseline',()=>{
  assert.ok(FACTORY_DOC.includes('## 6. Evidência estruturada sanitizada'));
  assert.ok(FACTORY_DOC.includes('5e45127d3b61b37968a4c2b05596919670b307cb'));
  assert.ok(FACTORY_DOC.includes('suporte\\ames-workstation\\factory-validation-evidence.py'));
  assert.ok(FACTORY_DOC.includes('ready_for_promotion_review'));
  assert.match(FACTORY_DOC,/não substitui.*candidata física/i);
  assert.match(FACTORY_DOC,/nunca GREEN automático/i);
});
