import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const tools=process.env.FIREBASE_TEST_MODULES;
if(!tools)throw Error('Set FIREBASE_TEST_MODULES to isolated node_modules');
const {initializeTestEnvironment,assertSucceeds,assertFails}=await import(pathToFileURL(tools+'/@firebase/rules-unit-testing/dist/esm/index.esm.js'));
const {doc,setDoc,getDoc,deleteDoc,updateDoc,serverTimestamp,Timestamp}=await import(pathToFileURL(tools+'/firebase/firestore/dist/index.mjs'));
const env=await initializeTestEnvironment({projectId:'demo-central-mes',firestore:{rules:fs.readFileSync('firestore.rules','utf8')}});
const uid='A',key='a'.repeat(64),line='TAN10101';
const head={schema:'central-ames-v2',owner_uid:uid,line_id:line,source_id:'source',snapshot_id:'1',snapshot_num:1,snapshot_revision:1,key,hash:key,parts:1,collected_at:'2026-10-09T10:00:00Z'};
const v2=(email,access_level,approval_state='approved')=>({email,disabled:false,role:'user',admission_version:2,access_level,approval_state});
const auth=(id,email,email_verified=true)=>env.authenticatedContext(id,{email,email_verified}).firestore();
try{
  await env.withSecurityRulesDisabled(async c=>{
    const db=c.firestore();
    for(const id of ['A','B','disabled'])await setDoc(doc(db,'users',id),{email:id+'@example.test',disabled:id==='disabled',role:'user'});
    await setDoc(doc(db,'users','legacyAdmin'),{email:'legacy-admin@example.test',disabled:false,role:'admin'});
    await setDoc(doc(db,'users','pendingV2'),v2('pending@example.test','viewer','pending'));
    await setDoc(doc(db,'users','unverifiedV2'),v2('unverified@example.test','viewer'));
    await setDoc(doc(db,'users','viewerV2'),v2('viewer@example.test','viewer'));
    await setDoc(doc(db,'users','operatorV2'),v2('operator@example.test','operator'));
    await setDoc(doc(db,'users','engineerV2'),v2('engineer@example.test','engineer'));
    await setDoc(doc(db,'users','supervisorV2'),v2('supervisor@example.test','supervisor'));
    await setDoc(doc(db,'users','adminV2'),{...v2('admin@example.test','admin'),role:'admin'});
    await setDoc(doc(db,'reports','seed'),{description:'seed'});
    await setDoc(doc(db,'products','seed'),{name:'seed'});
  });

  const a=env.authenticatedContext('A').firestore(),b=env.authenticatedContext('B').firestore(),guest=env.unauthenticatedContext().firestore(),disabled=env.authenticatedContext('disabled').firestore();
  const path=['amesUsers','A','lines',line],part=[...path,'snapshots',key,'parts','0'],team=['amesTeamLines',line];
  await assertSucceeds(setDoc(doc(a,...part),{owner_uid:'A',line_id:line,key,index:0,data:'sanitized'}));
  await assertSucceeds(setDoc(doc(a,...path),head));
  await assertSucceeds(setDoc(doc(a,...team),head));
  await assertSucceeds(getDoc(doc(a,...path)));
  await assertFails(getDoc(doc(b,...path)));
  await assertSucceeds(getDoc(doc(b,...team)));
  await assertSucceeds(getDoc(doc(b,...part)));
  await assertFails(getDoc(doc(guest,...team)));await assertFails(getDoc(doc(guest,...part)));
  await assertFails(getDoc(doc(disabled,...team)));await assertFails(getDoc(doc(disabled,...part)));
  await assertFails(setDoc(doc(b,...path),head));
  await assertFails(setDoc(doc(b,...team),head));
  const bKey='b'.repeat(64),bHead={...head,owner_uid:'B',source_id:'source-b',key:bKey,hash:bKey};
  await assertFails(setDoc(doc(b,...team),bHead));
  await assertSucceeds(setDoc(doc(b,'amesUsers','B','lines',line,'snapshots',bKey,'parts','0'),{owner_uid:'B',line_id:line,key:bKey,index:0,data:'sanitized-b'}));
  await assertSucceeds(setDoc(doc(b,'amesUsers','B','lines',line),bHead));
  await assertSucceeds(setDoc(doc(b,...team),bHead));
  await assertFails(setDoc(doc(b,...team),{...bHead,snapshot_revision:2}));
  await assertFails(setDoc(doc(a,...path),{...head,line_id:'TAN10102'}));
  await assertFails(setDoc(doc(a,...part),{owner_uid:'A',line_id:line,key,index:0,data:'changed'}));
  await assertSucceeds(setDoc(doc(a,...path),{...head,snapshot_revision:2}));await assertFails(setDoc(doc(a,...path),head));
  await assertFails(setDoc(doc(a,...path),{...head,snapshot_revision:3,password:'secret'}));await assertFails(deleteDoc(doc(a,...path)));
  await assertFails(setDoc(doc(a,'amesUsers','A','lines','TAN99999'),{...head,line_id:'TAN99999'}));
  await assertFails(setDoc(doc(a,'amesTeamLines','TAN99999'),{...head,line_id:'TAN99999'}));

  await assertSucceeds(setDoc(doc(a,'reports','legacy-report'),{description:'manual preserved'}));
  await assertSucceeds(setDoc(doc(a,'products','legacy-product'),{name:'legacy preserved'}));

  const pending=auth('pendingV2','pending@example.test',true);
  const unverified=auth('unverifiedV2','unverified@example.test',false);
  const viewer=auth('viewerV2','viewer@example.test',true);
  const operator=auth('operatorV2','operator@example.test',true);
  const engineer=auth('engineerV2','engineer@example.test',true);
  const supervisor=auth('supervisorV2','supervisor@example.test',true);
  const admin=auth('adminV2','admin@example.test',true);

  await assertFails(getDoc(doc(pending,'reports','seed')));
  await assertFails(getDoc(doc(unverified,'reports','seed')));
  await assertSucceeds(getDoc(doc(viewer,'reports','seed')));

  await assertFails(setDoc(doc(viewer,'reports','viewer-write'),{description:'blocked'}));
  await assertFails(setDoc(doc(viewer,'products','viewer-product'),{name:'blocked'}));
  const viewerKey='c'.repeat(64),viewerHead={...head,owner_uid:'viewerV2',source_id:'viewer',key:viewerKey,hash:viewerKey};
  await assertFails(setDoc(doc(viewer,'amesUsers','viewerV2','lines',line,'snapshots',viewerKey,'parts','0'),{owner_uid:'viewerV2',line_id:line,key:viewerKey,index:0,data:'blocked'}));

  await assertSucceeds(setDoc(doc(operator,'reports','operator-report'),{description:'allowed'}));
  await assertSucceeds(setDoc(doc(operator,'operationalFailures','operator-failure'),{issue:'allowed'}));
  await assertFails(setDoc(doc(operator,'products','operator-product'),{name:'blocked'}));
  const operatorKey='d'.repeat(64),operatorHead={...head,owner_uid:'operatorV2',source_id:'operator',key:operatorKey,hash:operatorKey};
  await assertSucceeds(setDoc(doc(operator,'amesUsers','operatorV2','lines',line,'snapshots',operatorKey,'parts','0'),{owner_uid:'operatorV2',line_id:line,key:operatorKey,index:0,data:'sanitized'}));
  await assertSucceeds(setDoc(doc(operator,'amesUsers','operatorV2','lines',line),operatorHead));
  await assertSucceeds(setDoc(doc(operator,'amesTeamLines',line),operatorHead));

  await assertSucceeds(setDoc(doc(engineer,'products','engineer-product'),{name:'allowed'}));
  await assertSucceeds(setDoc(doc(engineer,'failureAnalyses','engineer-analysis'),{status:'open'}));
  await assertSucceeds(setDoc(doc(supervisor,'aiKnowledge','supervisor-knowledge'),{title:'allowed'}));
  await assertFails(setDoc(doc(supervisor,'workShifts','shift-supervisor'),{name:'blocked'}));
  await assertSucceeds(setDoc(doc(admin,'workShifts','shift-admin'),{name:'allowed'}));

  // Lease/fencing groundwork: cada escrita usa novos sentinels de tempo do servidor.
  const wsA='ws_'+'a'.repeat(32),wsB='ws_'+'b'.repeat(32),leaseRef=doc(operator,'amesLineLeases',line);
  const leasePayload=({lineId=line,ownerUid='operatorV2',workstationId=wsA,generation=1})=>({
    schema:'central-collector-lease-v1',line_id:lineId,owner_uid:ownerUid,workstation_id:workstationId,generation,
    acquired_at:serverTimestamp(),renewed_at:serverTimestamp(),status:'active'
  });
  await assertSucceeds(setDoc(leaseRef,leasePayload({})));
  await assertSucceeds(getDoc(doc(viewer,'amesLineLeases',line)));
  await assertFails(getDoc(doc(pending,'amesLineLeases',line)));
  await assertFails(setDoc(doc(viewer,'amesLineLeases','TAN10102'),leasePayload({lineId:'TAN10102',ownerUid:'viewerV2'})));
  // Outro coletor não toma a linha antes do TTL do servidor, mesmo elevando a geração.
  await assertFails(setDoc(doc(engineer,'amesLineLeases',line),leasePayload({ownerUid:'engineerV2',workstationId:wsB,generation:2})));
  const liveLease=(await getDoc(leaseRef)).data();
  await assertSucceeds(setDoc(leaseRef,{...liveLease,renewed_at:serverTimestamp()}));
  await assertFails(deleteDoc(leaseRef));

  // Para provar takeover sem esperar 10 minutos, semeia lease com renewed_at já expirado.
  await env.withSecurityRulesDisabled(async c=>{
    await setDoc(doc(c.firestore(),'amesLineLeases',line),{
      schema:'central-collector-lease-v1',line_id:line,owner_uid:'operatorV2',workstation_id:wsA,generation:4,
      acquired_at:Timestamp.fromMillis(Date.now()-20*60*1000),renewed_at:Timestamp.fromMillis(Date.now()-11*60*1000),status:'active'
    });
  });
  await assertSucceeds(setDoc(doc(engineer,'amesLineLeases',line),leasePayload({ownerUid:'engineerV2',workstationId:wsB,generation:5})));

  await env.withSecurityRulesDisabled(async c=>{
    await setDoc(doc(c.firestore(),'amesLineLeases','TAN10102'),{
      schema:'central-collector-lease-v1',line_id:'TAN10102',owner_uid:'operatorV2',workstation_id:wsA,generation:9,
      acquired_at:Timestamp.fromMillis(Date.now()-20*60*1000),renewed_at:Timestamp.fromMillis(Date.now()-11*60*1000),status:'active'
    });
  });
  await assertFails(setDoc(doc(engineer,'amesLineLeases','TAN10102'),leasePayload({lineId:'TAN10102',ownerUid:'engineerV2',workstationId:wsB,generation:9})));
  await assertSucceeds(setDoc(doc(engineer,'amesLineLeases','TAN10102'),leasePayload({lineId:'TAN10102',ownerUid:'engineerV2',workstationId:wsB,generation:10})));

  const audit={schema:'central-admission-audit-v1',action:'approve',target_uid:'viewerV2',actor_uid:'adminV2',at:123456,reason:'approved for operation',before:{approval_state:'pending',access_level:'viewer'},after:{approval_state:'approved',access_level:'operator'}};
  await assertSucceeds(setDoc(doc(admin,'admissionAudit','audit-1'),audit));
  await assertSucceeds(getDoc(doc(admin,'admissionAudit','audit-1')));
  await assertFails(getDoc(doc(viewer,'admissionAudit','audit-1')));
  await assertFails(setDoc(doc(operator,'admissionAudit','audit-2'),{...audit,actor_uid:'operatorV2'}));
  await assertFails(setDoc(doc(admin,'admissionAudit','audit-3'),{...audit,actor_uid:'someone-else'}));
  await assertFails(updateDoc(doc(admin,'admissionAudit','audit-1'),{reason:'tampered'}));
  await assertFails(deleteDoc(doc(admin,'admissionAudit','audit-1')));

  await assertFails(updateDoc(doc(viewer,'users','viewerV2'),{access_level:'engineer'}));
  await assertFails(updateDoc(doc(viewer,'users','viewerV2'),{approval_state:'pending'}));
  await assertSucceeds(updateDoc(doc(viewer,'users','viewerV2'),{name:'Viewer Name'}));

  const newUser=auth('newV2','new@example.test',false);
  await assertSucceeds(setDoc(doc(newUser,'users','newV2'),{uid:'newV2',name:'New',...v2('new@example.test','viewer','pending')}));
  const escalated=auth('newEscalated','new2@example.test',true);
  await assertFails(setDoc(doc(escalated,'users','newEscalated'),{uid:'newEscalated',name:'Bad',...v2('new2@example.test','operator','approved')}));

  console.log('PASS: legacy/V2 RBAC + admission audit + MES authority + server-time collector lease/fencing groundwork');
}finally{await env.cleanup();}