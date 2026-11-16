# Continuidade Issue #85 / PR #86 — timeline de reuso por evento

**PR DRAFT contra a branch da PR #84. Homologação física PENDENTE. Sem instalador, merge, release ou deploy.**

## Identidade e continuidade

- Repo oficial `pedrokam700/Central-de-Controle-`.
- Base exata: `3a736b57230ec3dd14ff48ac00106a857c1fb7a6`, PR84, branch `work/ames-pr84-3022-extjs-preflight-20261116`.
- Nova branch: `work/ames-issue85-reuse-event-timeline-20261116`; [PR86](https://github.com/pedrokam700/Central-de-Controle-/pull/86), [Issue85](https://github.com/pedrokam700/Central-de-Controle-/issues/85).
- RED anterior à implementação: `dbcee625e4ef2a337a5b4ebb750d80b88c4bc304`; [CI RED 43904152828](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/43904152828). Falham os quatro novos contratos Node e o Chromium por duas tabelas no lugar de uma; demais correções já integradas não foram removidas.
- O SHA de implementação e a URL/conclusão CI do mesmo SHA são registrados no checkpoint final da PR86. Antes de continuar, conferir `head_sha` e esse comentário; não usar PR70/76/main como base.
- CI da base 43901362618 conferida: 2/2 SUCCESS. PR80 já eliminara a segunda tabela 2114; este trabalho não desfaz nem repete essa mudança.

## Comportamento implementado

Uma tabela operacional mostra eventos 2114, 3028, 3012 e 3022 de forma independente. Uma fonte não preenche a pessoa, data ou comentário de outra. Reparos de código diferente da falha também permanecem visíveis como atendimentos da mesma PCBA, sem afirmar correspondência com Hist Seq.

Cada linha conserva PCBA, fonte, Hist Seq, Defect Time, Tran Time, Repair Time, falha/processo, análise/escopo, status, pessoa e papel, comentário completo e metadados de origem/linha/snapshot/revisão/período/registro quando existentes. Não há `+N`, tooltip obrigatório ou painel recolhível para ler técnicos/comentários na timeline. A auditoria bruta permanece separada/recolhível.

Eventos com horário válido são ordenados pelo instante; no atendimento 3012 o Defect Time é a chave principal e Repair Time só é usado para ordenar se faltar Defect Time válido, sem preencher nenhum campo. Eventos sem instante ficam visíveis ao final com aviso. Hist Seq só desempata dentro da mesma fonte/PCBA/escopo. Não atribuímos hora 3012 a uma 2114 sem data.

Deduplicação exige identidade e conteúdo compatíveis: origem, linha, snapshot/revisão, fonte, registro, Hist Seq, clocks, papel/ID/nome, análise/status e comentário. Mudança de revisão, pessoa ou conteúdo não é apagada por igualdade de PCBA/código. Conflitos de nomes no mesmo evento são visíveis e não autenticam autoria. Os nomes 3012 usam o resolver existente da PR78, sem mapa global nem aproximação temporal.

Para componentes, cada PCBA vinculada conserva sua própria história. Y/N e Bind/Unbind Time só aparecem quando explicitamente fornecidos para aquela PCBA; um vínculo histórico sem status não herda o Y do vínculo atual. PCBA vinculada sem eventos recebe contexto 3074 de histórico indisponível, sem inferir ausência de falha ou quantidade de usos.

Leituras de cache 3012/3022 são independentes, em paralelo e memorizadas por PCBA dentro do snapshot montado. Fechar/reabrir o detalhe não reconsulta. Troca de seleção que desconecta o detalhe invalida a escrita tardia no DOM. Erro de uma fonte preserva os eventos já carregados, inclusive reparos existentes no snapshot. Não ocorre consulta MES para renderizar a timeline.

## Arquivos e fronteiras

- `ames/data/reuse-history-timeline.mjs`: projeção pura de observações; identidade, clocks, papéis e ordenação. Não calcula uso físico nem associa reparo à falha.
- `ames/console-reuse-history-timeline.mjs`: tabela única, valores visíveis, escaping, proveniência e estados de cobertura.
- `ames/console-reuse-cohorts.mjs`: adaptadores dos dois comparativos, fontes originais em vez de projeções incompletas do classificador, carregamento do cache e montagem única.
- `ames/console-improvements.css`: estilos locais da timeline com tokens de tema e quebra de texto.
- `sw.js`: inclui os dois módulos novos no cache offline e renova a revisão. Nenhuma limpeza de cache operacional foi executada.
- `scripts/fixtures/reuse-timeline.mjs`, `scripts/ames-reuse-event-timeline.test.mjs`, `scripts/ames-reuse-timeline.browser.mjs`: fixture, positivos/negativos e Chromium.
- Workflow PR76: branch vinculada, novo cenário Chromium e artifact somente de screenshots sintéticos. Sem empacotamento/instalador.

**Preservados byte a byte contra a base:** `ames/agent/`, `ames/factory-engine/`, `ames/data/reuse-cohorts.mjs`, `production-evidence.mjs`, `console-sn-repair-evidence.mjs`, `console-sn-history-detail.mjs`. As melhorias #72–84, captura MES, clique 3022 de 5s, nomes compartilhados, recuperação/checkpoints e classificação física não foram substituídos. Main, PR70/84, SQLite/WAL operacional, identidade, outbox, guardian, rede, auth e Firebase não foram alterados.

## Validação e reprodução

Na raiz da branch, executar:

```sh
node --test scripts/ames-reuse-event-timeline.test.mjs scripts/ames-reuse-history-parity.test.mjs
node --test --test-isolation=none $(find scripts -maxdepth 1 -type f -name 'ames-*.test.mjs' ! -name 'ames-auth-hardening.test.mjs' ! -name 'ames-agent-pairing.test.mjs' | sort)
node scripts/ames-reuse-timeline.browser.mjs
```

Chromium usa Playwright instalado isoladamente; `PLAYWRIGHT_MODULE`, `PLAYWRIGHT_EXECUTABLE_PATH` e `BROWSER_OUTPUT` podem selecionar instalação e saída de teste. O workflow PR76 contém os comandos completos dos contratos Python, auditoria N1/N3/S1/U1, autenticação/pareamento e quatro roteiros de navegador preexistentes. Nenhum precisa do MES ou banco da fábrica.

Controles da base: 29 testes focados e nove telas Chromium × PT/EN × claro/escuro PASS. Na implementação foram executados todos os contratos Node do gate, motor Python (109 testes), replay puro/misto, prova de checkpoint, leitura de operadores, captura/retomada, Home/OPC/ExtJS, 29 testes de observabilidade 3022, nomes e isolamento de origem; nove telas, sync-reload, pairing e conclusão 3028 em Chromium. Resultados/contagens finais e URLs estão no checkpoint da PR, vinculados ao SHA exato.

O novo Chromium verifica 8 eventos em uma tabela, nomes/comentários visíveis, nenhum técnico 3012/3022 copiado para 2114, cache uma vez por PCBA, PT/EN × temas, erro de cache sem apagar evidência e componente ligado a mais de uma PCBA. Unitários cobrem também duplicata exata, revisão/autor/origem diferentes, relógio ausente, XSS, pessoa sem nome, nome conflitante e reparos existentes no snapshot quando a leitura local falha.

## Situação dos requisitos

| Requisito | Situação no código/testes |
|---|---|
| Timeline operacional única, auditoria separada | Implementado; Chromium conta uma tabela no detalhe PCBA/material |
| Uma linha por registro/atendimento, duplicatas verdadeiras removidas | Implementado; identidade conserva escopo, clocks, ator e conteúdo |
| Técnicos/papéis/comentários completos e visíveis | Implementado; sem `+N`/hover; escaping e nomes distintos testados |
| 2114/3012 sem associação por PCBA+código | Eventos independentes; contraprova de nome/comentário em 2114 |
| Defect/Tran/Repair Time e histórico sem data | Campos distintos, ordenação sem preencher lacunas |
| MainBoard / Phone Disassembly / Phone Battery Cover | Escopos preservados e exibidos separadamente |
| Origem/linha/snapshot/revisão e Y/N histórico | Visíveis quando comprovados; desconhecido não herda dado atual |
| PT/EN, temas, linhas e nove telas | Novos cenários de timeline + regressões integradas existentes |
| Desempenho e cache | Sem MES; cache por PCBA, carregamentos paralelos e sem redraw por reabertura; UPH físico não medido |
| Recuperação, nomes, SQLite/checkpoints #72–84 | Código preservado; suites integradas executadas em ambiente sintético |
| Homologação física | **PENDENTE**; nenhum ensaio no posto ou inferência de GREEN físico |

## Limitações e próximo passo seguro

Os testes são sintéticos. Não demonstram que os nomes dos prints antigos existam no payload instalado nem esclarecem as 98 PCBAs indeterminadas ou as 46/173 referências sem contexto. Ausência de dado continua desconhecida. Cache tem os limites da API existente (até 5000 linhas); esta UI não afirma completude populacional. Evento histórico com outra linha/revisão mantém sua proveniência e não vira fato da ocorrência atual.

Antes de qualquer ação no posto, revisar a PR86 e o artifact de screenshots do mesmo SHA. Validar visualmente a timeline usando apenas evidências já armazenadas e versão servida comprovada, sem repetir coleta integral. Não gerar pacote nem instalar até a etapa supervisionada autorizada. Rollback do código é reverter os commits desta PR sobre PR84; não há migração de schema nem reversão de dados.
