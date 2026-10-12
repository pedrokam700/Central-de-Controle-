import {ACCESS_LEVELS,profileGeneration} from './access-policy.mjs';

export const LEGACY_ACCOUNT_MIGRATION_SCHEMA='central-legacy-account-migration-v1';

const clean=value=>String(value??'').trim();

function classify(profile){
  const generation=profileGeneration(profile);
  if(generation==='legacy')return profile?.disabled===true?'legacy_disabled':'legacy_active';
  const approval=clean(profile?.approval_state||'pending').toLowerCase();
  const level=clean(profile?.access_level).toLowerCase();
  if(!ACCESS_LEVELS.includes(level))return 'v2_invalid';
  if(profile?.disabled===true)return 'v2_disabled';
  if(approval==='approved')return 'v2_approved';
  if(approval==='denied')return 'v2_denied';
  if(approval==='pending')return 'v2_pending';
  return 'v2_invalid';
}

export function legacyAccountMigrationInventory(profiles=[]){
  const rows=Array.isArray(profiles)?profiles.filter(profile=>profile&&typeof profile==='object'):[];
  const counts={
    total:rows.length,
    legacy_total:0,
    legacy_active:0,
    legacy_disabled:0,
    v2_total:0,
    v2_approved:0,
    v2_pending:0,
    v2_denied:0,
    v2_disabled:0,
    v2_invalid:0
  };
  for(const profile of rows){
    const state=classify(profile);
    if(state.startsWith('legacy_')){
      counts.legacy_total++;
      counts[state]++;
    }else{
      counts.v2_total++;
      counts[state]++;
    }
  }
  const fallbackRemovalAllowed=counts.total>0&&counts.legacy_total===0&&counts.v2_invalid===0;
  return Object.freeze({
    schema:LEGACY_ACCOUNT_MIGRATION_SCHEMA,
    ...counts,
    migration_complete:counts.legacy_total===0,
    fallback_removal_allowed:fallbackRemovalAllowed,
    requires_explicit_admin_decision:counts.legacy_total>0,
    auto_migration_allowed:false,
    bulk_migration_allowed:false,
    access_level_inference_allowed:false
  });
}

export function legacyMigrationProgress(inventory){
  const total=Number(inventory?.total||0),v2=Number(inventory?.v2_total||0);
  if(total<=0)return 0;
  return Math.max(0,Math.min(100,Math.round((v2/total)*100)));
}
