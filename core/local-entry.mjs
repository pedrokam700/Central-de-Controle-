// CLEAN entry: local Console is independent of Central account/network services.
if(!['127.0.0.1','localhost'].includes(location.hostname))throw Error('Local workstation requires loopback');
if(new URLSearchParams(location.search).has('online')){
  // Compatibility with CLEANs/links that still point to ?online=1. Do not boot
  // Firebase Central on localhost: that is a different browser auth origin and
  // would show a second login. Return to the canonical Central session instead.
  const {canonicalCentralUrl}=await import('./central-roundtrip.mjs');
  location.replace(canonicalCentralUrl());
}else await import('./local-workstation.mjs');
