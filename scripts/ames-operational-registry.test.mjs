import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {OPERATIONAL_REGISTRY,LINE_IDS,LINE_ALIASES} from '../ames/data/operational-registry.mjs';
import {LINE_IDS as CONTRACT_LINES,requireLine} from '../ames/data/contract.mjs';

const read=path=>fs.readFileSync(path,'utf8');
const EXACT_LINES=['TAN10101','TAN10102','TAN10103'];

test('operational registry freezes current Extrema identities without relabeling MES lines',()=>{
  assert.equal(OPERATIONAL_REGISTRY.schema,'central-operational-registry-v1');
  assert.equal(OPERATIONAL_REGISTRY.site.id,'extrema');
  assert.equal(OPERATIONAL_REGISTRY.site.timezone,'America/Sao_Paulo');
  assert.deepEqual([...LINE_IDS],EXACT_LINES);
  assert.deepEqual({...LINE_ALIASES},{'Linha 1':'TAN10101','Linha 2':'TAN10102','Linha 3':'TAN10103'});
  assert.ok(Object.isFrozen(OPERATIONAL_REGISTRY));
  assert.ok(Object.isFrozen(OPERATIONAL_REGISTRY.lines));
});

test('canonical JS contract consumes registry instead of duplicating line list',()=>{
  assert.deepEqual([...CONTRACT_LINES],EXACT_LINES);
  for(const line of EXACT_LINES)assert.equal(requireLine(line),line);
  assert.throws(()=>requireLine('TAN10104'),/registered MES line/);
  const contract=read('ames/data/contract.mjs');
  assert.match(contract,/from '\.\/operational-registry\.mjs'/);
  assert.doesNotMatch(contract,/Object\.freeze\(\['TAN10101'/,'contract must not re-declare line identities');
});

test('legacy Python defaults and Firestore Rules remain in parity during gradual migration',()=>{
  const agent=read('ames/agent/agent.py');
  const rules=read('firestore.rules');
  for(const line of EXACT_LINES){
    assert.ok(agent.includes(`"${line}"`),`agent default missing ${line}`);
    assert.ok(rules.includes(`'${line}'`),`Firestore Rules missing ${line}`);
  }
  assert.match(agent,/"line_aliases": \{"Linha 1": "TAN10101", "Linha 2": "TAN10102", "Linha 3": "TAN10103"\}/);
  assert.match(rules,/lineId in \['TAN10101', 'TAN10102', 'TAN10103'\]/);
});
