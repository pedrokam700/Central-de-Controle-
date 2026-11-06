import {buildLiveSnForensics} from '/Central-de-Controle-/ames/data/sn-forensics.mjs';
import {renderSmartSnAlerts} from '/Central-de-Controle-/ames/console-sn-smart-alerts.mjs';
import {renderSnHistoryDetail} from '/Central-de-Controle-/ames/console-sn-history-detail.mjs';
import {renderMaterialSnInvestigation} from '/Central-de-Controle-/ames/console-sn-material-investigation.mjs';
import {renderSnMountingViews} from '/Central-de-Controle-/ames/console-sn-mounting-views.mjs';

const byId=id=>document.getElementById(id);
const escaped=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let loggedIn=false,jobId='',abort=false;

async function api(path,{method='GET',body}={}){
 const response=await fetch('/api/v1/'+path,{method,headers:{...(method!=='GET'?{'X-AT-Request':'1','Content-Type':'application/json'}:{})},
   body:body===undefined?undefined:JSON.stringify(body),credentials:'same-origin',cache:'no-store'});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(response.status===401||response.status===403?'Acesso não autorizado ou sessão expirada.':data.message||data.error||'Falha no agente local');
 return data;
}
function showLogin(){loggedIn=false;abort=true;jobId='';byId('loginPanel').hidden=false;byId('queryPanel').hidden=true;byId('userName').textContent='';byId('resultPanel').hidden=true;}
function showConsole(user){loggedIn=true;abort=false;byId('loginPanel').hidden=true;byId('queryPanel').hidden=false;byId('userName').textContent=user.name+' · '+user.username;byId('snInput').focus();}
function message(id,value){byId(id).textContent=value;}

byId('loginForm').addEventListener('submit',async event=>{
 event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');button.disabled=true;message('loginMessage','Verificando usuário…');
 try{const username=form.elements.username.value.trim(),password=form.elements.password.value;
   const result=await api('at/login',{method:'POST',body:{username,password}});form.elements.password.value='';showConsole(result.user);message('loginMessage','');}
 catch(error){message('loginMessage',error.message);}
 finally{button.disabled=false;}
});
byId('logoutButton').addEventListener('click',async()=>{abort=true;try{await api('at/logout',{method:'POST',body:{}});}finally{showLogin();}});

function renderResult(result){
 const forensic=buildLiveSnForensics(result),root=byId('resultPanel');
 const smart=renderSmartSnAlerts(forensic,result,'pt-BR');
 const timeline=renderSnHistoryDetail(forensic,result,'pt-BR');
 const investigation=renderMaterialSnInvestigation(result,'pt-BR');
 const mounting=renderSnMountingViews(result,'pt-BR');
 const technical=[investigation,mounting].filter(Boolean).join('');
 root.innerHTML=`<h2>Investigação · ${escaped(result.sn||result.query_sn||'—')}</h2>
   <p class="hint">${escaped(result.detected_type||'Identificação não confirmada')} · ${escaped(result.product_model||'Modelo não informado')} · A leitura é limitada às fontes retornadas nesta consulta.</p>
   ${smart||'<p class="notice">Nenhuma recorrência com evidência suficiente para alerta nesta consulta. Isso não comprova ausência de falhas.</p>'}
   ${timeline||''}
   ${technical?'<details class="technical"><summary>Detalhes técnicos · 3074 e rastreabilidade</summary>'+technical+'</details>':''}`;
 root.hidden=false;
}

byId('queryForm').addEventListener('submit',async event=>{
 event.preventDefault();if(!loggedIn)return;
 const form=event.currentTarget,button=form.querySelector('button'),sn=byId('snInput').value.trim();
 if(!/^[A-Za-z0-9_.#-]{4,100}$/.test(sn)){message('queryMessage','SN inválido.');return;}
 button.disabled=true;message('queryMessage','Iniciando consulta individual ao A-MES…');byId('resultPanel').hidden=true;
 try{
   const started=await api('sn-lookup',{method:'POST',body:{sn}});jobId=started.id;
   if(!jobId)throw Error('Agente não retornou identificador da consulta.');
   for(let i=0;i<900&&!abort;i++){
     const job=await api('jobs/'+encodeURIComponent(jobId));
     message('queryMessage',job.message||job.stage||'Consultando fontes…');
     if(['done','error','cancelled'].includes(job.status)){
       if(job.status==='done'&&job.result)renderResult(job.result);
       else throw Error(job.error||'Consulta não concluída.');
       message('queryMessage','Consulta concluída. Cobertura e limites aparecem nas evidências.');
       return;
     }
     await new Promise(resolve=>setTimeout(resolve,850));
   }
   throw Error('Consulta interrompida ou tempo limite excedido.');
 }catch(error){message('queryMessage',error.message);if(/sessão|autorizad/i.test(error.message))showLogin();}
 finally{button.disabled=false;}
});

byId('resultPanel').addEventListener('click',event=>{
 const button=event.target.closest('[data-sn-open-pcba]');if(!button)return;
 byId('snInput').value=button.dataset.snOpenPcba;
 byId('queryForm').requestSubmit();
});

api('at/session').then(result=>{if(result.ok&&result.user)showConsole(result.user);else showLogin();}).catch(()=>showLogin());
