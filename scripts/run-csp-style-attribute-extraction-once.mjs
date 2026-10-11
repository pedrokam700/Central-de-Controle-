import fs from 'node:fs';

await import('./patch-csp-style-attributes.mjs');

const file='index.html';
let html=fs.readFileSync(file,'utf8');
const old='data-extracted-style="inline-style-attributes"';
const next='data-extracted-style-attributes="true"';
if((html.match(/data-extracted-style="inline-style-attributes"/g)||[]).length!==1){
  throw new Error('style-attribute stylesheet metadata anchor changed');
}
html=html.replace(old,next);
fs.writeFileSync(file,html);
