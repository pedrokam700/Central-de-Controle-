import {readRelease} from './data/onboarding.mjs';
const API='https://api.github.com/repos/pedrokam700/Central-de-Controle-/releases/latest';
const SHAPE=/^ames-v(0\.5\.\d+)-(?:factory|multipc)-\d{8}$/;

// The GitHub API is read-only public release metadata. No token or cookies.
// Failure falls back to the SHA-pinned, factory-proven local manifest.
export function verifiedLatestRelease(json, fallback){
  const original=readRelease(fallback);
  if(!json||json.draft!==false||json.prerelease!==false||
    typeof json.target_commitish!=='string'||!/^[a-f0-9]{40}$/.test(json.target_commitish)||
    !SHAPE.test(json.tag_name||''))return original;
  const assetName='AMES_Central_CLEAN_'+json.target_commitish.slice(0,8)+'.zip';
  const asset=(Array.isArray(json.assets)?json.assets:[]).find(item=>
    item?.name===assetName&&Number.isFinite(item.size)&&item.size>100000&&
    item.state==='uploaded'&&
    item.digest?.match(/^sha256:[a-f0-9]{64}$/));
  if(!asset)return original;
  const exact='https://github.com/pedrokam700/Central-de-Controle-/releases/download/'+json.tag_name+'/'+assetName;
  if(asset.browser_download_url!==exact)return original;
  return readRelease({...fallback,version:json.tag_name.match(SHAPE)[1],
    package_available:true,package_name:assetName,sha256:asset.digest.slice(7),
    download_url:exact,validated_candidate_sha:json.target_commitish,
    candidate_status:'github_latest_release_verified'});
}
export async function discoverOfficialRelease(signal,fetcher=fetch,loadLocal=async()=>{
  const r=await fetch(new URL('./releases/latest/release.json',import.meta.url),{signal,cache:'no-store'});
  if(!r.ok)throw Error('Manifesto local indisponível');
  return r.json();
}){
  const local=await loadLocal();
  const safe=readRelease(local);
  try{
    const boundedSignal=signal?AbortSignal.any([signal,AbortSignal.timeout(3500)]):AbortSignal.timeout(3500);
    const response=await fetcher(API,{signal:boundedSignal,cache:'no-store',credentials:'omit'});
    if(!response.ok)return safe;
    return verifiedLatestRelease(await response.json(),local);
  }catch{return safe;}
}
