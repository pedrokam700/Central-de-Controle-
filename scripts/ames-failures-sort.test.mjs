import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sortFailureGroups} from '../ames/console-legacy-parity.mjs';

const source=fs.readFileSync(new URL('../ames/console-legacy-parity.mjs',import.meta.url),'utf8');
const groups=[
  {name:'Beta',count:3},
  {name:'Árvore',count:1},
  {name:'Gamma',count:2},
];

test('Failures grouped list defaults to occurrence count descending',()=>{
  assert.deepEqual(sortFailureGroups(groups).map(x=>x.name),['Beta','Gamma','Árvore']);
  assert.match(source,/sort='count_desc'/);
});

test('Failures grouped list supports all four requested sort modes',()=>{
  assert.deepEqual(sortFailureGroups(groups,'count_asc').map(x=>x.name),['Árvore','Gamma','Beta']);
  assert.deepEqual(sortFailureGroups(groups,'failure_asc').map(x=>x.name),['Árvore','Beta','Gamma']);
  assert.deepEqual(sortFailureGroups(groups,'failure_desc').map(x=>x.name),['Gamma','Beta','Árvore']);
  assert.match(source,/Ocorrências: maior → menor/);
  assert.match(source,/Ocorrências: menor → maior/);
  assert.match(source,/Falha: A → Z/);
  assert.match(source,/Falha: Z → A/);
});

test('Failures selector drives grouped ordering instead of a disconnected detail sort',()=>{
  assert.match(source,/const groups=sortFailureGroups\(\[\.\.\.grouped\.values\(\)\],sort\)/);
  assert.match(source,/const groupRank=new Map\(groups\.map/);
  assert.match(source,/data-failure-sort/);
});
