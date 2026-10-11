import fs from 'node:fs';
import {LINE_IDS} from '../ames/data/operational-registry.mjs';

export const FIRESTORE_OPERATIONAL_REGISTRY_BEGIN='    // CENTRAL_OPERATIONAL_REGISTRY_BEGIN — generated from ames/data/operational-registry.mjs';
export const FIRESTORE_OPERATIONAL_REGISTRY_END='    // CENTRAL_OPERATIONAL_REGISTRY_END';

const quote=value=>`'${String(value).replaceAll("'","\\'")}'`;

export function renderFirestoreMesLineBlock(){
  if(!Array.isArray(LINE_IDS)||!LINE_IDS.length)throw new Error('Operational registry must expose at least one enabled MES line');
  const unique=[...new Set(LINE_IDS)];
  if(unique.length!==LINE_IDS.length)throw new Error('Operational registry contains duplicate MES line IDs');
  for(const line of unique)if(!/^TAN\d{5}$/.test(line))throw new Error('Invalid MES line identity in operational registry');
  return [
    FIRESTORE_OPERATIONAL_REGISTRY_BEGIN,
    '    function mesLine(lineId) {',
    `      return lineId in [${unique.map(quote).join(', ')}];`,
    '    }',
    FIRESTORE_OPERATIONAL_REGISTRY_END
  ].join('\n');
}

export function replaceFirestoreMesLineBlock(source){
  const generated=renderFirestoreMesLineBlock();
  const begin=source.indexOf(FIRESTORE_OPERATIONAL_REGISTRY_BEGIN);
  const end=source.indexOf(FIRESTORE_OPERATIONAL_REGISTRY_END);
  if(begin>=0||end>=0){
    if(begin<0||end<begin)throw new Error('Malformed generated operational registry block in Firestore Rules');
    if(source.indexOf(FIRESTORE_OPERATIONAL_REGISTRY_BEGIN,begin+1)>=0||source.indexOf(FIRESTORE_OPERATIONAL_REGISTRY_END,end+1)>=0)throw new Error('Duplicate generated operational registry markers');
    return source.slice(0,begin)+generated+source.slice(end+FIRESTORE_OPERATIONAL_REGISTRY_END.length);
  }
  const legacy=/    function mesLine\(lineId\) \{\n      return lineId in \[[^\n]+\];\n    \}/g;
  const matches=[...source.matchAll(legacy)];
  if(matches.length!==1)throw new Error(`Expected exactly one legacy mesLine block, found ${matches.length}`);
  return source.slice(0,matches[0].index)+generated+source.slice(matches[0].index+matches[0][0].length);
}

export function firestoreOperationalRegistryCheck(source){
  return source.includes(FIRESTORE_OPERATIONAL_REGISTRY_BEGIN)
    && source.includes(FIRESTORE_OPERATIONAL_REGISTRY_END)
    && replaceFirestoreMesLineBlock(source)===source;
}

if(import.meta.url===new URL('file://'+process.argv[1]).href){
  const mode=process.argv[2]||'--check';
  const path='firestore.rules';
  const current=fs.readFileSync(path,'utf8');
  const next=replaceFirestoreMesLineBlock(current);
  if(mode==='--write'){fs.writeFileSync(path,next);console.log('Firestore operational registry block generated from canonical registry');}
  else if(mode==='--check'){if(next!==current||!firestoreOperationalRegistryCheck(current)){console.error('Firestore operational registry block is stale; run --write');process.exit(1);}console.log('Firestore operational registry block matches canonical registry');}
  else throw new Error('Use --check or --write');
}
