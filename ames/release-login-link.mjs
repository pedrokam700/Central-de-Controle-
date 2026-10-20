import {discoverOfficialRelease} from './release-discovery.mjs';

// Read-only enhancement on login. If GitHub is offline/unreachable, the
// factory-approved pinned link in index.html remains usable.
export async function refreshPublicInstallLink(doc=document,fetcher=fetch){
  const anchor=doc.getElementById('approvedCleanLoginDownload');
  if(!anchor)return;
  try{
    const rel=await discoverOfficialRelease(undefined,fetcher);
    if(rel.package_available&&rel.download_url){
      anchor.href=rel.download_url;
      anchor.dataset.releaseSha=rel.validated_sha||'';
      anchor.textContent='Baixar CLEAN oficial · GitHub · '+rel.version;
    }
  }catch{ /* Preserve the verified static fallback, no guessed packages. */ }
}
if(typeof document!=='undefined')void refreshPublicInstallLink();
