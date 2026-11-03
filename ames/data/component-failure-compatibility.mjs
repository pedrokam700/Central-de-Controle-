import {describeFailure} from './failure-taxonomy.mjs';

export const COMPONENT_FAILURE_MATCHER_VERSION='2026-10-23.1';
const norm=v=>String(v??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[_-]+/g,' ').trim();
const has=(s,re)=>re.test(s);

export function describePhysicalComponent(type=''){
  const name=norm(type);
  if(has(name,/camera|cam\b|摄像|相机/)){
    const front=has(name,/front|frontal|dianteira|前置|前摄/);
    const rear=has(name,/rear|back|traseira|后置|后摄|main camera|主摄/);
    const main=has(name,/main|primary|principal|主摄/);
    const secondary=has(name,/secondary|second|sub cam|auxiliary|secundaria|副摄/);
    return {family:'CAMERA',position:front&&!rear?'front':rear&&!front?'rear':null,
      module:main&&!secondary?'main':secondary&&!main?'secondary':null,ambiguous:front&&rear||main&&secondary};
  }
  if(has(name,/screen|display|\blcd\b|\blcm\b|tela|visor|显示屏|屏幕|液晶/))return {family:'DISPLAY_LCD'};
  if(has(name,/antenna|antena|\brf\b|天线/))return {family:'CONNECTIVITY_RF',part:'antenna'};
  if(has(name,/receiver|earpiece|auricular|受话器|听筒/))return {family:'AUDIO',part:'receiver'};
  if(has(name,/speaker|loudspeaker|alto falante|扬声器|喇叭/))return {family:'AUDIO',part:'speaker'};
  if(has(name,/microphone|\bmic\b|microfone|麦克风|咪头/))return {family:'AUDIO',part:'microphone'};
  if(has(name,/battery|bateria|电池/))return {family:'BATTERY_POWER'};
  if(has(name,/fingerprint|digital|指纹/))return {family:'FINGERPRINT'};
  if(has(name,/\bsub board\b|\baboard\b|\bu board\b|\bcboard\b|subplaca|副板/))return {family:'USB_CHARGING',part:'sub_board'};
  return {family:'UNKNOWN'};
}

export function matchComponentToCurrentFailure(itemType,defectCode,defectDescription){
  const component=describePhysicalComponent(itemType),failure=describeFailure(defectCode,defectDescription);
  const description=norm(defectDescription);
  const base={version:COMPONENT_FAILURE_MATCHER_VERSION,component,failure,
    classification:'UNKNOWN',reason:'insufficient_component_or_failure_classification'};
  if(failure.negative||failure.ambiguous||component.ambiguous)return {...base,reason:'negative_or_ambiguous_description'};
  if(component.family==='UNKNOWN'||failure.family==='OUTRO')return base;
  if(component.family!==failure.family)return {...base,reason:'different_subsystems'};
  if(component.family==='CAMERA'){
    const front=has(description,/front|frontal|dianteira|前置|前摄/);
    const rear=has(description,/rear|back|traseira|后置|后摄/);
    const position=front&&!rear?'front':rear&&!front?'rear':failure.subtype||null;
    const main=has(description,/main|primary|principal|主摄/),secondary=has(description,/secondary|second|sub cam|auxiliary|secundaria|副摄/);
    const module=main&&!secondary?'main':secondary&&!main?'secondary':null;
    if(front&&rear||main&&secondary)return {...base,reason:'conflicting_camera_subtypes'};
    if(component.position&&position&&component.position!==position||
       component.module&&module&&component.module!==module)return {...base,reason:'camera_subtype_mismatch'};
    if(!component.position||!position)return {...base,reason:'camera_position_unproven'};
    if(component.module&&module&&component.module===module)
      return {...base,classification:'EXACT_COMPATIBLE',reason:'camera_position_and_module_agree'};
    return {...base,classification:'FAMILY_COMPATIBLE',reason:'camera_position_agrees_module_unproven'};
  }
  if(component.family==='AUDIO'){
    const soundPart=has(description,/receiver|earpiece|auricular|受话器|听筒/)?'receiver':
      has(description,/speaker|loudspeaker|alto falante|扬声器|喇叭/)?'speaker':
      has(description,/microphone|\bmic\b|microfone|麦克风|咪头/)?'microphone':null;
    if(soundPart&&soundPart!==component.part)return {...base,reason:'audio_part_mismatch'};
    return {...base,classification:soundPart?'EXACT_COMPATIBLE':'FAMILY_COMPATIBLE',reason:soundPart?'audio_part_agrees':'generic_audio_failure'};
  }
  if(component.family==='CONNECTIVITY_RF')return {...base,classification:has(description,/antenna|antena|天线/)?'EXACT_COMPATIBLE':'FAMILY_COMPATIBLE',reason:'rf_or_antenna_related'};
  if(component.family==='USB_CHARGING')return {...base,classification:'FAMILY_COMPATIBLE',reason:'sub_board_related_to_charging_not_root_cause'};
  return {...base,classification:'EXACT_COMPATIBLE',reason:'known_component_subsystem_agrees'};
}

export function compatibleComponentReuseAlerts(model={}){
  if(!model.current||model.detected_type==='MATERIAL_SN'||
    model.material_selection?.cycle_state==='current_new_cycle')return [];
  if(!['selected_at_latest_2114_candidate','current_mounting_new_cycle'].includes(model.material_selection?.status))return [];
  const alerts=[];
  for(const material of model.materials||[]){
    if(material.raw?.current_pcba_confirmed!==true||
      !(Number(material.known_use_count)>=2||Number(material.reuse_count)>=1))continue;
    const match=matchComponentToCurrentFailure(material.item_type,model.current.defect_code,model.current.defect_desc);
    if(match.classification==='UNKNOWN')continue;
    alerts.push({kind:'COMPONENT_TYPE_COMPATIBLE',severity:'medium',item_sn:material.item_sn,
      item_type:material.item_type,pcba_sn:model.current_pcba,relation:match.classification,
      sources:['3074','2114'],match,root_cause_confirmed:false,
      evidence:{binding:{item_sn:material.item_sn,current_pcba:model.current_pcba,
        source:'3074'},current_failure:model.current}});
  }
  return alerts;
}
