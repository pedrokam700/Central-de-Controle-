// Reconcile existing trace_insights/TIPOS_COMPONENTE aggregates with physical evidence.
const text=v=>String(v??'').trim();
const number=v=>v!==null&&v!==undefined&&v!==''&&Number.isSafeInteger(Number(v))&&Number(v)>=0?Number(v):null;
const list=v=>{if(Array.isArray(v))return v.map(text);try{const x=JSON.parse(v);if(Array.isArray(x))return x.map(text);}catch{}return text(v).split(/[|,;\n]/).map(text).filter(Boolean);};
export const COMPONENT_METRICS={total:'Materiais únicos no lote',reused:'Reutilizados únicos',second:'2º uso',third:'3º+ uso',same:'Com mesma falha',similar:'Com mesma família',different:'Com falha diferente',links:null,unknown:null};
export function componentMatrix(snapshot={}){
 const insights=snapshot.insights||{},drill=insights.drilldowns||{},complete=Array.isArray(drill.component_type_items),physical=new Map();
 const rows=[...(drill.component_type_items||[]),...(drill.material_analysis||[])];
 for(const r of rows){
  if(r.Linha&&r.Linha!==snapshot.line_id)continue;
  const sn=text(r['Material SN']),type=text(r['Tipo material']);if(!sn||!type)continue;
  const key=JSON.stringify([type,sn]);
  if(!physical.has(key))physical.set(key,{key,sn,type,previous:new Set(),counts:new Set(),rows:[],same:false,similar:false,different:false});
  const item=physical.get(key),uses=number(r['Reusos anteriores material']);if(uses!==null)item.counts.add(uses);
  list(r['PCBAs desvinculadas']).forEach(p=>item.previous.add(p));item.rows.push(r);
  item.same||=number(r['PCBAs com mesma falha'])>0;item.similar||=number(r['PCBAs com mesma família'])>0;item.different||=number(r['PCBAs com falha diferente'])>0;
 }
 const types=new Set([...physical.values()].map(r=>r.type));for(const r of insights.component_types||[])if(r['Tipo material'])types.add(text(r['Tipo material']));
 return [...types].sort().map(type=>{
  const items=[...physical.values()].filter(r=>r.type===type).map(r=>({...r,previous:[...r.previous].sort(),uses:r.counts.size===1?[...r.counts][0]+1:null}));
  const aggregate=(insights.component_types||[]).find(r=>text(r['Tipo material'])===type)||{};
  const members={total:items,reused:items.filter(r=>r.uses>=2),second:items.filter(r=>r.uses===2),third:items.filter(r=>r.uses>=3),
   same:items.filter(r=>r.same),similar:items.filter(r=>r.similar&&!r.same),different:items.filter(r=>r.different),
   unknown:items.filter(r=>!r.same&&!r.similar&&!r.different),links:items.flatMap(r=>r.previous.map(pcba=>({...r,previous:[pcba]})))};
  const metrics=Object.fromEntries(Object.entries(members).map(([key,rows])=>{
   const declared=number(aggregate[COMPONENT_METRICS[key]]),observed=rows.length;
   const mismatch=declared!==null&&declared!==observed;
   // Zero is only a count of the fully enumerated observed set, never no failure.
   const enumerated=complete&&items.length>0&&items.every(r=>r.uses!==null);
   const value=mismatch?null:observed>0?observed:enumerated&&['reused','second','third'].includes(key)?0:null;
   return [key,{value,observed,declared,mismatch,rows}];
  }));
  return {type,metrics,classifier_version:insights.classifier_version||null,coverage:complete?'observed_items':'partial',source_id:snapshot.source_id||null,snapshot_id:snapshot.snapshot_id,
   revision:snapshot.snapshot_revision||snapshot.revision||null,line_id:snapshot.line_id,
   period:snapshot.canonical?.summary?.period||snapshot.period||null,component_failure:null,verified_no_failure:null,failure_rate:null};
 });
}
