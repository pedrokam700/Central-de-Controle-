// Legacy local entry kept only for compatibility with older shortcuts/CLEANs.
// The local workstation now boots the SAME Central application shell used online;
// Console MES is an internal Central view and no longer a second mini-application.
if(!['127.0.0.1','localhost'].includes(location.hostname))throw Error('Local workstation requires loopback');
await import('../offline-bootstrap.mjs');
