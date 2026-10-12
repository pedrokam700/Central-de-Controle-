import fs from 'node:fs';

const path='scripts/ames-rules.emulator.mjs';
const text=fs.readFileSync(path,'utf8');
const invalid="  await assertFails(setDoc(fencedOwnerRef,{...fencedHead,snapshot_revision:2,collector_fence:undefined},{merge:false}));\n";
const realDowngrade="  const {collector_fence:ignoredFence,...unfencedHead}=fencedHead2;\n  await assertFails(setDoc(fencedOwnerRef,{...unfencedHead,snapshot_revision:2}));";
const count=text.split(invalid).length-1;
if(count!==1)throw new Error(`expected exactly one invalid undefined-field assertion, found ${count}`);
if(!text.includes(realDowngrade))throw new Error('real Firestore Rules unfenced downgrade proof is missing');
const next=text.replace(invalid,'');
if(next.includes('collector_fence:undefined'))throw new Error('undefined collector_fence test survived patch');
if(!next.includes(realDowngrade))throw new Error('real downgrade proof was changed');
fs.writeFileSync(path,next);
console.log('PASS: removed SDK-invalid undefined field assertion; real Rules downgrade proof preserved');
