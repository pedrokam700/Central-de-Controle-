// Read committed reference code only; never checkout another user branch or
// import a builder. Relative imports resolve to unchanged policy modules.
import {execFileSync} from 'node:child_process';
export async function reference89(relative){
 const source=execFileSync('git',['show','b8a2b1e00193e2d5493d0fd14bfcbf41e89087ca:'+relative],{encoding:'utf8'});
 const directory=new URL('../../'+relative,import.meta.url);
 const resolved=source.replace(/from\s*(['"])(\.[^'"]+)\1/g,(_,quote,specifier)=>'from '+JSON.stringify(new URL(specifier,directory).href));
 return import('data:text/javascript;base64,'+Buffer.from(resolved).toString('base64'));
}
