// Presentation only: preserve raw snapshots and backend Defect Codes.
export function knownDescription(value){
  const text=String(value??'').trim();
  return /^(?:undefined(?: error)?|null|none|nan)$/i.test(text)?'':text;
}
export function defectDescription(value,locale=globalThis.document?.documentElement?.lang||'pt-BR'){
  return knownDescription(value)||(locale.startsWith('en')?'Description not provided':'Descrição não informada');
}
export function defectLabel(code,description){return `${code||'—'} — ${defectDescription(description)}`;}
