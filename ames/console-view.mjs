const LOCAL_CONSOLE_URL='http://127.0.0.1:8765/';

// A V0.5.23 local é a referência visual e operacional aprovada.
// Em vez de reconstruir uma cópia simplificada dentro da Central, o Console MES
// abre a interface real servida pelo agente local no mesmo navegador. Isso garante
// paridade 1:1 de layout, páginas e controles durante a validação R12.
// A integração/sincronização da Central continua existindo fora desta view e a
// branch permanece sem alterar main, produção ou Firebase Rules.
export function createConsoleView(root, store, { onChange = () => {} } = {}) {
  let redirected=false;

  function renderFallback(){
    if(!root)return;
    root.innerHTML=`<div style="position:fixed;inset:0;z-index:1200;background:#f4f4f2;display:grid;place-items:center;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#151515">
      <div style="width:min(620px,calc(100vw - 32px));background:#fff;border:1px solid #dededb;border-radius:12px;padding:24px;box-shadow:0 8px 26px rgba(0,0,0,.05)">
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:16px"><div style="display:grid;place-items:center;width:34px;height:34px;border-radius:8px;background:#111;color:#fff;font-weight:800">Q</div><div><strong style="font-size:16px">Console MES · V0.5.23</strong><div style="margin-top:3px;color:#696966;font-size:12px">Abrindo a interface local validada em 127.0.0.1:8765</div></div></div>
        <p style="margin:0 0 16px;color:#696966;line-height:1.55;font-size:13px">A interface aprovada da automação local agora é a baseline canônica do Console MES. Não usamos mais a reconstrução simplificada que estava no preview.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" data-open-local style="border:0;border-radius:8px;background:#111;color:#fff;padding:10px 14px;font-weight:700;cursor:pointer">Abrir Console MES local</button><button type="button" data-back-central style="border:1px solid #dededb;border-radius:8px;background:#fff;color:#111;padding:10px 14px;font-weight:700;cursor:pointer">Voltar à Central</button></div>
        <p style="margin:14px 0 0;color:#8b8b87;font-size:11px">Se o agente não estiver rodando neste computador, inicie o pacote A-MES e tente novamente.</p>
      </div>
    </div>`;
    root.querySelector('[data-open-local]')?.addEventListener('click',()=>location.assign(LOCAL_CONSOLE_URL));
    root.querySelector('[data-back-central]')?.addEventListener('click',()=>document.querySelector('.main-nav [data-page="home"], [data-page="home"]')?.click());
  }

  return Object.freeze({
    render(){
      if(!root)return;
      renderFallback();
      if(redirected)return;
      redirected=true;
      // A navegação é top-level, sem iframe. O histórico do navegador permite
      // que o botão "Voltar à Central" da V0.5.23 retorne para esta Central.
      setTimeout(()=>{
        try{ location.assign(LOCAL_CONSOLE_URL); }
        catch{ redirected=false; }
      },120);
      onChange();
    },
    clear(){ if(root)root.replaceChildren(); }
  });
}
