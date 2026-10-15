# Bloco 4 — UX / histórico — checkpoints incrementais

Base segura inicial: e0b4e1134e19f5e3b52515ca62e98857410ed8c9. Blocos 1–3 concluídos,
preservados. PR #27 draft/unmerged, branch work/ames-operator-ux-parity-20261014.
Clarificação #28/6197839964 lida: FPC/LCM são apenas fixtures; correlação continua
genérica por identidade/evidência para qualquer material serializado.

## A1 — apresentação de horários centralizada (concluída)

- time-display.mjs formata somente apresentação PT/EN, fuso São Paulo para ISO
  com offset e preserva wall-clock MES sem offset. Bindings UTC explicitam offset.
- Tabelas configuráveis, Base, SN live/local, tabelas especializadas e alertas
  usam o formatador. Exportação CSV e timestamps lógicos permanecem originais.
- O novo módulo está no precache; não se alterou bootstrap/porta/agente.
- 29 testes direcionados PASS: time-display (2), sn-correlations (18),
  advanced-table (8), base-view-performance (1). git diff --check PASS.
- Motor sn-forensics inalterado. Nenhum coletor/backend/SQLite/sync alterado.
- LAST_SAFE_SHA A1: d0214b4a934367b174b5c28c20ebd571e321e4c3.

## A2.1 — nomenclaturas + confiança de produção (concluída)

- `ames/data/production-evidence.mjs` centraliza a regra de apresentação: horário de
  geração, turno e dia de produção só são expostos como comprovados quando
  `production_shift_source=3022`, `production_shift_basis=reference_process`, posto de
  referência e horário real estão presentes.
- `console-failure-process.mjs` separa Registro da falha (MES), Horário de geração
  (3022), Turno comprovado (3022), Dia de produção (3022), passagem anterior e retorno.
- Retorno operacional usa somente `return_station_code`/`return_operation_name` +
  `return_event_time`. O legado `return_a5201_event_time` não prova retorno genérico.
- Manual/Automatic é descrito como modo de registro após reteste/caracterização, não
  como tipo de reparo.
- `console-process-operator.mjs` humaniza rótulos da visão operacional; o campo antigo
  A5201 fica explicitamente marcado como legado/técnico, não como regra de retorno.
- Novo helper incluído no precache offline.
- Teste direcionado `ames-block4-a2.test.mjs`: 4/4 PASS; `node --check` nos três módulos PASS.
- Não houve mudança em bootstrap/8765, coletores, waits/selectors/acceptance 3022,
  SQLite, sync, 3028 ou motor de correlação.
- LAST_SAFE_SHA A2.1: 8c3b7ec4903473cc89b0cf24f95baa26c16aa801.

## B1 — Consulta por SN ao vivo: KPIs → evidência (concluída)

- Os KPIs do resumo ao vivo agora levam diretamente à aba correspondente: falha atual,
  histórico 2114, materiais 3074, processo 3022 e reparos 3012.
- A navegação aceita clique e teclado (Enter/Espaço); não cria nova view nem estado paralelo.
- O card Processo 3022 do resumo só mostra posto/horário de geração/turno quando
  `trustedProductionEvidence()` comprova a referência. Uma passagem 3022 genérica não é
  reutilizada como se fosse geração da falha.
- `Defect Time` no resumo humano passa a ser rotulado `Registro da falha (MES)`.
- Motor `sn-forensics` e os alertas genéricos do Bloco 3 permanecem inalterados.
- Contrato estático novo `scripts/ames-sn-navigation.test.mjs` trava tabs, acessibilidade,
  uso do helper de confiança e proíbe o fallback antigo `contexts[0]||passages[0]`.

A2.2 ainda PENDING: aplicar a mesma regra de confiança nos adapters maiores
(`console-specialized-views`, analytics/resumos) sem usar Defect Time como fallback de
turno/dia/horário de geração.
B2 PENDING: paridade de navegação/drill-down da Consulta por SN offline.
C (enriquecimento/histórico) e D (multi-PC) também PENDING.
Não iniciar Bloco 5. Não rodar Full Quality/UX Physical Candidate nesta etapa.
Commits intermediários usam [skip ci] para não disparar gates pesados.
Gate físico PENDING exceto bootstrap e a persistência de rede já observados fisicamente;
o candidato final ainda precisa ser associado ao SHA exato. Nenhum ZIP gerado.
