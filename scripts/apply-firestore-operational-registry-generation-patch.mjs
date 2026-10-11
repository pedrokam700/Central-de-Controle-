import fs from 'node:fs';
import assert from 'node:assert/strict';
import {LINE_IDS} from '../ames/data/operational-registry.mjs';

const EXACT_LINES=['TAN10101','TAN10102','TAN10103'];
assert.deepEqual([...LINE_IDS],EXACT_LINES,'refuse any operational line identity drift');

function replaceExactly(source,oldText,newText,label){
  const first=source.indexOf(oldText);
  if(first<0)throw new Error(`${label}: anchor not found`);
  if(source.indexOf(oldText,first+oldText.length)>=0)throw new Error(`${label}: anchor is not unique`);
  return source.slice(0,first)+newText+source.slice(first+oldText.length);
}

const generator=`import fs from 'node:fs';\nimport {LINE_IDS} from '../ames/data/operational-registry.mjs';\n\nexport const FIRESTORE_OPERATIONAL_REGISTRY_BEGIN='    // CENTRAL_OPERATIONAL_REGISTRY_BEGIN — generated from ames/data/operational-registry.mjs';\nexport const FIRESTORE_OPERATIONAL_REGISTRY_END='    // CENTRAL_OPERATIONAL_REGISTRY_END';\n\nconst quote=value=>\`'\${String(value).replaceAll("'","\\\\'")}'\`;\n\nexport function renderFirestoreMesLineBlock(){\n  if(!Array.isArray(LINE_IDS)||!LINE_IDS.length)throw new Error('Operational registry must expose at least one enabled MES line');\n  const unique=[...new Set(LINE_IDS)];\n  if(unique.length!==LINE_IDS.length)throw new Error('Operational registry contains duplicate MES line IDs');\n  for(const line of unique)if(!/^TAN\\d{5}$/.test(line))throw new Error('Invalid MES line identity in operational registry');\n  return [\n    FIRESTORE_OPERATIONAL_REGISTRY_BEGIN,\n    '    function mesLine(lineId) {',\n    \`      return lineId in [\${unique.map(quote).join(', ')}];\`,\n    '    }',\n    FIRESTORE_OPERATIONAL_REGISTRY_END\n  ].join('\\n');\n}\n\nexport function replaceFirestoreMesLineBlock(source){\n  const generated=renderFirestoreMesLineBlock();\n  const begin=source.indexOf(FIRESTORE_OPERATIONAL_REGISTRY_BEGIN);\n  const end=source.indexOf(FIRESTORE_OPERATIONAL_REGISTRY_END);\n  if(begin>=0||end>=0){\n    if(begin<0||end<begin)throw new Error('Malformed generated operational registry block in Firestore Rules');\n    if(source.indexOf(FIRESTORE_OPERATIONAL_REGISTRY_BEGIN,begin+1)>=0||source.indexOf(FIRESTORE_OPERATIONAL_REGISTRY_END,end+1)>=0)throw new Error('Duplicate generated operational registry markers');\n    return source.slice(0,begin)+generated+source.slice(end+FIRESTORE_OPERATIONAL_REGISTRY_END.length);\n  }\n  const legacy=/    function mesLine\\(lineId\\) \\{\\n      return lineId in \\[[^\\n]+\\];\\n    \\}/g;\n  const matches=[...source.matchAll(legacy)];\n  if(matches.length!==1)throw new Error(\`Expected exactly one legacy mesLine block, found \${matches.length}\`);\n  return source.slice(0,matches[0].index)+generated+source.slice(matches[0].index+matches[0][0].length);\n}\n\nexport function firestoreOperationalRegistryCheck(source){\n  return source.includes(FIRESTORE_OPERATIONAL_REGISTRY_BEGIN)\n    && source.includes(FIRESTORE_OPERATIONAL_REGISTRY_END)\n    && replaceFirestoreMesLineBlock(source)===source;\n}\n\nif(import.meta.url===new URL('file://'+process.argv[1]).href){\n  const mode=process.argv[2]||'--check';\n  const path='firestore.rules';\n  const current=fs.readFileSync(path,'utf8');\n  const next=replaceFirestoreMesLineBlock(current);\n  if(mode==='--write'){fs.writeFileSync(path,next);console.log('Firestore operational registry block generated from canonical registry');}\n  else if(mode==='--check'){if(next!==current||!firestoreOperationalRegistryCheck(current)){console.error('Firestore operational registry block is stale; run --write');process.exit(1);}console.log('Firestore operational registry block matches canonical registry');}\n  else throw new Error('Use --check or --write');\n}\n`;
fs.writeFileSync('scripts/firestore-operational-registry.mjs',generator);

let rules=fs.readFileSync('firestore.rules','utf8');
const oldBlock=`    function mesLine(lineId) {\n      return lineId in ['TAN10101', 'TAN10102', 'TAN10103'];\n    }`;
const generatedBlock=[
  '    // CENTRAL_OPERATIONAL_REGISTRY_BEGIN — generated from ames/data/operational-registry.mjs',
  '    function mesLine(lineId) {',
  `      return lineId in [${LINE_IDS.map(line=>`'${line}'`).join(', ')}];`,
  '    }',
  '    // CENTRAL_OPERATIONAL_REGISTRY_END'
].join('\n');
rules=replaceExactly(rules,oldBlock,generatedBlock,'legacy mesLine block');
fs.writeFileSync('firestore.rules',rules);

const test=`import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport fs from 'node:fs';\nimport {LINE_IDS} from '../ames/data/operational-registry.mjs';\nimport {renderFirestoreMesLineBlock,replaceFirestoreMesLineBlock,firestoreOperationalRegistryCheck,FIRESTORE_OPERATIONAL_REGISTRY_BEGIN,FIRESTORE_OPERATIONAL_REGISTRY_END} from './firestore-operational-registry.mjs';\n\nconst EXACT_LINES=['TAN10101','TAN10102','TAN10103'];\nconst rules=fs.readFileSync('firestore.rules','utf8');\n\ntest('Firestore mesLine é gerado da fonte canônica sem alterar identidades',()=>{\n  assert.deepEqual([...LINE_IDS],EXACT_LINES);\n  const block=renderFirestoreMesLineBlock();\n  assert.equal(block.includes("['TAN10101', 'TAN10102', 'TAN10103']"),true);\n  assert.equal(block.includes('TAN10104'),false);\n  assert.equal(block.includes('Linha 1'),false);\n});\n\ntest('Rules contém exatamente um bloco gerado e está em sync com o registry',()=>{\n  assert.equal(rules.split(FIRESTORE_OPERATIONAL_REGISTRY_BEGIN).length-1,1);\n  assert.equal(rules.split(FIRESTORE_OPERATIONAL_REGISTRY_END).length-1,1);\n  assert.equal(firestoreOperationalRegistryCheck(rules),true);\n  assert.equal(replaceFirestoreMesLineBlock(rules),rules);\n});\n\ntest('gerador corrige drift simulado sem inferir por label amigável',()=>{\n  const drift=rules.replace("['TAN10101', 'TAN10102', 'TAN10103']","['TAN10101', 'TAN10103']");\n  assert.equal(firestoreOperationalRegistryCheck(drift),false);\n  const fixed=replaceFirestoreMesLineBlock(drift);\n  assert.equal(fixed,rules);\n  assert.equal(fixed.includes('Linha 1'),false);\n});\n`;
fs.writeFileSync('scripts/ames-firestore-operational-registry-generation.test.mjs',test);

console.log('PASS deterministic Firestore operational registry generation patch');
