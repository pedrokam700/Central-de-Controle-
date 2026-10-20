# PR #35 — Bloco 14 · Proveniência por fonte A-MES (2026-10-17)

Escopo: **somente leitura** na Página Falhas; não altera agentes coletores 3012/3022/3028/3074/2114, banco SQLite, sync Firebase ou regras.

## Contratos obrigatórios
- Snapshot: mostrar ID, revisão apenas com inteiro positivo comprovado, collected_at, cobertura, origem de transporte, freshness, hash prefix, ID da fonte e workstation *somente quando explicitamente informada*.
- O source_id não prova o nome/identidade do computador. Não inferir período do MES a partir de collected_at; período só vem do summary.period canônico.
- Por fonte 3028, 2114, 3074, 3022 e 3012: normalizar disponibilidade, partial, erro, não coletado, cache e zero confirmado. Falha 3022 nunca apaga a evidência 3028.
- Array vazio de fonte parcial não representa zero; dado 2114 ou 3074 de outra PCBA não comprova zero para a ocorrência selecionada.
- Transporte completo de uma revisão não prova que a consulta MES inteira foi concluída. Zero 3028 só com source_complete explicitamente informado e transport_complete.
- Repair User/Comment expostos pelo 3028 permanecem úteis, mas não atestam consulta 3012: origem 3012 exige repair_evidence_3012 vinculado a PCBA/defeito.
- Estado de cache não se passa por leitura atual; erro explícito da fonte não deve ser mascarado por cache.
- PT/EN simultaneamente; identificadores MES preservados; escaping para HTML.

## Gate
- Testes específicos: scripts/ames-observation-provenance.test.mjs, scripts/ames-failure-occurrence-evidence.test.mjs, scripts/ames-source-provenance.test.mjs.
- Rodar os gates integrados e navegador no SHA exato; distinguir resultados locais/CI de validação física real.
- PR #35 continua draft, empilhada sobre PR #33. Teste fabril continua no pacote congelado da PR #33. Nenhum merge/publicação até evidência no posto.
