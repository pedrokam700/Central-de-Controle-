export const USER_PROFILE_SERVICE_SCHEMA='central-user-profile-service-v1';

function requireFunction(name,value){
  if(typeof value!=='function')throw new TypeError(`User profile service requires ${name}`);
  return value;
}

export function createUserProfileService({db,doc,getDoc,setDoc,withTimeout,buildSignupProfile,now}={}){
  requireFunction('doc',doc);
  requireFunction('getDoc',getDoc);
  requireFunction('setDoc',setDoc);
  requireFunction('withTimeout',withTimeout);
  requireFunction('buildSignupProfile',buildSignupProfile);
  requireFunction('now',now);

  async function ensure(firebaseUser,legacy=null){
    const ref=doc(db,'users',firebaseUser.uid);
    const snap=await withTimeout(getDoc(ref),12000,'Validação do perfil');
    const email=(firebaseUser.email||'').toLowerCase();

    if(snap.exists()){
      const data=snap.data()||{};
      return {
        ...data,
        docId:firebaseUser.uid,
        uid:data.uid||firebaseUser.uid,
        name:data.name||legacy?.name||firebaseUser.displayName||email.split('@')[0],
        email:data.email||email,
        role:data.role==='admin'?'admin':'user',
        disabled:Boolean(data.disabled),
        createdAt:data.createdAt||now(),
        updatedAt:data.updatedAt||now()
      };
    }

    const createdAt=now();
    const profile={
      ...buildSignupProfile({
        uid:firebaseUser.uid,
        email,
        name:legacy?.name||firebaseUser.displayName||email.split('@')[0]
      }),
      createdAt,
      updatedAt:createdAt
    };
    await withTimeout(setDoc(ref,profile),12000,'Criação do perfil');
    return {docId:firebaseUser.uid,...profile};
  }

  return Object.freeze({schema:USER_PROFILE_SERVICE_SCHEMA,ensure});
}
