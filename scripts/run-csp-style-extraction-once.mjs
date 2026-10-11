import fs from 'node:fs';

await import('./patch-csp-style-extraction.mjs');

const file='scripts/ames-csp-style-extraction.test.mjs';
let text=fs.readFileSync(file,'utf8');
const oldLine='const links=[...sourceIndex.matchAll(/<link\\b[^>]*data-extracted-style=\\"([^\\"]+)\\"[^>]*href=\\"\\/Central-de-Controle-\\/(csp-inline-[^\\"?]+\\.css)\\?v=15\\.1\\.13\\.48\\"[^>]*>/gi)].map(match=>({id:match[1],file:match[2]}));';
const newLine='const links=[...sourceIndex.matchAll(/<link\\b(?=[^>]*href=\\"\\/Central-de-Controle-\\/(csp-inline-[^\\"?]+\\.css)\\?v=15\\.1\\.13\\.48\\")(?=[^>]*data-extracted-style=\\"([^\\"]+)\\")[^>]*>/gi)].map(match=>({id:match[2],file:match[1]}));';
if(!text.includes(oldLine))throw new Error('generated CSP style test anchor changed');
if(text.indexOf(oldLine)!==text.lastIndexOf(oldLine))throw new Error('generated CSP style test anchor duplicated');
text=text.replace(oldLine,newLine);
fs.writeFileSync(file,text);
