import { AGENT_URL } from './data/agent-contract.mjs';
import { escapeHtml as esc } from './evidence-view.mjs';

const TOKEN_KEY='central.ames.agentToken.v1';
const fmt=value=>value===null||value===undefined||value===''?'—':String(value);

function token(){
  try{return window.sessionStorage?.getItem(TOKEN_KEY)||'';}catch{return '';}
}

async function request(path,{method='GET',body}={}){
  const headers={};const auth=token();
  if(auth)headers['X-Central-Agent-Token']=auth;
  if(body!==undefined)headers['Content-Type']='application/json';
  const response=await fetch(AGENT_URL+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(12000)});
  if(response.status===401)throw new Error('Abra a Central pelo launcher deste posto para autorizar o diagnóstico de rede.');
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.message||data.error||`HTTP ${response.status}`);
  return data;
}

function statusLabel(network={}){
  if(network.reachable)return ['ok','A-MES conectado'];
  if(network.wifi?.connected===false)return ['bad','Wi-Fi A-MES desconectado'];
  if(network.wifi_expected===false)return ['warn','Wi-Fi diferente do perfil A-MES'];
  if(network.route?.route===null||network.route?.route===undefined)return ['warn','Rota A-MES não confirmada'];
  return ['bad','A-MES sem resposta'];
}

export function createNetworkHealthView(root,store){
  let disposed=false,timer=null,loading=false,last=null,error='';
  async function refresh(){
    if(disposed||loading||store.agent().status!=='connected')return;
    loading=true;
    try{last=await request('/network/status');error='';}
    catch(exc){error=exc.message||String(exc);}
    finally{loading=false;if(!disposed)render();}
  }
  async function repair(){
    if(disposed||loading)return;
    loading=true;render();
    try{last=await request('/network/repair',{method:'POST',body:{reason:'console_fastlane'}});error='';}
    catch(exc){error=exc.message||String(exc);}
    finally{loading=false;if(!disposed){render();setTimeout(refresh,1200);}}
  }
  function schedule(){
    clearInterval(timer);timer=setInterval(()=>{if(!document.hidden)refresh();},15000);
  }
  function render(){
    if(disposed)return;
    const agent=store.agent();
    if(agent.status!=='connected'){
      root.innerHTML=`<section class="mes-context-panel ames-network-panel"><div class="section-head"><div><h3>Rede do posto</h3><p>Modo local-first: dados já salvos continuam consultáveis mesmo sem internet. Para novas consultas MES, conecte o agente local.</p></div><span class="status">LOCAL / OFFLINE</span></div></section>`;
      return;
    }
    const network=last?.network||last||agent.readiness?.network||{};
    const guardian=last?.guardian||{};
    const [tone,label]=statusLabel(network);
    const wifi=network.wifi||{};const route=network.route?.route||network.route||{};const adapter=network.adapter||network.interface||{};
    root.innerHTML=`<section class="mes-context-panel ames-network-panel">
      <div class="section-head"><div><h3>Rede do posto</h3><p>Ethernet mantém internet; Wi-Fi A-MES e a rota exclusiva para 172.29.185.215 são monitorados sem alterar DNS ou gateway padrão.</p></div><span class="status ${tone}">${esc(label)}</span></div>
      <div class="ames-network-grid">
        <div><small>Wi-Fi A-MES</small><b>${esc(fmt(wifi.ssid||network.ssid))}</b><span>${esc(fmt(wifi.signal||network.signal))}</span></div>
        <div><small>Interface</small><b>${esc(fmt(wifi.interface||adapter.Name||adapter.name))}</b><span>ifIndex ${esc(fmt(adapter.ifIndex||route.InterfaceIndex||route.interface_index))}</span></div>
        <div><small>Host MES</small><b>172.29.185.215</b><span>${network.reachable?'alcançável':'sem resposta'}</span></div>
        <div><small>Auto-recuperação</small><b>${guardian.running===false?'parada':'ativa'}</b><span>${esc(fmt(guardian.last_action||guardian.status||'observando'))}</span></div>
      </div>
      ${error?`<div class="ames-network-error">${esc(error)}</div>`:''}
      <div class="ames-network-actions"><button class="button secondary" type="button" data-network-refresh ${loading?'disabled':''}>${loading?'Verificando…':'Verificar rede'}</button><button class="button secondary" type="button" data-network-repair ${loading?'disabled':''}>Reparar Wi-Fi / rota A-MES</button><span>Cloud não é requisito para operar o Console local.</span></div>
    </section>`;
    root.querySelector('[data-network-refresh]')?.addEventListener('click',refresh);
    root.querySelector('[data-network-repair]')?.addEventListener('click',repair);
  }
  schedule();
  return {render(){render();if(store.agent().status==='connected'&&!last&&!loading)refresh();},refresh,clear(){disposed=true;clearInterval(timer);root.replaceChildren();}};
}
