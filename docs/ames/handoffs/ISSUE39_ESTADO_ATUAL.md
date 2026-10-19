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
