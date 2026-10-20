import { readRelease, integrationMode, INTEGRATION_MODE_KEY, installationDetection, sharingState } from './data/onboarding.mjs';
import { escapeHtml as esc } from './evidence-view.mjs';

const t=(pt,en)=>document.documentElement.lang.startsWith('en')?en:pt;
const localUrl='http://127.0.0.1:8765/Central-de-Controle-/';
export function savedIntegrationMode(){
  try{return integrationMode(localStorage.getItem(INTEGRATION_MODE_KEY));}catch{return null;}
}

export function createOnboardingView(root,{
  onChoice=()=>{},
  getAgent=()=>({}),
  isPaired=()=>false,
  canPair=()=>false,
  onPair=()=>{},
  loadRelease=async signal=>{
    const response=await fetch(new URL('./releases/latest/release.json',import.meta.url),{signal,cache:'no-cache'});
    if(!response.ok)throw new Error('Release indisponível');
    return response.json();
  }
}={}){
  let mode=savedIntegrationMode(),release,error='',started=false,generation=0,controller,volatile=false;
  const choiceLabel=()=>mode==='collector'?t('Coletar neste PC','Collect on this PC'):mode==='viewer'?t('Consultar dados da equipe','View shared data'):t('Escolha como usar','Choose how to use');
  function collectionPanel(){
    const agent=getAgent(),state=installationDetection(agent,isPaired());
    const connectButton=state!=='verified'&&canPair()?'<button type="button" class="button primary" data-connect-local-pairing>'+t('Conectar agente deste PC','Connect agent on this PC')+'</button>':'';
    const titles={
      verified:t('Agente local conectado e autorizado','Local agent connected and authorized'),
      pairing_required:t('Agente encontrado · falta pareamento','Agent found · pairing required'),
      paired_unreachable:t('Pareamento salvo · agente não confirmado','Pairing saved · agent not verified'),
      not_verified:t('Ainda não foi possível confirmar o agente','Agent not yet verified')
    };
    const instructions={
      verified:t('A Central reconhece este posto. Não reinstale para conectar: use os dados locais e verifique a sincronização abaixo.','Work Center recognizes this workstation. Do not reinstall to connect; use local data and verify sync below.'),
      pairing_required:t('Agente local detectado. Use Conectar agente deste PC, confirme na janela local e volte à Central oficial já autorizada.','Local agent detected. Choose Connect agent on this PC, confirm in the local window, then return to the authorized official Work Center.'),
      paired_unreachable:t('O token desta aba já existe, mas o agente não respondeu. Verifique se o launcher está rodando neste mesmo computador.','This tab has a pairing token, but the agent did not answer. Check the launcher on this computer.'),
      not_verified:t('O navegador não comprovou se há instalação. Bloqueios HTTPS/loopback podem impedir a detecção. Um resultado negativo NÃO significa que o agente não existe.','The browser cannot verify an installation. HTTPS/loopback restrictions can block detection; this does NOT prove the agent is absent.')
    };
    const status='<section class="ames-setup-status" data-installation-detection="'+state+'"><strong>'+esc(titles[state])+'</strong><p>'+esc(instructions[state])+'</p>'+connectButton+
      '<a class="button secondary" href="'+localUrl+'" target="_blank" rel="noopener noreferrer">'+t('Abrir Central local deste PC','Open this PC’s local Work Center')+'</a>'+
      '<small>'+t('O endereço 127.0.0.1 aponta somente para este computador, nunca para outro posto. Não cole ou envie URL contendo token de pareamento.','127.0.0.1 points only to this computer, never another workstation. Never share pairing-token URLs.')+'</small></section>';
    if(!release)return status+'<p role="status">'+esc(error||t('Validando pacote oficial do GitHub…','Checking official GitHub package…'))+'</p>'+
      (error?'<button type="button" class="button secondary" data-release-retry>'+t('Tentar novamente','Retry')+'</button>':'');
    const safe=release.package_available;
    const download=safe
      ?'<a class="button secondary" data-official-clean-download href="'+esc(release.download_url)+'" target="_blank" rel="noopener noreferrer">'+t('Baixar CLEAN oficial','Download official CLEAN')+'</a>'+
       '<small>GitHub Release · '+esc(release.version)+' · SHA '+esc(release.validated_sha?.slice(0,8)||'—')+' · SHA-256 <code>'+esc(release.sha256)+'</code></small>'
      :'<p role="status" class="notice warn">'+t('O pacote ainda não foi publicado com SHA e hash confirmados. O download fica bloqueado.','The package has no verified SHA and hash yet. Download is blocked.')+'</p>';
    return '<div class="ames-setup-grid">'+
      '<section class="ames-setup-step" data-setup-existing><div class="ames-step-number">01</div><h3>'+t('Já existe um agente neste PC?','Already installed on this PC?')+'</h3>'+
      status+'<p>'+t('Não substitua a pasta que contém o SQLite. Use o launcher original deste computador; atualização só com backup e procedimento compatível.','Do not overwrite the folder containing SQLite. Use the original launcher; updates require a backup and compatible procedure.')+'</p></section>'+
      '<section class="ames-setup-step" data-setup-new><div class="ames-step-number">02</div><h3>'+t('Primeira instalação neste PC','First installation on this PC')+'</h3>'+
      '<p>'+t('Baixe uma vez o pacote validado. Extraia em uma pasta NOVA e execute <code>00_INICIAR_AQUI.bat</code> no Windows.','Download the verified package once. Extract into a NEW folder and run <code>00_INICIAR_AQUI.bat</code> on Windows.')+'</p>'+download+
      '<p>'+t('O ZIP não inclui SQLite operacional, usuário MES, cookies ou senhas. Instalar o agente não concede acesso à rede A-MES.','The ZIP contains no production SQLite, MES login, cookies or passwords. Installing the agent does not grant MES network access.')+'</p></section>'+
      '<section class="ames-setup-step" data-setup-share><div class="ames-step-number">03</div><h3>'+t('Publicar os dados para a equipe','Share data with the team')+'</h3>'+
      '<p>'+t('Faça login na Central e mantenha esta aba autenticada aberta no PC que coleta. O agente grava no SQLite offline; a Central publica snapshots sanitizados quando há internet.','Sign into Work Center and keep the authenticated tab open on the collecting PC. The agent stores offline in SQLite; Work Center publishes sanitized snapshots when online.')+'</p>'+
      '<p>'+t('Confira fila, última publicação, revisão por linha e origem. Um envio concluído NÃO prova que o outro PC recebeu; confirme também a leitura no PC B.','Check the queue, last publication, version per line and source. Successful sending does NOT prove another PC received it; verify on PC B as well.')+'</p></section></div>';
  }
  function viewerPanel(){
    const sync=sharingState(getAgent());
    const label=sync.receiving==='server_confirmed'
      ?t('Leitura do Firestore confirmada','Firestore read confirmed')
      :sync.receiving==='cached'?t('Somente cache do navegador','Browser cache only')
      :sync.receiving==='conflict'?t('Conflito de origem — não escolher automaticamente','Origin conflict — no automatic choice')
      :sync.receiving==='error'?t('Erro de leitura compartilhada','Shared read error')
      :t('Leitura compartilhada ainda não confirmada','Shared read not yet confirmed');
    return '<section class="ames-setup-viewer" data-setup-viewer><h3>'+t('Este computador não precisa de A-MES','This computer does not need A-MES')+'</h3>'+
      '<p>'+t('Entre com uma conta autorizada, abra Monitoramento e escolha a linha. Apenas snapshots já publicados são visíveis. A Consulta por SN local completa exige um agente/SQLite com evidências; a ausência dessa fonte não representa zero defeitos.','Sign in with an authorized account, open Monitoring and select a line. Only published snapshots are visible. Complete local SN investigation requires an agent/SQLite with evidence; missing evidence is not zero defects.')+'</p>'+
      '<p role="status"><strong>'+esc(label)+'</strong> · '+t('Linhas compartilhadas identificadas','Shared lines identified')+': '+sync.receivedLines.length+'/3</p>'+
      '<p>'+t('Não instale o CLEAN apenas para visualizar dados. A coleta e o acesso à rede MES continuam restritos ao PC de origem.','Do not install CLEAN just to view data. Collection and MES network access remain on the source workstation.')+'</p></section>';
  }
  function paint(){
    if(!root)return;
    root.innerHTML='<section class="ames-installation-guide" data-onboarding-guide>'+
      '<div class="ames-installation-heading"><div><h2>'+t('Preparar PC e compartilhar dados','Set up PC and share data')+'</h2><p>'+t('Instalação, pareamento e sincronização no mesmo lugar. Sem segundo banco ou aplicativo.','Installation, pairing and synchronization in one place. No second database or app.')+'</p></div></div>'+
      '<div class="ames-setup-choice" role="group" aria-label="'+t('Modo deste computador','This computer mode')+'">'+
      '<button type="button" class="button secondary" data-integration-mode="collector" aria-pressed="'+String(mode==='collector')+'">'+t('Este PC coleta A-MES','This PC collects A-MES')+'</button>'+
      '<button type="button" class="button secondary" data-integration-mode="viewer" aria-pressed="'+String(mode==='viewer')+'">'+t('Este PC só consulta dados','This PC only views data')+'</button></div>'+
      '<p class="mes-context" role="status">'+t('Modo escolhido','Selected mode')+': '+esc(choiceLabel())+
      (volatile?' · '+t('Preferência não salva neste navegador','Preference not saved in this browser'):'')+'</p>'+
      (mode==='viewer'?viewerPanel():collectionPanel())+
      '<p class="mes-context">'+t('O MES permanece offline/local. Login e autorizações nunca são sincronizados entre PCs.','MES stays local/offline. Login credentials and authorizations are never synchronized across PCs.')+'</p></section>';
  }
  async function render(){
    if(!root)return;paint();
    if(started)return;
    started=true;const token=generation;controller=new AbortController();
    try{release=readRelease(await loadRelease(controller.signal));error='';}
    catch{error=t('Manifesto oficial indisponível ou inválido. Nenhum ZIP será sugerido sem verificação.','Official manifest unavailable or invalid. No unverified ZIP will be offered.');}
    if(token===generation)paint();
  }
  root?.addEventListener('click',event=>{
    const button=event.target.closest('[data-integration-mode],[data-release-retry],[data-connect-local-pairing]');
    if(!button)return;
    if(button.hasAttribute('data-release-retry')){started=false;error='';void render();return;}
    if(button.hasAttribute('data-connect-local-pairing')){onPair();return;}
    mode=integrationMode(button.dataset.integrationMode);
    try{localStorage.setItem(INTEGRATION_MODE_KEY,mode);volatile=false;}catch{volatile=true;}
    paint();onChoice(mode);
  });
  return Object.freeze({render,clear(){generation++;controller?.abort();started=false;release=null;error='';root?.replaceChildren();}});
}
