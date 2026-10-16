import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src=fs.readFileSync(new URL('../ames/console-fastlane-sn-reuse.mjs',import.meta.url),'utf8');

test('live SN summary KPIs navigate to their evidence tabs',()=>{
  for(const tab of ['failure','history','materials','process','repair'])assert.match(src,new RegExp(`data-sn-open-tab|nav\\('${tab}'`));
  assert.match(src,/role="button"/);
  assert.match(src,/tabindex="0"/);
  assert.match(src,/openSummaryTarget/);
  assert.match(src,/\['Enter',' '\]/);
});

test('live SN process digest only presents proven 3022 reference as generation evidence',()=>{
  assert.match(src,/trustedProductionEvidence/);
  assert.match(src,/contexts\.map\(trustedProductionEvidence\)\.find/);
  assert.doesNotMatch(src,/contexts\[0\]\|\|passages\[0\]/);
  assert.match(src,/Posto de referência \(3022\)/);
  assert.match(src,/Horário de geração \(3022\)/);
  assert.match(src,/Turno comprovado \(3022\)/);
  assert.match(src,/Sem referência 3022 comprovada/);
});

test('live SN labels defect time as MES record, not production generation',()=>{
  assert.match(src,/Registro da falha \(MES\)/);
});
