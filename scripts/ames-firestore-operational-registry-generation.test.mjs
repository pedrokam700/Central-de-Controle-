import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {LINE_IDS} from '../ames/data/operational-registry.mjs';
import {renderFirestoreMesLineBlock,replaceFirestoreMesLineBlock,firestoreOperationalRegistryCheck,FIRESTORE_OPERATIONAL_REGISTRY_BEGIN,FIRESTORE_OPERATIONAL_REGISTRY_END} from './firestore-operational-registry.mjs';

const EXACT_LINES=['TAN10101','TAN10102','TAN10103'];
const rules=fs.readFileSync('firestore.rules','utf8');

test('Firestore mesLine é gerado da fonte canônica sem alterar identidades',()=>{
  assert.deepEqual([...LINE_IDS],EXACT_LINES);
  const block=renderFirestoreMesLineBlock();
  assert.equal(block.includes("['TAN10101', 'TAN10102', 'TAN10103']"),true);
  assert.equal(block.includes('TAN10104'),false);
  assert.equal(block.includes('Linha 1'),false);
});

test('Rules contém exatamente um bloco gerado e está em sync com o registry',()=>{
  assert.equal(rules.split(FIRESTORE_OPERATIONAL_REGISTRY_BEGIN).length-1,1);
  assert.equal(rules.split(FIRESTORE_OPERATIONAL_REGISTRY_END).length-1,1);
  assert.equal(firestoreOperationalRegistryCheck(rules),true);
  assert.equal(replaceFirestoreMesLineBlock(rules),rules);
});

test('gerador corrige drift simulado sem inferir por label amigável',()=>{
  const drift=rules.replace("['TAN10101', 'TAN10102', 'TAN10103']","['TAN10101', 'TAN10103']");
  assert.equal(firestoreOperationalRegistryCheck(drift),false);
  const fixed=replaceFirestoreMesLineBlock(drift);
  assert.equal(fixed,rules);
  assert.equal(fixed.includes('Linha 1'),false);
});
