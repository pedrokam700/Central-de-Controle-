const LEGACY_USERS_KEY='controleFalhas.users.v1';
const MIGRATION_MARKER='controleFalhas.users.credentialsRemoved.v1';

const text=value=>typeof value==='string'?value.trim():'';
const email=value=>text(value).toLowerCase();

export function sanitizeLegacyUserMetadata(storage=globalThis.localStorage,{now=()=>Date.now()}={}){
  if(!storage||typeof storage.getItem!=='function'||typeof storage.setItem!=='function'||typeof storage.removeItem!=='function')return [];
  let raw;
  try{raw=storage.getItem(LEGACY_USERS_KEY);}catch{return [];}
  if(!raw)return [];
  const marker=(status,extra={})=>{try{storage.setItem(MIGRATION_MARKER,JSON.stringify({at:Number(now()),status,...extra}));}catch{}};
  const removeSource=status=>{
    try{storage.removeItem(LEGACY_USERS_KEY);}catch{}
    marker(status);
  };
  let parsed;
  try{parsed=JSON.parse(raw);}catch{
    // Corrupted legacy credential storage has no safe migration path. Delete the
    // credential-bearing source instead of leaving potentially recoverable secrets.
    removeSource('removed_corrupt_legacy_storage');
    return [];
  }
  if(!Array.isArray(parsed)){
    removeSource('removed_invalid_legacy_storage');
    return [];
  }
  const seen=new Set(),metadata=[];
  for(const item of parsed){
    if(!item||typeof item!=='object'||Array.isArray(item))continue;
    const userEmail=email(item.email);if(!userEmail||seen.has(userEmail))continue;
    seen.add(userEmail);
    metadata.push({email:userEmail,name:text(item.name)});
  }
  // Rewrite the same legacy key with metadata only. password, role and any other
  // local authority disappear permanently; Firebase/profile remains authoritative.
  try{
    storage.setItem(LEGACY_USERS_KEY,JSON.stringify(metadata));
    marker('credentials_removed',{users:metadata.length});
  }catch{
    // If rewriting is blocked, prefer deleting the credential-bearing source.
    removeSource('credentials_source_removed_storage_rewrite_failed');
  }
  return metadata;
}

export function findLegacyUserMetadata(metadata,userEmail){
  const target=email(userEmail);if(!target||!Array.isArray(metadata))return null;
  return metadata.find(item=>email(item?.email)===target)||null;
}

export const LEGACY_CREDENTIALS_MIGRATION=Object.freeze({key:LEGACY_USERS_KEY,marker:MIGRATION_MARKER,authority:'firebase-only'});
