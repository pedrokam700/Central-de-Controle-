export const SOURCE_STATE=Object.freeze({
  OK:'ok',
  ZERO:'zero',
  NOT_COLLECTED:'not_collected',
  UNAVAILABLE:'unavailable',
  ERROR:'error',
  PARTIAL:'partial',
  CACHED:'cached',
});

const LABELS=Object.freeze({
  [SOURCE_STATE.OK]:['Disponível','Available'],
  [SOURCE_STATE.ZERO]:['Zero confirmado','Confirmed zero'],
  [SOURCE_STATE.NOT_COLLECTED]:['Não coletado','Not collected'],
  [SOURCE_STATE.UNAVAILABLE]:['Indisponível','Unavailable'],
  [SOURCE_STATE.ERROR]:['Erro','Error'],
  [SOURCE_STATE.PARTIAL]:['Parcial','Partial'],
  [SOURCE_STATE.CACHED]:['Cache local','Local cache'],
});

const RAW_ALIASES=Object.freeze({
  complete:SOURCE_STATE.OK,completed:SOURCE_STATE.OK,available:SOURCE_STATE.OK,success:SOURCE_STATE.OK,transported:SOURCE_STATE.OK,
  failed:SOURCE_STATE.ERROR,failure:SOURCE_STATE.ERROR,bad:SOURCE_STATE.ERROR,
  unknown:SOURCE_STATE.NOT_COLLECTED,missing:SOURCE_STATE.NOT_COLLECTED,pending:SOURCE_STATE.NOT_COLLECTED,waiting:SOURCE_STATE.NOT_COLLECTED,
  unsupported:SOURCE_STATE.UNAVAILABLE,not_available:SOURCE_STATE.UNAVAILABLE,notavailable:SOURCE_STATE.UNAVAILABLE,
  stale:SOURCE_STATE.CACHED,cache:SOURCE_STATE.CACHED,local_cache:SOURCE_STATE.CACHED,
});

const SUCCESS_RAW=new Set(['ok','complete','completed','available','success','transported']);
const ERROR_RAW=new Set(['error','failed','failure','bad']);
const UNAVAILABLE_RAW=new Set(['unavailable','unsupported','not_available','notavailable']);

export function normalizeSourceState(value){
  const raw=String(value??'').trim().toLowerCase();
  if(!raw)return SOURCE_STATE.NOT_COLLECTED;
  if(Object.values(SOURCE_STATE).includes(raw))return raw;
  return RAW_ALIASES[raw]||SOURCE_STATE.NOT_COLLECTED;
}

export function sourceStateLabel(state,locale='pt-BR'){
  const normalized=normalizeSourceState(state),pair=LABELS[normalized]||LABELS[SOURCE_STATE.NOT_COLLECTED];
  return String(locale||'').toLowerCase().startsWith('en')?pair[1]:pair[0];
}

export function sourceStateTone(state){
  switch(normalizeSourceState(state)){
    case SOURCE_STATE.OK:
    case SOURCE_STATE.ZERO:return 'ok';
    case SOURCE_STATE.ERROR:return 'bad';
    case SOURCE_STATE.PARTIAL:return 'warn';
    case SOURCE_STATE.CACHED:return 'cached';
    default:return 'unknown';
  }
}

export function sourceStateHasEvidence(state){
  return [SOURCE_STATE.OK,SOURCE_STATE.ZERO,SOURCE_STATE.PARTIAL,SOURCE_STATE.CACHED].includes(normalizeSourceState(state));
}

export function sourceDisplayValue(value,state,{unknown='—'}={}){
  const normalized=normalizeSourceState(state);
  if(normalized===SOURCE_STATE.ZERO)return 0;
  if(!sourceStateHasEvidence(normalized))return unknown;
  return value===null||value===undefined||value===''?unknown:value;
}

export function sourceStateFromTrace(trace,{recordCount=null,countProven=false,cached=false}={}){
  if(cached)return SOURCE_STATE.CACHED;
  if(!trace)return SOURCE_STATE.NOT_COLLECTED;
  const raw=String(trace.status??trace.state??'').trim().toLowerCase();
  const hasError=Boolean(trace.error||trace.reason);
  if(hasError||ERROR_RAW.has(raw))return SOURCE_STATE.ERROR;
  if(raw==='partial')return SOURCE_STATE.PARTIAL;
  if(UNAVAILABLE_RAW.has(raw))return SOURCE_STATE.UNAVAILABLE;
  if(raw==='cached'||raw==='cache'||raw==='local_cache')return SOURCE_STATE.CACHED;
  const completed=trace.ok===true||trace.completed===true||SUCCESS_RAW.has(raw);
  if(countProven&&Number.isFinite(Number(recordCount))){
    const count=Number(recordCount);
    if(count===0&&completed)return SOURCE_STATE.ZERO;
    if(count>0)return SOURCE_STATE.OK;
  }
  return completed?SOURCE_STATE.OK:SOURCE_STATE.NOT_COLLECTED;
}

export function describeSourceState(state,{locale='pt-BR',detail='',source=null,timestamp=null,origin=null}={}){
  const normalized=normalizeSourceState(state);
  return Object.freeze({
    state:normalized,
    label:sourceStateLabel(normalized,locale),
    tone:sourceStateTone(normalized),
    detail:String(detail||''),
    source:source||null,
    timestamp:timestamp||null,
    origin:origin||null,
    proven:sourceStateHasEvidence(normalized),
  });
}
