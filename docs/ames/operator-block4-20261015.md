# Bloco 4 — UX / histórico — checkpoints incrementais

Base segura: e0b4e1134e19f5e3b52515ca62e98857410ed8c9. Blocos 1–3 concluídos,
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

A2 (nomenclaturas/proveniência), B (drill-down), C (enriquecimento/histórico) e D
(multi-PC) ainda PENDING. Próxima ação: completar A2 a partir deste checkpoint.
Não iniciar Bloco 5. Não rodar Full Quality/UX Physical Candidate nesta etapa.
Commits intermediários usam [skip ci] para não disparar esses gates pesados.
Gate físico PENDING exceto bootstrap já aprovado/congelado. Nenhum ZIP gerado.
SHA do checkpoint A1 registrado nos comentários da Issue #28 e PR #27.
