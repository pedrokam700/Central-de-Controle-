import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const BUILD='15.1.13.48';
const firebaseConfig={
  apiKey:"AIzaSyBi8ll-uiEh9L9sPBXQZhqIbFxgLfnTjeM",
  authDomain:"central-de-controle-88962.firebaseapp.com",
  projectId:"central-de-controle-88962",
  storageBucket:"central-de-controle-88962.firebasestorage.app",
  messagingSenderId:"557459646371",
  appId:"1:557459646371:web:e5bfb77bfbcad6d50bdc16",
  measurementId:"G-J8RQMXQT4D"
};

// A ponte histórica podia manter senhas em controleFalhas.users.v1 e o app antigo
// ainda sabia compará-las. Preserve somente metadados legados; credenciais locais
// deixam de existir antes de app.js carregar. Firebase Auth é a única autoridade.
try{
  const key='controleFalhas.users.v1';
  const raw=localStorage.getItem(key);
  if(raw){
    const parsed=JSON.parse(raw);
    if(Array.isArray(parsed)){
      let changed=false;
      const sanitized=parsed.map(item=>{
        if(!item||typeof item!=='object'||Array.isArray(item))return item;
        if(!Object.prototype.hasOwnProperty.call(item,'password'))return item;
        changed=true;
        const {password,...rest}=item;
        return rest;
      });
      if(changed)localStorage.setItem(key,JSON.stringify(sanitized));
    }
  }
  window.__centralLegacyCredentialBridge='disabled';
}catch(error){
  // Never restore or copy a corrupt legacy credential store. Firebase Auth can
  // still initialize normally; expose only a diagnostic flag, not its contents.
  window.__centralLegacyCredentialBridge='disabled_with_invalid_legacy_store';
  console.warn('[Central] Armazenamento legado inválido; credenciais locais não serão usadas.');
}

// Um único Firebase app/Auth. O bootstrap apenas configura persistência ANTES de
// app.js obter as instâncias. Primeiro login/primeiro carregamento ainda exigem
// internet; depois disso o navegador pode restaurar a sessão e dados já cacheados.
const app=getApps().length?getApp():initializeApp(firebaseConfig);
try{
  await setPersistence(getAuth(app),browserLocalPersistence);
  window.__centralAuthPersistence='local';
}catch(error){
  window.__centralAuthPersistence='default-fallback';
  window.__centralAuthPersistenceError=String(error?.code||error?.message||error);
  console.warn('[Central] Persistência explícita do Auth indisponível:',error);
}

try{
  initializeFirestore(app,{
    localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})
  });
  window.__centralFirestoreCache='persistent';
}catch(error){
  // IndexedDB pode ser bloqueado por política do navegador/Modo Privado. Não impeça
  // a Central de abrir; o app seguirá com o cache padrão em memória e deixará o
  // estado explícito para diagnóstico.
  window.__centralFirestoreCache='memory-fallback';
  window.__centralFirestoreCacheError=String(error?.code||error?.message||error);
  console.warn('[Central] Cache Firestore persistente indisponível:',error);
}

try{
  await import(`./app.js?v=${BUILD}`);
}catch(error){
  window.__centralAppImportError=String(error?.message||error);
  console.error('[Central] app.js não carregou:',error);
  const status=document.querySelector('#authLoginStatus');
  const button=document.querySelector('#loginButton');
  if(status){
    status.textContent='A aplicação não carregou completamente. Verifique o cache/conexão e recarregue.';
    status.className='auth-status error';
  }
  if(button){button.disabled=true;button.textContent='Aplicação indisponível';}
  throw error;
}
