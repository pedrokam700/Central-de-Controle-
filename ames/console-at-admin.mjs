import {escapeHtml as esc} from './evidence-view.mjs';

export function createAtAdminView(root){
 let users=[],status='',loaded=false,ready=false,configured=false,authorized=false,generation=0;
 const local=()=>['127.0.0.1','localhost'].includes(globalThis.location?.hostname);
 async function api(path,{body,download=false}={}){
  const response=await fetch('/api/v1/at-admin/'+path,{method:body?'POST':'GET',cache:'no-store',credentials:'same-origin',
   headers:body?{'Content-Type':'application/json','X-AT-Admin-Request':'1'}:{},body:body?JSON.stringify(body):undefined});
  if(!response.ok)throw Error((await response.json().catch(()=>({}))).message||'Operação não autorizada pelo agente local.');
  return download?response.blob():response.json();
 }
 async function reload(){const version=generation;try{const session=await api('session');if(version!==generation)return;
   configured=!!session.configured;authorized=!!session.authorized;
   const nextUsers=authorized?(await api('users')).users||[]:[];if(version!==generation)return;
   users=nextUsers;status='';ready=true;
  }catch(error){if(version!==generation)return;status=error.message;ready=true;}paint();}
 function paint(){
  if(!local()){
   root.innerHTML='<p class="muted">Para criar contas offline, abra esta mesma página da Central no computador administrador onde o agente está instalado: <code>http://127.0.0.1:8765/Central-de-Controle-/</code>. A Central online não recebe as senhas offline.</p>';return;
  }
  if(!ready){root.innerHTML='<section class="mes-context-panel"><h2>Usuários AT</h2><p>Conferindo acesso administrativo local…</p></section>';return;}
  if(!authorized){
   root.innerHTML=`<section class="mes-context-panel"><h3>${configured?'Entrar na administração offline':'Primeira configuração da administração offline'}</h3>
    <p>${configured?'Informe sua senha de administrador para criar e exportar usuários.':'Defina uma senha administrativa de pelo menos 10 caracteres. Ela ficará somente neste computador e nunca será enviada ao posto AT.'}</p>
    <form data-at-gate-form style="display:grid;gap:12px;max-width:420px"><label>Senha administrativa<input type="password" name="password" required minlength="10" autocomplete="${configured?'current-password':'new-password'}"></label>
    <button class="button primary">${configured?'Entrar':'Definir senha e continuar'}</button></form><p role="status">${esc(status)}</p></section>`;
   root.querySelector('[data-at-gate-form]').addEventListener('submit',async event=>{
    event.preventDefault();const password=event.currentTarget.elements.password.value;
    try{await api(configured?'login':'setup',{body:{password}});await reload();}catch(error){status=error.message;paint();}
   });return;
  }
  root.innerHTML=`<section class="mes-context-panel" data-at-user-admin><h3>Contas para os postos AT</h3>
   <p>Crie as contas neste computador. As senhas são protegidas antes de serem salvas. Os postos de AT recebem os perfis pelo pendrive, sem acesso às configurações administrativas.</p>
   <form data-at-form class="ames-toolbar" style="display:grid;gap:12px;max-width:660px">
    <label>Nome completo<input name="name" required maxlength="100"></label>
    <label>Usuário<input name="username" required minlength="3" maxlength="40" placeholder="at001"></label>
    <label>Perfil<select name="role"><option value="technician">Técnico AT</option><option value="repair_assistant">Auxiliar de Reparo</option><option value="custom">Personalizado</option></select></label>
    <label>Senha <small>10 caracteres ou mais; em edição, deixe vazia para manter</small><input name="password" type="password" minlength="10" autocomplete="new-password"></label>
    <fieldset><legend>Permissões</legend><label><input type="checkbox" checked disabled> Consulta por SN</label><p>Outras telas estarão disponíveis quando seus endpoints restritos forem validados; coleta em massa, configuração e monitoramento nunca serão liberados para perfis AT.</p></fieldset>
    <label><input type="checkbox" name="enabled" checked> Conta ativa</label>
    <button class="button primary">Salvar usuário</button>
   </form><p role="status" data-at-status>${esc(status)}</p>
   <h3>Contas cadastradas · ${users.length}</h3><div class="table-wrap"><table><thead><tr><th>Usuário</th><th>Nome</th><th>Telas</th><th>Estado</th><th></th></tr></thead><tbody>
   ${users.map(user=>`<tr><td>${esc(user.username)}</td><td>${esc(user.name)}<small> (${esc(user.role||'technician')})</small></td><td>${esc(user.permissions.join(', '))}</td><td>${user.enabled?'Ativa':'Bloqueada'}</td><td><button type="button" data-at-edit="${esc(user.username)}">Editar</button></td></tr>`).join('')}
   </tbody></table></div>
   <button type="button" class="button primary" data-at-package ${users.length?'':'disabled'}>Gerar instalador AT offline para pendrive</button>
   <details><summary>Opções técnicas de provisionamento</summary><button type="button" class="button secondary" data-at-export ${users.length?'':'disabled'}>Exportar somente contas protegidas</button></details>
   <button type="button" class="button secondary" data-at-logout>Sair da administração</button>
   <p class="mes-context">No primeiro uso, execute uma vez <code>at-setup/00_PREPARAR_PENDRIVE_AT.bat</code> na pasta da Central instalada neste computador com internet. Depois clique em Gerar instalador. O sistema bloqueia pacotes incompletos; o PC do AT não faz downloads.</p></section>`;
  const form=root.querySelector('[data-at-form]');
  form.addEventListener('submit',async event=>{
    event.preventDefault();const fields=new FormData(form),username=String(fields.get('username')||'').trim();
    const current=users.find(row=>row.username===username.toLowerCase());
    const body={username,name:String(fields.get('name')||''),role:String(fields.get('role')||'technician'),permissions:['sn'],enabled:fields.has('enabled')};
    if(fields.get('password'))body.password=String(fields.get('password'));
    if(!current&&!body.password){status='Nova conta exige senha.';paint();return;}
    try{await api('users',{body});await reload();}catch(error){status=error.message;paint();}
  });
  for(const button of root.querySelectorAll('[data-at-edit]'))button.addEventListener('click',()=>{
    const user=users.find(u=>u.username===button.dataset.atEdit);if(!user)return;
    form.elements.name.value=user.name;form.elements.username.value=user.username;
    form.elements.password.value='';form.elements.enabled.checked=user.enabled;form.elements.role.value=user.role||'technician';form.elements.username.focus();
  });
  root.querySelector('[data-at-export]')?.addEventListener('click',async()=>{
    try{const blob=await api('accounts-export',{download:true}),url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download='at_offline_accounts.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
    }catch(error){root.querySelector('[data-at-status]').textContent=error.message;}
  });
  root.querySelector('[data-at-package]')?.addEventListener('click',async event=>{
    const button=event.currentTarget;button.disabled=true;button.textContent='Conferindo pacote offline…';
    try{const blob=await api('offline-package',{download:true}),url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download='Central_AT_OFFLINE.zip';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
      root.querySelector('[data-at-status]').textContent='Pacote gerado. Use somente no posto AT destinado e preserve as senhas dos técnicos.';
    }catch(error){root.querySelector('[data-at-status]').textContent=error.message;}
    finally{button.disabled=false;button.textContent='Gerar instalador AT offline para pendrive';}
  });
  root.querySelector('[data-at-logout]').addEventListener('click',async()=>{
    try{await api('logout',{body:{}});await reload();}catch(error){status=error.message;paint();}
  });
 }
 return {render(){if(!loaded){loaded=true;paint();if(local())void reload();}},clear(){generation++;root.replaceChildren();loaded=false;ready=false;configured=false;authorized=false;users=[];status='';}};
}
