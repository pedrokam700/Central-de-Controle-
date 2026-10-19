# ISSUE #39 — HANDOFF OPERACIONAL — A2 + B1

## Fonte de verdade e restrições
- Repo `pedrokam700/Central-de-Controle-`, PR #40, branch `work/ames-operational-history-kpis-20261019`.
- Issue https://github.com/pedrokam700/Central-de-Controle-/issues/39 ; especificação `docs/ames/ISSUE39_HISTORICO_KPIS_SEGUNDO_USO.md`.
- Base PR #38 draft: `9e4c531bcbb46a6b99e875035220494ad9036bf3`, fábrica A/B PENDING. Não alterar PR38/main/35/36/Firebase de produção/instalação da fábrica/porta8765.
- Sem merge/deploy, limpeza SQLite/IndexedDB, migração de source_id ou novo store/agente/view. Coleta MES continua serializada. Sem alteração de algoritmos dos coletores.

## Checkpoints preservados
- A1 `231d988929aefdfd1222413d2a6bff6a268be8a6`: seleção temporal no store separada de `localCanonical()`/publicação. 21 contratos PASS.
- A2 `c3a26edcc56f35afdab17dc4bccf4a205debafa7`: seletor compacto nas Linhas + leitura das nove views. 414 contratos Node PASS localmente.
- CI A2 **GREEN** no SHA exato: run **39301191945**, jobs **118226514140** (contratos) e **118226513786** (browser). Browser comprova Hoje/passado/Hoje, linha ausente, nove panes, PT/EN/mobile, zero mutações MES. Não é Full Quality nem prova física.
- B1: SHA do commit que contém este handoff, registrado no comentário da PR40 após publicação. CI pendente até consultar esse SHA.

## Estado por bloco
- **A PARCIAL, checkpoint funcional salvo.** `reading-period.mjs`, `store.mjs`, `reading-period-controller.mjs`, `console-reading-period.mjs`, `console-view.mjs`, `console-legacy-parity.mjs`, `sw.js`.
  - Hoje / Último dia produtivo / Período; calendário São Paulo 07:00, feriados/exceções; contexto único sem promover passado a head/publicação.
  - Nove panes mostram período. SN/Base/CORA/3012 histórica usam leitura paginada canônica; busca SN exata; falta de dados não vira zero. Histórico 3012 continua evidência candidata.
  - Passado bloqueia novas coletas/atualização até B garantir alvo exato. Navegar não coleta. Respostas tardias de período/conta anterior são recusadas.
  - Limites: custom seleciona janela exata, não agrega vários dias; escolha manual entre fontes/revisões ambíguas e filtros avançados/CPH pendentes; leitura histórica em memória precisa SQLite/Firestore para reabrir após reload; paridade integral dos drilldowns investigativos pendente. Hoje não usa fallback histórico nem troca de dia automaticamente enquanto aberto. Origem textual do agent-evidence-view ainda deve ser ajustada para histórico/remoto.
- **B PARCIAL: B1 concluído no conteúdo deste checkpoint.** Recuperação de revisão local exata, não histórico integral já aprovado.
  - `canonical.py`: índice das revisões já persistidas, com source_id/snapshot/revision/content_hash/período; `read_revision` nunca substitui versão ausente pela mais recente.
  - `agent_hardened_entry.py`: `/local-history?snapshot_id=...&snapshot_revision=...` lê revisão exata. Sem revision, preserva a operação anterior de exportar estado local para revisão. Listar não grava nem consulta MES.
  - Estado local não exportado ou alterado desde a última revisão fica `revision_pending:true`, sem número inventado. Abrir materializa revisão via mecanismo existente, preservando todas as anteriores. Compatível com índice antigo sem revisão, explicitamente local/pendente.
  - `agent-client.mjs`, `history-source.mjs`, controller: encaminham revisão; rejeitam substituição por agente antigo; permitem materialização somente para entrada local pendente. Corrigida importação ausente de normalizeCanonical, que causava ReferenceError ao abrir histórico real.
  - Sem schema novo, mudança de source_id ou alteração da coleta. Mesmas tabelas SQLite e mecanismo mes_revisions.
- **C/D/E NÃO INICIADOS.** Não afirmar taxas de reutilização, completude das cinco fontes, sincronização integral histórica, backup/Windows ou fábrica aprovados.

## Testes B1 e arquivos de verificação
- **48/48 Node direcionados PASS**: reading-period, operational-context, history-source, offline-shell, history-revisions, period-history-matching, agent.
- **417/417 Node PASS**: `node --test --test-isolation=none scripts/ames-*.test.mjs`.
- **10/10 Python PASS**: `agent-local-history.test.py` (3), `agent-canonical.test.py` (5), `agent-operational-day-selection.test.py` (2).
- Novo teste executa o método GET real sem importar/iniciar bootstrap: revisão antiga após atualização tardia e restart, source_id preservado, índice somente leitura, versão ausente/linha inválida/autorização recusadas. Nenhum acesso MES.
- Workflow `.github/workflows/ames-operational-history.yml` cobre contratos Node, SQLite e browser na branch #40. Quality Gate geral filtra PR para main; não atribuir a ele este resultado.
- Browser local indisponível (Chromium ausente/binário legado SIGSEGV); usar prova CI de cada SHA. Fábrica PENDING.

## Próximo passo exato — B2
1. Revalidar remoto PR40 e CI do B1 antes de nova alteração. Não refazer A1/A2/B1.
2. Corrigir alvo de `agent_entry.py::_run_deep_trace_job`: hoje escolhe `latest_snapshot_ids_by_line(lines)` e chama `base_rows(sid,limit=100000)` sem linha. Proibir fallback para último snapshot quando o período escolhido exige outro; filtrar linha em snapshot compartilhado.
3. Encaminhar identidade explícita pelo `agent-client.mjs` e handler `/deep-trace` (source_id, snapshot_id, revision, período); validar antes de MES e ao executar job para cobrir filas/races; preservar revisão original antes de enriquecer. Não alterar o coletor em si. Testes com snapshot novo de outro período, linha divergente e revisão/source inválidos.
4. Depois investigar projeção completa das cinco fontes e associação temporal de 3012 sem atribuição por PCBA apenas. Não confundir candidato com reparo comprovado, associação com causa, ausência com zero; denominador não comprovado proíbe taxa.
5. Commit coerente + handoff + PR40/Issue39 + CI exato antes de avançar C/D/E. Não acumular trabalho local.

## Recuperação e publicação
- Checkout isolado `operational-history`; working tree deve ficar limpa após cada checkpoint.
- Git fetch funciona; git push neste ambiente não tem credencial. Publicar via GitHub Git Data API (blobs/tree/commit), verificar tree SHA igual ao conteúdo testado e update_ref com expected_sha. Preservar commit local em recovery/* e reconciliar apenas árvores idênticas. Nunca reset/clean destrutivo.
- A Central autenticada aberta pode publicar; aba fechada não publica. Replay integral de revisões nunca observadas pelo navegador continua não comprovado. Não modificar o estado das PRs anteriores.
