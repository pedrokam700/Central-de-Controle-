import fs from "node:fs";
import path from "node:path";
import "../config/env.mjs";
const required = ["FIREBASE_PROJECT_ID","FIREBASE_CLIENT_EMAIL","FIREBASE_PRIVATE_KEY"];
const runtimePackages = ["express","cors","firebase-admin","@google/genai","pptxgenjs","docx","pdfkit"];
const providers = ["GEMINI_API_KEY","OPENAI_API_KEY","ANTHROPIC_API_KEY","TAVILY_API_KEY"];
console.log("\n=== Central + CORA — validação de ambiente ===");
console.log("Projeto Firebase:", process.env.FIREBASE_PROJECT_ID || "não configurado");
for (const k of required) console.log(`${k}:`, process.env[k] ? "OK" : "AUSENTE");
for (const k of providers) console.log(`${k}:`, process.env[k] ? "CONFIGURADA" : "não configurada");
for (const pkg of runtimePackages) {
  try { await import(pkg); console.log(`DEPENDÊNCIA ${pkg}: OK`); }
  catch (err) { console.error(`DEPENDÊNCIA ${pkg}: AUSENTE`); process.exitCode = 1; }
}
const ai = providers.slice(0,3).some(k => Boolean(process.env[k]));
const geminiModel = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const openaiModel = process.env.OPENAI_MODEL || "gpt-5.6-terra";
console.log("GEMINI_MODEL:", geminiModel);
console.log("OPENAI_MODEL:", openaiModel);
console.log("AI_ROUTING_ENABLED:", process.env.AI_ROUTING_ENABLED ?? "true");
for (const key of ["AI_BUDGET_DAILY_USD","AI_BUDGET_MONTHLY_USD","AI_BUDGET_PER_USER_MONTHLY_USD"]) {
  const value = Number(process.env[key] || 0);
  if (!Number.isFinite(value) || value < 0) { console.error(`${key}: valor inválido`); process.exitCode=1; }
  else console.log(`${key}:`, value || "desativado");
}
if (!ai) { console.error("\nERRO: nenhuma chave de provedor de IA foi configurada."); process.exitCode=1; }
if (process.env.AI_DEV_MODE === "true") console.warn("\nATENÇÃO: AI_DEV_MODE=true — somente desenvolvimento local.");
console.log("\nNão coloque chaves reais no GitHub. Use .env local ou secrets do provedor de deploy.");
