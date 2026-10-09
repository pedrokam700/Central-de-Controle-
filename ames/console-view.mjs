import { createAgentClient } from './agent-client.mjs';
import { mountV0523 } from './v0523-loader.mjs';
import { createLineOverview, createTrendAddon, createFailuresParityView } from './console-legacy-parity.mjs';

// Mantidos como contratos de regressão da etapa R12. A renderização principal abaixo
// usa diretamente os assets canônicos da V0.5.23 enviada/validada pelo usuário.
const LEGACY_STYLE_HREF=new URL('./console-legacy.css',import.meta.url).href;
void LEGACY_STYLE_HREF;void createLineOverview;void createTrendAddon;void createFailuresParityView;

const CANONICAL_VIEWS=Object.freeze([
  'Monitoramento','Top 3 & FPY','Falhas','Consulta por SN','Rastreabilidade',
  'Dashboards de reuso','Processo / 3022 & AT','Base local','CORA conhecimento'
]);

// Console MES nativo da Central usando a UI V0.5.23 como baseline 1:1.
// Não há iframe, redirect para outra aplicação ou reconstrução simplificada.
export function createConsoleView(root,store,{onChange=()=>{},transport={}}={}){
  let mounted=null,mounting=null,disposed=false;
  const client=createAgentClient(store,{...transport,changed:onChange});

  function backToCentral(){
    mounted?.cleanup?.();mounted=null;mounting=null;
    const home=document.querySelector('.main-nav [data-page="home"], [data-page="home"]');
    home?.click();
  }

  async function ensureMounted(){
    if(disposed||mounted)return mounted;
    if(mounting)return mounting;
    mounting=mountV0523(root,{onBack:backToCentral}).then(result=>{
      if(disposed){result?.cleanup?.();return null;}
      mounted=result;
      // Espelha o estado do agente no state.ames quando o agente R12 está disponível.
      // Falha de conexão não bloqueia a UI local canônica, que continua mostrando seu
      // próprio estado e diagnóstico exatamente como na V0.5.23.
      client.connect().catch(()=>{});
      onChange();
      return result;
    }).catch(error=>{
      console.error('Falha ao montar Console MES V0.5.23',error);
      return null;
    }).finally(()=>{mounting=null;});
    return mounting;
  }

  return Object.freeze({
    render(){if(!root||disposed)return;ensureMounted();},
    clear(){disposed=true;mounted?.cleanup?.();mounted=null;mounting=null;client.clear();root?.replaceChildren();}
  });
}

export { CANONICAL_VIEWS };
