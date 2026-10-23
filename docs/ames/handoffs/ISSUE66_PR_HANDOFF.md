# Issue #66 · Handoff funcional (23/10/2026)

## Escopo e proteção

- Fonte oficial no início: `main` e tag `ames-v0.5.39-multipc-20261022` no SHA `b283b1764432f5d90486d38a7553b30542a5c118`.
- Branch dedicada: `work/ames-issue66-forensics-functional-20261023`; PR **draft**, sem merge/release/instalação. Não tocar na PR #64, updater, árvores do Work ou máquina da fábrica.
- Contratos preservados: Rastreabilidade ancorada na ocorrência **3028** da revisão/linha/período exatos; Consulta SN independente, ancorada na 2114 ou diretamente em Material SN; Y/N não destrói histórico, 3012 pode ser candidata, causalidade nunca inferida.
- Issues relacionadas lidas: #39 (contexto temporal único e fechamento), #52 (live/matriz/alertas). Issue #66 e fluxo da conversa são a especificação funcional.

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

1. `data/daily-reuse-evidence.mjs`: cálculo puro de participação dos sinalizados no conjunto 3028 observado e escala de **pontos percentuais teóricos**, somente com Quantity verdadeiro, dia operacional único, evidência 3022 e uma ocorrência distinta por PCBA. Exemplo da Issue #66: 57 falhas observadas, 10 sinalizadas, 1600 produzidas → 17,54% das falhas e 0,625 pp de escala teórica; `check_fpy_gain` fica **null** e nenhum ganho real é atribuído. Sem provas suficientes retorna `—`. `daily-failure-analytics` expõe cards, SNs distintos e evita transformar Quantity ausente em `0`.
2. PCBA sem qualquer falha 2114, mas com materiais atuais Y comprovados pela 3074, agora tem seleção `current_mounting_unanchored` explícita. A montagem atual não desaparece e não recebe falso alerta de falha. Consulta PCBA e histórico seguem independentes da Rastreabilidade 3028.
3. Testes `ames-issue66-dashboard`, `ames-issue66-compatibility`, `ames-daily-failure-analytics` e Python `test_issue66_mounting_cycles` ampliados, incluindo ausência de denominador e ciclo atual sem 2114.

## Continuidade imediata

1. Publicar P4 na branch da PR #67 draft e revalidar jobs de CI por **SHA exato**; acompanhar especialmente o gate browser e o preview Netlify externo HTTP 401. Não fazer merge nem publicar.
2. P0b diagnóstico da consulta 3074 na grade real sanitizada: discriminar `no_data` confirmado, timeout, store ExtJS não correspondente e linha com material porém sem vínculo temporal. Nunca aceitar grid velha ou inferir que uma peça N não existiu na falha. Preservar demais fontes no erro.
3. P1 física: confirmar na fábrica respostas 3074 PCBA/Material SN, Bind/Unbind reais, alarme GN06-X015 e 3022 dos respectivos ciclos. Resolver possíveis lacunas de parser/driver somente com evidência sanitizada.
4. P2 pendente: persistência autoritativa de fechamento FULL real, leitura da linha do tempo de fechamentos e gráficos dia-a-dia com denominações/Check FPY comprovadas. A classificação/UI fail-closed do leitor já está em andamento; não inferir fonte completa de dados parciais.
6. Testes: Node/Python, integração HTTP, browser, Windows e gate físico L3/snapshot14; nenhum teste local equivale à validação física A-MES.
