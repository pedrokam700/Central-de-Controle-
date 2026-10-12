import fs from 'node:fs';
const path='sw.js';
const text=fs.readFileSync(path,'utf8');
const anchor="BASE+'root-entry.js',BASE+'core/offline-outbox.mjs'";
const replacement="BASE+'root-entry.js',BASE+'core/offline-readiness.mjs',BASE+'core/firebase-sdk-preparation.mjs',BASE+'core/offline-outbox.mjs'";
const count=text.split(anchor).length-1;
if(count!==1)throw new Error(`expected one service-worker precache anchor, found ${count}`);
if(text.includes("BASE+'core/firebase-sdk-preparation.mjs'"))throw new Error('firebase sdk preparation already precached unexpectedly');
const next=text.replace(anchor,replacement);
for(const asset of ["BASE+'core/offline-readiness.mjs'","BASE+'core/firebase-sdk-preparation.mjs'"]){if(!next.includes(asset))throw new Error(`missing patched asset ${asset}`);}
fs.writeFileSync(path,next);
console.log('PASS: offline readiness dependency chain added to static precache');
