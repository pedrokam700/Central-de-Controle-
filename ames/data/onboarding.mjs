import { immutable } from './contract.mjs';

export const INTEGRATION_MODE_KEY = 'central.ames.integration-mode.v1';
export const integrationMode = value => ['collector', 'viewer'].includes(value) ? value : null;
function readRuntime(value) {
  if (!value || typeof value !== 'object') return null;
  // Only the documented local console location; never an inferred API endpoint.
  const url = new URL(value.console_url);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.port !== '8765' ||
      url.pathname !== '/' || url.search || url.hash || url.username || url.password ||
      value.start_file !== '00_INICIAR_AQUI.bat' || value.fallback_file !== '03_ABRIR_CENTRAL_LOCAL_FALLBACK.bat') throw new TypeError('Localização documentada inválida');
  return { console_url: url.href, start_file: value.start_file, fallback_file: value.fallback_file };
}
export function readRelease(value) {
  if (!value || typeof value.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(value.version) ||
      typeof value.package_name !== 'string' || !value.package_name.endsWith('.zip') ||
      typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(value.sha256)) throw new TypeError('Manifesto de release inválido');
  const url = new URL(value.download_url);
  if (url.protocol !== 'https:' || url.username || url.password) throw new TypeError('Link de pacote inválido');
  return immutable({ version: value.version, package_name: value.package_name, sha256: value.sha256,
    local_runtime: readRuntime(value.local_runtime),
    download_url: url.href, validated_baseline: typeof value.validated_baseline === 'string' ? value.validated_baseline : '',
    candidate_status: typeof value.candidate_status === 'string' ? value.candidate_status : 'unknown',
    minimum_central_version: typeof value.minimum_central_version === 'string' ? value.minimum_central_version : '' });
}
