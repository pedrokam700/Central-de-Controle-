# Bloco 4 — UX / histórico — checkpoints incrementais

Base segura inicial: e0b4e1134e19f5e3b52515ca62e98857410ed8c9. Blocos 1–3 concluídos,
preservados. PR #27 draft/unmerged, branch work/ames-operator-ux-parity-20261014.
Clarificação #28/6197839964 lida: FPC/LCM são apenas fixtures; correlação continua
genérica por identidade/evidência para qualquer material serializado.

## A1 — apresentação de horários centralizada (concluída)
- `time-display.mjs` centraliza apresentação PT/EN sem alterar timestamps lógicos.
- LAST_SAFE_SHA A1: `d0214b4a934367b174b5c28c20ebd571e321e4c3`.

## A2.1 — nomenclaturas + confiança de produção (concluída)
- `production-evidence.mjs` exige source=3022 + basis=reference_process + posto/horário.
- Falhas separa Registro da falha (MES), geração/turno/dia 3022, passagem anterior e retorno genérico.
- Manual/Automatic = modo de registro, não reparo. A5201 antigo fica legado/técnico.
- LAST_SAFE_SHA A2.1: `8c3b7ec4903473cc89b0cf24f95baa26c16aa801`.

## B1 — Consulta por SN ao vivo: KPIs → evidência (concluída)
- KPIs abrem tabs de falha, histórico 2114, materiais 3074, processo 3022 e reparos 3012.
- Clique + Enter/Espaço; nenhuma view/store paralela.
- Card de processo só apresenta geração/turno quando `trustedProductionEvidence()` comprova referência.
- `sn-forensics` permaneceu intacto.
- LAST_SAFE_SHA B1: `9fd7ae6471cd1892585af237702253a7bb52c9f7`.

## A2.2a — analytics: registro MES ≠ produção 3022 (concluída)
- `productionEvidenceForOccurrence()` associa contexto apenas à ocorrência exata por `defect_key`
  ou PCBA + código + instante equivalente; contexto vizinho não pode emprestar turno/horário/dia.
- `daily-failure-analytics.mjs` não usa mais Defect Time como fallback de `production_event_time`,
  `production_shift` ou `production_operational_date`.
- O período De/Até passa a ser explicitamente período de Registro MES (`failure_record_date`).
- Hora, turno, matriz e KPIs de turno usam apenas evidência 3022 comprovada; sem cobertura, ficam
  desconhecidos/— em vez de zero falso. Filtro de turno/hora não esvazia o conjunto quando não há
  classificação comprovada.
- Métricas com denominador de produção ficam indisponíveis quando o escopo temporal não é provado
  pela 3022, em vez de usar o dia do Defect Time como se fosse produção.
- Contrato `ames-production-evidence-analytics.test.mjs` trava ocorrência exata e proíbe fallbacks.
- Sem mudanças em coletor/SQLite/sync/3028/bootstrap/8765/waits/selectors/acceptance 3022.

PENDENTE: A2.2b (`daily-failure-summary` + `console-specialized-views`), B2 offline, C histórico/revisões e D multi-PC.
Não iniciar Bloco 5 nem rodar gates pesados até o Bloco 4 fechar. PR draft/unmerged; físico geral PENDING; sem ZIP.
