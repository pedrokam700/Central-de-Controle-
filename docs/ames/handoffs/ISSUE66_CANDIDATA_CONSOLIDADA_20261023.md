# Central de Trabalho / A-MES — candidata consolidada e transição supervisionada

Checkpoint de 23/10/2026. Repositório oficial `pedrokam700/Central-de-Controle-`.

## Escopo e regras

- A `main` e a última release oficial permanecem na 0.5.39, SHA `b283b1764432f5d90486d38a7553b30542a5c118`, salvo verificação remota posterior.
- PR #67 / Issue #66 contêm correções funcionais recentes e têm homologação física **PENDENTE**. Sua última base auditada nesta integração foi `ca64094e63b02d4e51d83b6fb113b9eb91510594`.
- PR #64 / Issue #57 tratam do mecanismo transacional de atualização/backup/rollback e permanecem **DRAFT**; última revisão conhecida `9b8140413984347e71df1af65aabd4ac1e9b5231`. Não transplantar seu updater inacabado para a candidata funcional, nem alterar essa branch.
- A nova branch de consolidação é `work/ames-unified-candidate-20261023`, baseada na PR #67, isolada das PRs antigas.
- Não fazer merge, release oficial, deploy, publicação de regras Firebase, instalação no posto ou remoção de processo sem autorização expressa e evidência física.
- O ambiente de entrega oficial é GitHub (repositório, Actions, Releases e GitHub Pages). Referências históricas a Netlify não são gate deste projeto.

## Auditoria de PRs DRAFT antigas

- #40 e #42: seus HEADs são ancestrais da base funcional atual; não representam dezenas de arquivos perdidos a fundir novamente. Revalidar por comportamento quando necessário.
- #32: painel de suporte, origem, saúde e desempenho do agente; nove commits funcionais selecionados e reintroduzidos, com testes. Não copiar o commit antigo de manifesto `release.json`, pois ele apontaria para versão obsoleta.
- #33/#35/#36: branches antigas empilhadas com lógica de Top3, reuso e histórico temporal. Muitas funcionalidades foram implementadas posteriormente na linha oficial. Não mesclar indiscriminadamente: verificar equivalência com Issue #66, identificar lacunas comprovadas e preservar evidência conservadora.
- #24: preview antigo; não mesclar.
- #1: mobile antigo; não mesclar.
- #26: fastlane histórico; preservar funções úteis já presentes sem restaurar entrypoint antigo.
- #38: identidade L3 antiga e ainda não comprovada; não incorporar até análise funcional específica.

## Incrementos da candidata consolidada

1. Painel adicional **Suporte, origem e desempenho** na Automação: origem/frescor/horário do snapshot por linha, status de runtime, backup, monitor, sync e diagnóstico de integridade; histórico recente de jobs em leitura local opcional. Sanitização do conteúdo recebido do agente. Sem iniciar coleta ou alterar MES ao ler o diagnóstico.
2. Novo módulo `ames/automation-support.mjs` no cache offline canônico para preservar todos os imports quando sem rede.
3. **Barreira suplementar na inicialização**: o launcher examina a porta 8765 e recusa subir outra instância quando encontra listener existente. Também falha se não houver capacidade de consultar os listeners. Esse preflight **não consegue provar a ausência de guardian legado** que esteja momentaneamente sem agente.
4. O `LEIA_PRIMEIRO.txt` da candidata explicita que **não se deve rodar `00_INICIAR_AQUI.bat` no computador 0.5.39 antes da migração supervisionada**. O ZIP não é um updater Windows.
5. O fallback público de download estava preso à antiga 0.5.35. Agora aponta para a release oficial 0.5.39 comprovada no histórico do projeto, SHA `b283b176...`; a descoberta pela API GitHub rejeita respostas mais antigas que esse fallback, evitando sugerir um pacote obsoleto em caso de resposta defasada.

## Ordem de validação e implantação — sem atalhos

### A. Primeiro contato com o mesmo PC da fábrica (somente leitura)

1. Continuar usando o posto atual; o pacote novo baixado e extraído pelo operador ainda não foi executado.
2. Executar **somente** o kit independente `ISSUE57_INVENTARIO_GUARDIAN_READONLY.zip`, preferindo `INVENTARIAR_GUARDIANS_READONLY.ps1`, sem copiar/alterar SQLite, tokens, perfis ou tarefas agendadas. O kit está fora da nova candidata.
3. Compartilhar apenas metadados de PID, caminho dos executáveis, comandos/inicializadores, serviços/tarefas e horário do processo; ocultar token, cookies, URLs com `#ames_agent_token=` e outros segredos.
4. Cruzar inventário com `Root/logs`, demais locais de runtime, processos e filas pendentes. Caso não seja possível comprovar writer ou origem, **bloquear** inscrição/atualização.

### B. Migração única do guardian antigo — após A e homologação

1. Planejar janela sem coleta/reparo em andamento e comprovar autorização do operador.
2. Inventariar processos/guardian e manifestos; manter backup consistente de configurações, SQLite/WAL/journal, snapshots/outbox e artefatos referenciados. Validar restauração em destino isolado.
3. Desativar o mecanismo antigo de reinício **somente depois de identificá-lo exatamente**. Não usar mata-processo por nome amplo nem deixar guardiões antigos atuarem em paralelo.
4. Instalar e verificar o novo launcher/guardian em diretório controlado, preservando identidade do posto, token, fonte, dados e coletores congelados. Observar porta/PID/raiz/health e recuperação.
5. Executar testes supervisionados na candidata, incluindo consulta SN, rastreabilidade de último dia, FULL 3028+3074+2114+3022, histórico/material de segundo uso, dashboards e compartilhamento entre PCs. Manter rollback funcional.
6. Se uma verificação falhar, **não promover**; recuperar a configuração anterior comprovada.

### C. Atualizações futuras

Só após o piloto de B, o coordenador transacional da PR #64 pode ser elegível para atualização com bloqueios persistentes, drenagem, backup/restore, identidade dos writers e rollback. CI GREEN não substitui homologação física. `update_authorized=false` até liberação explícita.

## Requisitos funcionais a preservar da Issue #66

- Consulta por PCBA: destacar vínculo Y atual; se não houver nova montagem, reconstruir vínculo da última falha N e distinguir comprovado/candidato; nunca promover histórico indeterminado a certeza. Uma nova montagem é o foco atual, sem misturar materiais antigos.
- Consulta por Material SN: 3074 → PCBAs anteriores → falhas/famílias e migração de falha acompanhando o componente, com origem/tempo e prova separada de hipótese.
- Rastreabilidade usa a ocorrência exata do 3028, não a regra isolada de Consulta por SN.
- Último dia produtivo deve sair do bloqueio; FPY/Quantity exigem fechamento FULL comprovado, não mera leitura 3028 ou zero inventado.
- Falhas agrupadas devem mostrar valores observados exatos quando houver prova, e indicar cobertura incompleta sem extrapolar.
- Dashboard: categorias configuráveis PCBA/material reusado, mesma falha/família, união/interseção sem duplicação; sensibilidade do Check FPY separada de causalidade; dois gráficos navegáveis e tendência vinculada a fechamentos FULL comprovados.

## Gates

- Testes de módulo/cache/suporte/launcher: devem ser GREEN no SHA efetivo desta branch.
- Qualidade CI GitHub: revalidar somente o SHA exato depois de qualquer commit.
- Candidato ZIP: manifesto interno e hashes SHA-256 de cada entrada; nenhum dado local, token ou cookie dentro.
- Teste físico de 3074/2114/3022, processos guardian, 0.5.39 e sincronização multicomp.: **PENDENTE** até evidência enviada pelo operador.
- Merge/Release/produção: **NÃO AUTORIZADOS** neste checkpoint.

## Ponto de retomada

1. Confirmar `main`, PR #67, PR #64 e CI da branch de consolidação no GitHub.
2. Resolver qualquer teste não verde; construir candidato ZIP com `scripts/build-integrated-candidate.py` no HEAD limpo, verificando hashes e o aviso de migração.
3. Entregar o kit read-only e instruções de fase A ao operador. **Não** pedir que execute o ZIP da candidata no posto atual enquanto o guardian legado estiver desconhecido.
4. Com os metadados reais, finalizar a transição supervisionada, validar e então discutir promoção.

## Continuidade 23/10 — duas origens legítimas nas mesmas linhas (PR #68)

**Este adendo atualiza a prioridade operacional dos passos acima.** O operador confirmou que **dois computadores coletam ambas as linhas TAN10102 e TAN10103**. Não solicitar novamente PowerShell, prints, acesso aos postos ou inventário do segundo computador neste ciclo. O diagnóstico anterior pertence ao contexto do primeiro posto; não usá-lo para deduzir a identidade, a preferência ou a autoridade do segundo. A exigência de inventário supervisionado permanece apenas como gate para uma futura **instalação**, não para desenvolvimento seguro nesta branch.

- Evidência do primeiro posto, não extrapolável ao segundo: `publishing.status=shared_history_legacy_conflict`, `receiving.status=origin_conflict`, `pending=0`, `visible_heads=[]`, linhas bloqueadas TAN10102/TAN10103, build `CANONICAL-R11-BATCH`. Não equivale a falta de coleta e não autoriza limpar filas, históricos ou origens.
- **Checkpoint funcional publicado:** `2b443d5d8e44419348b8557cef3e2a15b88a7467` (`feat(ames): inspect overlapping collector origins in preserved history`). A tela de Histórico distingue source IDs, permite filtrar revisões por origem e destaca dias produtivos em que ambos registraram versões. Não soma as ocorrências e não seleciona um posto como autoridade automaticamente. A lista é **somente leitura** e não substitui Hoje/FPY, não altera Firebase, agentes ou guardian.
- Testes locais deste incremento: `node --test scripts/ames-history-source.test.mjs scripts/ames-history-origin-choice.test.mjs scripts/ames-history-revisions.test.mjs scripts/ames-period-history-matching.test.mjs scripts/ames-history-usability-20261020.test.mjs` → **5/5 arquivos PASS**; `git diff --check` PASS. Isso **não** comprova sincronização multicomp. nem resultado físico. Central Quality Gate para o SHA citado foi visto **in_progress**, não GREEN, na primeira consulta.
- **Limite não resolvido:** `origin_conflict` segue bloqueando a adoção/promoção de um único HEAD operacional quando dois coletores reivindicam as mesmas linhas; histórico imutável pode ser inspecionado por origem, mas não deve ser fundido ou tratado como fechamento FULL compartilhado sem uma política de identidade/coordenação e evidência de integridade implementada e testada.
- **Próxima implementação segura:** investigar no código e nos testes a identidade por linha/PC, o algoritmo de publicação/recepção e os conflitos legados; adicionar diagnósticos e regras conservadoras para múltiplos publicadores sem excluir evidências nem desbloquear automaticamente os agregados. Manter PR #68 DRAFT e PR #64 intocada. Nenhum merge, release ou instalação autorizados.

### Bloco seguinte — evidência de recepção para duas instalações

- `ames/sync.mjs`: após verificar hash/manifesto e detectar duas instalações para a mesma linha, mantém a recusa de selecionar um `HEAD`, mas agora registra `origin_conflict_candidates` com **apenas metadados** de snapshot, origem, horário e período; detecta também quando duas instalações apresentam o **mesmo `source_id`** (colisão de identidade). A conta/UID de publicação não é enviada ao diagnóstico. `stop()` apaga esses metadados da sessão.
- `ames/console-data-health.mjs`: mostra essa evidência em **Monitoramento → Diagnósticos e informações técnicas → Sincronização entre postos**, sem declarar sincronização concluída. O botão de diagnóstico A/B copia somente número de instalações/origens e colisão por linha, sem IDs de origem, contas ou registros de produção.
- Testes locais: `ames-sync`, `ames-data-health`, `ames-multipc-shared-contract` e `ames-history-source` **4/4 arquivos PASS**, incluindo duas instalações com source ID idêntico e a ausência de UID na interface/cópia. As duas instalações continuam em conflito até conciliação legítima. Nenhum bypass de regra Firebase, escrita de HEAD, soma entre fontes ou alteração de posto.
- Ampliação local: **7/7 arquivos Node PASS** incluindo escolha de origem, leitura de período e revisões; tentativa separada com `ames-reading-period.browser.mjs` não executou por dependência `playwright` ausente neste ambiente (gate navegador **NÃO COMPROVADO** localmente). Aguardar Actions para evidência CI do SHA exato, sem classificar essa tentativa como GREEN.

### Comparação conservadora das coletas concorrentes (incremento seguinte)

- O commit de diagnóstico anterior **`2e749c8c413bf2da5bf5f96e98368191934ed66f`** teve **Central Quality Gate #40020312589 SUCCESS, 3/3** (views, E2E Firestore e estático). Não é homologação na fábrica.
- Acrescentar à recepção de duas instalações uma **comparação somente de observações 3028**, usando PCBA, código e horário de falha como **candidatos** de coincidência, não identidade comprovada. Ela ocorre apenas após verificação criptográfica do payload e nunca publica uma união.
- Caso os períodos diferirem, comparar somente a **janela temporal comum**, separando registros fora dela; se não houver sobreposição, não comparar. Rejeitar contagens comparativas quando faltar identificador ou houver chaves ambíguas/repetidas no mesmo coletor. O resultado retém **apenas contagens/estados**, nunca PCBA, SN, UID ou chaves brutas.
- No Monitoramento, expor um atalho visível `Sincronização entre postos · ver diagnóstico` para abrir a seção técnica que antes ficava recolhida. Continuar mostrando cobertura parcial/indeterminada sem zeros fabricados.
- **Ainda pendente:** conciliação do HEAD compartilhado e política de múltiplos writers com integridade e homologação física. Proibido converter coincidências candidatas em deduplicação definitiva, promover qualquer origem sem política autorizada ou mudar `main`/PR #64/agentes.
- **Regressão detectada por Actions** no SHA `a5193f0410e6c732b1d028d25f2b8677628f20e2`: Central Quality Gate #40036976034 teve E2E Firestore e estático SUCCESS, mas o job das nove views FAILED porque o novo atalho permanecia em português na UI inglesa. A correção seguinte renderiza o rótulo segundo `document.documentElement.lang`, inclusive após alternância de idioma. **Não classificar o SHA com falha como GREEN**; aguardar a nova CI no novo HEAD.

## Evidência de fábrica 26/10 — recepção histórica confirmada sem agente

- O operador enviou oito capturas: a primeira mostra o PC coletor com `CANONICAL-R11-BATCH`; as demais mostram outro PC sem agente, acessando a URL oficial do GitHub Pages. **Não solicitar novamente uso de computador alheio, PowerShell ou diagnóstico já fornecido.**
- **PASS físico restrito à leitura remota de histórico já publicado:** no segundo PC, o dia produtivo 23/10/2026 07:00 → 24/10/2026 07:00 ofereceu duas origens para TAN10102. Ao selecionar, exibiu snapshot histórico 19 com Quantity 1124, Falhas 26, FPY 97,69% e Check FPY 97,86%. Na TAN10103, snapshot 20 com Quantity 1422, Falhas 39, FPY 97,26% e Check FPY 98,31%. Ambas as linhas indicavam origem **Compartilhada** e hora original de 23/10/2026 14:48:19. Sem soma automática das origens.
- O diagnóstico copiado do receptor (`2026-10-26T11:10:57.886Z`) mostra `local_agent_connected=false`, `publishing.status=idle`, `receiving.status=ready`, `authority=operational_day_history`, `visible_heads=[]`, `candidates=0`, `downloaded=0`, `conflict_lines=[]`. A tela indicava **0/3 linhas atuais**, sem snapshot remoto do período corrente, apesar da leitura do histórico anterior bem-sucedida. Isso não prova perda de histórico nem compartilhamento do dia corrente.
- **Conclusão de homologação:** visualização histórica sem agente comprovada na versão pública existente; **sincronização de HEAD atual com dois coletores, reconciliação de origens, fechamento FULL, PR #68 candidata, PR #64 e atualização/rollback** continuam não homologados. Não confundir esses gates.
- **Correção de UX subsequente:** rótulo de status passa a mencionar explicitamente dados **atuais** e o diagnóstico sem HEAD esclarece que histórico passado ainda pode ser consultado. Preserva o bloqueio conservador e não muda algoritmo de leitura, Firebase, agente ou publicação.

## Incremento 26/10 — observações atuais isoladas por origem em conflito

- Após a comparação conservadora dos dois coletores e validação íntegra dos payloads, `ames/sync.mjs` inclui no diagnóstico de **cada origem** apenas FPY, Check FPY, Quantity e quantidade de falhas **observadas naquela revisão**, além da confirmação (ou não) de completude 3028. Campos ausentes ou inválidos viram `null`/`—`, nunca zero presumido.
- `ames/console-data-health.mjs` mostra os valores separadamente em **Monitoramento → Sincronização entre postos → Revisar origens conflitantes**, rotulados como **observação apenas desta origem**. Isso não alimenta `store.replaceSyncedSnapshots`, não vira o cartão principal de Hoje, não soma duas coletas, não calcula FPY total, não escolhe origem e não promove fechamento FULL.
- O diagnóstico A/B copiado continua sem UID, SN, PCBA, conteúdo bruto e sem esses agregados; expõe somente metadados mínimos/candidatos de comparação. A UI escapa o source ID e valida os limites numéricos, mesmo se a entrada do estado estiver adulterada.
- Testes sintéticos verificam métricas distintas por origem, salvaguardas do `origin_conflict`, ausência de promoção ao Today, bloqueio de valores inválidos e sanitização da UI. `node --test scripts/ames-sync.test.mjs scripts/ames-data-health.test.mjs scripts/ames-multipc-shared-contract.test.mjs scripts/ames-history-source.test.mjs` **4/4 arquivos PASS local**, `git diff --check` PASS. CI GitHub do SHA final ainda precisa de comprovação exata.
- A **consulta histórica em PC sem automação foi comprovada na fábrica** (registro acima); a **nova visualização de candidatas em conflito ainda NÃO foi testada lá**, pois a PR #68 segue DRAFT e não instalada. Próximo passo seguro: continuar a leitura isolada e evoluir a política de coordenação com prova de integridade e consentimento operacional antes de qualquer head compartilhado.

### Checkpoint GitHub confirmado — observações concorrentes

- SHA `5585a210ea1d27c84d25f527bd21fcb84a17283e` na PR #68 DRAFT, Central Quality Gate run **#40317283620 SUCCESS, 3/3 jobs** (views, sync E2E/Firestore e estático). Esses testes não substituem validação física da candidata.

## Incremento 26/10 — colisões de identidade no índice histórico

- **Risco corrigido no receptor:** antes, `createMesHistorySource` indexava as revisões pelo conjunto `(line_id, source_id, snapshot_id, snapshot_revision)`. Se dois proprietários publicassem a mesma identidade visível, uma linha remota podia substituir silenciosamente a outra **somente na lista local**, embora ambos os documentos Firestore fossem imutáveis. Agora a identidade interna da revisão compartilhada incorpora também o proprietário e o `key/hash` já verificados; versões distintas são preservadas.
- A preferência por uma revisão SQLite local só marca `Local + compartilhada` quando **existe exatamente uma** revisão remota correspondente e não há divergência de hash/período. Na presença de duas candidatas remotas com o mesmo ID visível, a versão local permanece separada e `shared_ambiguous=true`, sem associação fictícia.
- `summarizeHistoryPublishers` mantém as revisões de cada proprietário, detecta `identity_collisions` e contabiliza a sobreposição mesmo quando dois proprietários repetem o mesmo `source_id`. Uma revisão local sem UID não inventa outro computador quando há apenas um proprietário remoto conhecido dessa mesma origem.
- Em **Base local → Histórico por data**, há aviso acessível de colisão, explicando que o filtro pelo mesmo ID de origem não separa essas instalações. O UID não é exibido/copiado; a UI continua apenas leitura e não combina métricas, datas ou falhas.
- Testes sintéticos: dois proprietários/revisões com mesmo ID visível, abertura independente das revisões, local ambíguo preservado, ausência de falso segundo posto e aviso de UI. `node --test scripts/ames-history-source.test.mjs scripts/ames-history-origin-choice.test.mjs scripts/ames-history-revisions.test.mjs scripts/ames-sync.test.mjs scripts/ames-data-health.test.mjs` **5/5 arquivos PASS local**; `git diff --check` PASS. **CI do próximo SHA PENDING** até publicação.
- Sem alterações em writers/Firestore Rules/atualizador, agentes reais, guardian, `main`, release ou PR #64. A homologação multiwriter e confirmação de origem operativa continuam PENDING.

### Checkpoint GitHub confirmado — preservação por proprietário

- SHA `88a6118b7e63f464c255379768ae049c8e1b2ccd` na PR #68 DRAFT, Central Quality Gate **#40317992640 SUCCESS**. A homologação física de colisões permanece pendente.

## Incremento 26/10 — não confundir revisão visível com identidade de conteúdo

- Ao aprofundar a auditoria, verificou-se que o índice Firestore original carrega `hash` do payload transportado, enquanto o SQLite local expõe `content_hash` da revisão canônica. Esses campos **não são intercambiáveis**, e as regras atuais do índice nem admitem `content_hash` como coluna. Portanto, duas revisões com mesmo `source_id`, número e janela **não comprovam** o mesmo conteúdo apenas por metadados.
- `createMesHistorySource` agora só prefere a versão local e remove a duplicata remota da lista quando **ambos** os lados fornecem o mesmo `content_hash` canônico explícito e os períodos não divergem. Se a prova falta, preserva **as duas** entradas e marca a local como `shared_candidate` (índice semelhante, conteúdo não comprovado). Uma divergência comprovada de hash/período continua sendo erro de integridade, sem substituição.
- A coluna Compartilhamento distingue `Local · índice semelhante, conteúdo não comprovado`; o usuário ainda pode abrir ambas as revisões isoladamente. A candidata remota não é instalada no SQLite nem promovida a Hoje.
- Testes locais ampliados para proveniência ambígua, hashes incomparáveis e acesso independente: `node --test scripts/ames-history-source.test.mjs scripts/ames-history-origin-choice.test.mjs scripts/ames-history-revisions.test.mjs scripts/ames-history-usability-20261020.test.mjs scripts/ames-sync.test.mjs scripts/ames-data-health.test.mjs` **6/6 arquivos PASS**, `git diff --check` PASS. CI GitHub do novo SHA ainda **PENDING**.
- Nenhuma alteração em regras Firestore, writers, contas, postos, instalador ou atualização transacional. Investigar uma comparação de conteúdo provada/eficiente somente em trabalho futuro separado, sem fingir equivalência de dois hashes de natureza distinta.

### Checkpoint GitHub confirmado — equivalência de conteúdo

- SHA `3c6e3dac05668d77655ef073b9e1b2536e186d4a` na PR #68 DRAFT: Central Quality Gate **#40318427717 SUCCESS, 3/3 jobs** (Console, sync E2E/Rules, estático); sem homologação da versão candidata na fábrica.

## Incremento 26/10 — acesso imediato a revisões concorrentes de Hoje

- Em **Base local → Hoje**, se a linha selecionada apresentar `origin_conflict`, uma caixa de aviso agora declara explicitamente que nenhuma origem remota foi promovida ao painel corrente e que as falhas não podem ser somadas.
- O botão **Ver revisões isoladas de hoje** abre diretamente a aba Histórico por data, pré-preenchendo o início do dia operacional da fábrica **e deixando o fim vazio** (o horário final da captura 3028 é móvel, portanto um fim exato impediria consultar versões legítimas do mesmo dia).
- A transição continua **somente leitura**: o histórico retorna revisões independentes com abertura manual. Ela não instala um snapshot como Today, não altera a base SQLite nem envia comandos de coleta ao MES.
- Testes locais direcionados: `node --test scripts/ames-history-source.test.mjs scripts/ames-history-origin-choice.test.mjs scripts/ames-period-history-matching.test.mjs scripts/ames-history-usability-20261020.test.mjs scripts/ames-sync.test.mjs scripts/ames-data-health.test.mjs` **6/6 arquivos PASS**, `git diff --check` PASS. Teste navegador e CI do SHA novo ainda pendentes.
- Teste físico dessa melhoria permanece **PENDING**, inclusive porque os prints do PC receptor foram feitos na página pública antiga, não na PR #68. Não solicitar mais acesso ao PC alheio.

### Checkpoint confirmado — acesso a revisões concorrentes

- SHA `40a99fc19b39ecf5fd3574b92e2ed38e60408962` na PR #68 DRAFT, Central Quality Gate **#40318835115 SUCCESS, 3/3 jobs**. Sem homologação física da candidata.

## Incremento seguinte — métricas isoladas acessíveis no próprio Hoje

- A visualização **Base local → Hoje** passa a mostrar uma tabela de **coletas concorrentes por origem** sempre que o receptor relata `origin_conflict` para a linha selecionada. Para cada revisão verificada, aparecem origem/revisão, período de extração, FPY, Check FPY, Quantity, contagem **observada** de falhas 3028 e condição de completude. Os dados não são fundidos nem promovidos a um HEAD único.
- Função pura `isolatedCurrentPublisherCards` faz uma lista restrita de números validados e metadados necessários; descarta UID, PCBA, materiais, comentários e propriedades arbitrárias do payload. HTML escapa IDs de origem, campos inválidos viram `—` e a tela diz explicitamente que valores não representam FULL nem resultado consolidado da linha.
- O botão **Ver revisões isoladas de hoje** continua levando ao histórico com início fixado e fim omitido. A tabela do Hoje não altera a store, não faz coleta e não transfere dados entre agentes.
- Testes locais Node: `node --test scripts/ames-history-source.test.mjs scripts/ames-history-origin-choice.test.mjs scripts/ames-sync.test.mjs scripts/ames-data-health.test.mjs` → **4/4 PASS**. Tentativa separada de `ames-reading-period.browser.mjs` **NÃO EXECUTOU** por ausência do pacote Playwright no ambiente local; não confundir com aprovação do teste de navegador. `git diff --check` PASS. CI do SHA novo ainda PENDING.
- O painel novo **não foi instalado na fábrica**; a prova física de 26/10 confirma a leitura histórica da versão pública anterior, não a interface desta PR.

### Checkpoint GitHub — métricas separadas no Hoje

- SHA `e3bcb5670e86b1579a7e2761468a40438c426d96` na PR #68 DRAFT, Central Quality Gate **#40320257663 SUCCESS, 3/3 jobs**. A tabela por origem permanece sem homologação física.

## Incremento seguinte — cache Firestore incompleto não desfaz conflito verificado

- **Risco identificado:** após um `origin_conflict` verificado no servidor para duas instalações da mesma linha, um evento `from_cache` parcial poderia conter apenas uma instalação (ou nenhuma). Antes, o callback substituía o índice conhecido por essa visão incompleta e podia selecionar falsamente um único HEAD compartilhado.
- `ames/sync.mjs` mantém o conflito e as evidências de origem já verificadas quando um evento `from_cache` chega durante `origin_conflict`. O cache local não prova que um segundo coletor deixou de existir; só uma nova resposta do servidor pode atualizar essa decisão. O guard de cache vazio continua para cenários sem conflito.
- Regressão sintética `scripts/ames-sync.test.mjs`: servidor confirma duas origens → conflito, cache com uma origem → conflito preservado, cache vazio → conflito preservado, nenhum snapshot promovido ao Hoje. `node --test scripts/ames-sync.test.mjs scripts/ames-data-health.test.mjs scripts/ames-history-source.test.mjs` **3/3 arquivos PASS local**, `git diff --check` PASS.
- **Ainda pendente:** validação CI do novo SHA, homologação de comportamento em rede real, política formal de múltiplos coletores e conciliação de HEAD atual. Não alterar agentes, Firestore, `main`, PR #64 ou postos da fábrica.

### Extensão do guard — prioridade do índice de servidor durante verificação

- Um cache parcial também podia chegar **antes** de terminar a verificação dos dois payloads do servidor; nesse momento `origin_conflict_lines` ainda estaria vazio. O listener agora recusa a substituição de **qualquer índice já entregue pelo servidor** por eventos posteriores `from_cache` na mesma assinatura, inclusive durante downloads/validação criptográfica. A mudança para um novo dia continua criando assinatura nova.
- A regressão envia o índice de uma única origem em cache **imediatamente após** o evento de servidor com duas fontes, ainda durante recepção, e novamente após o estado `origin_conflict`; ambos são ignorados. Uma atualização futura **do servidor** continua apta a ser processada e reconciliar o índice de forma explícita.

### Checkpoints GitHub — cache e prioridade do servidor

- SHA `66acc5932e90d855af0d53e75f5227a5ca87fc01`: barreira inicial de cache parcial, Central Quality Gate #40320862321 **ainda em andamento** na última consulta.
- SHA `2b2072ac7736e5a997630cfeaa60a01c91586a94`: barreira para eventos de cache durante validação do índice do servidor; Central Quality Gate **#40321116119 SUCCESS, 3/3 jobs** (Console, E2E Firestore, qualidade estática). Sem teste físico dessa candidata.

## Incremento — conflito de origem protegido durante todo o dia operacional

- **Risco residual:** um novo evento do servidor com apenas uma instalação (ou índice vazio), mesmo depois de duas origens anteriormente comprovadas por payload/hash, ainda podia selecionar falso HEAD por descarte transitório de documentos ou escopo de query. Um índice parcial não representa uma conciliação formal.
- `ames/sync.mjs` agora conserva em **memória de sessão e restrita ao dia operacional** a última evidência comprovada de multiwriter por linha. Eventos subsequentes com uma/zero origem mantêm o conflito sem publicar HEAD; eventos com duas origens válidas atualizam a evidência. O primeiro evento de um novo dia limpa a proteção anterior; logout a limpa também. Uma subscrição reiniciada invalida leituras assíncronas da assinatura anterior.
- `ames/console-history.mjs` distingue os **últimos números previamente verificados** de uma leitura atual quando o índice mais recente já não contém as duas origens. Não os apresenta como captura ao vivo nem agrega valores. A preferência permanente de um único writer **NÃO está implementada**.
- Regressões verificam: servidor com duas fontes; cache parcial antes/depois da verificação; servidor novamente com só uma fonte; servidor vazio; proteção de ausência de HEAD; reinício de dia limpo; nota visível em PT/EN. `node --test scripts/ames-sync.test.mjs scripts/ames-data-health.test.mjs scripts/ames-history-source.test.mjs scripts/ames-multipc-shared-contract.test.mjs` **4/4 arquivos PASS local**; `git diff --check` PASS. Gate GitHub do novo SHA **PENDING** até publicação.
- **Limite importante:** a proteção é da sessão corrente e não constitui registro persistente de coordenação entre máquinas ou prova definitiva de origem. Após recarregar a página, a consulta do índice e a detecção precisam ser verificadas novamente. Política coordenada, FULL e homologação física seguem pendentes. Não modificar Firestore Rules, dados compartilhados, agentes, guardian ou PR #64.

### Checkpoint confirmado — retenção por dia em memória

- SHA `23c4dd11d9aee1b904bc6ed08e5d17f00cd37346` na PR #68 DRAFT: Central Quality Gate **#40321680302 SUCCESS, 3/3 jobs** (Console, E2E Firestore Rules, qualidade estática). O comportamento segue não instalado/não homologado fisicamente.

## Incremento 26/10 — marcador local mínimo do conflito após recarga

- **Risco remanescente do checkpoint anterior:** ao reiniciar a aba/aplicação, a memória da proteção diária desaparecia. Se um índice remoto posterior expusesse somente uma das instalações sem provar reconciliação, o receptor voltaria a promover um único HEAD.
- `ames/sync.mjs`: introduz `browserConflictJournal`, um **marcador local de segurança** com armazenamento nativo do navegador, separado do IndexedDB da fila. Grava somente a informação booleana de que já foram verificados múltiplos publicadores para `(conta autenticada, dia operacional, linha)`; **não grava SN, origem, FPY, histórico, payload nem UID em valores exportados**. A chave local é restrita à conta e data, e as escritas por linha são idempotentes entre abas.
- O marcador é criado **somente depois de verificar os payloads recebidos do servidor**. Em uma nova sessão desse mesmo navegador/conta/dia, impede a promoção de um único HEAD enquanto não existir uma política formal de autoridade. A janela do novo dia não herda bloqueios antigos. O marcador **não é apagado no logout**, pois isso reabriria o risco no próximo login da mesma conta; `stop()` só elimina os dados efêmeros da sessão.
- Se o navegador não permitir armazenamento, o sistema mantém o bloqueio **da sessão corrente** e avisa que a proteção **após recarga não está comprovada**. Em Hoje e no diagnóstico técnico, os registros restaurados são rotulados como **marcador local sem métrica/origem**, sem fabricar quantidade de instalações ou dados atuais.
- Regressões: dois publishers comprovados → grava marcador, `stop()` → nova instância com índice remoto de um publisher → conflito preservado, nenhuma promoção; segregação entre contas/dias, nenhuma informação industrial no marcador, falha de armazenamento não interrompe consulta e aviso na interface; preservação da mudança de dia. `node --test scripts/ames-sync.test.mjs scripts/ames-data-health.test.mjs scripts/ames-history-source.test.mjs scripts/ames-multipc-shared-contract.test.mjs scripts/ames-history-origin-choice.test.mjs scripts/ames-history-revisions.test.mjs scripts/ames-period-history-matching.test.mjs` **7/7 arquivos PASS local**, `git diff --check` PASS. CI do SHA novo PENDING até publicação.
- **Limitações deliberadas:** o marcador só protege o **mesmo navegador/perfil** enquanto o armazenamento estiver intacto. Não cria autoridade entre computadores, não substitui prova do índice atual, não persiste revisões de produção, não resolve conflitos de instalação e não certifica FULL. Limpar os dados do navegador remove o marcador; a política de conciliação multiwriter com evidência persistente e compartilhada **continua pendente**.
- Nenhum merge, release, deploy, instalação de agente, alteração da PR #64, escrita no Firebase ou contato com o PC alheio.
