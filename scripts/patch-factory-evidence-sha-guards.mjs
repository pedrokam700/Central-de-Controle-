import fs from 'node:fs';
import assert from 'node:assert/strict';

const file='tools/ames-workstation/factory-validation-evidence.py';
let text=fs.readFileSync(file,'utf8');

function replaceOnce(from,to,label){
  const count=text.split(from).length-1;
  assert.equal(count,1,`${label}: expected exactly one anchor, found ${count}`);
  text=text.replace(from,to);
}

replaceOnce(
  "HEX64 = re.compile(r'^[0-9a-f]{64}$', re.I)",
  "GIT_SHA = re.compile(r'^(?:[0-9a-f]{40}|[0-9a-f]{64})$', re.I)\nSHA256 = re.compile(r'^[0-9a-f]{64}$', re.I)",
  'split git sha and sha256 validators'
);
replaceOnce(
  "if hardening_sha is not None and not HEX64.fullmatch(hardening_sha):\n        raise SystemExit('hardening SHA deve conter exatamente 64 caracteres hexadecimais')",
  "if hardening_sha is not None and not GIT_SHA.fullmatch(hardening_sha):\n        raise SystemExit('hardening SHA deve conter 40 ou 64 caracteres hexadecimais')",
  'template hardening sha validator'
);
replaceOnce(
  "if hardening['sha'] is not None and not HEX64.fullmatch(str(hardening['sha'])):\n        raise ValueError('hardening_candidate.sha inválido')\n    hardening['validation'] = status(hardening['validation'], 'hardening_candidate.validation')",
  "if hardening['sha'] is not None and not GIT_SHA.fullmatch(str(hardening['sha'])):\n        raise ValueError('hardening_candidate.sha inválido')\n    hardening['validation'] = status(hardening['validation'], 'hardening_candidate.validation')\n    if hardening['validation'] == 'pass' and hardening['sha'] is None:\n        raise ValueError('hardening_candidate PASS exige SHA exato')",
  'validated hardening sha and pass guard'
);
replaceOnce(
  "if capture['sha256'] is not None and not HEX64.fullmatch(str(capture['sha256'])):",
  "if capture['sha256'] is not None and not SHA256.fullmatch(str(capture['sha256'])):",
  'R12 sha256 validator'
);
replaceOnce(
  "elif all(value == 'pass' for value in statuses) and doc['human_approval'] == 'approved':\n        overall = 'ready_for_promotion_review'",
  "elif all(value == 'pass' for value in statuses) and doc['human_approval'] == 'approved' and hardening['sha'] is not None:\n        overall = 'ready_for_promotion_review'",
  'review-ready exact hardening sha guard'
);

fs.writeFileSync(file,text);
console.log('factory evidence SHA guards patched');
