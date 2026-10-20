# PR #42 — Gate físico histórico Linhas 2 e 3 — 20/10/2026

## Incidente reproduzido pelo print do operador

A coleta AWIP3028 de 19/10/2026 07:00 → 20/10/2026 07:00 foi marcada como `done` no Console local, mas o modo **Último dia produtivo** deixou vazios FPY, Check FPY, Quantity, Falhas e Snapshot nas Linhas 2 (`TAN10102`) e 3 (`TAN10103`). Os prints mostram o erro explícito `ambiguous_history_source:<linha>` para AMBAS as linhas. Não se trata de prova de zero defeitos, e `done` não comprova persistência SQLite ou fonte completa. O trabalho começou do SHA `460890efdfb3dfa0d03af9dfc7d15b7306608194`, 5/5 GREEN **daquela versão antiga**, sem homologação física.

## Causa confirmada no código

`ames/reading-period-controller.mjs` encerrava a leitura ANTES de abrir qualquer revisão assim que `history.list(line)` retornava `source_id` diferentes em um mesmo período. É uma proteção legítima contra misturar postos, mas bloqueava uma revisão válida mesmo quando a origem local estava comprovada. O erro é visível nos prints do operador; não foi preciso especular sobre configuração Firebase. O SQLite da instalação física ainda NÃO foi inspecionado, logo não é possível afirmar que a coleta anterior foi efetivamente salva.

## Correção restrita da PR42

- `ames/reading-period-controller.mjs`: se houver mais de uma origem, selecionar automaticamente **somente** a origem coincidente com a identidade `capabilities.source_id` do agente conectado, ou identidade única do seu head canônico local, exigindo ainda que a revisão daquela origem tenha `history_source='local'`. Não usar “último `collected_at`” de outro posto. Se a origem não for comprovada, expor as opções de fontes por **linha e período**, sem abrir payload arbitrário.
- `ames/console-reading-period.mjs`: seletor compacto aparece somente na linha cuja origem é ambígua. O usuário pode selecionar uma origem explicitamente; exibir a escolha e atualizar leitura **não** agenda nova consulta MES.
- Mantidas as verificações de `source_id`, `line_id`, `snapshot_id`, `snapshot_revision`, período, modo e revisão local pendente; vedada associação de dados de outra linha/origem e publicação de raw ao Firestore.
- `scripts/ames-reading-period.test.mjs`: casos de ambiguidade, autoescolha vinculada à identidade local, escolha manual sem identidade e recusa de payload de outra origem.
- `scripts/ames-reading-period.browser.mjs`: cenário de revisão remota mais recente do mesmo dia e origem diferente; exige escolha explícita, sem iniciar MES, e mantém Today.
- Teste direto do controlador feito com Linhas 2 e 3 fictícias: ambas carregaram apenas a origem do agente conectado; com origem não comprovada, somente a linha selecionada foi aberta após a escolha. Parser JS validado para arquivos alterados. **Esses testes locais não são os cinco gates do CI.**

## Estado e segurança

A PR42 continua **OPEN/DRAFT** sobre PR40. A última mudança funcional foi `3cb1a7fdf5c4047b7e9830adf0f8d227224fb5a9` (confirme o novo HEAD após este documento). CI do HEAD NOVO: **não confirmado**; o conector consultado lista somente workflows de pull_request, enquanto o workflow `ames-operational-history.yml` dispara em `push`. Não escrever “5/5 GREEN” sem os cinco jobs da execução exata. **Fábrica RED/PENDING** até leitura demonstrada; nenhuma alteração de `main`, Firebase produção, banco da fábrica, token, identidade ou porta 8765.

## Próxima sequência segura

1. Confirmar no GitHub Actions da branch **cinco jobs** no HEAD exato (`reading-contract`, `reading-browser`, `reading-windows`, `reading-firestore`, `package-pr42`). Usar apenas o ZIP CLEAN do artefato do mesmo SHA, preservando pastas, backup e SQLite antigos.
2. Após testes automatizados, na fábrica fechar candidato anterior; abrir candidato em pasta isolada, sem dois serviços simultâneos na 8765. Não afirmar que o novo SQLite contém o histórico do candidato antigo. Preservar as pastas que receberam a coleta física anterior.
3. No computador que realmente guardou o histórico, escolher Último dia produtivo (19/10 07→20/10 07), clicar **Atualizar leitura**, selecionar Linha 2 e Linha 3. Se houver escolha de origem, conferir qual é do posto e selecionar; não presumir que remoto mais recente é a origem correta.
4. Conferir período, linha, `source_id`, snapshot/revisão e indicadores contra o MES real. Se a linha continuar vazia após corrigir a ambiguidade, verificar índice `/local-history`, `/v2/capabilities.source_id`, proveniência e erros de abertura das revisões no SQLite correspondente — diagnósticos apenas sanitizados, sem token, IMEI, SN ou conteúdos privados.
5. Não mudar Firebase para corrigir leitura do SQLite local. Não refazer a lógica 3022 R2–R12, o filtro de Top3 de target ou as regras 3074 de montagem temporal já implementadas. Manter os projetos PR38/40 independentes.

**Referências:** PR42 https://github.com/pedrokam700/Central-de-Controle-/pull/42 ; documento canônico 3022 `docs/ames/handoffs/HANDOFF_CANONICO_3022_R12_20261020.md`; handoff principal PR42 `docs/ames/handoffs/ISSUE41_PR42_INTEGRACAO_20261019.md`.

## Nova regressão física: Consulta por SN não deve herdar o período do monitoramento

**Evidência de 20/10:** a captura da AWIP2114 (consulta PCBA) foi colocada lado a lado com a Central no modo `Último dia produtivo`: em vez de sua interface própria de investigação SN, a Central mostrou `Consultar SN nos dados armazenados`, dataset `3012` e `Não coletado para este período/linha`. Trata-se de uma regressão da UX, **não de prova de que a PCBA não possui histórico 2114/3074/3022/3012**.

**Causa no código:** `ames/console-view.mjs` encaminhava `id==='sn'` ao genérico `createStoredPeriodRecords` quando o modo era histórico. Esse componente pesquisa **somente a revisão do dia da linha**, enquanto a Consulta por SN deve iniciar uma investigação transversal (PCBA + montagem da falha + materiais físicos selecionados + PCBAs anteriores, com as guardas temporais já implementadas) e pode abrir jobs SN anteriores do SQLite.

**Correção localizada na PR #42:**
- A view `sn` monta sempre `createSnConsoleView`, decoradores forenses e `createSavedSnHistoryView`, independentemente de `Hoje/Último dia produtivo/Período…`. O filtro diário continua valendo para os indicadores das linhas, Top3, falhas e dashboards; não se aplica como filtro de coleta SN.
- `ames/agent-client.mjs` foi lido para confirmar que a coleta `sn` usa `/sn-lookup` com SN e `include_3022=true`, sem herdar `collectionScope` de período/linha. Nenhuma alteração foi necessária no coletor MES.
- `ames/data/store.mjs` expõe `sessionGeneration`, incrementado por `clear()`; `console-view.mjs` mantém a view SN ativa e o campo de entrada entre mudanças de período **da mesma sessão**, mas a destrói e apaga ao mudar/limpar a sessão, prevenindo exposição do último SN entre contas.
- O aviso de período no topo da view SN foi trocado por uma frase discreta `Consulta por SN independente do período de monitoramento`; os snapshots históricos do monitoramento continuam disponíveis em suas views próprias.
- `scripts/ames-reading-period.browser.mjs` testa SN sempre presente no modo histórico, input/DOM/investigação preservados em anterior→hoje, nenhuma mutação MES ao alternar, e descarte efetivo do SN após `store.clear()`. `scripts/ames-reading-period.test.mjs` verifica invariância da sessão no período e invalidação após logout.
- Verificações locais nesta conversa: sintaxe JS das fontes modificadas PASS; execução isolada da função **real** `createAmesStore` confirmou que troca de período não altera `sessionGeneration`, e `clear()` incrementa. **Browser Playwright completo e 5 jobs Actions ainda NÃO comprovados neste checkpoint**.

**Validação operacional deve ser separada:** o operador está testando a CLEAN que existia **antes** deste patch SN, portanto NÃO esperar que o comportamento SN já esteja corrigido nela. Sua prova principal agora é se `Último dia produtivo` mostra as duas linhas com os snapshots do SQLite original; não transferir bancos nem perder o resultado do posto. Após CI 5/5 no HEAD do patch SN e candidato SHA correspondente, testar a Consulta por SN com uma PCBA de 2114, alternando o período do monitoramento, garantindo que a investigação e suas fontes continuem acessíveis. Não confundir `Manual/Automatic` com reparo e não inventar turno/geração sem passagem 3022 provada.
