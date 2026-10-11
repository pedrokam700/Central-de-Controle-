(()=>{
  const BUILD='15.1.13.48';
  document.documentElement.classList.add('cora-boot-pending');
  const key='cora.build.active';
  const finish=()=>document.documentElement.classList.remove('cora-boot-pending');
  const current=localStorage.getItem(key);
  if(current===BUILD){ finish(); return; }
  localStorage.setItem(key,BUILD);
  Promise.allSettled([
    'caches' in window ? caches.keys().then(keys=>Promise.all(keys.map(k=>caches.delete(k)))) : Promise.resolve(),
    'serviceWorker' in navigator ? navigator.serviceWorker.getRegistrations().then(rs=>Promise.all(rs.map(r=>r.unregister()))) : Promise.resolve()
  ]).finally(()=>location.reload());
})();
