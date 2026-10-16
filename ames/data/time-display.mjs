// Presentation only. Never overwrite a MES timestamp with its displayed value.
export const FACTORY_ZONE='America/Sao_Paulo';
const language=()=>globalThis.document?.documentElement?.lang||'pt-BR';
const aware=/(?:Z|[+-]\d{2}:?\d{2})$/i;
const parts=/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/;
function dateValue(value,{naiveOffset}={}){
  const raw=String(value??'').trim();if(!raw)return null;
  if(aware.test(raw)){const d=new Date(raw);return Number.isFinite(d.getTime())?d:null;}
  const m=parts.exec(raw);if(!m)return null;
  // Local MES wall-clock values stay local; raw grids can explicitly specify UTC.
  if(naiveOffset!==undefined&&m[4]){const d=new Date(raw.replace(' ','T')+naiveOffset);return Number.isFinite(d.getTime())?d:null;}
  const [,year,month,day,hour='00',minute='00',second='00']=m;
  const d=new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
  if(!Number.isFinite(d.getTime())||d.getUTCDate()!==Number(day)||d.getUTCMonth()+1!==Number(month))return null;
  return {date:d,hasTime:Boolean(m[4])};
}
export function formatFactoryDateTime(value,{seconds=true,locale=language(),dateOnly=false,naiveOffset}={}){
  const parsed=dateValue(value,{naiveOffset});if(!parsed)return '—';
  const local=!(parsed instanceof Date),date=local?parsed.date:parsed;
  return new Intl.DateTimeFormat(locale,{timeZone:local?'UTC':FACTORY_ZONE,year:'numeric',month:'2-digit',day:'2-digit',
    ...(!dateOnly&&(!local||parsed.hasTime)?{hour:'2-digit',minute:'2-digit',...(seconds?{second:'2-digit'}:{}),hourCycle:'h23'}:{})}).format(date).replace(',', '');
}
export function formatFactoryDate(value,options={}){return formatFactoryDateTime(value,{...options,dateOnly:true});}
export function factoryHourKey(value){
  const parsed=dateValue(value);if(!parsed||(!(parsed instanceof Date)&&!parsed.hasTime))return '';
  return new Intl.DateTimeFormat('en-GB',{timeZone:parsed instanceof Date?FACTORY_ZONE:'UTC',hour:'2-digit',hourCycle:'h23'}).format(parsed.date||parsed)+':00';
}
export function isTimeLikeKey(key=''){return /(?:^|[_ ])(?:time|date|at)(?:$|[_ ])|(?:Time|Date)$|collected_at|started_at|finished_at|Tran Time/i.test(String(key));}
export function displayValue(key,value,options={}){
  if(value===null||value===undefined||value==='')return '—';
  if(isTimeLikeKey(key)&&/^\d{4}-\d{2}-\d{2}/.test(String(value).trim()))return /(?:operational_date|^date$|_date$)/i.test(key)?formatFactoryDate(value,options):formatFactoryDateTime(value,options);
  return Array.isArray(value)?value.join(', '):typeof value==='object'?JSON.stringify(value):String(value);
}
