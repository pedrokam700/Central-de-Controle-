import {sessionAmes} from './ames-session.mjs';
import {createConsoleView} from '../ames/console-view.mjs';
const state={ames:sessionAmes};
const languageKey='controleFalhas.language.v1';
let locale=localStorage.getItem(languageKey)||'pt-BR';
const root=document.querySelector('#mesConsole');
const section=document.querySelector('#mesConsoleView');
const en=()=>locale==='en-US';
const t=(pt,eng)=>en()?eng:pt;
// This is a local capability session, not a Firebase identity. Cloud operations
// remain behind the existing Central Auth and are loaded only when requested.
document.querySelector('#accountScreen').classList.add('hidden');
document.querySelectorAll('main > section, .overview').forEach(e=>e.classList.add('hidden'));
section.classList.remove('hidden');
document.body.classList.add('central-local-workstation');
const style=document.createElement('style');style.textContent='.central-local-workstation .sidebar,.central-local-workstation .topbar{display:none!important}.central-local-workstation .main{margin-left:0!important;width:100%!important}.central-local-controls{display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:12px}.central-local-controls strong{margin-right:auto}.central-local-home{padding:24px}';document.head.append(style);
const controls=document.createElement('div');controls.className='central-local-controls';section.before(controls);
const home=document.createElement('section');home.className='central-local-home hidden';section.before(home);
async function localHistory(params){const token=sessionStorage.getItem('central.ames.agentToken.v1')||new URLSearchParams(location.hash.slice(1)).get('ames_agent_token')||'';const response=await fetch('/api/v1/local-history?'+new URLSearchParams(params),{headers:{'X-Central-Agent-Token':token},cache:'no-store'});if(!response.ok)throw Error('Local history unavailable');return response.json();}
let view=createConsoleView(root,state.ames,{locale:()=>locale,history:{list:line=>localHistory({line}),open:head=>localHistory({line:head.line_id,snapshot_id:head.snapshot_id})}});
function paint(){document.documentElement.lang=locale;controls.innerHTML=`<strong>${t('Central de Trabalho · posto local','Work Center · local workstation')}</strong><select aria-label="Language" data-language><option value="pt-BR">Português</option><option value="en-US">English</option></select><button class="button secondary" data-theme>${t('Claro / escuro','Light / dark')}</button><a class="button secondary" href="?online=1">${t('Conta Central / sincronização','Central account / sync')}</a>`;controls.querySelector('[data-language]').value=locale;controls.querySelector('[data-language]').onchange=e=>{locale=e.target.value;localStorage.setItem(languageKey,locale);paint();};controls.querySelector('[data-theme]').onclick=()=>{const dark=!document.body.classList.contains('dark');document.body.classList.toggle('dark',dark);document.documentElement.classList.toggle('dark',dark);localStorage.setItem('central.local.dark',String(dark));view.render();};home.innerHTML=`<h2>${t('Central de Trabalho','Work Center')}</h2><p>${t('O Console operacional deste posto usa a base local. Para atividades da conta e sincronização, entre na Central quando houver conexão.','This workstation console uses the local database. Sign in to Central when connected for account activities and sync.')}</p><button class="button primary" data-open-console>${t('Abrir Console MES','Open MES Console')}</button>`;home.querySelector('[data-open-console]').onclick=()=>{home.classList.add('hidden');section.classList.remove('hidden');view.render();};view.render();}
const dark=localStorage.getItem('central.local.dark')==='true';document.body.classList.toggle('dark',dark);document.documentElement.classList.toggle('dark',dark);
document.querySelector('[data-page="home"]')?.addEventListener('click',()=>{section.classList.add('hidden');home.classList.remove('hidden');});
paint();window.__centralLocalReady=true;
