import fs from 'node:fs';
import assert from 'node:assert/strict';

function replaceOnce(path,from,to,label){
  let text=fs.readFileSync(path,'utf8');
  const count=text.split(from).length-1;
  assert.equal(count,1,`${label}: expected exactly one anchor, found ${count}`);
  text=text.replace(from,to);
  fs.writeFileSync(path,text);
}

replaceOnce(
  'scripts/build-r12-migration-bundle-v5.py',
  '    "suporte/ames-workstation/frontend-local-state.py": WORKSTATION / "frontend-local-state.py",\n}',
  '    "suporte/ames-workstation/frontend-local-state.py": WORKSTATION / "frontend-local-state.py",\n    "suporte/ames-workstation/factory-validation-evidence.py": WORKSTATION / "factory-validation-evidence.py",\n}',
  'bundle support tool'
);

replaceOnce(
  'scripts/agent-r12-bundle-v5.test.py',
  '            check("suporte/ames-workstation/frontend-local-state.py" in names, "local frontend activation state tool missing")',
  '            check("suporte/ames-workstation/frontend-local-state.py" in names, "local frontend activation state tool missing")\n            check("suporte/ames-workstation/factory-validation-evidence.py" in names, "sanitized factory validation evidence tool missing")',
  'bundle evidence assertion'
);

const docPath='docs/ames/FACTORY_GATE_R12.md';
let doc=fs.readFileSync(docPath,'utf8');
assert.ok(!doc.includes('## 6. Evidência estruturada sanitizada'),'factory evidence section already exists');
doc += `\n## 6. Evidência estruturada sanitizada\n\nO gate visual e este documento continuam usando como **baseline física congelada** a branch \`v2/console-parity-r12\` no SHA \`5e45127d3b61b37968a4c2b05596919670b307cb\`. A branch \`hardening/p0-production-readiness\` é uma regressão suplementar: ela **não substitui** a candidata física e não transforma CI em evidência de fábrica.\n\nO bundle V5 inclui \`suporte\\ames-workstation\\factory-validation-evidence.py\` para gerar um manifesto JSON sanitizado do gate. Ele não executa A-MES, não coleta SN, não lê credenciais e não aprova promoção.\n\nNo posto, depois de confirmar o SHA exato da hardening que está sendo avaliada:\n\n\`\`\`bat\npy -3 suporte\\ames-workstation\\factory-validation-evidence.py template FACTORY_VALIDATION.json --hardening-sha <SHA_EXATO_HARDENING>\n\`\`\`\n\nPreencher manualmente somente os estados \`pending/pass/fail/blocked\` conforme a evidência física. O arquivo contém exatamente as 9 views canônicas, Gates A–I, captura R12, hardening multiposto, local-origin e tempos numéricos. **Não adicionar campos livres**: SN/PCBA/Material SN, operador, comentário bruto, cookie, sessão, credencial ou payload MES fazem a validação falhar fechada.\n\nPara a captura R12, registrar apenas \`status\`, SHA-256 do ZIP sanitizado e quantidade de arquivos; o ZIP continua sendo gerado pela ferramenta de captura segura já existente. Para validar e normalizar o manifesto:\n\n\`\`\`bat\npy -3 suporte\\ames-workstation\\factory-validation-evidence.py validate FACTORY_VALIDATION.json --output FACTORY_VALIDATION_VALIDATED.json\n\`\`\`\n\nMesmo quando todas as provas estão \`pass\` e a aprovação humana está \`approved\`, o máximo produzido é \`ready_for_promotion_review\`. Isso significa **pronto para revisão de promoção**, nunca GREEN automático, merge, publicação de Rules ou produção. Qualquer \`fail\`, \`blocked\`, ausência do SHA exato da hardening ou divergência da candidata física congelada impede esse estado.\n`;
fs.writeFileSync(docPath,doc);

replaceOnce(
  'scripts/ames-factory-validation-evidence.test.mjs',
  "const VIEW_NAMES=['Monitoramento','Top 3 & FPY','Falhas','Consulta por SN','Rastreabilidade','Dashboards de reuso','Processo / 3022 & AT','Base local','CORA conhecimento'];",
  "const VIEW_NAMES=['Monitoramento','Top 3 & FPY','Falhas','Consulta por SN','Rastreabilidade','Dashboards de reuso','Processo / 3022 & AT','Base local','CORA conhecimento'];\nconst FACTORY_DOC=fs.readFileSync('docs/ames/FACTORY_GATE_R12.md','utf8');",
  'factory doc fixture'
);

let tests=fs.readFileSync('scripts/ames-factory-validation-evidence.test.mjs','utf8');
assert.ok(!tests.includes("factory gate documentation ships the sanitized evidence tool"),'documentation test already exists');
tests += `\n\ntest('factory gate documentation ships the sanitized evidence tool without replacing the frozen physical baseline',()=>{\n  assert.ok(FACTORY_DOC.includes('## 6. Evidência estruturada sanitizada'));\n  assert.ok(FACTORY_DOC.includes('5e45127d3b61b37968a4c2b05596919670b307cb'));\n  assert.ok(FACTORY_DOC.includes('suporte\\\\ames-workstation\\\\factory-validation-evidence.py'));\n  assert.ok(FACTORY_DOC.includes('ready_for_promotion_review'));\n  assert.match(FACTORY_DOC,/não substitui.*candidata física/i);\n  assert.match(FACTORY_DOC,/nunca GREEN automático/i);\n});\n`;
fs.writeFileSync('scripts/ames-factory-validation-evidence.test.mjs',tests);
console.log('factory evidence bundle/docs integration patched');
