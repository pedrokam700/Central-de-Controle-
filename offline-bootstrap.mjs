import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

// A Central continua usando o mesmo Firebase app/Auth. Este bootstrap existe apenas
// para que o Firestore seja inicializado com cache persistente ANTES do app.js chamar
// getFirestore(app). Assim, após um primeiro acesso online bem-sucedido, dados já
// sincronizados podem continuar disponíveis durante perda de internet/reinício.
const app=getApps().length?getApp():initializeApp(firebaseConfig);
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
