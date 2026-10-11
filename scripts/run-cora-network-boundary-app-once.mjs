import fs from 'node:fs';

await import('./patch-cora-network-boundary-app.mjs');

const file='scripts/ames-cora-network-boundary-app.test.mjs';
let text=fs.readFileSync(file,'utf8');
const old="  assert.match(fn,/approvedExternalOrigins:[]/);";
const replacement="  assert.ok(fn.includes('approvedExternalOrigins:[]'));";
const count=text.split(old).length-1;
if(count!==2)throw new Error(`expected two generated approvedExternalOrigins assertions, found ${count}`);
text=text.split(old).join(replacement);
fs.writeFileSync(file,text);
