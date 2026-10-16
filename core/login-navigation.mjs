export function centralEntry(location) {
  // A preview has a separate browser session. Provide the existing normal
  // Central entry without forwarding pairing tokens or Console query parameters.
  if(/\.vercel\.app$|\.netlify\.app$/.test(location.hostname||'')&&location.hostname!=='central-cora-v2.vercel.app')return 'https://central-cora-v2.vercel.app/Central-de-Controle-/';
  return location.pathname.startsWith('/Central-de-Controle-') ? '/Central-de-Controle-/' : './';
}
export function installLoginReturn(document, location) {
  const link = document.querySelector('[data-login-central]');
  if (link) link.href = centralEntry(location);
}
