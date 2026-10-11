import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const ROOT=path.resolve('.');
const TEXT_EXT=new Set(['.html','.js','.mjs','.css','.webmanifest']);
const ROOT_FILES=['index.html','app.js','offline-bootstrap.mjs','styles.css','mobile.css','sw.js','manifest.webmanifest'];
const ROOT_DIRS=['ames','core'];
const LOOPBACK_HTTP=/^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/;
// A-MES is an explicitly approved factory/intranet reference, not a browser CDN
// dependency. Keep it visible in the inventory instead of hiding it, while every
// other non-loopback HTTP URL remains a hard blocker.
const APPROVED_OPERATIONAL_HTTP=[
  /^http:\/\/172\.29\.185\.215(?:\/asymes(?:[/?#]|$)|\/?)$/i
];

function collectFiles(){
  const files=[];
  for(const file of ROOT_FILES){if(fs.existsSync(file))files.push(file);}
  const walk=dir=>{
    if(!fs.existsSync(dir))return;
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
      const rel=path.join(dir,entry.name);
      if(entry.isDirectory())walk(rel);
      else if(TEXT_EXT.has(path.extname(entry.name)))files.push(rel);
    }
  };
  for(const dir of ROOT_DIRS)walk(dir);
  return [...new Set(files)].sort();
}

function normalizeOrigin(raw){
  try{return new URL(raw).origin;}catch{return null;}
}

function approvedOperationalHttp(raw){
  return APPROVED_OPERATIONAL_HTTP.some(pattern=>pattern.test(raw));
}

export function buildCspInventory(){
  const files=collectFiles();
  const origins=new Set(),insecureNonLocal=new Set(),operationalHttp=new Set();
  let inlineScripts=0,inlineStyles=0,evalLike=0,dynamicScripts=0;
  const evalFiles=[],inlineScriptFiles=[],inlineStyleFiles=[];
  const urlRegex=/(?:https?|wss?):\/\/[^\s"'`()<>\\]+/g;
  for(const file of files){
    const text=fs.readFileSync(file,'utf8');
    for(const match of text.matchAll(urlRegex)){
      const raw=match[0];
      const origin=normalizeOrigin(raw);
      if(origin)origins.add(origin);
      if(raw.startsWith('http://')&&!LOOPBACK_HTTP.test(raw)){
        if(approvedOperationalHttp(raw))operationalHttp.add(raw);
        else insecureNonLocal.add(raw);
      }
    }
    if(path.extname(file)==='.html'){
      const scripts=[...text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
      const count=scripts.filter(match=>!(/\bsrc\s*=/.test(match[1]||''))).length;
      if(count){inlineScripts+=count;inlineScriptFiles.push({file,count});}
      const styles=[...text.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi)].length;
      if(styles){inlineStyles+=styles;inlineStyleFiles.push({file,count:styles});}
    }
    const evalCount=(text.match(/\beval\s*\(/g)||[]).length+(text.match(/\bnew\s+Function\s*\(/g)||[]).length;
    if(evalCount){evalLike+=evalCount;evalFiles.push({file,count:evalCount});}
    dynamicScripts+=(text.match(/document\.createElement\s*\(\s*['"]script['"]\s*\)/g)||[]).length;
  }
  return {
    schema:'central-csp-inventory-v1',
    scanned_files:files.length,
    external_origins:[...origins].sort(),
    approved_operational_http_references:[...operationalHttp].sort(),
    insecure_non_local_urls:[...insecureNonLocal].sort(),
    inline_scripts:inlineScripts,
    inline_script_files:inlineScriptFiles,
    inline_styles:inlineStyles,
    inline_style_files:inlineStyleFiles,
    eval_like:evalLike,
    eval_files:evalFiles,
    dynamic_script_elements:dynamicScripts,
    blocking_csp_ready:inlineScripts===0&&evalLike===0&&insecureNonLocal.size===0,
    mode:'inventory_only'
  };
}

const invoked=process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href;
if(invoked)process.stdout.write(JSON.stringify(buildCspInventory(),null,2)+'\n');
