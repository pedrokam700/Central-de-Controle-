import fs from 'node:fs';

let app=fs.readFileSync('app.js','utf8');
let sw=fs.readFileSync('sw.js','utf8');

const admissionImport="    import {buildSignupProfile,evaluateSessionAdmission} from './core/session-admission.mjs';";
if((app.split(admissionImport).length-1)!==1)throw new Error('session admission import anchor changed');
app=app.replace(admissionImport,`${admissionImport}\n    import {createUserProfileService} from './core/user-profile-service.mjs';`);

const nowAnchor="    const now = () => new Date().toISOString();";
if((app.split(nowAnchor).length-1)!==1)throw new Error('now anchor changed');
const serviceBlock=`${nowAnchor}\n    const userProfileService=createUserProfileService({\n      db,doc,getDoc,setDoc,withTimeout,buildSignupProfile,now\n    });`;
app=app.replace(nowAnchor,serviceBlock);

const startMarker='    async function ensureUserProfile(firebaseUser, legacy = null) {';
const endMarker='    async function migrateLegacyDataOnce() {';
if((app.split(startMarker).length-1)!==1)throw new Error('ensureUserProfile start marker changed');
if((app.split(endMarker).length-1)!==1)throw new Error('ensureUserProfile end marker changed');
const start=app.indexOf(startMarker),end=app.indexOf(endMarker,start);
if(end<=start)throw new Error('ensureUserProfile block order invalid');
const oldBlock=app.slice(start,end);
for(const required of ["doc(db, 'users', firebaseUser.uid)","withTimeout(getDoc(ref), 12000, 'Validação do perfil')","buildSignupProfile({","withTimeout(setDoc(ref, profile), 12000, 'Criação do perfil')"]){
  if(!oldBlock.includes(required))throw new Error(`ensureUserProfile contract changed: ${required}`);
}
const delegate="    async function ensureUserProfile(firebaseUser,legacy=null){ return userProfileService.ensure(firebaseUser,legacy); }\n\n";
app=app.slice(0,start)+delegate+app.slice(end);

if((app.match(/createUserProfileService/g)||[]).length!==2)throw new Error('user profile service import/initialization contract changed');
if((app.match(/userProfileService\.ensure\(/g)||[]).length!==1)throw new Error('ensureUserProfile delegation contract changed');

const swAnchor="BASE+'core/session-admission.mjs',";
if((sw.split(swAnchor).length-1)!==1)throw new Error('service worker session admission cache anchor changed');
if(sw.includes("core/user-profile-service.mjs"))throw new Error('user profile service already cached');
sw=sw.replace(swAnchor,`${swAnchor}BASE+'core/user-profile-service.mjs',`);

fs.writeFileSync('app.js',app);
fs.writeFileSync('sw.js',sw);

fs.writeFileSync('scripts/ames-session-admission-app.test.mjs',`import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport fs from 'node:fs';\n\nconst app=fs.readFileSync('app.js','utf8');\nconst sw=fs.readFileSync('sw.js','utf8');\n\ntest('app usa contrato V2 de cadastro e admissão sem auto-admin por e-mail',()=>{\n  assert.match(app,/\\.\\/core\\/session-admission\\.mjs/);\n  assert.match(app,/buildSignupProfile\\(\\{ uid: credential\\.user\\.uid, email, name \\}\\)/);\n  assert.match(app,/evaluateSessionAdmission\\(\\{ firebaseUser, profile \\}\\)/);\n  assert.doesNotMatch(app,/role: email === ADMIN_EMAIL \\? 'admin' : 'user'/);\n  assert.doesNotMatch(app,/await finishLogin\\(credential\\.user\\)/);\n});\n\ntest('perfil ausente delega criação V2 ao serviço de perfil e sessão inválida falha fechada',()=>{\n  assert.match(app,/import \\{createUserProfileService\\} from ['\"]\\.\\/core\\/user-profile-service\\.mjs['\"]/);\n  assert.match(app,/const userProfileService=createUserProfileService\\(\\{[\\s\\S]*db,doc,getDoc,setDoc,withTimeout,buildSignupProfile,now[\\s\\S]*\\}\\)/);\n  assert.match(app,/async function ensureUserProfile\\(firebaseUser,legacy=null\\)\\{ return userProfileService\\.ensure\\(firebaseUser,legacy\\); \\}/);\n  assert.match(app,/try \\{ await signOut\\(auth\\); \\} catch \\{\\}/);\n  assert.match(app,/admissionState: admission\\.admission_state/);\n  assert.match(app,/accessLevel: admission\\.access_level/);\n  assert.match(app,/capabilities: admission\\.capabilities/);\n});\n\ntest('publicação MES e refresh da sessão obedecem capabilities',()=>{\n  assert.match(app,/if \\(admission\\.capabilities\\.publish_mes\\) startMesSync\\(firebaseUser\\.uid\\)/);\n  assert.match(app,/hadMesPublish = Boolean\\(currentAccount\\.capabilities\\?\\.publish_mes\\)/);\n  assert.match(app,/profile: \\{ \\.\\.\\.me, uid: me\\.uid \\|\\| me\\.docId \\}/);\n  assert.match(app,/if \\(!admission\\.capabilities\\.publish_mes && hadMesPublish\\) mesSync\\?\\.stop\\(\\)/);\n});\n\ntest('cadastro bloqueia corrida do auth observer e explica aprovação',()=>{\n  assert.match(app,/registrationInProgress = true/);\n  assert.match(app,/if \\(firebaseUser && registrationInProgress\\) return/);\n  assert.match(app,/Confirme seu e-mail corporativo e aguarde a aprovação de um administrador/);\n});\n\ntest('contratos de admissão e serviço de perfil ficam disponíveis no shell offline',()=>{\n  assert.match(sw,/core\\/access-policy\\.mjs/);\n  assert.match(sw,/core\\/session-admission\\.mjs/);\n  assert.match(sw,/core\\/user-profile-service\\.mjs/);\n});\n`);

console.log(JSON.stringify({module:'core/user-profile-service.mjs',ensure_user_profile_delegated:true,finish_login_unchanged:true,behavior_change:false},null,2));
