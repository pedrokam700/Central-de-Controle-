import fs from 'node:fs';

const file='scripts/patch-cora-direct-fetch-boundary.mjs';
let text=fs.readFileSync(file,'utf8');
const replacements=[
  ["directFetchCount!==10","directFetchCount!==12"],
  ["expected 10 fetch() calls before CORA direct-fetch hardening","expected 12 fetch() calls before CORA direct-fetch hardening"],
  ["remaining!==9","remaining!==11"],
  ["expected 9 remaining direct CORA fetches","expected 11 remaining direct CORA fetches"],
  ["guardedCalls!==10","guardedCalls!==12"],
  ["expected helper definition plus 9 guarded calls","expected helper definition plus 11 guarded calls"],
  [".length,10);",".length,12);"],
  ["raw_fetches_before:10,guarded_direct_requests:9","raw_fetches_before:12,guarded_direct_requests:11"]
];
for(const [from,to] of replacements){
  const count=text.split(from).length-1;
  if(count!==1)throw new Error(`expected one patch-harness occurrence for ${from}, found ${count}`);
  text=text.replace(from,to);
}
fs.writeFileSync(file,text);
await import('./patch-cora-direct-fetch-boundary.mjs');
