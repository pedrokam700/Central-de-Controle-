# Issue #66 · Handoff funcional (23/10/2026)

## Escopo e proteção

- Fonte oficial no início: `main` e tag `ames-v0.5.39-multipc-20261022` no SHA `b283b1764432f5d90486d38a7553b30542a5c118`.
- Branch dedicada: `work/ames-issue66-forensics-functional-20261023`; PR **draft**, sem merge/release/instalação. Não tocar na PR #64, updater, árvores do Work ou máquina da fábrica.
- Contratos preservados: Rastreabilidade ancorada na ocorrência **3028** da revisão/linha/período exatos; Consulta SN independente, ancorada na 2114 ou diretamente em Material SN; Y/N não destrói histórico, 3012 pode ser candidata, causalidade nunca inferida.
- Issues relacionadas lidas: #39 (contexto temporal único e fechamento), #52 (live/matriz/alertas). Issue #66 e fluxo da conversa são a especificação funcional.

## Regra canônica de publicação e CI · correção de contexto (P10)

- **O GitHub é a única fonte oficial de verdade.** Código e revisão: GitHub; publicação oficial: GitHub Pages somente a partir da última **Release GitHub verificada**, por `.github/workflows/publish-github-pages.yml`. Netlify **não é utilizado como hospedagem oficial** e seus HTTP 401 de preview não representam falha da Central ou bloqueio de homologação da Issue #66.
- O antigo `post-deploy-smoke` em `.github/workflows/quality-gate.yml` fazia toda PR tentar `deploy-preview-${PR_NUMBER}--productcontrolcenter.netlify.app`, embora o projeto não dependa desse serviço. **P10 remove apenas esse job da branch da PR #67**. Mantém `static-quality`, `sync-emulator` e `console-experience`; preserva integralmente workflow de publicação GitHub Pages, scripts legados e histórico de execuções anteriores.
- `scripts/ames-issue66-official-ci-gate.test.mjs` testa o contrato de CI e a origem oficial da publicação. P10 não modifica `main`, PR #64, branch do updater, release, Firebase ou instalação de fábrica. Até merge autorizado, a `main` ainda contém o job legado.
- As referências abaixo a falhas anteriores `Published preview smoke` são **registros históricos factuais de runs antigos**, não itens pendentes nem gate oficial atual. O gate da PR #67 no SHA P10 deve ser verificado separadamente por seus três jobs internos. PASS automatizado **nunca equivale a homologação física**.
- **Verificação local P10:** `node --test --test-isolation=none scripts/ames-issue66-*.test.mjs scripts/ames-deploy-routing.test.mjs` = **25/25 casos PASS**; parser YAML confirmou exatamente os três jobs internos; `git diff --check` PASS. Evidência de CI GitHub deve ser associada ao SHA remoto publicado, sem antecipar resultado.

## Checkpoint P0 inicial — salvo na PR #67 draft

- Checkpoint remoto P0: commit `c6b35daf8f1a8e0abc62693a3714c1cf5f563b05` na PR https://github.com/pedrokam700/Central-de-Controle-/pull/67.
- CI desse SHA: `Central Quality Gate` **FAILURE**, job de idioma/experiência apontou duas frases de rastreabilidade PT na visualização EN; corrigidas no bloco seguinte, aguardando novo SHA/CI. Preview Netlify retornou HTTP 401, gate externo não GREEN. Outros jobs do Central Gate observados: `Agent & sync E2E with Firestore Rules` SUCCESS e `Static quality checks` SUCCESS. Não atribuir esses resultados ao SHA seguinte.

1. `ames/data/trace-targets.mjs`: pré-validação por linha da revisão 3028, identidade de origem local, período, snapshot/revisão/hash, com falha explícita somente nas linhas efetivamente selecionadas. O cliente HTTP usa **o mesmo verificador** para formar `snapshot_targets`, sem recorrer a `latest_snapshot_id`.
2. `ames/console-specialized-views.mjs`: a coleta da Rastreabilidade inicia somente com a linha operacional ativa marcada. Cada linha exibe a disponibilidade da revisão local. Trocar período reinicia o escopo de linha e não mistura inadvertidamente três datas/origens. Continua permitido escolher múltiplas linhas conscientemente. A leitura de ontem permanece separada da ação explícita de enriquecer aquele snapshot.
3. `ames/agent/engine_bridge.py` e `ames/data/sn-forensics.mjs`: retorno confirmado da grade 3074 agora tem status explícito e quantidade de linhas. A classificação de proveniência distingue **grade consultada**, **zero confirmado**, **parcialidade temporal** e **ausência/erro da fonte**, mesmo se nenhum material for comprovado no escopo da falha. O KPI da Consulta SN não declara 0 reutilizados quando a classificação temporal não foi comprovada.
4. `sw.js`: novo módulo importado incluído no pré-cache offline da branch, com revisionamento próprio de candidato.
5. `scripts/ames-issue66-p0.test.mjs`: fixtures L3/snapshot14 de 22/10→23/10 (L1/L2 ausentes), origem divergente e estados 3074 zero/ok/parcial/ausente/erro.

### Evidência de teste local (não é gate CI nem homologação física)

Executados nesta branch:

```
node --test scripts/ames-issue66-p0.test.mjs scripts/ames-sn-contract.test.mjs scripts/ames-sn-source-provenance.test.mjs scripts/ames-sn-forensics.test.mjs scripts/ames-sn-live-context.test.mjs scripts/ames-trace-scope.test.mjs scripts/ames-period-history-matching.test.mjs scripts/ames-trace-status.test.mjs scripts/ames-offline-central.test.mjs
  9/9 arquivos PASS
python3 scripts/agent-trace-target.test.py
  5/5 PASS
python3 scripts/agent-sn-lookup-context.test.py
  PASS
git diff --check
  PASS
```

**Limites conhecidos:** não há resposta física da 3074 nem logs redigidos do snapshot 14. A classificação incorreta de `3074 Não coletado` foi reproduzida por fixture, mas uma falha independente de navegação/parser do MES ainda precisa ser investigada no posto. Não declarar P0 aceito fisicamente. Playwright não está disponível no checkout deste runtime; executar testes browser na CI oficial e no Windows antes de homologar.

## Checkpoint P1 · ciclos, Material SN, alertas e observado (em preparação)

- **Publicado na PR draft #67** com commit remoto `e272f34ceacfb0c8cbee2eea237cd2f5d0e8d036`.
- CI desse SHA: `Central Quality Gate` **FAILURE**; `Console themes, languages and mobile` **SUCCESS** (regressão PT/EN P0 corrigida); `Agent and sync E2E with Firestore Rules` **SUCCESS**; `Static quality checks` **FAILURE** com duas causas reproduzidas e corrigidas no bloco P2 seguinte: módulo `component-failure-compatibility.mjs` ausente do pré-cache e SHA da política `temporal_3074.py` não repinado no contrato CLEAN V3. Não declarar o SHA P1 GREEN.

1. `core/temporal_3074.py`: recorte independente de **Consulta SN** por montagem principal: vínculo `Y` atual com Bind posterior à falha 2114 é **novo ciclo**, exibido sozinho; `Y` anterior segue o mesmo ciclo; ausência de `Y` reconstrói montagem da última falha com inclusões `N` temporalmente demonstradas. Datas ausentes, status conflitantes, desvínculos sem hora e intervalos conflitantes tornam o material candidato, não comprovado. Rastreabilidade por 3028 não usa essa seleção.
2. `engine_bridge.py`: varredura explícita 3074 dos componentes selecionados; consulta inversa por **Material SN** (3074 → PCBAs relacionadas → 2114 → contexto 3012/3022), até 25 PCBAs por chamada, com limite/omissões à vista. Falhas da PCBA anterior à vinculação ou posterior ao desvínculo não são atribuídas ao componente. Agrupamento de linhas de posto evita contar duplicata como novo ciclo; retorno mantém status Y/N.
3. `console-sn-material-investigation.mjs` e `console-sn-live-context.mjs`: painel de Material SN com ciclos, PCBAs clicáveis, defeitos associados/candidatos/excluídos e alerta de recorrência entre PCBAs; anotação da montagem investigada, histórico secundário, candidato colapsável. Troca de PCBA usa a própria consulta explícita, não disparo em segundo plano.
4. `sn-forensics.mjs`: ao ver novo ciclo `Y` posterior à última falha, a última ocorrência 2114 passa a **histórico**, sem fingir que já há falha da montagem recém-criada. Históricos 3074 `N` sem Unbind não provam presença em falhas pretéritas.
5. `component-failure-compatibility.mjs` + `console-sn-smart-alerts.mjs`: alerta de prioridade média para componente **reutilizado, fisicamente compatível com a falha 2114 atual**, sem alegar causa raiz. Matcher versionado conservador para câmera frontal/traseira e principal/secundária, áudio, LCD, RF etc.; detalhamento com 3074/2114. Não replica alerta da falha antiga numa montagem nova.
6. `failure-group-evidence.mjs`: UI diferencia **contagem exata observada** de **população completa**. Ex.: `13` significa 13 registros distintos encontrados nesse recorte, não `≥13`; ausência de prova mostra `—` e jamais zero inferido. O texto da tabela esclarece cobertura parcial/causa não comprovada.
7. Correção dos dois trechos de tradução do gate de idioma P0; cache offline dos novos módulos versionado.

### Evidências locais do P1, antes do commit remoto

- `python3 -m unittest ames/factory-engine/tests/test_issue66_mounting_cycles.py`: **11/11 testes de casos PASS**.
- `node --test scripts/ames-issue66-compatibility.test.mjs scripts/ames-issue66-material.test.mjs scripts/ames-issue66-p0.test.mjs`: **3/3 arquivos PASS**.
- `node --test scripts/ames-failures-grouped-summary.test.mjs scripts/ames-daily-autoread-ui.test.mjs scripts/ames-sn-smart-alerts.test.mjs scripts/ames-issue66-compatibility.test.mjs`: **4/4 arquivos PASS**.
- `git diff --check`: PASS. Executar bateria ampliada e gates por SHA antes de marcar integração aceita.

## Checkpoint P2 · Dashboard e contrato de fechamento (em preparação)

- **Publicado na PR draft #67** com commit remoto `8cf09bc7967ba95830d2776d161a3df519450737`.
- CI por SHA: `Static quality checks` **SUCCESS**, `Agent and sync E2E with Firestore Rules` **SUCCESS**; `Console themes, languages and mobile` ainda em execução na última consulta deste handoff, `Published preview smoke` **FAILURE** na verificação do SHA/rota do preview externo (investigar resposta HTTP/URL; não atribuir automaticamente a falha ao código). Run `39982286786`.

1. `data/daily-reuse-evidence.mjs` e `daily-failure-analytics.mjs`: novo modo **Dashboard de reuso** integrado à visão de falhas do dia. Conta sem duplicar ocorrências 3028 por linha + PCBA + Defect Code + instante; separa união, interseção, somente PCBA, somente material e sem evidência, com clique nas métricas para abrir as ocorrências específicas, eixo configurável **dia MES** ou **linha**, e números observados sem fingir produção total/Check FPY. A filtragem já existente por data, modelo, posto e falha continua aplicável.
2. `data/full-day-closure.mjs` e `console-history.mjs`: verificador fail-closed de fechamento: exige dia completo 07:00→07:00, identidade imutável de snapshot/revisão/hash e comprovação de integralidade 3028+3074+2114+3022. Ao abrir uma revisão no histórico, informa **FULL comprovado** ou lista as fontes sem comprovação. Seleciona último fechamento comprovado entre candidatos deduplicados, mas **não cria novos registros nem promove as capturas parciais existentes a FULL**.
3. `sw.js`: versão nova do cache com os módulos de compatibilidade, dashboard e fechamento. `ames-clean-v3.test.mjs`: hash da extensão temporal Issue #66 explicitamente fixado; arquivos congelados CLEAN V3/3028 continuam verificados byte a byte.

### Evidências locais P2

- `node scripts/ames-cache.test.mjs`: **8/8 PASS**, inclusive grafo completo de imports offline.
- `node scripts/ames-clean-v3.test.mjs`: **11/11 PASS**, inclusive preservação dos arquivos congelados e pin temporal.
- `node scripts/ames-issue66-dashboard.test.mjs`: **2/2 PASS**.
- `node scripts/ames-issue66-full-closure.test.mjs`: **2/2 PASS**.
- `node --check ames/daily-failure-analytics.mjs`, `node --check ames/console-history.mjs`, `git diff --check`: **PASS**.
- Bateria Node global em execução na elaboração deste registro. O `node scripts/quality-gate.mjs` local foi **interrompido** após mais de 2 minutos sem novos logs no teste Python de atualização (não declarar sucesso).

**Limite de dados de fechamento:** na versão oficial `ames/agent/canonical.py` a `source_coverage` das fontes 3074/2114/3022 é intencionalmente `observed_partial`/`source_complete=false`. Para existir um fechamento FULL real, ainda será necessário coletar e armazenar prova de integralidade da janela/fonte vinculada exatamente à revisão, respeitando os limites e sem sobrescrever histórico. Até isso e homologação de fábrica, a interface continuará mostrando **não comprovado**.

## Checkpoint P3 · Drilldown físico e métricas com identidade exata (em preparação)

- **Publicado na PR draft #67** com commit remoto `3b3172f4bc82feb04b4f5ba7e7b24160f383fc39`. CI: `Static quality checks` SUCCESS e `Agent and sync E2E with Firestore Rules` SUCCESS; browser ainda instalando ferramenta Playwright na última consulta; preview externo **FAILURE**, diagnóstico comprovado `release_build_http_401` para `deploy-preview-67--productcontrolcenter.netlify.app` (run `39983517233`). Esse 401 não deve ser mascarado como código GREEN; configuração/deploy externo fica pendente.

1. Na Consulta por SN de PCBA, cada cartão de Material SN agora oferece botão **Investigar este Material SN na 3074** usando a consulta já existente; o caminho inverso Material → PCBA também está presente. O identificador é escapado no HTML; sem consultas implícitas ao abrir o cartão.
2. Falhas agrupadas ganharam **Materiais 2º+***: SNs físicos distintos, com ocorrência exata PCBA + Defect Code + Defect Time; não multiplicar linhas de kit, não transferir componente de outra falha da placa. Falta de chave exata exibe `—`, nunca zero comprovado.
3. No Dashboard de reuso, o eixo **linha** ganhou barras segmentadas para PCBA somente / material somente / ambos; o eixo **dia MES** ganhou gráfico de linha sem interpolar lacunas. A associação de material na contagem só aceita ligação à ocorrência 3028 exata; associação PCBA genérica fica como contexto, não como defeito físico comprovado.
4. Testes direcionados `ames-failures-grouped-summary`, `ames-issue66-dashboard`, `ames-issue66-compatibility`, `ames-sn-history-detail`, `ames-sn-live-context` e `ames-daily-failure-analytics` passaram localmente. Revalidar a CI do SHA remoto correspondente antes de alegar GREEN.

## Checkpoint P4 · sensibilidade teórica e PCBA sem âncora 2114 (em preparação)

- **Publicado na PR draft #67** com commit remoto `5903256741cbfcd0215d73e2a946d09e51bfd695`.
- CI por SHA: `Static quality checks` SUCCESS, `Agent and sync E2E with Firestore Rules` SUCCESS, `Console themes, languages and mobile` SUCCESS. `Published preview smoke` ainda em progresso na última verificação; previews anteriores responderam `release_build_http_401` externo. Ainda não declarar gate integrado GREEN.

1. `data/daily-reuse-evidence.mjs`: cálculo puro de participação dos sinalizados no conjunto 3028 observado e escala de **pontos percentuais teóricos**, somente com Quantity verdadeiro, dia operacional único, evidência 3022 e uma ocorrência distinta por PCBA. Exemplo da Issue #66: 57 falhas observadas, 10 sinalizadas, 1600 produzidas → 17,54% das falhas e 0,625 pp de escala teórica; `check_fpy_gain` fica **null** e nenhum ganho real é atribuído. Sem provas suficientes retorna `—`. `daily-failure-analytics` expõe cards, SNs distintos e evita transformar Quantity ausente em `0`.
2. PCBA sem qualquer falha 2114, mas com materiais atuais Y comprovados pela 3074, agora tem seleção `current_mounting_unanchored` explícita. A montagem atual não desaparece e não recebe falso alerta de falha. Consulta PCBA e histórico seguem independentes da Rastreabilidade 3028.
3. Testes `ames-issue66-dashboard`, `ames-issue66-compatibility`, `ames-daily-failure-analytics` e Python `test_issue66_mounting_cycles` ampliados, incluindo ausência de denominador e ciclo atual sem 2114.

## Checkpoint P5 · seleção múltipla de categorias (publicado)

- **Publicado na PR draft #67** com commit remoto `8ebd1eeca214616c3f3861cab9f1646c626e356f`.
- CI run `39985208672` por SHA: `Static quality checks` **SUCCESS**, `Console themes, languages and mobile` **SUCCESS**, `Agent and sync E2E with Firestore Rules` **SUCCESS**. `Published preview smoke` **FAILURE** em `release_build_http_401` no endereço Netlify `deploy-preview-67--productcontrolcenter.netlify.app`. Integração publicada **não** é GREEN; físico ainda não homologado.

1. `data/daily-reuse-evidence.mjs`: novos critérios combináveis sob **OU/E**: PCBA reutilizada, PCBA reutilizada com falha histórica, material físico reutilizado com associação à ocorrência exata, falha histórica da PCBA anterior **candidata**, e tipo físico compatível com falha atual **hipótese** (matcher determinístico); flags sem evidência ficam false, nunca são causalidade.
2. `daily-failure-analytics.mjs`: painel de combinação com checkboxes, seletor OU/E, resultados deduplicados, drilldown por ocorrência e percentagem/escala teórica guardadas. O modo pré-configurado União/Interseção anterior permanece intacto.
3. Testes de união/interseção configurável e não transferência entre ocorrências em `scripts/ames-issue66-dashboard.test.mjs`, além dos suites diários: 10 arquivos Node selecionados e 12 casos Python passaram localmente antes do checkpoint; gate CI interno 3/3 SUCCESS acima, físico pendente.

## Checkpoint P6 · atribuição material ↔ ocorrência 3028 (publicado)

- **Publicado na PR draft #67** com commit remoto `e471953812483de5f1420589841590bb91b103ed`.
- CI run `39986560229` por SHA: `Static quality checks`, `Console themes, languages and mobile` e `Agent and sync E2E with Firestore Rules` **SUCCESS**. `Published preview smoke` **FAILURE**, log comprovou `release_build_http_401` no Netlify. Nenhum gate externo/físico declarado aprovado.

1. Foi identificada uma contaminação no dashboard: `reuseLinks` podia preencher o código/horário da **primeira** ocorrência da PCBA quando a fonte 3074 tinha apenas contexto da placa; a comparação posterior no dashboard podia atribuir esse Material SN àquela falha sem identificação real. Não alterar a visualização contextual legada.
2. `ames/data/reuse-analysis.mjs` agora reconcilia o material por `current_defect_key` **ou** código+instante explícitos da fonte, exigindo identidade única; a associação genérica de PCBA fica só como contexto. `ames/daily-failure-analytics.mjs` exige também identidade bruta por ocorrência, intervalo Bind/Unbind quando disponível e unicidade 3028 antes de incluir material nos indicadores de falha exata. Vínculo de novo ciclo posterior à falha não conta.
3. Regressão testada: duas falhas na mesma PCBA, material de uma falha apenas, linha 3074 sem identificação da ocorrência e Bind posterior excluídos; a correspondência UTC / hora de fábrica da segunda falha permanece válida.
4. Testes locais: `node --test scripts/ames-daily-failure-analytics.test.mjs scripts/ames-issue66-dashboard.test.mjs scripts/ames-reuse-localization.test.mjs scripts/ames-failure-occurrence-evidence.test.mjs scripts/ames-reuse-cohorts.test.mjs scripts/ames-clean-v3.test.mjs scripts/ames-cache.test.mjs` **7/7 arquivos PASS**.

## Checkpoint P7 · reincidência mesma falha vs mesma família (publicado)

- **Publicado na PR draft #67** com commit remoto `1f9e1af1ccf4eab19e1e1a79a6245e38c87b6d19`.
- CI run `39987334555` por SHA: `Static quality checks` e `Agent and sync E2E with Firestore Rules` **SUCCESS**; `Console themes, languages and mobile` em execução no último check; `Published preview smoke` **FAILURE** pelo `release_build_http_401` confirmado no log. Não chamar integrado GREEN.

1. O dashboard configurável passa de 5 para **9 critérios**. Acrescenta PCBA 2º+ com falha 2114 **anterior da mesma falha** e **da mesma família**, e material físico com falha **da mesma falha** / **mesma família** em PCBA anterior. Os dois critérios de Material SN são explicitamente **candidatos**, não provam que a peça causou a falha antiga.
2. As reincidências da PCBA usam 2114 da própria PCBA estritamente **anterior** ao instante 3028, nunca histórico de outra PCBA, falha futura ou registro sem hora. A classificação usa taxonomia oficial versionada `failure-taxonomy.mjs`: `EXACT` distinto de `SIMILAR`, sem promover texto agregado `D1, D2` a um único código comprovado.
3. Mantém OU/E, drilldown observado sem duplicação, matcher de tipo compatível, tradução PT/EN. Os 5 critérios anteriores e presets continuam funcionando.
4. Testes locais direcionados: Node `ames-issue66-dashboard`, `ames-daily-failure-analytics`, `ames-reuse-cohorts`, `ames-cache`, `ames-clean-v3` **5/5 arquivos PASS**. Suite adicional `ames-failure-taxonomy` local foi **interrompida** após ficar sem progresso no subprocesso de checagem Python; não declarar PASS. Evidência remota por SHA acima; físico ainda requer execução na fábrica.

## Checkpoint P8 · tendência somente a partir de FULL comprovado (publicado)

- **Publicado na PR draft #67** com commit remoto `1bf6089c57d04f00c16fda8540663aa0257aff88`.
- CI run `39988259534` por SHA: `Static quality checks`, `Console themes, languages and mobile` e `Agent and sync E2E with Firestore Rules` **SUCCESS**. `Published preview smoke` **FAILURE**, mesmo `release_build_http_401` comprovado no log. Não declarar release/deploy/homologação GREEN.

1. `ames/data/history-trends.mjs` tem opção de leitura `requireFullClosure`: ao percorrer as revisões imutáveis de cada dia/linha/origem, salta capturas posteriores parciais e usa apenas a **revisão completa mais recente** demonstrada por `fullDayClosureEvidence` (3028+3074+2114+3022, dia 07:00→07:00, hash e escopo). Dia sem prova vira `unproven_full` e lacuna, não zero; origem em conflito e revisão inválida continuam bloqueadas.
2. `ames/console-history-trends.mjs`: checkbox **Somente fechamentos FULL comprovados** dentro do gráfico histórico 7/30/93 dias; o padrão existente continua sendo tendência de dados observados/possivelmente parciais. O modo FULL não lê o MES, não publica, não altera snapshot atual, e não faz uma coleta parcial virar completa.
3. Regressão em `ames-history-trends.test.mjs`: dia com r1 FULL e r2 posterior parcial seleciona **r1 somente no modo FULL**; modo observado mantém r2; sem FULL retorna lacuna/`—`, não ocorrência zero. Testes locais `ames-history-trends`, `ames-issue66-full-closure`, `ames-cache`, `ames-issue66-dashboard` **4/4 arquivos PASS**. CI exata registrada acima; homologação física pendente.

## Checkpoint P9 · denominador de produção com recorte temporal exato (publicado)

- **Publicado na PR draft #67** como `01e176ed4a5d91a6031dd8f2972c07b3922b4d79`. CI `39989202325`: o workflow terminou `failure` por exigência legada de preview Netlify, que foi removida somente no P10. Revalidar cada job se necessário; não atribuir sucesso do SHA P10 a esta execução.

1. Corrige risco de `daily-failure-analytics.mjs`: `productionMetrics` poderia ler Quantity/Check FPY do snapshot atual ao filtrar um dia MES diferente. O agregado só é exibido como comprovado se o snapshot da mesma linha corresponder **exatamente** ao dia selecionado 07:00→07:00, possuir `coverage.defects.source_complete` e `transport_complete`, e suas ocorrências carregadas tiverem prova de 3022 para o mesmo dia operacional. Não compara produtos/linhas/turnos/horas misturados. Caso contrário, Quantity/Check FPY e projeção teórica retornam `—`/null, nunca zero ou ganho.
2. `scripts/ames-daily-failure-analytics.test.mjs`: cenário válido 100 produzidos/96,5% Check FPY, período divergente, origem parcial, filtro sem dia e data inválida. Testes direcionados `ames-daily-failure-analytics`, `ames-issue66-dashboard`, `ames-history-trends`, `ames-cache` **4/4 arquivos PASS**; CI por SHA e teste físico pendentes.

## Continuidade imediata

1. Publicar P10 na branch da PR #67 draft e revalidar **os três jobs internos por SHA exato**; não executar ou exigir Netlify como gate da Central. Não fazer merge nem publicar.
2. P0b diagnóstico da consulta 3074 na grade real sanitizada: discriminar `no_data` confirmado, timeout, store ExtJS não correspondente e linha com material porém sem vínculo temporal. Nunca aceitar grid velha ou inferir que uma peça N não existiu na falha. Preservar demais fontes no erro.
3. P1 física: confirmar na fábrica respostas 3074 PCBA/Material SN, Bind/Unbind reais, alarme GN06-X015 e 3022 dos respectivos ciclos. Resolver possíveis lacunas de parser/driver somente com evidência sanitizada.
4. P2 pendente: persistência autoritativa de fechamento FULL real, leitura da linha do tempo de fechamentos e gráficos dia-a-dia com denominações/Check FPY comprovadas. A classificação/UI fail-closed do leitor já está em andamento; não inferir fonte completa de dados parciais.
6. Testes: Node/Python, integração HTTP, browser, Windows e gate físico L3/snapshot14; nenhum teste local equivale à validação física A-MES.
