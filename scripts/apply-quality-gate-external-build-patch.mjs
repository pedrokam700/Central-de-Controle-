import fs from 'node:fs';

function replaceExactly(source,oldText,newText,label){
  const first=source.indexOf(oldText);
  if(first<0)throw new Error(`${label}: anchor not found`);
  if(source.indexOf(oldText,first+oldText.length)>=0)throw new Error(`${label}: anchor is not unique`);
  return source.slice(0,first)+newText+source.slice(first+oldText.length);
}

let source=fs.readFileSync('scripts/quality-gate.mjs','utf8');
source=replaceExactly(
  source,
  "  'index.html',\n  'app.js',",
  "  'index.html',\n  'cora-build-guard.js',\n  'app.js',",
  'required external build guard'
);
source=replaceExactly(
  source,
  "const index = read('index.html');\nconst app = read('app.js');",
  "const index = read('index.html');\nconst buildGuard = read('cora-build-guard.js');\nconst app = read('app.js');",
  'read external build guard'
);
source=replaceExactly(
  source,
  "const buildMatch = index.match(/\\bconst\\s+BUILD\\s*=\\s*['\"]([^'\"]+)['\"]/);\nconst build = buildMatch && buildMatch[1];\nassertCheck(Boolean(build), 'index.html: BUILD detectado', 'index.html: BUILD não detectado');",
  "const buildMatch = buildGuard.match(/\\bconst\\s+BUILD\\s*=\\s*['\"]([^'\"]+)['\"]/);\nconst build = buildMatch && buildMatch[1];\nassertCheck(Boolean(build), 'cora-build-guard.js: BUILD detectado', 'cora-build-guard.js: BUILD não detectado');",
  'BUILD authority'
);
for(const required of ["'cora-build-guard.js'","const buildGuard = read('cora-build-guard.js');","cora-build-guard.js: BUILD detectado"]){
  if(!source.includes(required))throw new Error('quality gate integration missing: '+required);
}
if(source.includes("const buildMatch = index.match(/\\bconst\\s+BUILD"))throw new Error('quality gate still reads BUILD from index');
fs.writeFileSync('scripts/quality-gate.mjs',source);
console.log('PASS quality gate BUILD authority moved to external guard');
