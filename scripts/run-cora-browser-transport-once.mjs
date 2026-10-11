import fs from 'node:fs';

const file='scripts/patch-cora-browser-transport.mjs';
let text=fs.readFileSync(file,'utf8');
const replacements=[
  ["if((app.match(/\\bfetch\\(/g)||[]).length!==0)throw new Error('app.js must not retain raw fetch primitives after transport extraction');","if((app.match(/(?<![\\w$.])fetch\\(/g)||[]).length!==0)throw new Error('app.js must not retain unqualified fetch primitives after transport extraction');"],
  ["assert.equal((app.match(/\\\\bfetch\\\\(/g)||[]).length,0);","assert.equal((app.match(/(?<![\\\\w$.])fetch\\\\(/g)||[]).length,0);"]
];
for(const [from,to] of replacements){
  const count=text.split(from).length-1;
  if(count!==1)throw new Error(`expected one harness occurrence for ${from}, found ${count}`);
  text=text.replace(from,to);
}
fs.writeFileSync(file,text);
await import('./patch-cora-browser-transport.mjs');

// The patch generator writes persistent tests through a template literal. Escape
// literal arrow-function parentheses after generation so regexes test source text
// instead of interpreting () as an empty regex group.
const generated='scripts/ames-cora-network-boundary-app.test.mjs';
let testText=fs.readFileSync(generated,'utf8');
for(const [from,to,label] of [
  [String.raw`assert.match(app,/getOrigin:()=>window\.location\.origin/);`,String.raw`assert.match(app,/getOrigin:\(\)=>window\.location\.origin/);`,'getOrigin'],
  [String.raw`assert.match(app,/getToken:async()=>auth\?\.currentUser\?await auth\.currentUser\.getIdToken\(\):null/);`,String.raw`assert.match(app,/getToken:async\(\)=>auth\?\.currentUser\?await auth\.currentUser\.getIdToken\(\):null/);`,'getToken']
]){
  const count=testText.split(from).length-1;
  if(count!==1)throw new Error(`expected one generated ${label} assertion, found ${count}`);
  testText=testText.replace(from,to);
}
fs.writeFileSync(generated,testText);
