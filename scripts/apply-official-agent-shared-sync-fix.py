from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")
    return text.replace(old, new, 1)


# 1) Official-origin workstation pairing persists across tabs, but is never synced.
p = Path('ames/agent-client.mjs')
t = p.read_text(encoding='utf-8')
old = """const AGENT_TOKEN_KEY='central.ames.agentToken.v1';
function bootstrapAgentToken(explicit=''){
  if(explicit)return String(explicit);
  if(typeof window==='undefined')return '';
  let token='';
  try{
    const raw=String(window.location?.hash||'').replace(/^#/,'');
    const params=new URLSearchParams(raw);
    token=params.get('ames_agent_token')||'';
    if(token){
      window.sessionStorage?.setItem(AGENT_TOKEN_KEY,token);
      params.delete('ames_agent_token');
      const rest=params.toString();
      window.history?.replaceState?.(null,'',window.location.pathname+window.location.search+(rest?'#'+rest:''));
    }else token=window.sessionStorage?.getItem(AGENT_TOKEN_KEY)||'';
  }catch{}
  return token;
}
"""
new = """const AGENT_TOKEN_KEY='central.ames.agentToken.v1';
const validAgentToken=value=>{const token=String(value||'').trim();return token.length>=32&&token.length<=256&&!/\\s/.test(token)?token:'';};
const readStorage=(storage,key)=>{try{return validAgentToken(storage?.getItem?.(key)||'');}catch{return '';}};
export function readStoredAgentToken(){
  if(typeof window==='undefined')return '';
  const session=readStorage(window.sessionStorage,AGENT_TOKEN_KEY);
  if(session)return session;
  const persisted=readStorage(window.localStorage,AGENT_TOKEN_KEY);
  if(persisted){try{window.sessionStorage?.setItem(AGENT_TOKEN_KEY,persisted);}catch{}}
  return persisted;
}
function persistAgentToken(value){
  const token=validAgentToken(value);if(!token||typeof window==='undefined')return token;
  try{window.sessionStorage?.setItem(AGENT_TOKEN_KEY,token);}catch{}
  try{window.localStorage?.setItem(AGENT_TOKEN_KEY,token);}catch{}
  return token;
}
export function clearAgentToken(){
  if(typeof window==='undefined')return;
  try{window.sessionStorage?.removeItem(AGENT_TOKEN_KEY);}catch{}
  try{window.localStorage?.removeItem(AGENT_TOKEN_KEY);}catch{}
}
export function bootstrapAgentToken(explicit=''){
  if(typeof window==='undefined')return validAgentToken(explicit);
  let token=validAgentToken(explicit),removePairingFragment=false;
  try{
    const raw=String(window.location?.hash||'').replace(/^#/,'');
    const params=new URLSearchParams(raw);
    if(params.has('ames_agent_token')){
      removePairingFragment=true;
      token=validAgentToken(params.get('ames_agent_token'))||token;
      params.delete('ames_agent_token');
      const rest=params.toString();
      window.history?.replaceState?.(null,'',window.location.pathname+window.location.search+(rest?'#'+rest:''));
    }
  }catch{}
  token=token?persistAgentToken(token):readStoredAgentToken();
  if(removePairingFragment&&token)persistAgentToken(token);
  return token;
}
"""
t = replace_once(t, old, new, 'agent token bootstrap')
t = replace_once(t, "  const workstationToken=bootstrapAgentToken(agentToken);", "  let workstationToken=bootstrapAgentToken(agentToken);", 'mutable workstation token')
t = replace_once(t, """    const token=generation;
    const headers={};
    if(body!==undefined)headers['Content-Type']='application/json';
    if(workstationToken)headers['X-Central-Agent-Token']=workstationToken;
""", """    const token=generation;
    const storedToken=readStoredAgentToken();if(storedToken&&storedToken!==workstationToken)workstationToken=storedToken;
    const headers={};
    if(body!==undefined)headers['Content-Type']='application/json';
    if(workstationToken)headers['X-Central-Agent-Token']=workstationToken;
""", 'dynamic workstation token adoption')
t = replace_once(t, """    if(response.status===401)throw new Error('Agente local não autorizado. Abra a Central pelo launcher deste posto.');
""", """    if(response.status===401){clearAgentToken();workstationToken='';throw new Error('Agente local não autorizado. Execute 00_INICIAR_AQUI.bat uma vez neste posto e tente novamente.');}
""", '401 stale pairing cleanup')
p.write_text(t, encoding='utf-8')


# 2) Store emits a canonical local-snapshot event. Sync no longer depends on a view callback.
p = Path('ames/data/store.mjs')
t = p.read_text(encoding='utf-8')
t = replace_once(t, """  let contextRevision=0;
  let contextLineExplicit=false;

  function normalizeBatch""", """  let contextRevision=0;
  let contextLineExplicit=false;
  const localSnapshotListeners=new Set();
  function notifyLocalSnapshotChange(){for(const listener of [...localSnapshotListeners]){try{listener();}catch{}}}

  function normalizeBatch""", 'store local listeners')
t = replace_once(t, """      local = result.next;
      if(local.size)ensureContextLine();
      return immutable(result.errors);
""", """      local = result.next;
      if(local.size)ensureContextLine();
      notifyLocalSnapshotChange();
      return immutable(result.errors);
""", 'store local change notify')
t = replace_once(t, """    localCanonical(){return [...local.values()].map(s=>s.canonical).filter(Boolean);},
    agent() { return agent; },
""", """    localCanonical(){return [...local.values()].map(s=>s.canonical).filter(Boolean);},
    onLocalSnapshotsChanged(listener){if(typeof listener!=='function')throw Error('invalid_local_snapshot_listener');localSnapshotListeners.add(listener);return ()=>localSnapshotListeners.delete(listener);},
    agent() { return agent; },
""", 'store subscription API')
p.write_text(t, encoding='utf-8')


# 3) MES sync subscribes directly to local snapshot changes and publishes automatically.
p = Path('ames/sync.mjs')
t = p.read_text(encoding='utf-8')
t = replace_once(t, """  let uid=null,generation=0,running=false,timer,readTimer,retry=1000,readRetry=1000,unwatch,seen='',headsKey='',readGeneration=0,lastHeads=[];
""", """  let uid=null,generation=0,running=false,timer,readTimer,retry=1000,readRetry=1000,unwatch,unwatchLocal,seen='',headsKey='',readGeneration=0,lastHeads=[];
""", 'sync local unwatch state')
old_start = """    start(user){this.stop();uid=user;const u=uid,g=generation;unwatch=remote.watch(u,heads=>{if(!alive(u,g))return;const key=JSON.stringify(heads.map(h=>[h.line_id,h.owner_uid,h.key]).sort());if(key===headsKey)return;headsKey=key;lastHeads=heads;receive(heads);},error=>{if(alive(u,g))status({read_status:'error',read_error:error.message});});flush();},
"""
new_start = """    start(user){
      this.stop();uid=user;const u=uid,g=generation,api=this;
      unwatch=remote.watch(u,heads=>{if(!alive(u,g))return;const key=JSON.stringify(heads.map(h=>[h.line_id,h.owner_uid,h.key]).sort());if(key===headsKey)return;headsKey=key;lastHeads=heads;receive(heads);},error=>{if(alive(u,g))status({read_status:'error',read_error:error.message});});
      unwatchLocal=store.onLocalSnapshotsChanged?.(()=>{void api.capture().catch(error=>{if(alive(u,g))status({status:'pending',error:error.message});});});
      void api.capture().catch(error=>{if(alive(u,g))status({status:'pending',error:error.message});});
      flush();
    },
"""
t = replace_once(t, old_start, new_start, 'sync start subscription')
t = replace_once(t, """    stop(){generation++;readGeneration++;uid=null;running=false;seen='';headsKey='';lastHeads=[];unwatch?.();unwatch=null;unschedule(timer);unschedule(readTimer);retry=readRetry=1000;store.replaceSyncedSnapshots([]);clearRemoteStatus();}
""", """    stop(){generation++;readGeneration++;uid=null;running=false;seen='';headsKey='';lastHeads=[];unwatch?.();unwatch=null;unwatchLocal?.();unwatchLocal=null;unschedule(timer);unschedule(readTimer);retry=readRetry=1000;store.replaceSyncedSnapshots([]);clearRemoteStatus();}
""", 'sync stop subscription cleanup')
p.write_text(t, encoding='utf-8')


# 4) Security documentation matches the new same-origin persistent workstation pairing.
p = Path('ames/agent/local_security.py')
t = p.read_text(encoding='utf-8')
t = t.replace(
    "The Central moves it to\nsessionStorage and sends it only to http://127.0.0.1:8765.",
    "The Central stores it only in browser storage scoped to the Central origin so\nother tabs on the same workstation can reuse the pairing, and sends it only to\nhttp://127.0.0.1:8765. It is never synchronized to Firebase."
)
p.write_text(t, encoding='utf-8')
