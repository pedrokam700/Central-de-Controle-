import rules from './failure-taxonomy-rules.mjs';
export const FAILURE_TAXONOMY_VERSION=rules.version;
const normalize=v=>String(v??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const contains=(text,phrase)=>Boolean(phrase)&&(' '+text+' ').includes(' '+phrase+' ');
export function describeFailure(code,desc){
 let text=normalize(desc);
 for(const [old,next] of Object.entries(rules.aliases).sort((a,b)=>b[0].length-a[0].length))text=(' '+text+' ').split(' '+normalize(old)+' ').join(' '+normalize(next)+' ').trim();
 const family=Object.entries(rules.families).find(([,words])=>words.some(w=>contains(text,normalize(w))))?.[0]||'OUTRO';
 const subtypes=Object.entries(rules.subtypes[family]||{}).filter(([,words])=>words.some(w=>contains(text,normalize(w)))).map(([s])=>s);
 let normalizedCode=String(code??'').trim().toUpperCase();normalizedCode=rules.code_aliases[normalizedCode]||normalizedCode;if(rules.unknown_codes.includes(normalizedCode))normalizedCode='';
 return {code:normalizedCode,text,family,subtype:subtypes.length===1?subtypes[0]:null,ambiguous:subtypes.length>1,negative:rules.negative_phrases.some(p=>contains(text,normalize(p)))};
}
export function compareFailures(cc,cd,oc,od,context={}){
 const a=describeFailure(cc,cd),b=describeFailure(oc,od);
 for(const [key,item] of [['currentFamily',a],['oldFamily',b]])if(context[key]!==undefined)item.family=Object.hasOwn(rules.families,context[key])?context[key]:'OUTRO';
 let classification='UNKNOWN',reason_code='INSUFFICIENT_EVIDENCE';
 if(a.negative||b.negative)reason_code='NEGATED_FAILURE';
 else if(a.ambiguous||b.ambiguous)reason_code='AMBIGUOUS_SUBTYPE';
 else if(a.family===b.family&&a.subtype&&b.subtype&&a.subtype!==b.subtype&&!rules.cross_subtype_similar.includes(a.family)){
  [classification,reason_code]=a.code&&a.code===b.code?['UNKNOWN','CODE_SUBTYPE_CONFLICT']:['OTHER','DISTINCT_SUBTYPES'];
 }else if(a.code&&a.code===b.code)[classification,reason_code]=['EXACT','CODE_EQUAL_OR_FORMAL_ALIAS'];
 else if(a.family!=='OUTRO'&&a.family===b.family){
  if(rules.subtypes[a.family]&&(!a.subtype||!b.subtype))reason_code='SUBTYPE_UNPROVEN';
  else [classification,reason_code]=['SIMILAR','SAME_OPERATIONAL_SUBSYSTEM'];
 }else if(a.family!=='OUTRO'&&b.family!=='OUTRO')[classification,reason_code]=['OTHER','DISTINCT_SUBSYSTEMS'];
 return {classification,reason_code,version:rules.version,current_family:a.family,old_family:b.family,current_subtype:a.subtype,old_subtype:b.subtype,current_code:cc,current_desc:cd,old_code:oc,old_desc:od};
}

export function explainFailureComparison(match,locale='pt-BR'){return rules.reasons[match?.reason_code]?.[locale.startsWith('en')?'en':'pt']||match?.reason_code||'';}
