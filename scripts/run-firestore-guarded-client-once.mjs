import fs from 'node:fs';

await import('./patch-firestore-guarded-client.mjs');

const generated='scripts/ames-capability-write-ui.test.mjs';
let text=fs.readFileSync(generated,'utf8');
for(const [from,to,label] of [
  [String.raw`assert.match(app,/getActorUid:()=>auth\.currentUser\?\.uid \|\| currentAuthUser\?\.uid \|\| ['"]['"]/);`,String.raw`assert.match(app,/getActorUid:\(\)=>auth\.currentUser\?\.uid \|\| currentAuthUser\?\.uid \|\| ['"]['"]/);`,'getActorUid'],
  [String.raw`assert.match(app,/getCapabilities:()=>currentAccount\?\.capabilities\|\|null/);`,String.raw`assert.match(app,/getCapabilities:\(\)=>currentAccount\?\.capabilities\|\|null/);`,'getCapabilities']
]){
  const count=text.split(from).length-1;
  if(count!==1)throw new Error(`expected one generated ${label} assertion, found ${count}`);
  text=text.replace(from,to);
}
fs.writeFileSync(generated,text);
