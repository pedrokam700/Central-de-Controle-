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

### Checkpoint GitHub — marcador por navegador

- SHA `ce4568e4fcd6fa9ab45b3f33a24bde3d28122e89` na PR #68 DRAFT, Central Quality Gate **#40324568714 SUCCESS, 3/3 jobs** (Console, E2E Firestore Rules, qualidade estática). Sem homologação física.

## Incremento funcional Issue #66 P0 — resumo da Consulta por SN não inventa zeros

- Auditoria da Issue #66 em 26/10 confirmou que as implementações de P0/P1 já estão amplamente presentes na candidata, incluindo leitura 3074, ciclos, Material SN, matcher e contagens observadas. Detectou uma incongruência residual na interface resumida de `ames/console-fastlane-sn-reuse.mjs`: o cartão de materiais dizia `Nenhum material 2º+ uso confirmado` mesmo com 3074 **não coletada ou com erro**, e os contadores de 2114/3022/3012 podiam apresentar `0` a partir de arrays placeholder sem confirmação da fonte.
- Correção na origem da renderização: 3074 ausente, erro, parcial e zero realmente confirmado possuem mensagens diferentes em PT/EN; materiais/PCBAs anteriores aparecem como `—` quando não há prova. `0` é reservado para fonte comprovadamente concluída com contagem zero; registros parciais observados continuam contáveis **como observações**, sem inferir população global.
- A contagem 3022 agora usa a primeira lista **não vazia** de passagens/linhas/evidência disponível, evitando que `process_passages=[]` esconda `rows` válidas. 3012 e 2114 sem coleta comprovada deixam de gerar KPIs de falso zero. 2114 Manual/Automatic e correlação com reparos permanecem sem mudança semântica.
- Teste sintético de `operatorSummary` exercita 3074/3022/3012 ausentes, com erro, zero comprovado; falha 2114 e 3022 parcial com linhas válidas, junto aos contratos existentes de provenance/UX. `node --test scripts/ames-sn-source-provenance.test.mjs scripts/ames-sn-2114-two-analysis.test.mjs scripts/ames-operator-ux-parity.test.mjs` **3/3 arquivos PASS local**, `git diff --check` PASS. CI do novo SHA **PENDING** até publicação.
- A consulta 3074 real ainda precisa de **teste físico** para confirmar navegação, parser e retorno dos vínculos. Essa correção impede mensagem enganosa mas não prova que a coleta real esteja concluída. `main`, Firebase Rules, release, PR #64 e PCs da fábrica intocados.

### Refinamento do contrato zero — fonte concluída sem linhas não basta

- Na auditoria do primeiro incremento foi observado que `status=complete` sem uma grade/lista de origem comprovada ainda poderia produzir `0` em KPIs. O refinamento exige evidência efetiva de contagem: 2114 `previous_failures` comprovada (ou falha observada), 3022 estado `zero` ou linhas observadas (resumo positivo pode complementar), 3012 estado `zero` ou reparos observados. Dados 3012 embutidos na 2114 não se tornam automaticamente `0` reparos coletados da 3012 principal.
- Testes adicionais cobrem `2114 complete` sem rows, `3022 complete` sem lista com resumo 0 e reparo 3012 embutido sem consulta direta; todos devem mostrar `—` onde não existe prova do zero.

### Checkpoint comprovado — Consulta por SN

- `4d4ea27ab76b9b21387cce198f1bad0b63406baf`: Central Quality Gate **#40327779119 SUCCESS**.
- `1552845609f10d8e6d01d0532a1e66f3c4b61cc0`: Central Quality Gate **#40328137459 SUCCESS, 3/3 jobs** (interface/nove views, Firestore Rules/E2E, qualidade estática). Os oito contratos Node direcionados também passaram localmente. **Não é homologação física da 3074.**

## Incremento 26/10 — duas representações de horário do mesmo início 3028

- **Falha de cobertura identificada:** `firestoreTransport.watch` buscava revisões imutáveis apenas no intervalo textual de um minuto (`YYYY-MM-DDT07:00` até `07:01`). Uma segunda instalação que escrevesse o mesmo instante como `YYYY-MM-DDT10:00:00Z` ficaria fora da consulta, embora ambas representem as 07:00 da fábrica. Assim, um consumidor novo poderia enxergar apenas um writer e promover um HEAD sem perceber a disputa.
- **Correção de identificação:** `periodIdentity`/`isTodaySnapshot` normalizam os instantes para `America/Sao_Paulo`, preservando segundos não nulos e recusando período inválido/fora do turno. O período UTC equivalente agora mantém exatamente a mesma identidade de dia produtivo, sem derivá-la do momento da coleta.
- **Correção de leitura:** a consulta imutável abrange somente a data civil do início de produção, depois **filtra os cabeçalhos por instante 07:00 normalizado antes de baixar partes**. Assim recupera 07:00-03:00 e 10:00Z, mas não carrega como candidato um outro começo de período da mesma data. O índice continua exclusivamente leitura; não modifica documentos, regras, agentes ou fila.
- **Custo/trade-off:** o listener pode ler mais cabeçalhos leves que a faixa textual de um minuto, mas não baixa payloads de períodos não correspondentes. Medir consumo/latência na homologação futura; não alegar desempenho físico verificado.
- Regressões Node: `scripts/ames-operational-period.test.mjs` cobre períodos UTC/local equivalentes, segundos inválidos e fim além da janela. `scripts/ames-pr38-day.emulator.mjs` inclui duas instalações independentes com as duas formas de horário e uma terceira revisão no mesmo dia/horário diferente; deve bloquear o HEAD, preservar as duas fontes e excluir a terceira antes do download.
- **Evidência local:** 7/7 suítes Node direcionadas PASS e `git diff --check` PASS. **Emulador Firestore depende do CI** para execução real; não declarar GREEN do próximo SHA até o job concluir. O receptor no segundo computador real e a autoridade persistente multi-PC seguem não homologados. Nenhum pedido adicional de dados do PC de terceiro.

### Checkpoint GitHub — duas codificações do mesmo início de produção

- SHA `cdfad2abad70bf09ae2362bfb4e3b885671dbb77` na PR #68 DRAFT. Gate **#40329182110 CANCELLED**: `Agent and sync E2E with Firestore Rules` e `Static quality checks` terminaram **SUCCESS**; `Console themes, languages and mobile` foi **CANCELLED durante instalação das dependências de navegador** (o teste das nove views foi SKIPPED). Portanto **NÃO existe GREEN 3/3 do SHA**. A regressão real A/B Firestore passou no job correspondente; o cancelamento da interface precisa de nova evidência antes da homologação automática do conjunto.
- Sem deploy, instalação, mudança do Firebase em produção ou fusão de coletas. PR #64 intacta.

## Incremento Issue #66 P2 — preservar fechamento FULL anterior mesmo com revisão mais recente ilegível

- `ames/data/history-trends.mjs`: o modo opt-in **Somente fechamentos FULL comprovados** antes parava imediatamente se a revisão imutável mais recente não pudesse ser aberta, ocultando outro fechamento FULL que já estava salvo e poderia ser comprovado. Agora ele verifica outras revisões independentes do mesmo dia/linha/origem e usa apenas a **última FULL efetivamente íntegra**. Exibe o número de revisões mais recentes ilegíveis para evitar fallback silencioso. Se nenhuma FULL for comprovada, retorna lacuna `unavailable`/`unproven_full`, nunca zero. O modo histórico comum preserva a proteção anterior e continua apontando a falha da revisão mais recente, sem substituição silenciosa.
- `ames/console-history-trends.mjs`: coluna Cobertura mostra aviso PT/EN `revisões mais recentes ilegíveis: n` quando uma revisão FULL anterior precisou ser usada. Histórico segue leitura somente, sem coleta MES ou alteração da seleção global.
- `ames/data/full-day-closure.mjs`: `latestProvenFullDayClosure` deixa de escolher a revisão numericamente mais alta quando um fechamento realmente posterior tem outro snapshot_id/revision. Ordena por fim do dia e coleta efetiva quando comprovada; exige seleção explícita da origem e da linha se houver mais de uma, sem promover arbitrariamente um posto. Não soma 3028 de contas distintas nem converte PARTIAL em FULL.
- Novos testes: revisão recente ilegível → FULL anterior visível e aviso; sem FULL → indisponível; modo histórico normal não recua silenciosamente; 09h FULL rev9 versus 10h FULL rev1 → seleciona 10h; revisão 11h parcial não rebaixa FULL; duas origens/linhas exigem escopo explícito. `node --test scripts/ames-history-trends.test.mjs scripts/ames-issue66-full-closure.test.mjs scripts/ames-issue66-dashboard.test.mjs scripts/ames-period-history-matching.test.mjs scripts/ames-history-source.test.mjs` **5/5 PASS local**; `git diff --check` PASS.
- CI exata do próximo SHA **PENDING** até publicação. Não afirmar que a causa da indisponibilidade de 3074 no posto foi comprovada; não alterados os dados do SQLite, Firebase, instalações ou PR #64.

### Gate de interface encontrado e corrigido no checkpoint subsequente

- SHA `45138c1aa6ddd668b03d403e3c5196a455f74fb9`, Gate #40331191630: **E2E Firestore SUCCESS**, **Static quality SUCCESS**, **Console themes/languages/mobile FAILURE**. O Playwright instalou corretamente, mas `ames-experience.browser.mjs` expirou aguardando `window.qa` (30 s). **Não declarar GREEN 3/3.**
- Diagnóstico reproduzido localmente por `node --check ames/console-history-trends.mjs`: havia **SyntaxError** em lista de cabeçalhos no trecho da coluna `Ocorrências / 1000`. Foi erro introduzido ao incluir o aviso de revisões ilegíveis; bloqueava carregamento de um módulo ES importado pelo Console, por isso o harness não inicializava `window.qa`. Corrigido o parêntese desse cabeçalho.
- Proteção adicional: `scripts/ames-history-trends.test.mjs` agora importa o módulo visual diretamente, de modo que futuros erros de sintaxe abortem o contrato Node antes do longo download de navegador. `node --check` PASS, 6/6 suítes Node direcionadas PASS, `git diff --check` PASS.
- A prova de navegador do novo SHA depende do próximo CI; não afirmar que a interface já foi homologada, nem reaproveitar GREEN de outro commit. PR #68 DRAFT, sem publicar no GitHub Pages/fábrica.

### Confirmação do checkpoint anterior — 26/10

- SHA `f5d85e25655d0aea7ce49ca88b61201456bb9eec`, Central Quality Gate **#40331829229 SUCCESS 3/3** (Console/9 views, E2E Firestore Rules e estático). Corrigiu somente a sintaxe de tendências; **não homologa a coleta física 3074**.

## Incremento P0b — coleta 3074 não reconhecia grades de componentes sem a PCBA literal

- **Causa no código reproduzida por fixture ExtJS:** `ames/factory-engine/ames/tela_3074.py::consultar` aceitava linhas apenas quando uma coluna (`Barcode`, `Material SN`, `Aut Cmf1` ou `Aut Cmf2`) fosse igual ao SN pesquisado. Entretanto, uma consulta válida de **PCBA** pode retornar somente Barcode dos componentes; uma consulta válida de **Material SN** pode retornar somente Barcode de PCBAs vinculadas. A condição anterior ignorava essas linhas até esgotar o timeout e a interface via a 3074 como indisponível. Essa **falha lógica é comprovada no teste sintético**, mas a causa exata da execução fotografada na fábrica **não foi confirmada**.
- **Correção conservadora:** antes de clicar `View`, confirmar que o campo contém exatamente o SN alvo; localizar a grid ExtJS visível no mesmo frame da consulta e observar apenas o store daquela grid. Só aceitar linhas que não repetem o SN alvo quando existir **prova posterior ao View** de `load` bem-sucedido, `datachanged` válido, troca de store ou recriação de grid. Uma grade antiga intacta ou `load` malsucedido não serve como evidência. A consulta fallback sem monitoração ainda exige igualdade explícita com o SN; não inventa retorno de componentes.
- **Zero comprovado:** uma grade vazia só vira `no_data=True` após atualização observada **e** a janela de estabilidade configurada. Vazio antigo sem View comprovado fica como erro/indisponibilidade, não `0` peças/reuso. Os resultados incluem `query_confirmation` (`STORE_REFRESH_AFTER_VIEW` ou `EXACT_QUERY_ROW`) para diagnóstico sem expor SN nos logs.
- Teste realista com ExtJS simulado em Node VM, executado pelo Python em `scripts/agent-3074-grid-lifecycle.test.py`: PCBA→somente materiais; Material SN→somente PCBAs Y/N; grid desatualizada; vazio novo; vazio não atualizado; grid recriada; store reatribuído; falha de load; limpeza dos listeners. Integrado à etapa **Static quality checks** do GitHub Actions da própria PR.
- Preserva a Rastreabilidade por ocorrência 3028, a Consulta por SN independente, prova temporal de vínculo e separação do reuso da PCBA/material. **Nenhum MES, Firebase, computador da fábrica, PR #64, `main` ou release alterado.** Teste físico da 3074 continua obrigatório antes da instalação.
- Checkpoint GitHub/CI do incremento: **PENDENTE** até novo SHA/execução exata.

### Gate de integridade CLEAN V3 — refinamento e exceção auditável

- Checkpoint `2d92101b211d4c960771215ae2858771d0892cf2`, Central Quality Gate **#40335223191 FAILURE**: Console/nove views **SUCCESS**, E2E Firestore **SUCCESS**; Static quality **FAILURE** no `scripts/ames-clean-v3.test.mjs` por exigir a `ames/tela_3074.py` historicamente idêntica ao CLEAN V3. A regressão nova da 3074 executou **SUCCESS** no próprio Static antes dessa falha. O gate vermelho não prova erro runtime, mas impede certificação do SHA.
- **Preservação do baseline:** não alterar `docs/ames/clean-v3-source-manifest.json`. `scripts/ames-clean-v3.test.mjs` continua exigindo os hashes CLEAN V3 exatos de `ames/browser.py`, `core/fluxo_3028_3074.py`, agentes 3028 congelados e demais contratos. Registra o delta **intencional e exclusivo da 3074** com SHA-256 da fonte final fixado no teste, análogo à exceção já existente para `core/temporal_3074.py`; novas alterações futuras da 3074 exigirão revisão explícita do hash e CI.
- Refinamento de segurança: mesmo se a grade antiga já contiver o SN consultado, um store ExtJS monitorado **não aceita** linhas até comprovar refresh; `datachanged` durante `beforeload` remoto também não comprova sucesso antes do `load`. Quando o MES local utiliza `loadData` sem `beforeload`, `datachanged` posterior ao View serve como prova. **10/10 testes** com ExtJS simulado em Node/Python PASS, `node --test scripts/ames-clean-v3.test.mjs scripts/ames-issue66-p0.test.mjs` PASS, `python -m py_compile` PASS e `git diff --check` PASS.
- Próximo checkpoint/CI: **PENDENTE**. Até isso, NÃO considerar o incremento GREEN nem instalar na fábrica.

### Checkpoint GitHub confirmado — consulta 3074 com refresh provado

- SHA `97f3d56c2f29aceee5d260da4f21d679a715c5d1` na PR #68 DRAFT; Central Quality Gate **#40335990017 COMPLETED SUCCESS, 3/3 jobs** (Console/nove views, E2E Firestore Rules, Static quality com novo teste 3074). Este checkpoint substitui o anterior com gate vermelho, sem apagar seu registro auditável. Comentário PR #68 ID `6417978606` documenta as evidências. **Não é homologação física da 3074**.

## Incremento P1 — distinguir PCBA e Material SN quando a 2114 está vazia

- **Risco residual real do algoritmo:** `ames/agent/engine_bridge.py::run_individual_lookup` classificava qualquer consulta **sem histórico 2114** como `MATERIAL_SN` se a 3074 possuísse sequer uma linha de PCBA. Uma PCBA sem falhas registradas, cuja grade mistura componentes e PCBAs históricos, podia ser investigada como material. Quando a grade mostrava apenas componentes, a consulta ficava `SN_INDETERMINADO` e a montagem atual não era selecionada.
- Classificador determinístico `classify_individual_sn_target`: histórico **não vazio** da própria 2114 comprova PCBA; na ausência dele, apenas linhas da 3074 com Sn Type homogêneo sustentam inferência limitada — só materiais vinculados => PCBA, só PCBAs relacionadas => Material SN. Linha do próprio SN identificada explicitamente como PCBA também comprova PCBA. Grade mista, vazia, com Barcode/Sn Type ausentes continua `SN_INDETERMINADO`; não usar prefixo de SN nem converter ausência 2114 em zero de falhas.
- Saída conserva `detected_type` e acrescenta `detected_type_basis` para auditoria. A Consulta por SN de PCBA sem falha 2114 pode destacar **montagem atual sem âncora de falha**, sem inventar defeito; Material SN continua investigando PCBAs relacionadas com limites de coleta; montagem/associação temporal por 3074 e Rastreabilidade da ocorrência exata 3028 continuam isoladas.
- `scripts/agent-individual-assembly.test.py`: 11/11 PASS incluindo classificação apenas por 3074, Material SN sem 2114, PCBA com somente componentes e grade mista indeterminada. `scripts/agent-3074-grid-lifecycle.test.py`: 10/10 PASS; `scripts/agent-assembly-scope.test.py`: 5/5 PASS; duas suítes Node PASS, `git diff --check` PASS. CI do **próximo SHA ainda PENDING** até publicação/verificação.

### Checkpoint GitHub confirmado — PCBA vs Material SN sem histórico 2114

- SHA `e82eb7d8527e38da09edac414ce7073ef998c614`, Central Quality Gate **#40336714073 COMPLETED SUCCESS 3/3** (nove views, Firestore E2E/Rules, qualidade estática). Sem homologação física. PR #68 continua DRAFT; `main` e PR #64 intocadas.

## Incremento de integridade do resumo — 3074 íntegra não significa reuso completamente investigado

- **Cenário novo da classificação conservadora:** um SN `SN_INDETERMINADO` ou `MATERIAL_SN` com uma grade 3074 bem coletada ainda era capaz de gerar o cartão **`Materiais 2º+ uso = 0`** na interface de PCBA. Além disso, a PCBA podia ter grade 3074 completa e **falha nas consultas individuais dos componentes**, sem prova suficiente para contabilizar não reutilizados. Nenhuma dessas situações confirma zero de reuso da montagem.
- `ames/console-fastlane-sn-reuse.mjs::provenPcbaReuseCount` exige **alvo PCBA**, zero diretamente comprovado pela grade ou conjunto de componentes selecionados com um resultado `is_reused` booleano para **cada** componente e escopo de montagem válido. Resultado de consulta mista/ambígua, material como alvo ou qualquer `is_reused=null`/erro não promove zero. Reusos **positivos observados** continuam visíveis mesmo quando há cobertura parcial, sem convertê-los em contagem exata da população.
- Texto PT/EN específico diferencia Material SN (linha do tempo de PCBAs na aba dedicada), tipo indeterminado, **3074 não coletada**, erro de consulta, cobertura parcial e coleta íntegra mas insuficiente para classificar os usos. Contagens dos outros módulos e a Rastreabilidade por ocorrência 3028 permanecem independentes.
- `scripts/ames-sn-source-provenance.test.mjs` mantém 8/8 casos PASS, incluindo material direto, tipo indeterminado, falha de material, grade completa mas pesquisa parcial, zero efetivamente provado e positivo observado. `node --check ames/console-fastlane-sn-reuse.mjs` PASS; outras 3 suítes SN Node PASS; `git diff --check` PASS. **CI do próximo SHA: PENDING até publicação.**

### Checkpoint GitHub confirmado — reuso material sem falso zero

- SHA `0a846b50e61bd322fb48192b7ef26642c4f7fc73`: Central Quality Gate **#40338228922 COMPLETED SUCCESS, 3/3 jobs** (Console/nove views, Firestore Rules/E2E, qualidade estática). O resultado de CI é exclusivo deste SHA e **não comprova 3074 no MES físico**. PR #68 DRAFT; `main`, release, fábrica e PR #64 sem alterações.

## Incremento P0a — ler histórico anterior diante de revisão recente ilegível

- `ames/reading-period-controller.mjs`: antes, `history.open` da primeira revisão recente que falhasse (arquivo ausente, leitura corrompida, origem/revisão incompatível ou período do payload divergente do índice) abortava toda a **linha** e nem tentava outra revisão imutável anterior. O Monitoramento/Rastreabilidade podiam parecer sem dados do último dia embora existisse uma revisão válida mais antiga. O fallback de fechamento FULL em `ames/data/history-trends.mjs` já tinha sido corrigido; esta correção atua no **seletor operacional Hoje/Último dia/Período** e não duplica o dashboard.
- A consulta percorre as revisões salvas da **mesma origem selecionada**, em ordem; apenas payload com `line_id`, `source_id`, `snapshot_id`, `snapshot_revision` e janela operacional consistentes entra na leitura. Se a mais recente falhar, uma anterior íntegra pode ser aberta **somente para leitura**; `period_read.status=partial` e `recovered_lines` registram linha, origem, snapshot/revisão e quantidade de entradas recentes ilegíveis. O aviso visível não inventa que esse dado é o último FULL ou atual.
- `ames/data/trace-targets.mjs` recusa `deep-trace` sobre essa revisão **recuperada**. Assim, uma revisão anterior não é indevidamente enviada ao MES como revisão corrente; só `Atualizar leitura` com uma revisão local recente válida permite coleta explícita. Sem MES automático, sem misturar origens/TAN10102/TAN10103, sem modificar 3028 nem os dados SQLite.
- `ames/console-reading-period.mjs`: aviso de leitura degradada em PT/EN, com identificação do snapshot e botão já existente `Atualizar leitura`; `ames/console-specialized-views.mjs`: motivo específico de coleta indisponível na linha, PT/EN.
- Regressões: `scripts/ames-reading-period.test.mjs` **22/22 PASS** (mais recente ilegível → anterior íntegra; período falsificado no índice; duas origens sem cruzamento; todas ilegíveis → sem inventar métrica; navegação Hoje/Último dia e leituras tardias); `scripts/ames-issue66-p0.test.mjs` **5/5 PASS**; `scripts/ames-agent.test.mjs` **16/16 PASS**; `node --check` dos módulos editados e `git diff --check` PASS. **CI novo SHA: PENDING até commit/publicação**.
- Ainda é necessário testar em ambiente real com o operador, quando houver instalação **supervisionada e autorizada**, o snapshot 14 da L3 (22/10 07:00 → 23/10 07:00) e a consulta 3074; os testes atuais são sintéticos. O computador de terceiro não é requisito para avançar na PR.

### Gate GitHub P0a confirmado

- SHA `0df92e80aeecf9a85f2a3f0f1ec109c6e72856b8`: Central Quality Gate **#40343082168 COMPLETED SUCCESS, 3/3 jobs** — Console/nove views, Agent and sync E2E Firestore Rules e qualidade estática. Comentário registrado na PR #68 (ID `6419031550`). Testes Node direcionados adicionais: tendências **10/10**, fonte do histórico **20/20**, revisões **5/5**, períodos **5/5**, rastreabilidade/status **3/3**. O gate não prova a coleta 3074 da OPPO nem execução Windows na fábrica.

## Incremento P0a — a execução do agente não é certificado de cobertura das fontes

- Em `ames/agent/agent_entry.py`, `_source_stage` antes devolvia statuses MES desconhecidos sem normalizar (como `timeout`). `_aggregate_stage` só identificava `error` e `partial`; portanto podia somar `timeout` e `complete` como se **todas** as fontes estivessem concluídas. Da mesma forma, uma segunda linha selecionada sem execução da fonte era ignorada se a primeira linha retornasse sucesso. Isso contraria a regra de não converter fonte ausente/falha em conclusão.
- Mapeamento conservador: `timeout/timed_out` são erro; estados `not_collected/not_run/pending` são não executados; estados não mapeados ficam **partial**, nunca `done`. Uma linha ativa sem retorno de uma fonte degrada a cobertura agregada para `partial`; escopos realmente `skipped` por ausência de falhas continuam sem inventar execução.
- O job mantém o status técnico `done` quando o agendador terminou sem exceção (preservando contratos de polling), mas a **mensagem visível** diz `Execução finalizada sem cobertura completa` com nomes das fontes; o resultado possui `stages` discriminando `error/partial/not_run/done`. `capture_source` conserva o status próprio por fonte e prova da revisão 3028 original.
- `scripts/agent-trace-target.test.py`: **7/7 PASS** (timeout da 3074 no worker real simulado, 2114 completa isoladamente, fonte faltante em segunda linha, status desconhecido e leitura do índice SQLite); `python -m py_compile` e `git diff --check` PASS. **CI do próximo SHA: PENDING** até commit/publicação. Sem coleta MES real, agente do posto, regra Firebase, PR #64, release ou `main` alterados.

### Checkpoint GitHub — normalização dos estados de coleta

- SHA `28c5860f3abaef3e32a770457ab34b2078c5d97d`, Central Quality Gate **#40343700545 COMPLETED CANCELLED**: `Static quality checks` **SUCCESS** (inclui 7/7 Python), `Agent and sync E2E with Firestore Rules` **SUCCESS**; job `Console themes, languages and mobile` foi **CANCELLED na instalação isolada das ferramentas** e a verificação das nove views foi **SKIPPED**. **Não há GREEN 3/3 deste SHA**. Resultado/limite registrados na PR #68 no comentário `6419197773`.

## Incremento P0a — cobertura real das fontes visível na tela de progresso

- `ames/collection-status.mjs`: anteriormente, o progresso podia indicar 100% e o cabeçalho `Job done` mesmo quando `result.stages` comprovava que a 3074 falhou, a 2114 ficou parcial ou a 3022 não rodou. Com barras presentes, a interface sequer mostrava o estágio final da fonte. A mensagem do agente já foi endurecida no checkpoint anterior, mas faltava destacar a prova na interface.
- Quando o `deep_trace` termina, a tela consulta **somente `result.stages`** para rotular a cobertura separada de cada origem: `Completa`, `Parcial`, `Falhou`, `Não coletada` ou `Não comprovada`. Uma fonte ausente de um job legado **não recebe** o rótulo `Completa`; estágios degradados geram um aviso visível mesmo com barra 100%. Modos `reuse_only`/`process_only` exigem apenas fontes executáveis do próprio escopo; 3022 intencionalmente fora do modo de reuso não é declarada falha.
- Textos novos em PT/EN, dados de entrada escapados; não inicia/coleta MES, não altera status técnico `done` do scheduler nem substitui a âncora 3028.
- `scripts/ames-trace-status.test.mjs`: **6/6 PASS** (progresso 100% com 3074 falha, stage ausente, prova full e EN); `scripts/ames-live-trace-feed.test.mjs`: **3/3 PASS**, `node --check`, `git diff --check` PASS. **Próximo CI PENDING** até publicar novo SHA.
- Homologações físicas de 3074 e L3 snapshot14 continuam pendentes. Não instalar candidata, não alterar `main`, Firebase, PR #64 ou computadores da fábrica.

### Gate GitHub — distinção visual entre execução e coleta

- SHA `ee54a9282e8aa984f43f302dde7975bae1b90764` confirmado na PR #68 DRAFT: **Central Quality Gate #40356574683 COMPLETED SUCCESS, 3/3 jobs** (Console/nove views, Firestore E2E/Rules e Static quality). A execução do agente continua independente da prova de cobertura da 3074 no MES real; **não há homologação física deste SHA**.

## Incremento de segurança — prova do fechamento FULL vinculada ao coletor

- `ames/data/full-day-closure.mjs`: as certificações 3074, 2114 e 3022 exigem `scope.source_id` idêntico ao coletor do snapshot além de linha/SN de revisão. Quando a 3028 publica certificado próprio em `source_coverage['3028']`, esse certificado precisa concordar com o resumo de falhas 3028 e com a mesma identidade; se não existe certificado independente, a cobertura 3028 original permanece fonte de prova.
- Janela coincidentemente 07:00→07:00 com `mode=custom` **não** pode virar FULL; exige modo diário reconhecido. Snapshot vazio, zero ou identificador numérico inválido **não** passa como identidade imutável. História observada e fechamento FULL permanecem diferentes; nenhuma fonte parcial ou de outro PC promove população completa.
- Regressões locais: `scripts/ames-issue66-full-closure.test.mjs` **7/7 PASS** (inclui PC de outra origem, certificado 3028 discordante, período personalizado e snapshot zero), `scripts/ames-history-trends.test.mjs` **10/10 PASS**, `scripts/ames-reading-period.test.mjs` **22/22 PASS**, `git diff --check` PASS. CI do próximo SHA **PENDING** até publicar/verificar o commit.
- Gate físico continua aberto: 3074 real e L3 snapshot 14 (22/10 07:00→23/10 07:00) requerem prova na fábrica **apenas em instalação supervisionada e autorizada**. Não tocar PR #64, main, release, Firebase de produção ou computadores da fábrica.


## Continuidade executiva 26/10 — resposta atrasada de consulta 3074 anterior

**Base remota:** `9b22958ae8640e40b2e42a4675324a206f4151f1`, Central Quality Gate #40359645294 COMPLETED SUCCESS 3/3. main/oficial 0.5.39 permanece `b283b1764432f5d90486d38a7553b30542a5c118`; PR #68 OPEN/DRAFT/UNMERGED. Checkout isolado; alterações locais do trabalho paralelo preservadas.

**RED reproduzido:** o simulador ExtJS mantém uma carga anterior em andamento, o MES ignora o View seguinte e emite load bem-sucedido da consulta antiga. O coletor aceitava componentes antigos para o novo SN (teste falhou com RuntimeError not raised). Agora o observador registra se o store já estava carregando antes de View e recusa novo submit com `3074_PREVIOUS_QUERY_PENDING`; listeners são removidos. As tentativas e tempos existentes são preservados: se a carga antiga terminar, a próxima tentativa precisa executar seu próprio View e obter resposta nova. Não cancela requisições do MES nem otimiza polling.

**Arquivos:** ames/factory-engine/ames/tela_3074.py; scripts/agent-3074-grid-lifecycle.test.py; scripts/ames-clean-v3.test.mjs (hash da alteração intencional 3074 atualizado, manifesto histórico CLEAN V3 intacto); este handoff. Local: **12/12** ciclo de grid, **11/11** consulta individual, **17/17** contratos Node CLEAN/P0; git diff --check PASS. SHA publicado e CI exata no próximo comentário da PR; CI PENDING no momento deste commit.

**Limites/retomada:** esta prova é simulada, não homologa a tela OPPO nem todas as formas de concorrência de rede. 3074 e snapshot14/L3 físicos continuam PENDING. Próxima lacuna comprovável localizada: extract_extjs_store_grid fornece store_total_count, mas Tela3074.consultar descarta esse campo e coverage_3074.classify_3074_page não está integrado ao fluxo; conferir paginação parcial antes de certificar cobertura/zero. Prosseguir somente após CI deste incremento. Não tocar main, PR #64/#67, Firebase de produção, release, guardian ou postos. Sem merge/instalação/deploy.


### Gate do incremento de resposta atrasada confirmado

SHA `7460eb4bb4d8c8be1a6c2cdfb8b1a18efd1c21a6`: Central Quality Gate **#40362763071 COMPLETED SUCCESS 3/3**, Console/nove views, Agent/sync E2E Firestore Rules e Static quality. Não é homologação física da 3074.

## Continuidade P0 — paginação 3074 não pode virar cobertura completa

**Dois REDs reproduzidos:** a extração ExtJS retornava store_total_count=4 com uma linha, mas Tela3074.consultar removia esse total; uma página vazia com total positivo virava no_data=true. O classificador coverage_3074 existente estava isolado, sem receber esses dados na cadeia real.

**Implementado:** coletor preserva store_count/store_total_count e anexa o resultado do classificador existente; página vazia com total positivo fica incompleta, nunca sem vínculos. engine_bridge propaga essa prova ao status parcial da Consulta por PCBA/Material SN e ao source_status PARTIAL do resultado 3074 nos fluxos integrado/manual existentes. A varredura temporal conserva PCBAs anteriores observadas e usa HISTORICO_3074_PARCIAL/previous_pcba_count=null quando a página truncada não prova ausência de reuso. A consulta individual usa is_reused/reuse_count=null nessa mesma situação, conservando linhas e vínculos confirmados. Material SN mantém ciclos com cobertura parcial. Nenhum segundo algoritmo de classificação, alteração da âncora3028, navegação automática de páginas ou promessa de coleção integral.

**Arquivos:** ames/factory-engine/ames/tela_3074.py; ames/factory-engine/core/varredura_3074.py; ames/agent/engine_bridge.py; scripts/agent-3074-grid-lifecycle.test.py, agent-individual-assembly.test.py, agent-assembly-scope.test.py, agent-scheduler.test.py, ames-clean-v3.test.mjs; .github/workflows/quality-gate.yml (executa também paginação/escopo na etapa3074); este handoff. Manifesto original CLEAN V3 e core/fluxo_3028_3074.py congelado intactos; hash do delta intencional3074 atualizado.

**Local:** lifecycle ExtJS **14/14**, individual **14/14**, escopo temporal **6/6**, scheduler **12/12**, seleção histórica/worker **7/7**, CLEAN Python **3/3**, contrato paginação PASS; Node CLEAN/P0/proveniência/Material **28/28**, gate oficial **2/2**; git diff --check PASS. CI exata PENDING até publicar/consultar SHA no próximo checkpoint da PR.

**Retomada:** consultar HEAD e CI deste incremento. Próximos pontos seguros da Issue66: cobertura/escopo dos indicadores configuráveis e deduplicação de fechamento FULL, após confrontar testes existentes; política multiwriter compartilhada continua bloqueio distinto (não inventar autoridade). A paginação incompleta agora é diagnosticada, mas não foi implementado avanço automático de páginas sem validar seu contrato MES. Fábrica3074/último dia snapshot14L3/candidata/guardian continuam PENDING. Sem pedido de novos dados do PC de terceiro; PR68 DRAFT, PR64/67/main/oficial0.5.39/Firebase/postos intocados.


### Gate paginação3074 confirmado

SHA `5f06b267d5cd0e430cc93b6b0c22b967dbd145d9`: Central Quality Gate **#40363602776 COMPLETED SUCCESS 3/3** (Console/nove views, Firestore Rules E2E, Static incluindo paginação e escopo3074). Artefato integrado gerado no workflow, ainda sem homologação física.

## Continuidade P1/P2 — dashboard precisa atualizar na nova revisão recebida

**RED reproduzido:** createDailyFailureAnalytics.render ignorava nova revisão do mesmo snapshot quando PCBA/defect_key/comentário/turno/quantidade de vínculos permaneciam iguais. Um teste carregou a revisão1, depois revisão2 com descrição enriquecida e o DOM continuou mostrando a descrição antiga (1 render, esperados2). A mesma chave também não distinguia outro coletor com o mesmo número de snapshot.

**Correção mínima:** chave de renderização inclui por linha source_id, snapshot_id, snapshot_revision/revision e content_hash (fallback canonical), além dos indicadores calculados. A proteção contra render repetido sem alteração permanece; não faz leitura de rede, coleta ou nova store. Filtros e seleção temporal preservados.

**Arquivos:** ames/daily-failure-analytics.mjs; scripts/ames-daily-failure-analytics.test.mjs; este handoff. Regressão verifica revisão enriquecida, troca de coletor, hash novo e ausência de render redundante. **38/38 Node GREEN** nas cinco suítes analytics/dashboard66/stage3/fechamentoFULL/tendências; node --check e git diff --check PASS. CI do próximo SHA PENDING até consulta do checkpoint da PR.

### Prontidão e próxima ação exata

1. Revalidar HEAD e a CI do SHA deste incremento; artefato central-ames-integrated-SHA no job Static contém manifesto do mesmo SHA e hashes internos verificados. ZIP CLEAN de candidata NÃO é atualizador de instalação existente; não executar no posto0.5.39. Não publicar release/Pages.
2. Antes de qualquer instalação, coordenação com o responsável da PR64: inventário/inscrição do guardian existente, preservação de SQLite/WAL/config/token/source_id/filas, backup com ensaio de restauração e rollback supervisionado. Nenhum desses atos físicos foi executado aqui.
3. Aceite físico P0 pendente, somente após liberação: Consulta PCBA e MaterialSN na AWIP3074 conferindo vínculos, página parcial e retry; consulta anterior ainda carregando não pode validar novo SN; 2114/3022/3012 independentes continuam visíveis; N atual não elimina vínculo histórico comprovado.
4. Aceite último dia: L3 snapshot14, 22/10 07:00→23/10 07:00, mesma origem/revisão; revisão recuperada é leitura degradada, nunca coleta automática ou FULL. Depois validar indicadores/drilldowns/enriquecimento por revisão e PT/EN/mobile.
5. A/B quando disponível em homologação: comparar source_id/snapshot/revisão/hash/período exatos, offline/reload/reconexão; dois coletores nas mesmas linhas permanecem origin_conflict, sem soma/eleição arbitrária. Não pedir novamente PC de terceiro para avançar desenvolvimento. A leitura histórica no PC sem agente foi comprovada na versão pública anterior, não certifica a candidata atual.
6. Pendências reais ainda abertas: autoridade/política persistente compartilhada dos dois writers, coleta completa quando houver paginação, fechamentoFULL real/deduplicação entre novas coletas integrais, desempenho e integração operacional de instalação com PR64. Não declarar Issue66 inteira concluída. Prossiga somente com defeito reproduzido no escopo existente, sem repetir os três incrementos acima.

PR68 permanece DRAFT; oficial0.5.39/main/PR64/PR67/Firebase produção/porta8765/SQLite e postos intactos. Implementação automatizada não é homologação física; estado físico da candidata PENDING.


### Gate dashboard confirmado

SHA `5b1d6acacce2592de7f839e32cdefe765e591fde`: Central Quality Gate **#40364303200 COMPLETED SUCCESS 3/3**, com nove views, Firestore E2E/Rules e Static.

## Preparação final do pacote — rollback aponta à instalação oficial preservada

A conferência do LEIA_PRIMEIRO gerado encontrou frase antiga mandando voltar à CLEAN V3. Isso contrariava o baseline oficial0.5.39 e o próprio aviso de preservar a instalação existente. Corrigida SOMENTE a orientação: falha do ensaio exige retorno supervisionado à instalação oficial anterior comprovada, com dados/identidade preservados e rollback ensaiado; ZIP não restaura backups nem reinscreve guardians. Sem cópia/substituição de SQLite/WAL/token/config/source_id/filas, sem CLEAN sobre instalação ativa ou dois agentes/guardians. Backup/identidade sem prova mantém migração bloqueada.

Arquivos: scripts/build-integrated-candidate.py, scripts/ames-candidate-legacy-port-guard.test.mjs e este handoff. Teste da instrução obsoleta reproduziu RED antes da correção; após ajuste contrato do pacote/porta **2/2 PASS**, syntax/diff PASS. O build/verificação integral do ZIP e os três jobs precisam de CI do próximo SHA; consultar checkpoint final da PR. Nenhum código do updater, launcher, guardian ou coletores modificado neste incremento.

**Ponto final de retomada:** revalidar HEAD e o comentário CI/artefato associado; começar pelos itens1–6 de Prontidão acima. As três correções funcionais anteriores já estão integradas, não refazer. Não instalar este CLEAN no posto existente; pendências de autoridade multiwriter, paginação integral, FULL real e guardian permanecem abertas, além da homologação física. PR68 DRAFT; main/PR64/PR67/Firebase produção/fábrica intocados.


### Gate e pacote da preparação confirmados (substituídos pelo incremento seguinte)

SHA `1a0f43dae400b6f4f6f691f2636237986f643183`: Central Quality Gate **#40364818581 COMPLETED SUCCESS 3/3**. Segundo run automático40364819006 ainda aguardava navegador na última consulta; não duplicar manualmente. Pacote integrado do run40364818581 teve296 entradas/295 hashes verificados; seu hash interno9be088686a7a49bb9803a52f67c01e9f85a8b20a1b7e3db6529c258f5a73b74a pertence SOMENTE a esseSHA, não ao novoHEAD.

## Continuidade P1 — candidato3012 não pode virar AT da ocorrência no dashboard

**RED reproduzido:** buildDailyFailureRows escolhia repair_evidence_3012 por score de código/data/comentário, inclusive quando o contrato existente dizia occurrence_match=contradicted, candidate_for_occurrence=false e repair_confirmed=false. Uma fixture de outra falha anterior da mesmaPCBA colocava seu AT antigo no campo principal da falha atual, como fonte3012. Mesmo exact_identity_candidate continua candidato no contrato canônico; coincidência temporal não comprova intervenção.

**Correção:** a projeção respeita os flags da associação existente, sem reimplementar o matcher. Só confirmação explícita da ocorrência pode alimentar best; candidatos e registros contraditos ficam preservados em repair_candidates/repair_rows. Campos originais da3028 não são substituídos por candidatos. Em Ocorrências detalhadas, um details discreto PT/EN mostra associação não comprovada/outra ocorrência, código, instante MES, autor informado, horário e comentário integral escapado. Não declara que esse AT atendeu a falha atual nem confirma causa por comentário candidato. Sem alterações no coletor3012/SQLite/matcher/9views.

**Arquivos:** ames/daily-failure-analytics.mjs, scripts/ames-daily-failure-analytics.test.mjs, estehandoff. **39/39 Node PASS** (analytics/dashboard66/stage3/FULL/tendências), incluindo contradito, identidade exata ainda candidata, preservação3028, detalhePT/EN e HTML escapado; syntax/diff PASS. CI/ZIP do próximoSHA PENDING até publicação/verificação.

**Retomada atualizada:** consultar primeiro HEAD e último comentário CI/artefato da PR68/Issue66. Não usar ZIP/hash de SHA anterior como entrega atual. Os cinco incrementos desta execução estão salvos; não refazer. Continuam os itens1–6 de Prontidão acima: autoridade compartilhada dos doiswriters, coleta integral paginada, FULL real/deduplicação entre novascoletas e desempenho; teste físico3074 e snapshot14/L3 e migração supervisionada dependem de ambiente/autorização. PR68 DRAFT; sem main/PR64/PR67/produção/fábrica.


## Continuidade 26/10 — paginação3074 executável no mesmo store confirmado

Base remota `068d826cd0a05549499db296fbabbdca5a30934d`, PR68 OPEN/DRAFT/UNMERGED, Quality40366410032 SUCCESS3/3 revalidado no checkpoint anterior. As cinco correções anteriores não foram refeitas.

**Avanço funcional:** Tela3074 agora percorre sequencialmente páginas restantes SOMENTE quando há store ExtJS não-buffered com loadPage, primeira página/tamanho/total comprovados e parâmetro sn igual ao alvo. Reutiliza o store e todos os parâmetros originais, deixando page/start/limit para loadPage, conforme fonte oficial https://docs.sencha.com/extjs/4.2.1/source/Store.html. Sem nova implementação MES, endpoint adivinhado, nova navegação, paralelismo ou mudança dos tempos do View.

Cada callback exige sucesso, número da página, SN, mesmo store visível, campo de entrada e conjunto de parâmetros inalterados, colunas e total estáveis, contagem esperada. Página repetida ou incoerente recusa completude; linhas de kits iguais em postos diferentes continuam individuais, sem multiplicar SN físico na contagem derivada. Limite50páginas/5000linhas; o orçamento usa somente o restante do timeout original. Timeout/falha/limite/API não comprovada retornam as páginas já verificadas como parciais. Requisição pendente não é cancelada nem libera próxima consulta; a barreira de carga anterior continua ativa. Sem prova dos parâmetros ou da página1, mantém retorno parcial anterior, não inventa coleção integral.

**Testes:** REDs novos reproduziram retorno de uma página só, perda das páginas seguintes e inexistência da evidência de paginação. Após correção **20/20 lifecycle3074 PASS**, incluindo subcasos de query/parâmetros/store alterados, total alterado, load falho, página repetida/incorreta/vazia, timeout e barreira da consulta seguinte, API/limites e kit. Individual14/14, escopo6/6, Node CLEAN/P0/proveniência/Material28/28 PASS; diff PASS. Hash explícito da3074 atualizado; manifesto histórico CLEAN V3 e demais coletores intactos.

**Arquivos:** ames/factory-engine/ames/tela_3074.py, scripts/agent-3074-grid-lifecycle.test.py, scripts/ames-clean-v3.test.mjs e estehandoff. SHA/CI/artefato exatos devem ser consultados no próximo comentário. CI PENDING no momento destecommit. Homologação da API/3074 no MES físico continua PENDING; não promover o cenário testado a prova industrial. Próximo incremento independente: idempotência do fechamento/histórico e medição isolada, sem apagar versões ou criar prova FULL artificial. PR68 DRAFT; PR64/67/main/produção/fábrica intocados.
