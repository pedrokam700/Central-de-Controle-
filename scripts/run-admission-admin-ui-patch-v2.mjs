import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

const original='scripts/apply-admission-admin-ui-patch.mjs';
const temp='scripts/.tmp-apply-admission-admin-ui-patch-v2.mjs';
let source=fs.readFileSync(original,'utf8');
const start=source.indexOf('const oldAdminRows=`');
const endMarker="app=replaceExactly(app,oldAdminRows,newAdminRows,'admin users table');";
const end=source.indexOf(endMarker,start);
if(start<0||end<0)throw new Error('admin table patch source anchors missing');
if(source.indexOf('const oldAdminRows=`',start+1)>=0)throw new Error('admin table patch source anchor duplicated');

const replacement=String.raw`function replaceDelimited(source,startAnchor,endAnchor,replacement,label){
  const start=source.indexOf(startAnchor);
  if(start<0)throw new Error(`${label}: start anchor not found`);
  if(source.indexOf(startAnchor,start+startAnchor.length)>=0)throw new Error(`${label}: start anchor is not unique`);
  const end=source.indexOf(endAnchor,start+startAnchor.length);
  if(end<0)throw new Error(`${label}: end anchor not found`);
  return source.slice(0,start)+replacement+source.slice(end+endAnchor.length);
}
const adminRowsStart="      const isAdmin = currentAccount.role === 'admin';\n      const adminSection = document.querySelector('#adminUsersSection');";
const adminRowsEnd="        `).join('');\n      }";
const newAdminRows=`      const isAdmin = canAdminister();\n      const adminSection = document.querySelector('#adminUsersSection');\n      adminSection.classList.toggle('hidden', !isAdmin);\n\n      if (isAdmin) {\n        document.querySelector('#adminUserRows').innerHTML = users.map(adminUserRowHtml).join('');\n      }`;
app=replaceDelimited(app,adminRowsStart,adminRowsEnd,newAdminRows,'admin users table');`;

source=source.slice(0,start)+replacement+source.slice(end+endMarker.length);
fs.writeFileSync(temp,source);
try{
  await import(pathToFileURL(process.cwd()+'/'+temp).href+'?v='+Date.now());
}finally{
  fs.rmSync(temp,{force:true});
}
