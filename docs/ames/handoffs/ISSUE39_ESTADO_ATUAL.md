# ISSUE #39 — HANDOFF OPERACIONAL — A2 + B1 + B2 + B3.1

## Fonte de verdade e restrições
- Repo `pedrokam700/Central-de-Controle-`, PR #40, branch `work/ames-operational-history-kpis-20261019`.
- Issue https://github.com/pedrokam700/Central-de-Controle-/issues/39 ; especificação `docs/ames/ISSUE39_HISTORICO_KPIS_SEGUNDO_USO.md`.
- Base PR #38 draft: `9e4c531bcbb46a6b99e875035220494ad9036bf3`, fábrica A/B PENDING. Não alterar PR38/main/35/36/Firebase de produção/instalação da fábrica/porta8765.
- Sem merge/deploy, limpeza SQLite/IndexedDB, migração de source_id ou novo store/agente/view. Coleta MES continua serializada. Sem alteração de algoritmos dos coletores.

## Checkpoints preservados
- A1 `231d988929aefdfd1222413d2a6bff6a268be8a6`: seleção temporal no store separada de `localCanonical()`/publicação. 21 contratos PASS.
- A2 `c3a26edcc56f35afdab17dc4bccf4a205debafa7`: seletor compacto nas Linhas + leitura das nove views. 414 contratos Node PASS localmente.
- CI A2 **GREEN** no SHA exato: run **39301191945**, jobs **118226514140** (contratos) e **118226513786** (browser). Browser comprova Hoje/passado/Hoje, linha ausente, nove panes, PT/EN/mobile, zero mutações MES. Não é Full Quality nem prova física.
- B1 `776277a9974214c1148a34f308967a99ff91eeb1`: revisões locais exatas. CI **GREEN**, run **39302554518**, jobs **118231230042** (contratos Node/Python) e **118231229594** (browser).
- B2 `0343f069c8eec65bd800e6a83eefde7b7c408666`: CI GREEN, run 39303294356 (contratos + browser).

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
- **B2 concluído no conteúdo deste checkpoint; B permanece PARCIAL.** `agent_entry.py`, `agent-client.mjs`, testes de alvo e workflow.
  - Cliente envia source_id/snapshot_id/snapshot_revision/content_hash/período do snapshot local selecionado, não do head de publicação. Rejeita origem remota, outro posto e ausência de período.
  - Capability `exact_trace_targets` impede que agente antigo ignore o contrato. Central e agente candidatos precisam ser atualizados juntos para executar deep-trace; nenhuma instalação da fábrica foi alterada.
  - Admission valida identidade persistida; worker revalida revisão/epoch antes de MES. Alteração enquanto aguardava fila termina em erro, exigindo recarregar o período; não escolhe outro alvo. Idempotência continua no scheduler existente; retry após timeout mantém payload/revisão/request_id originais mesmo após refresh de revisão.
  - Removido fallback latest_snapshot_ids_by_line; base_rows recebe linha explicitamente. Exportação original permanece intacta em mes_revisions; enriquecimento ocorre no snapshot exato. Nenhuma mudança dos algoritmos, timings, waits ou seletores dos coletores.
  - UI histórica continua somente leitura até existir atualização explícita com feedback/recarregamento histórico seguro. B2 não libera automaticamente essa ação.
- **C/D/E NÃO INICIADOS.** Não afirmar taxas de reutilização, completude das cinco fontes, sincronização integral histórica, backup/Windows ou fábrica aprovados.

## Testes B1 e arquivos de verificação
- **48/48 Node direcionados PASS**: reading-period, operational-context, history-source, offline-shell, history-revisions, period-history-matching, agent.
- **417/417 Node PASS**: `node --test --test-isolation=none scripts/ames-*.test.mjs`.
- **10/10 Python PASS**: `agent-local-history.test.py` (3), `agent-canonical.test.py` (5), `agent-operational-day-selection.test.py` (2).
- Novo teste executa o método GET real sem importar/iniciar bootstrap: revisão antiga após atualização tardia e restart, source_id preservado, índice somente leitura, versão ausente/linha inválida/autorização recusadas. Nenhum acesso MES.
- Workflow `.github/workflows/ames-operational-history.yml` cobre contratos Node, SQLite e browser na branch #40. Quality Gate geral filtra PR para main; não atribuir a ele este resultado.
- Browser local indisponível (Chromium ausente/binário legado SIGSEGV); usar prova CI de cada SHA. Fábrica PENDING.

## Testes B2
- **50/50 contratos Node direcionados PASS** (mesma lista B1 + regressões de deep-trace).
- **419/419 contratos Node PASS** no conteúdo final.
- **14/14 Python de histórico/identidade PASS**: local-history (3), canonical (5), operational-day-selection (2), trace-target (4).
- **20/20 Python observability PASS** como regressão do wrapper alterado, sem teste físico nem nova investigação da 3022.
- trace-target executa admission, worker e POST reais extraídos sem iniciar bootstrap, com SQLite temporário e MES mockado: alvo antigo apesar de outro mais novo, isolamento de linha, mismatch, corrida na fila, revisão anterior preservada e FPY/período intactos.
- Workflow da branch executa 50 contratos Node + 14 Python + browser nove views. CI do SHA B2 deve ser consultado antes de avançar. Não confundir esse gate focado com Full Quality.

## Próximo passo exato — B3, histórico completo ainda WIP
1. Revalidar remoto PR40 e CI do B2. Não refazer A1/A2/B1/B2; hashes e runs estão nos comentários.
2. Investigar somente lacunas entre evidência persistida no SQLite e projeção histórica canônica: consultas SN sem ocorrência 3028, histórico 2114, vínculos 3074, process_contexts/3022 e 3012. Ver `canonical.py::export_revision`, `store.py` e os pontos de persistência dos resultados existentes. Confirmar preservação de todas as cinco fontes, parciais e revisões com fixtures, antes de declarar B completo.
3. 3012 permanece `same_pcba_candidate`: não atribuir reparo por PCBA apenas. Associação temporal/falha precisa de prova; preservar ocorrência/FPY. Não inventar fonte/cobertura ausente nem transformar associação em causa.
4. UI: atualização explícita de período passado ainda bloqueada. Só liberar ao conectar identidade exata B2, feedback de job e reabertura da nova revisão B1, mantendo navegação sem MES. Multi-dia, escolha de origem/revisão e persistência offline da seleção continuam pendentes A/B.
5. Depois C (PCBA principal e material separados, dedup físico, três desfechos, denominador), D (tendências), E (sync A/B/offline/Windows/backup/rollback). Aba fechada/replay histórico integral continuam limites conhecidos.
6. Commit coerente + handoff + PR40/Issue39 + CI exato antes de avançar. Factory PENDING; não atualizar posto A, mergear ou fazer deploy.

## Recuperação e publicação
- Checkout isolado `operational-history`; working tree deve ficar limpa após cada checkpoint.
- Git fetch funciona; git push neste ambiente não tem credencial. Publicar via GitHub Git Data API (blobs/tree/commit), verificar tree SHA igual ao conteúdo testado e update_ref com expected_sha. Preservar commit local em recovery/* e reconciliar apenas árvores idênticas. Nunca reset/clean destrutivo.
- A Central autenticada aberta pode publicar; aba fechada não publica. Replay integral de revisões nunca observadas pelo navegador continua não comprovado. Não modificar o estado das PRs anteriores.

## Checkpoint B3.1 — preservação bruta, escopo pequeno por cota
- Remoto revalidado em `0343f069c8eec65bd800e6a83eefde7b7c408666`, PR40 aberta/draft; árvore limpa antes de iniciar.
- Defeito comprovado: `save_snapshot_payload` substituía payload anterior do mesmo snapshot/kind. Corrigido no Store existente com tabela aditiva `snapshot_payload_revisions` no MESMO SQLite; nenhum DB/store/agente paralelo.
- Transação BEGIN IMMEDIATE preserva o head legado antes de substituí-lo e acrescenta somente versões diferentes. Leitura atual de snapshot_payloads mantém o contrato anterior. Metadata/read exatos disponíveis no Store; nenhuma rota pública nova, dados brutos não publicados no Firebase.
- Revisões persistem após restart, mudanças parciais não destroem o payload completo anterior, concorrência não perde versões; falha ao escrever o head desfaz também a revisão da transação. source_id preservado. Sem exclusão automática.
- Histórico bruto anterior já sobrescrito antes deste patch NÃO é recuperável por esta mudança. Baseline legado é capturado na próxima gravação de cada snapshot/kind; não há backfill maciço. Código antigo continua lendo/escrevendo head; ao voltar ao novo, o head legado atual é capturado, mas alterações intermediárias durante rollback antigo não podem ser recuperadas.
- Arquivos: `ames/agent/store.py`, `scripts/agent-raw-history.test.py`, workflow da branch e este handoff. Coletores, bootstrap/8765, Firebase produção, main e PRs congeladas intactos. Não atualizar fábrica.
- Testes locais **18/18 Python PASS**: raw-history (4), local-history (3), canonical (5), trace-target (4), operational-day-selection (2). CI SHA exato e LAST_SAFE_SHA no comentário de publicação; sem repetir suíte Node completa, pois nenhuma alteração JS.
- **A/B PARCIAIS; C/D/E pendentes; fábrica PENDING.** B3.1 é persistência local, ainda não recuperação pela UI nem compartilhamento sanitizado destas versões. Não declarar B completo.
- Próximo passo B3.2: recuperar/projetar consultas SN já salvas em `jobs.result_json` (`agent.py::_persist_job`, chamado pelo `agent_3012_patch.py::run_sn_lookup`), sem refazer coleta. Separar origem/período comprovados e dados sem linha, sanitizar antes de transporte. Completar a verificação das cinco fontes e associação 3012 candidata antes dos KPIs. Não refazer A1/A2/B1/B2/B3.1.


## Checkpoint B3.2 — Índice local e leitura exata das consultas SN salvas

- **Código testado:** SHA 0dd4a18c3755c9a208cb3e6e65a2605a97d6a7a7. [CI GREEN](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39308734328): reading-contract 51/51 Node, 24/24 Python (local-history 3, raw-history 4, saved-SN 6, trace-target 4, canonical 5, operational-day 2), reading-browser nove views PT/EN/mobile, nenhuma mutação MES. Não é Full Quality nem teste físico.
- ames/agent/store.py: métodos saved_sn_lookups e open_saved_sn_lookup usam a tabela jobs/result_json JÁ EXISTENTE; página máxima 50, cursor estável com escopo dos filtros, filtro SN e horário de criação da CONSULTA com fuso explícito. Não atribuem dia produtivo ou linha inferida. O índice não inclui resultado bruto. Leitura exata exige ID + hash SHA-256 da identidade/conteúdo/status, recusando alteração.
- ames/agent/agent_hardened_entry.py: GET /api/v1/saved-sn-history, protegido pelo mesmo token/origin do agente canônico. Retorna metadados apenas no índice; resultado bruto apenas na leitura autorizada local.
- ames/agent-client.mjs: savedSnHistory e openSavedSnHistory com validação da identidade e sem publicar no Firebase nem modificar o snapshot Hoje.
- scripts/agent-saved-sn-history.test.py: seis testes para paginação com horários iguais, resultado parcial, SN/período de consulta, alteração de hash/config, restart/source_id, cursor inválido, 401 sem autorização e ausência de escrita. scripts/ames-agent.test.mjs cobre o cliente.
- Workflow .github/workflows/ames-operational-history.yml inclui os testes B3.2. O código estava em HEAD 0dd4a18c; ESTE commit documental terá SHA posterior e deve passar seu próprio gate.
- Limites: jobs.result_json NÃO é um journal imutável de estados intermediários. Quando job/config/status mudar, hash antigo falha e usuário deve recarregar índice. Não recupera dados sobrescritos/excluídos antes da correção. Não infere ocorrência/linha/dia da SN isolada. Histórico SN ainda NÃO é exibido na UI; não há replay sanitizado para Firebase. Coleta e agentes da fábrica intactos.
- **Próximo bloco exato B3.3:** integrar pesquisa e abertura paginada do histórico local SN à Central com relógio de consulta distinto do dia operacional, sem inserir bruto em heads, Today, Firestore ou relacionar 3012 à falha apenas por PCBA. Depois auditar projeção completa das fontes 3028/3074/2114/3022/3012, parciais e relacionamentos comprovados antes de C. A/B ainda parciais; C/D/E não iniciados; fábrica pendente.
- Não refazer A1/A2/B1/B2/B3.1/B3.2. Revalidar HEAD e CI da PR40. Não alterar PR38/main/PR35/PR36, SQLite produtivo, source_id, porta 8765 ou Firebase de produção.



## Checkpoint B3.3 — interface da Central para consultas SN salvas

- **LAST_CODE_SAFE_SHA:** `2cde126d6ad82d27b7f0cb804f5abdeac9a67617`. [CI exato 39310488156](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39310488156) **GREEN**: reading-contract 51 Node + 24 Python; reading-browser nove views, seletor PT/EN/mobile e **novo fluxo Ver consultas salvas → Pesquisar → Abrir resultado**. O SHA deste checkpoint documental é posterior; confirmar também o gate desse commit.
- `ames/console-saved-sn-history.mjs`: novo painel compacto dentro da view **Consulta por SN**, somente no modo Hoje da UI existente, exibindo em seção claramente isolada **consultas salvas no posto**, não produção de Hoje. Formulário SN + horário de criação da consulta, paginação e abertura por ID+hash; fontes do resultado exibidas em `details` sob demanda, por `textContent` (sem XSS). Nenhuma coleta MES, mutação de Today, mudança de leitura temporal ou envio do raw ao Firebase. O painel não se exibe em outras views nem confunde leitura de produção histórica.
- `ames/console-view.mjs`: reutiliza uma das nove telas, mantém os decoradores atuais de consulta SN num subcontainer isolado e adiciona o painel; `sw.js` inclui o novo módulo no cache offline.
- `scripts/ames-reading-period.browser.mjs`: exercita consulta salva e resultado técnico original contendo HTML não confiável, verifica ausência de `script` criado, mantém TODAY-SNAPSHOT e `mutations=0`, além de alternar pelas nove views.
- Limites: a UI requer **agente local conectado, atualizado com B3.2**; B não pode recuperar raw de A por localhost sem ponte autorizada. Data usada no filtro é **horário da consulta**, não produção. A revisão de cada job é protegida por hash mas `jobs.result_json` pré-existente não é log imutável de todos os estados intermediários. Nenhuma promessa de recuperação de dados já apagados.
- **Ponto exato seguinte B3.4:** auditar/projetar fontes 3028+3074+2114+3022+3012 por snapshot e período exatos, cobertura parcial e vínculo técnico. Não preencher ausência como zero nem atribuir reparo 3012 somente por PCBA. Preservar kits/múltiplos vínculos e versões brutas B3.1; testes SQLite + browser. Só depois concluir bloco B e começar indicadores C (PCBA principal separada de material SN).
- CI de histórico GREEN NÃO é Full Quality ou fábrica; PR40 draft, sem deploy, PR38/main/PR35/PR36/SQLite produtivo/source_id/8765/Firebase produção intactos. B3.3 não foi instalado no posto A/B.


## Checkpoint B3.4a — evidência de cobertura por cinco fontes sem falsos zeros (19/10/2026)

- **LAST_CODE_SHA** `f48b1c80a742138e12a1987e64ac9bdc76ce73a7`; este SHA introduz os testes do bloco e exige CI GitHub `reading-contract` + `reading-browser` verdes antes de promover LAST_SAFE_SHA. Revalidar também CI do commit documental (HEAD posterior). Não é teste de fábrica nem Full Quality.
- `ames/agent/canonical.py`: `PROJECTION_VERSION=8` nas **NOVAS revisões imutáveis**, preservando todas as revisões v7 anteriores, agora com `source_coverage` separado do índice de dados. Mapeia 3028, 3074, 2114, 3022 e 3012 por snapshot/linha exatos. Status de fonte `observed_partial`, `candidate_partial` ou `unknown`. `source_complete=false` e `population_complete=false` sempre, apesar de `transport_complete=true` das linhas da revisão. Ausência não vira prova de zero/ausência de falha. 3012 conta candidatos **distintos** por row_key dentre defeitos do recorte e não valida reparo da ocorrência por igualdade de PCBA.
- `ames/data/canonical.mjs`: mantém o novo metadata em `coverage.sources` sem quebrar snapshots legados sem esse campo. `ames/data/source-coverage.mjs`: interpreta arquivos legados e fontes não consultadas como `unknown`, suprime contagem zero quando a cobertura é parcial e preserva `candidateOnly` da 3012.
- `ames/console-reading-period.mjs`: apresenta cobertura das cinco fontes no histórico das nove views, junto ao período/snapshot/revisão do registro; PT/EN; sem novos botões de execução MES ou mutações em Today.
- Testes `scripts/agent-canonical.test.py` validam v8, idempotência, reparo AT posterior como **nova revisão**, permanência da revisão original v1, desconhecido vs parcial, candidatos 3012 e transporte completo distinto da consulta completa. `scripts/ames-source-coverage.test.mjs` protege não-zero de fontes sem evidência e compatibilidade legado; browser `scripts/ames-reading-period.browser.mjs` confirma estados 3074 desconhecido e 3012 candidato enquanto alterna Hoje/Ontem nas nove views.
- Não alterou schema de fonte `central-ames-v2` nem banco produtivo. Não há certificação de que a fonte 3074/2114/3022/3012 executou consulta MES completa. Ainda não é retenção integral de cinco extrações brutas por dia: falta persistência/associação de resultados parciais específicos de cada fonte ao snapshot/linha/período, sem reprocessar MES ou inferir causalidade.
- **Próximo bloco B3.4b**: auditar evidência de execução e preservação bruta de cada fonte 3028/3074/2114/3022/3012, associar por IDs exatos de snapshot/revision/period, distinguir parcial/não coletado no dado real, retenção de múltiplos vínculos de kit LCD e reparo 3012 candidato; testar SQLite e Windows sem alterar a instalação física. Só depois considerar B completo; C/D/E pendentes.
- PR40 draft, sem merge ou deploy. PR38/main/#35/#36, Firebase produção, source_id, porta 8765 e instalações de A/B intocadas. Usar handoff + PR40 CI exato para retomar sem refazer B3.4a.


## Checkpoint B3.4b1 — capturas brutas locais por fonte e consulta exata (19/10/2026)

- **LAST_CODE_SHA:** `7a8f1a06175f9a1d6d926fbafd8b972d514fd29c`. [CI deste SHA](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39314447228) GREEN: 54 testes Node, 28 Python (inclui `agent-source-capture.test.py` com 3 testes), nove views navegador PT/EN/mobile, sem executar MES. Testar o commit de handoff posterior no próprio SHA antes de promover como `LAST_SAFE_SHA`.
- `ames/agent/source_capture.py`: `capture_source` grava no SQLite já existente o resultado bruto **por fonte e por job**, sob chave `source_capture_<3074|2114|3022>_<job_id>` em `snapshot_payloads`; herda o journal de revisões imutáveis `snapshot_payload_revisions` do B3.1. Guarda `source_id`, linha, snapshot, **revisão original selecionada**, `content_hash`, **período exato** e `job_id`, tipo de fonte/status, hora e dados brutos. Recusa origem, período, hash, linha, snapshot, fonte ou ID de job incompatíveis. Mesmo job pode acrescentar versão, outro job jamais substitui o bruto anterior da primeira consulta.
- `capture_index` é índice **somente de metadados locais** (não envia conteúdo bruto nem abre endpoint novo). Resultado de origem continua no SQLite, obtido internamente por `get_snapshot_payload_revision`. Nenhuma regra Firebase ou endpoint de publicação foi alterado.
- `ames/agent/agent_entry.py`: o worker **já existente e com alvos históricos exatos B2** persiste as fontes 3074 e 2114 separadas assim que o motor retorna e persiste 3022 quando a coleta correspondente retorna. Não marca fonte como `done` por inferência: `unknown/not_run` torna-se `partial` se há payload. Um estágio posterior que falha não apaga um resultado anterior que foi gravado. As atualizações derivadas do snapshot canônico mantêm seu próprio relógio e **não são forçadas** por capturas brutas idênticas.
- Testes: `scripts/agent-source-capture.test.py` valida separação das fontes, a retenção de vínculos de kit LCD/PCBAs anteriores no raw, revisões 1/2 do mesmo job, isolamento JOB1/JOB2, restart SQLite/origem, linha e período errados e 3028 original intacta. `scripts/agent-trace-target.test.py` valida o worker AST real em dia anterior da Linha 1 com um snapshot mais recente presente, mantendo as duas capturas na revisão original e sem mutar o novo snapshot. Workflow histórico executa novas provas.
- **Limites:** não contém ainda 3012 atribuída ao dia, pois a consulta é histórica/transversal e a igualdade de PCBA só gera `same_pcba_candidate`. A 3028 já usa seu próprio `3028_live_raw`. Eventos **no meio** da 3074/2114/3022 que nunca chegam ao retorno final continuam dependendo do banco estruturado e dos checkpoints existentes; a preservação bruta intermediária deverá ser um bloco posterior. Não há atestado de coleta integral, denominação de todas as peças ou causa de falha.
- **Próximo B3.4b2**: integrar evidências de **execução parcial em progresso** sem gravar event-stream ilimitado; comprovar escopo de vínculo/kit e completude de 3012 por consulta, preparar índice autenticado de capturas locais por snapshot/period sem expor bruto ao Firebase; testar Windows e Firestore antes de afirmar Bloco B fechado.
- C/D/E pendentes, PR40 draft, sem merge/deploy/ZIP, **fábrica PENDING**. PR38/main/#35/#36, regras Firebase, `source_id`, porta 8765 e instalações reais A/B intocados. Revalidar HEAD e CI antes da próxima edição.


## Checkpoint B3.4b2 — evidência parcial persistida antes da conclusão da MES (19/10/2026)

- **LAST_CODE_SAFE_SHA** `b0dd6ca2cc9b0b30f720702097ab372bc562945a`; [CI exato 39316302999](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39316302999) **2/2 GREEN**: 54 testes Node, 31 Python e navegador nove views PT/EN/mobile. O SHA deste commit documental é posterior: revalidar CI do novo HEAD.
- `ames/agent/source_capture.py`: classe `BoundedPartialJournal` amostra **eventos reais** de 3074 (`pcba_result` com item), 2114 (`pcba COMPLETE` com `state.result`) e 3022 (`pcba` contendo **somente metadados de progresso**, nunca linhas brutas 3022 não fornecidas pelo callback). Identifica corretamente `sn` da 3074. Guarda no **mesmo journal SQLite B3.1/B3.4b1**, por fonte/job/snapshot/revisão original/período; marca sempre `partial`, `source_complete=false`, `population_complete=false` e `progress_only=true` na 3022.
- **Limites estritos por fonte/job:** no máximo 12 itens distintos de progresso, 12 KiB por item e 4 escritas/revisões intermediárias; novas evidências fora do limite não ampliam indefinidamente o SQLite. A conclusão normal acrescenta uma revisão posterior com o resultado completo da fonte. Uma interrupção durante a coleta deixa pelo menos o primeiro checkpoint escrito; os eventos não gravados entre checkpoints podem permanecer apenas nos dados estruturados/checkpoints do motor. **Não declarar replay completo de eventos.**
- `ames/agent/agent_entry.py`: o callback do worker com `snapshot_targets` exatos B2 chama o journal parcial mesmo antes do retorno do motor. Falha transitória de gravação parcial é registrada no log e não derruba a navegação MES nem altera o status da coleta para concluído.
- `scripts/agent-source-capture.test.py`: amostragem limitada com 20 eventos de 3074, oversized recusado, vínculo de componente LCD/PCBAs anteriores preservado, diferentes revisões e conclusão posterior sem substituir o primeiro raw; 2114 e 3022 parciais explicitamente incompletas.
- `scripts/agent-trace-target.test.py`: worker AST real interrompido intencionalmente após eventos 3074 e 2114; job termina com erro, mas ambas as capturas parciais persistem no dia/revisão antigo e outro snapshot mais recente permanece intocado.
- Invariantes: sem novas tabelas, sem reconsulta A-MES, sem alteração de `source_id`/FPY original, sem publicação do bruto ao Firebase, sem decisão causal sobre defeito/3012, sem tocar computador físico. O índice local `capture_index` de B3.4b1 continua privado/metadata-only.
- **Próximo ponto B3.4b3:** revisão crítica do índice autenticado por `snapshot_id+line+period+source` para consultar metadados parciais sem expor bruto ao Firebase; investigar preservação da 3012 transversal com vínculo temporal comprovado, sem chamar igualdade de PCBA de reparo confirmado; verificar Windows e compatibilidade Firestore antes de fechar B. Depois indicadores C (PCBA principal vs componentes de segundo uso), D tendências e E remoto/fábrica.
- Bloco B continua **parcial**; C/D/E pendentes; PR40 draft; CI histórico não equivale a Full Quality ou teste físico. PR38/main/#35/#36/Firebase produção/porta 8765/instalação A/B intocados. Não reexecutar A1/A2/B1/B2/B3.1/B3.2/B3.3/B3.4a/B3.4b1/B3.4b2.
