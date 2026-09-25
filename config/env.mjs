import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseEnv(text) {
  const out = {};
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('export ')) line = line.slice(7).trim();
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) continue;
    if (value.startsWith('"')) {
      let raw = value.slice(1);
      let closed = false;
      for (let j = 1; j < raw.length; j++) {
        if (raw[j] === '"' && raw[j - 1] !== '\\') { raw = raw.slice(0, j); closed = true; break; }
      }
      while (!closed && i + 1 < lines.length) {
        i++;
        raw += '\n' + lines[i];
        const idx = raw.search(/(^|[^\\])"/);
        if (idx >= 0) { raw = raw.slice(0, idx + (idx > 0 ? 1 : 0)); closed = true; }
      }
      value = raw.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    } else if (value.startsWith("'")) {
      const end = value.lastIndexOf("'");
      value = end > 0 ? value.slice(1, end) : value.slice(1);
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    out[key] = value;
  }
  return out;
}

export function loadLocalEnv(file = path.join(ROOT, '.env')) {
  if (!fs.existsSync(file)) return { loaded: false, file };
  const values = parseEnv(fs.readFileSync(file, 'utf8'));
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
  return { loaded: true, file, keys: Object.keys(values) };
}

loadLocalEnv();
