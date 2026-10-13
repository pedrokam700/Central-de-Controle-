import {createAdvancedTable} from './advanced-table.mjs';
import {escapeHtml as esc} from './evidence-view.mjs';

// PR26 3012 enrichment uses the shared configurable table. The canonical SN
// view already renders 2114/3074/3022; no second reuse dashboard is mounted.
export const REPAIR_COLUMNS=[['pcba_sn','PCBA'],['line','Linha'],['product_model','Modelo'],['product_id','Product ID'],['sample_batch_id','Batch ID'],['defect_oper','Operation / Station'],['defect_code','Defect Code'],['defect_desc','Defect Description'],['defect_time','Defect Time'],['defect_user','Defect User'],['repair_user','Repair User'],['repair_time','Repair Time'],['repair_code','Repair Code'],['repair_comment','Repair Comment'],['defect_reason_type','Reason Type'],['defect_reason_desc','Reason Description']].map(([key,label])=>({key,label,en:label}));
export function withFastlaneSnEnhancements(base,root,store){
 let last='',table=null;
 return {render(){base.render();const agent=store.agent(),result=agent.resultSource==='sn'?agent.job?.result:null;
  if(!result)return;
  const rows=result.trace_3012?.rows||[],key=JSON.stringify(rows);
  if(key===last&&root.querySelector('[data-sn-repair-table]'))return;last=key;
  root.querySelector('[data-fastlane-sn]')?.remove();
  const section=document.createElement('section');section.dataset.fastlaneSn='1';section.className='mes-context-panel';
  const en=document.documentElement.lang.startsWith('en');section.setAttribute('data-no-i18n','');
  section.innerHTML=`<h3>3012 · ${en?'Repair and analysis':'Reparo e análise'}</h3><p>${esc(en?'Complementary source. Rows retain their own PCBA, defect and repair timestamps; differences from 2114 remain visible.':'Fonte complementar. Registros mantêm PCBA e horários próprios de falha/reparo; divergências com 2114 permanecem visíveis.')}</p><div data-sn-repair-table></div>`;
  root.querySelector('[data-sn-result]')?.append(section);
  table=createAdvancedTable(section.querySelector('[data-sn-repair-table]'),{rows,columns:REPAIR_COLUMNS,key:'sn-repair',presets:[{id:'repair',label:'Reparo 3012',en:'3012 repair',columns:['pcba_sn','defect_code','defect_desc','defect_time','repair_user','repair_time','repair_code','repair_comment']}]});
 },clear(){table?.clear();base.clear?.();last='';}};
}
