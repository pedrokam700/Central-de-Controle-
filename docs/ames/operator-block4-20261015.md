# Bloco 4 — UX / histórico — fechamento incremental

Base segura inicial: `e0b4e1134e19f5e3b52515ca62e98857410ed8c9` (Bloco 3 concluído).
PR #27 permanece draft/unmerged na branch `work/ames-operator-ux-parity-20261014`.
Clarificação canônica #28/6197839964 preservada: FPC/LCM são apenas fixtures; correlação é genérica para qualquer material serializado com evidência real.

## A1 — apresentação de horários centralizada
LAST_SAFE_SHA: `d0214b4a934367b174b5c28c20ebd571e321e4c3`
- `time-display.mjs` centraliza apresentação PT/EN sem alterar timestamps lógicos.
- Work reportou 29 testes direcionados PASS.

## A2.1 — nomenclaturas + confiança de produção
LAST_SAFE_SHA: `8c3b7ec4903473cc89b0cf24f95baa26c16aa801`
- `production-evidence.mjs` exige source=3022 + basis=reference_process + posto/horário para geração/turno/dia.
- Falhas separa Registro da falha (MES), geração/turno/dia 3022, passagem anterior e retorno genérico.
- Manual/Automatic = modo de registro, não reparo. A5201 antigo fica legado/técnico.
- Teste dirigido A2.1: 4/4 PASS + sintaxe PASS.

## B1 — Consulta por SN ao vivo: KPI → evidência
LAST_SAFE_SHA: `9fd7ae6471cd1892585af237702253a7bb52c9f7`
- KPIs abrem tabs de falha, histórico 2114, materiais 3074, processo 3022 e reparos 3012.
- Clique + Enter/Espaço; nenhuma view/store paralela.
- Card Processo só usa geração/turno quando `trustedProductionEvidence()` comprova referência.

## A2.2a — analytics: Registro MES ≠ produção 3022
LAST_SAFE_SHA: `831699d8013baeca2366889f95f2c99f0fdeaaca`
- `productionEvidenceForOccurrence()` associa contexto só à ocorrência exata.
- Analytics não usa Defect Time como fallback de horário/turno/dia de produção.
- Período De/Até = período de Registro MES; hora/turno/matriz = somente evidência 3022 comprovada.
- Sem classificação comprovada permanece UNKNOWN/—; denominador de produção fica indisponível quando o escopo temporal não é provado.

## A2.2b — Top 3 / FPY
LAST_SAFE_SHA: `94eb4652b1fe0923b26a3a496e0e76fd2cdd04eb`
- Resumo projeta cada ocorrência com `productionEvidenceForOccurrence()`.
- Filtro de turno só restringe quando existe classificação 3022 comprovada.
- FPY/Quantity só aparecem quando o período selecionado também é comprovado como escopo de produção.

## A2.2c — Processo / 3022 e retorno genérico
LAST_SAFE_SHA: `30e83f58ce757e6eb1145b45ba6ae1a7f89a2f6d`
- `console-specialized-views.mjs` sanitiza contextos via `trustedProductionEvidence()`.
- Retorno usa `genericReturnEvidence()`; A5201 não é regra operacional.
- Timeline bruta permanece passagem 3022, não ponto automático de geração.

## B2 — Consulta por SN offline navegável
LAST_SAFE_SHA: `62a6e2aaa62a1bb1c035bd853d1da23fd9e84b03`
- Decorator pequeno reutiliza a consulta local já existente; não reimplementa SQLite/local lookup.
- KPIs/coverage abrem história local, 2114, 3022, 3012 e cobertura; clique + teclado.
- Alertas de correlação, export sanitizado e regra “ausência local não prova ausência no A-MES” preservados.

## C — histórico por período e revisões
LAST_SAFE_SHA: `7f8e6952dcf3a4081c9d84d03dd66b566a06154d`
- Auditoria confirmou que sync/Firestore já preservavam versões por `source_id + snapshot_id + snapshot_revision + hash`.
- UX permite `Atualizar este período (preservar histórico)` e `Abrir sem substituir atual`.
- Hoje/Ontem usam `day_start`; versões mostram snapshot/revisão/origem/coleta; visualização histórica é read-only.
- Nenhum segundo histórico/store/DB criado.

## D — multi-PC / origem / freshness
AUDITORIA CONCLUÍDA — não requer mudança de produto.

Contratos existentes confirmados:
- `sync.mjs` sanitiza snapshot compartilhado, preservando `source_id`, `snapshot_id`, `snapshot_revision`, `collected_at`, `process_contexts` e descartando password/cookie/token/session/CDP/Wi-Fi/raw sensível.
- publicação distingue revisões por `source_id + snapshot_id + snapshot_revision + hash`.
- `firebase-sync.mjs` mantém latest por linha em transação e impede snapshot antigo da fila offline de sobrescrever evidência coletada depois.
- outro posto recebe heads compartilhados e carrega dados via `replaceSyncedSnapshots()` no MES store já existente; nenhum segundo SQLite/cache/app é criado.
- histórico remoto continua separado/versionado.
- Data Health já mostra autoridade `team_latest`, origem, snapshot, revisão, `collected_at`, última coleta remota e preserva a última evidência válida em erro de refresh.
- `stop()` limpa snapshots/metadados remotos da sessão para não carregar origem antiga no próximo login.
- novo contrato `scripts/ames-multipc-shared-contract.test.mjs` trava esses invariantes sem alterar produto.

## Estado do Bloco 4
FUNCIONALIDADE IMPLEMENTADA / CHECKPOINTADA. Antes de promoção ainda faltam os testes consolidados e gates do Bloco 5.

NO-TOUCH preservado em todo o Bloco 4:
- bootstrap/8765;
- waits/selectors/acceptance de produção 3022;
- 3028 sem bug comprovado;
- exatamente 9 views / 1 state.ames / 1 agente / 1 SQLite / 1 fluxo MES serializado;
- UNKNOWN != ZERO.

Os contratos estáticos adicionados após A2.1 ainda precisam ser executados no Bloco 5. Full Quality e UX Physical Candidate também ficam reservados ao Bloco 5. PR draft/unmerged; físico geral PENDING; nenhum ZIP gerado neste bloco.
