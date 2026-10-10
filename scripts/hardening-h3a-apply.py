from pathlib import Path

app_path=Path('app.js')
app=app_path.read_text(encoding='utf-8')

import_anchor="    import {createOfflineOutbox,createBrowserOutboxStorage} from './core/offline-outbox.mjs';\n"
import_line="    import {sanitizeLegacyUserMetadata,findLegacyUserMetadata} from './core/auth-hardening.mjs';\n"
if import_line not in app:
    if app.count(import_anchor)!=1:raise SystemExit('H3A import anchor mismatch')
    app=app.replace(import_anchor,import_anchor+import_line,1)

old_legacy="""    function legacyUsers() {
      try { return JSON.parse(localStorage.getItem('controleFalhas.users.v1') || '[]') || []; }
      catch { return []; }
    }
"""
new_legacy="""    const legacyUserMetadata=sanitizeLegacyUserMetadata(localStorage);
    function legacyUsers() { return legacyUserMetadata; }
"""
if app.count(old_legacy)!=1:raise SystemExit(f'H3A legacyUsers mismatch: {app.count(old_legacy)}')
app=app.replace(old_legacy,new_legacy,1)

old_existing="role: data.role || (isAdminEmail ? 'admin' : legacy?.role || 'user'),"
new_existing="role: data.role || (isAdminEmail ? 'admin' : 'user'),"
if app.count(old_existing)!=1:raise SystemExit(f'H3A existing profile role mismatch: {app.count(old_existing)}')
app=app.replace(old_existing,new_existing,1)
old_new="role: isAdminEmail ? 'admin' : (legacy?.role || 'user'),"
new_new="role: isAdminEmail ? 'admin' : 'user',"
if app.count(old_new)!=1:raise SystemExit(f'H3A new profile role mismatch: {app.count(old_new)}')
app=app.replace(old_new,new_new,1)

old_login="""          let credential;
          try {
            credential = await signInWithEmailAndPassword(auth, email, password);
          } catch (error) {
            const legacy = legacyUsers().find(u => String(u.email || '').toLowerCase() === email);
            if (['auth/user-not-found','auth/invalid-credential','auth/invalid-login-credentials'].includes(error?.code)
                && legacy && legacy.password === password) {
              credential = await createUserWithEmailAndPassword(auth, email, password);
            } else {
              throw error;
            }
          }
          const legacy = legacyUsers().find(u => String(u.email || '').toLowerCase() === email);
"""
new_login="""          const credential = await signInWithEmailAndPassword(auth, email, password);
          const legacy = findLegacyUserMetadata(legacyUsers(), email);
"""
if app.count(old_login)!=1:raise SystemExit(f'H3A login fallback mismatch: {app.count(old_login)}')
app=app.replace(old_login,new_login,1)

old_auth="const legacyUser = legacyUsers().find(u => (u.email || '').toLowerCase() === (firebaseUser.email || '').toLowerCase());"
new_auth="const legacyUser = findLegacyUserMetadata(legacyUsers(), firebaseUser.email);"
if app.count(old_auth)!=1:raise SystemExit(f'H3A auth bootstrap legacy lookup mismatch: {app.count(old_auth)}')
app=app.replace(old_auth,new_auth,1)

for forbidden in ('legacy.password === password','legacy?.role ||','legacyUsers().find('):
    if forbidden in app:raise SystemExit('H3A forbidden legacy authority remains: '+forbidden)
for required in ("./core/auth-hardening.mjs",'sanitizeLegacyUserMetadata(localStorage)','findLegacyUserMetadata(legacyUsers(), email)','await signInWithEmailAndPassword(auth, email, password)'):
    if required not in app:raise SystemExit('H3A required behavior missing: '+required)
app_path.write_text(app,encoding='utf-8')

sw_path=Path('sw.js')
sw=sw_path.read_text(encoding='utf-8')
old="BASE+'core/offline-outbox.mjs'"
new="BASE+'core/offline-outbox.mjs',BASE+'core/auth-hardening.mjs'"
if "BASE+'core/auth-hardening.mjs'" not in sw:
    if sw.count(old)!=1:raise SystemExit('H3A SW anchor mismatch')
    sw=sw.replace(old,new,1)
if sw.count("BASE+'core/auth-hardening.mjs'")!=1:raise SystemExit('H3A SW cache mismatch')
sw_path.write_text(sw,encoding='utf-8')
print('H3A app.js + sw.js migration applied exactly once')
