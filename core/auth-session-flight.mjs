export const AUTH_SESSION_FLIGHT_SCHEMA='central-auth-session-flight-v1';

function uidKey(value){
  const uid=String(value??'').trim();
  if(!uid)throw new TypeError('auth session flight requires a non-empty uid');
  return uid;
}

export function createAuthSessionFlight(){
  let active=null;

  function run(uid,task){
    const key=uidKey(uid);
    if(typeof task!=='function')throw new TypeError('auth session flight requires a task function');
    if(active?.uid===key)return active.promise;

    const flight={uid:key,promise:null};
    const execution=Promise.resolve().then(()=>task());
    flight.promise=execution.finally(()=>{
      // A superseded UID may still settle later. It must never clear the
      // coordinator state belonging to the newer session.
      if(active===flight)active=null;
    });
    active=flight;
    return flight.promise;
  }

  function status(){
    return Object.freeze({
      schema:AUTH_SESSION_FLIGHT_SCHEMA,
      active:Boolean(active)
    });
  }

  return Object.freeze({run,status});
}
