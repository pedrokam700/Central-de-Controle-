import { instant } from './data/contract.mjs';

const LANGUAGE_KEY='controleFalhas.language.v1';
const PT='pt-BR',EN='en-US';

export function automationLanguage({documentRef=globalThis.document,storage=globalThis.localStorage}={}){
  let value='';
  try{value=String(documentRef?.documentElement?.lang||storage?.getItem?.(LANGUAGE_KEY)||PT);}catch{value=PT;}
  return value.toLowerCase().startsWith('en')?EN:PT;
}

export function automationText(language,pt,en){return String(language||PT).toLowerCase().startsWith('en')?en:pt;}

function dateKey(ms,timeZone){
  try{return new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(ms);}catch{return '';}
}

export function formatAutomationTime(value,{language=PT,timeZone='America/Sao_Paulo',now=Date.now()}={}){
  if(value===null||value===undefined||value==='')return '—';
  const raw=String(value),ms=instant(raw);
  if(ms===null)return raw;
  const locale=String(language).toLowerCase().startsWith('en')?EN:PT;
  try{
    const clock=new Intl.DateTimeFormat(locale,{timeZone,hour:'2-digit',minute:'2-digit',hour12:false}).format(ms);
    if(dateKey(ms,timeZone)===dateKey(now,timeZone))return `${automationText(locale,'Hoje','Today')}, ${clock}`;
    return new Intl.DateTimeFormat(locale,{timeZone,day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(ms).replace(',', '');
  }catch{return raw;}
}

export function sourceLabel(source,language=PT){
  const map={
    local:['Agente local','Local agent'],
    local_cache:['Cache local','Local cache'],
    remote:['Remoto / compartilhado','Remote / shared'],
    none:['Não coletado','Not collected']
  };
  const pair=map[String(source||'')]||[String(source||'Desconhecido'),String(source||'Unknown')];
  return automationText(language,pair[0],pair[1]);
}

export function freshnessLabel(value,language=PT){
  const map={fresh:['Atual','Fresh'],stale:['Desatualizado','Stale'],unknown:['Desconhecido','Unknown']};
  const pair=map[String(value||'')]||[String(value||'Desconhecido'),String(value||'Unknown')];
  return automationText(language,pair[0],pair[1]);
}

export function readinessLabel(value,language=PT){
  if(value===true)return automationText(language,'OK','OK');
  if(value===false)return automationText(language,'Indisponível','Unavailable');
  return automationText(language,'Não informado','Unknown');
}

export function formatBytes(value,language=PT){
  const n=Number(value);
  if(!Number.isFinite(n)||n<0)return '—';
  if(n<1024)return `${Math.round(n)} B`;
  if(n<1024**2)return `${(n/1024).toFixed(1)} KB`;
  if(n<1024**3)return `${(n/1024**2).toFixed(1)} MB`;
  return `${(n/1024**3).toFixed(1)} GB`;
}

export function diagnosticsLabel(status,reason,language=PT){
  if(status==='ok')return automationText(language,'Disponível','Available');
  if(status==='error')return automationText(language,'Erro','Error');
  const reasons={not_paired:['Posto não pareado','Workstation not paired'],unauthorized:['Não autorizado','Unauthorized'],unsupported:['Não suportado','Unsupported'],timeout:['Tempo esgotado','Timed out'],network:['Sem resposta local','No local response']};
  const pair=reasons[String(reason||'')]||['Indisponível','Unavailable'];
  return automationText(language,pair[0],pair[1]);
}
