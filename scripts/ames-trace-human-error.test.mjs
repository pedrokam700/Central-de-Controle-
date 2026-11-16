import assert from 'node:assert/strict';
import {humanTraceError} from '../ames/console-trace-scope.mjs';

globalThis.document={documentElement:{lang:'pt-BR'}};
const failed3012=`3022 · PROCESSADO 47/47; 3074 · COMPLETE 47/47
  RuntimeError: 3012_CONTRACT_BLOCKED: 3012_QUERY_PERIOD_MISMATCH observado AUSENTE`;
assert.match(humanTraceError(failed3012),/3012 interrompeu/);
assert.doesNotMatch(humanTraceError(failed3012),/3022 nesta etapa/);
assert.match(humanTraceError('RuntimeError: failure at 3022'),/3022/);
console.log('3012/3022 attribution gate OK');
