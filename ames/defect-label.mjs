// Presentation only: preserve raw snapshots and backend Defect Codes.
export function knownDescription(value){
  const text=String(value??'').trim();
  return /^(?:undefined(?: error)?|null|none|nan)$/i.test(text)?'':text;
}
export function defectDescription(value,locale=globalThis.document?.documentElement?.lang||'pt-BR'){
  return knownDescription(value)||(locale.startsWith('en')?'Description not provided':'Descrição não informada');
}
// Operator-facing labels are description-first. The raw code remains available as
// a secondary technical reference and is the fallback only when no description exists.
export function defectLabel(code,description,locale=globalThis.document?.documentElement?.lang||'pt-BR'){
  const desc=knownDescription(description),raw=String(code??'').trim();
  if(desc&&raw)return `${desc} — ${raw}`;
  if(desc)return desc;
  if(raw)return raw;
  return locale.startsWith('en')?'Failure not identified':'Falha não identificada';
}
