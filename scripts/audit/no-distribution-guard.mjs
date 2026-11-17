// Test preload: refuse distribution commands and .zip writes before execution.
import cp from 'node:child_process';
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
export function assertNoDistribution(command,args=[]){
 const parts=[command,...(Array.isArray(args)?args:[])].filter(x=>typeof x==='string');
 if(parts.some(value=>/(?:^|[\\/\s])(?:build-[\w-]+\.(?:py|mjs)|stage-vercel\.mjs|capture-r12-engine\.py|harden-[\w-]*package\.py)(?:$|\s)/.test(value)))throw Error('NO_DISTRIBUTION: builder command refused');
}
for(const method of ['spawn','spawnSync','execFile','execFileSync']){
 const original=cp[method];cp[method]=function(command,args,...rest){assertNoDistribution(command,args);return original.call(this,command,args,...rest);};
}
for(const method of ['exec','execSync']){
 const original=cp[method];cp[method]=function(command,...rest){assertNoDistribution(command);return original.call(this,command,...rest);};
}
for(const method of ['writeFile','writeFileSync','createWriteStream']){
 const original=fs[method];fs[method]=function(file,...rest){if(String(file).toLowerCase().endsWith('.zip'))throw Error('NO_DISTRIBUTION: ZIP write refused');return original.call(this,file,...rest);};
}
syncBuiltinESMExports();
