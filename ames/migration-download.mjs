const API='https://api.github.com/repos/pedrokam700/Central-de-Controle-/actions/artifacts';
export async function migrationDownload(signal,fetcher=fetch){
  const build=await fetcher(new URL('../../release-build.json',import.meta.url),{signal,cache:'no-store'});
  if(!build.ok)return null;
  const {sha}=await build.json();if(!/^[a-f0-9]{40}$/.test(sha||''))return null;
  const name='central-v2-r12-migration-'+sha;
  const response=await fetcher(API+'?per_page=100&name='+name,{signal,cache:'no-store',credentials:'omit'});
  if(!response.ok)return null;
  const {artifacts=[]}=await response.json();
  const artifact=artifacts.find(a=>a.name===name&&!a.expired&&a.workflow_run?.head_sha===sha&&Number.isSafeInteger(a.id)&&Number.isSafeInteger(a.workflow_run.id));
  return artifact?{name,sha,url:`https://github.com/pedrokam700/Central-de-Controle-/actions/runs/${artifact.workflow_run.id}/artifacts/${artifact.id}`} : null;
}
