# ISSUE #39 — HANDOFF OPERACIONAL / checkpoint 0

## Fonte de verdade
- Repositório: `pedrokam700/Central-de-Controle-`
- Branch: `work/ames-operational-history-kpis-20261019`
- Base da branch: `9e4c531bcbb46a6b99e875035220494ad9036bf3` (PR #38 draft, pendente de fábrica).
- Issue: https://github.com/pedrokam700/Central-de-Controle-/issues/39
- Especificação funcional e critérios: `docs/ames/ISSUE39_HISTORICO_KPIS_SEGUNDO_USO.md`.

## Estado que pode ser afirmado
- Apenas bloco 0 de planejamento e documentação executado.
- **Nenhum código funcional da issue #39 alterado**, nenhum teste desta nova missão realizado.
- Sem merge, sem deploy, sem alteração de `main`/PR #38/Firebase/SQLite/porta 8765.
- Riscos verificados na base PR38: store web ativo por linha sem visão temporal global; histórico em Base local isolado das outras views; `_run_deep_trace_job` usa latest snapshot sem período explícito; 3012 exige associação cautelosa.

## Próximo passo exato
1. Revalidar HEAD/PR38/Issue39/CI antes de editar.
2. Ler a especificação da Issue39 e contratos existentes.
3. Iniciar **Bloco A**: selecionar contexto de leitura histórico em todas as nove views, com `Hoje | Último dia produtivo | Período...` compacto na Central das Linhas.
4. Commit funcional pequeno, testes precisos, publicar checkpoint em PR/Issue39 com SHA/CI; atualizar ESTE arquivo para manter retomada.
5. Seguir blocos B→C→D→E quando gates permitirem. Não apagar dados, não atualizar posto A nem considerar emulador prova física.

## Invariantes
Nunca migrar `source_id` automaticamente, apagar histórico, confundir material 2º uso com PCBA 2º uso, tomar ausência como zero, calcular taxa sem denominador comprovado, mudar Hoje ao consultar ontem ou presumir que 3012 candidata prova reparo da ocorrência.

## Checkpoint A1 — 19/10/2026 — fundamento de leitura (substitui estado inicial acima)
- Base remota revalidada: PR40 `5917243035ee48137a3567962112625eab280752`; PR38 permanece `9e4c531bcbb46a6b99e875035220494ad9036bf3`, draft.
- Implementado: `ames/data/reading-period.mjs` + API de seleção/instalação histórica em `data/store.mjs`. Leitura histórica separada de `localCanonical()`/publicação; falta de período é NOT_COLLECTED; respostas de período/conta anterior são recusadas. Calendário São Paulo 07:00, feriados/exceções e custom separado de dia produtivo.
- `sw.js`: nova dependência incluída. `scripts/ames-reading-period.test.mjs`: regressões de identidade, período, conta, imutabilidade e não promoção.
- Testes locais: 21/21 PASS em reading-period, operational-context, history-source e offline-shell. CI do commit: pendente de despacho/verificação; SHA exato será registrado no comentário da PR40 (não é possível embutir o próprio hash no commit).
- **Bloco A PARCIAL**: API ainda opt-in, sem seletor ligado à UI. Nove views e carregamento histórico não estão concluídos. B/C/D/E não iniciados nesta rodada. Fábrica PENDING.
- Próximo passo: conectar seletor compacto em `createLineOverview`, carregamento via `createMesHistorySource` e renderização das nove views; impedir resultados locais/transitórios de outra data em SN/3012/Base/CORA. Depois testes browser de alternância com zero extrações.
- Nenhum coletor, SQLite, source_id, porta, PR38, Firebase ou produção alterado. Não excluir arquivos/histórico. Checkout de trabalho: `operational-history`.
