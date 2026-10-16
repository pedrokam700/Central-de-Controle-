const asArray=value=>Array.isArray(value)?value:[];
const text=value=>String(value??'').trim();
const normalized=value=>text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

function recordKeys(record){
  return [record?.executionKey,record?.id,record?.docId,record?.key]
    .map(text)
    .filter(Boolean);
}

function recordIdentifiers(record){
  return [record?.id,record?.docId,record?.failureId,record?.activityId,record?.reportId]
    .map(text)
    .filter(Boolean);
}

function linkedIds(executions,field){
  return new Set(asArray(executions).flatMap(item=>asArray(item?.[field]).map(text)).filter(Boolean));
}

function schemaItems(execution){
  const schema=execution?.checklistSchema;
  if(Array.isArray(schema)) return schema;
  if(Array.isArray(schema?.items)) return schema.items;
  return [];
}

function isTargetFailure(item){
  if(item?.outsideTarget===true||item?.withinTarget===false) return true;
  const assessment=normalized(item?.assessment||item?.targetAssessment||item?.metaAssessment);
  return ['fail','failed','ng','outside_target','out_of_target','fora_da_meta','fora da meta'].includes(assessment);
}

function isFpyLabel(label){
  const value=normalized(label);
  return /(^|\W)fpy($|\W)/.test(value)||value.includes('first pass yield');
}

function checklistEntries(execution){
  const saved=asArray(execution?.checklist);
  const schema=schemaItems(execution);
  const schemaById=new Map(schema.map((item,index)=>[text(item?.id||item?.itemId||index),item]));
  return saved.map((item,index)=>{
    const key=text(item?.itemId||item?.id||index);
    const definition=schemaById.get(key)||schema[index]||{};
    const label=text(definition?.label||definition?.name||item?.label||item?.name||`Item ${index+1}`);
    const unit=text(definition?.unit||item?.unit);
    const value=text(item?.value);
    return {
      executionKey:recordKeys(execution)[0]||'',
      executionId:text(execution?.id||execution?.docId||execution?.executionKey),
      dateKey:text(execution?.dateKey||execution?.originDateKey),
      completedAt:text(execution?.completedAt||execution?.updatedAt||execution?.createdAt),
      routineName:text(execution?.routineName||execution?.name||execution?.title),
      scopeName:text(execution?.scopeName||execution?.originScopeName||execution?.scopeCode),
      label,
      unit,
      value,
      evidence:text(item?.evidence),
      assessment:text(item?.assessment||item?.targetAssessment||item?.metaAssessment),
      targetFailure:isTargetFailure(item),
      isFpy:isFpyLabel(label)
    };
  });
}

function eventTime(value){
  const raw=text(value);
  if(!raw) return 0;
  const parsed=Date.parse(raw);
  return Number.isFinite(parsed)?parsed:0;
}

function executionLabel(execution){
  return text(execution?.routineName||execution?.name||execution?.title||'Rotina');
}

function scopeLabel(execution){
  return text(execution?.scopeName||execution?.originScopeName||execution?.scopeCode||'Sem escopo');
}

function historyItem(item){
  return {
    timestamp:text(item?.at||item?.timestamp||item?.createdAt||item?.updatedAt||item?.date),
    kind:text(item?.kind||item?.type||item?.category),
    title:text(item?.summary||item?.title||item?.label||item?.name||item?.action||'Alteração administrativa'),
    detail:text(item?.detail||item?.description||item?.label||item?.action),
    actor:text(item?.by||item?.actorName||item?.userName||item?.changedByName||item?.ownerName)
  };
}

function isSystemAccount(user){
  return user?.systemAccount===true||normalized(user?.id||user?.docId)==='master';
}

export function buildDailyAdminInsights({
  executions=[],
  operationalFailures=[],
  reports=[],
  activities=[],
  users=[],
  adminHistory=[]
}={}){
  const rows=asArray(executions);
  const executionKeySet=new Set(rows.flatMap(recordKeys));
  const explicitlyLinkedFailureIds=linkedIds(rows,'linkedFailureIds');
  const explicitlyLinkedActivityIds=linkedIds(rows,'linkedActivityIds');

  const linkedFailures=asArray(operationalFailures).filter(item=>{
    const origin=text(item?.originRoutineExecutionId);
    const ids=recordIdentifiers(item);
    return (origin&&executionKeySet.has(origin))||ids.some(id=>explicitlyLinkedFailureIds.has(id));
  });
  const linkedFailureIds=new Set(linkedFailures.flatMap(recordIdentifiers));

  const linkedReports=asArray(reports).filter(item=>{
    const origin=text(item?.originRoutineExecutionId);
    const sourceFailure=text(item?.sourceOperationalFailureId);
    return (origin&&executionKeySet.has(origin))||(sourceFailure&&linkedFailureIds.has(sourceFailure));
  });

  const linkedActivities=asArray(activities).filter(item=>{
    const origin=text(item?.originRoutineExecutionId);
    const ids=recordIdentifiers(item);
    return (origin&&executionKeySet.has(origin))||ids.some(id=>explicitlyLinkedActivityIds.has(id));
  });

  const checklist=rows.flatMap(checklistEntries);
  const collectedValues=checklist.filter(item=>item.value!==''||item.evidence!=='');
  const targetFailures=checklist.filter(item=>item.targetFailure);
  const fpyEntries=checklist
    .filter(item=>item.isFpy&&item.value!=='')
    .sort((a,b)=>eventTime(b.completedAt||b.dateKey)-eventTime(a.completedAt||a.dateKey));

  const alerts=rows.flatMap(execution=>{
    const reasons=[];
    const timingState=normalized(execution?.dashboardTimingState||execution?.timingState);
    const result=normalized(execution?.result);
    if(timingState==='missed') reasons.push('Não cumprida');
    if(timingState==='overdue') reasons.push('Atrasada');
    if(result==='ng') reasons.push('Resultado NG');
    const executionTargetFailures=checklistEntries(execution).filter(item=>item.targetFailure).length;
    if(executionTargetFailures) reasons.push(`${executionTargetFailures} fora da meta`);
    if(!reasons.length) return [];
    return [{
      executionKey:recordKeys(execution)[0]||'',
      dateKey:text(execution?.dateKey||execution?.originDateKey),
      routineName:executionLabel(execution),
      scopeName:scopeLabel(execution),
      reasons,
      status:text(execution?.status),
      result:text(execution?.result)
    }];
  });

  const teamUsers=asArray(users).filter(user=>!isSystemAccount(user));
  const activeUsers=teamUsers.filter(user=>user?.disabled!==true);
  const disabledUsers=teamUsers.filter(user=>user?.disabled===true);
  const activeAdmins=activeUsers.filter(user=>normalized(user?.role)==='admin');
  const activeOperators=activeUsers.filter(user=>normalized(user?.role)!=='admin');
  const history=asArray(adminHistory)
    .map(historyItem)
    .sort((a,b)=>eventTime(b.timestamp)-eventTime(a.timestamp));

  return {
    counts:{
      failures:linkedFailures.length,
      reports:linkedReports.length,
      activities:linkedActivities.length,
      targetFailures:targetFailures.length,
      fpyReadings:fpyEntries.length,
      collectedValues:collectedValues.length,
      activeUsers:activeUsers.length,
      disabledUsers:disabledUsers.length,
      activeAdmins:activeAdmins.length,
      activeOperators:activeOperators.length,
      adminChanges:history.length
    },
    linkedFailures,
    linkedReports,
    linkedActivities,
    collectedValues,
    targetFailures,
    fpyEntries,
    alerts,
    history,
    governance:{
      activeUsers:activeUsers.length,
      disabledUsers:disabledUsers.length,
      activeAdmins:activeAdmins.length,
      activeOperators:activeOperators.length,
      systemAccounts:asArray(users).length-teamUsers.length
    }
  };
}
