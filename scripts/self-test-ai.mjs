import './validate-config.mjs';
import { loadLocalEnv } from '../config/env.mjs';
loadLocalEnv();

const timeoutMs = 15000;
const withTimeout = async (promiseFactory) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await promiseFactory(controller.signal); }
  finally { clearTimeout(timer); }
};

async function testGemini() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { provider: 'Gemini', status: 'SKIP', detail: 'GEMINI_API_KEY ausente' };
  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const response = await withTimeout(signal => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Responda apenas: OK' }] }], generationConfig: { maxOutputTokens: 32 } })
  }));
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `HTTP ${response.status}`);
  return { provider: 'Gemini', status: 'OK', model, detail: 'chamada real concluída' };
}

async function testOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { provider: 'OpenAI', status: 'SKIP', detail: 'OPENAI_API_KEY ausente' };
  const model = process.env.OPENAI_MODEL || 'gpt-5.6-terra';
  const response = await withTimeout(signal => fetch('https://api.openai.com/v1/responses', {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, input: 'Responda apenas: OK', max_output_tokens: 32 })
  }));
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `HTTP ${response.status}`);
  return { provider: 'OpenAI', status: 'OK', model, detail: 'chamada real concluída' };
}

const tests = [testGemini, testOpenAI];
let failed = false;
console.log('\n=== CORA — teste real dos provedores de IA ===');
for (const test of tests) {
  try {
    const result = await test();
    console.log(`${result.provider}: ${result.status}${result.model ? ` | modelo=${result.model}` : ''} | ${result.detail}`);
    if (result.status === 'SKIP') continue;
  } catch (err) {
    failed = true;
    console.error(`${test === testGemini ? 'Gemini' : 'OpenAI'}: FALHA | ${err?.message || err}`);
  }
}
if (failed) process.exitCode = 1;
else console.log('\nTeste concluído. Nenhuma chave foi exibida.');
