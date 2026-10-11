import fs from 'node:fs';

await import('./patch-csp-style-extraction.mjs');

const file='scripts/ames-csp-style-extraction.test.mjs';
const lines=fs.readFileSync(file,'utf8').split('\n');
const matches=[];
for(let i=0;i<lines.length;i++){
  if(lines[i].startsWith('const links=[...sourceIndex.matchAll('))matches.push(i);
}
if(matches.length!==1)throw new Error(`generated CSP style test link parser count changed: ${matches.length}`);
lines[matches[0]]='const links=[...sourceIndex.matchAll(/<link\\b(?=[^>]*href="\\/Central-de-Controle-\\/(csp-inline-[^"?]+\\.css)\\?v=15\\.1\\.13\\.48")(?=[^>]*data-extracted-style="([^"]+)")[^>]*>/gi)].map(match=>({id:match[2],file:match[1]}));';
fs.writeFileSync(file,lines.join('\n'));
