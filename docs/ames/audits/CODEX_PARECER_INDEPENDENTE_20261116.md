# Parecer independente — Central / A-MES — 16/11/2026

**Fase 1 concluída: auditoria e contratos executáveis; nenhuma correção produtiva. Gate físico permanece RED/PENDING.**

Objeto: `pedrokam700/Central-de-Controle-`, branch `work/ames-3012-reuso-auditado-20261106`, fixada em **`fddc75438796cdfcc8a133eb8193d08fa1d9b783`**. Base pública preservada: `main` **`b283b1764432f5d90486d38a7553b30542a5c118`**. A PR #70 estava OPEN/DRAFT, base na branch da #69. Este parecer e seus testes ficam em branch própria, com PR DRAFT contra a branch auditada, sem mover sua referência.

## 1. Conclusão independente e alcance da prova

As regressões não têm uma causa única demonstrada. Há defeitos independentes em **pré-condições do navegador, materialização/leitura de eventos, projeções de pessoas, retomada e apresentação**. A combinação permite coletar e salvar uma informação sem que todos os consumidores a leiam; permite ainda depender do Chrome para recuperar dados já confirmados. Isso explica mecanismos de divergência entre telas sem precisar presumir corrupção do SQLite ou alteração do classificador.

O achado novo mais forte é um caminho concreto de perda de nome: a 3022 salva eventos de operador que não são `END LOT` no bruto e em `mes_process_timeline`, mas `/local/sn` consulta `process_events`, preenchida apenas com passagens `END LOT`. Reproduzi com `REPAIR END` A6900: uma linha bruta e uma canônica com o nome; **nenhum operador no resultado local**. Não há perda do bruto nesse teste: há perda na seleção da leitura.

Outra causa demonstrada é a recuperação 3022: mesmo quando **todos** os resultados são sementes locais confirmadas, `collect_and_persist` conecta CDP e prepara a view **antes** de consultar as sementes. Um Chrome indisponível bloqueia um trabalho que poderia ser inteiramente local. A ausência do campo ExtJS, por sua vez, fica `UNCONFIRMED` e não participa do circuito de dois bloqueios, consumindo novamente o orçamento por PCBA.

Não demonstrei que esses mecanismos sejam a causa específica de todos os prints de 16/11. Os cinco screenshots, SQLite privado, requisições MES e SHAs efetivamente servidos/instalados **não estavam disponíveis nesta sessão**; os relatos foram lidos nos documentos e comentários. Não contatei MES, Chrome de fábrica, agente produtivo ou Firebase. Os bancos usados nos testes foram descartáveis. A correspondência entre sintomas físicos e cada mecanismo permanece uma etapa de evidência, não uma conclusão automática.

## 2. Método e fontes históricas

Foram lidos integralmente os dois documentos solicitados: [auditoria transversal](../audits/AUDITORIA_TRANSVERSAL_CENTRAL_20261116.md) e [ordem de revisão independente](../audits/CODEX_REVISAO_INDEPENDENTE_20261116.md). Foram confrontados com o mapa ativo, contrato das nove views, handoff canônico 3022/R12 e handoffs PR69/70 — recuperação, período 3012, A6900, tendências, reuso fino, técnicos, UNKNOWN/2114, instalação segura, regressão e continuidade de 12/11. As afirmações desses registros são antecedentes, não prova independente de execução física.

Consultei metadados, corpos, discussões e patches originais das PRs indicadas. A revisão dos patches foi dirigida aos contratos e caminhos envolvidos; não é certificação de cada arquivo de todas as PRs nem inspeção dos artefatos privados históricos.

| PR | SHA de cabeça consultado | Contrato recuperado e confronto |
|---|---|---|
| [#35](https://github.com/pedrokam700/Central-de-Controle-/pull/35) | `da3d16c` | Histórico, proveniência por fonte e prova temporal sem alterar coletores. Seus decorators explicam o acoplamento de SN, Falhas e alertas. |
| [#36](https://github.com/pedrokam700/Central-de-Controle-/pull/36) | `0757224` | PCBA/código/instante, anterioridade e fuso. A proteção de ocorrência não é, por si só, proteção de origem/revisão. |
| [#42](https://github.com/pedrokam700/Central-de-Controle-/pull/42) | `ef43b72` | Integração seletiva, proveniência e empacotamento. Igualdade de módulos não prova que todos os wrappers forneçam a mesma evidência. |
| [#47](https://github.com/pedrokam700/Central-de-Controle-/pull/47) | `f2f454d` | Última captura por linha, dia 07→07, lacunas, alias de nomes. Alterações de proveniência não provam coleta de nomes ausentes. |
| [#55](https://github.com/pedrokam700/Central-de-Controle-/pull/55) | `5b8a4ed` | Período compartilhado em Monitor/Top3, SN independente, resumo com candidatos AT. Vários consumidores passam a resolver pessoas por caminhos distintos. |
| [#59](https://github.com/pedrokam700/Central-de-Controle-/pull/59) | `c45b733` | Alerta existia, mas era montado na aba Técnico em vez de História. Exemplo histórico comprovado de regressão de composição sem mudança de coletor. |
| [#64](https://github.com/pedrokam700/Central-de-Controle-/pull/64) | `9b81404` | Pareamento, guardian, backup, lease, migração e rollback. Não fornece prova de controle do guardian instalado. Nenhuma ação nessa PR. |
| [#67](https://github.com/pedrokam700/Central-de-Controle-/pull/67) | `ca64094` | Rastreabilidade por ocorrência vs SN independente; material Y atual vs histórico; erro de fonte não apaga outras; FULL anterior preservado. |
| [#69](https://github.com/pedrokam700/Central-de-Controle-/pull/69) | `128397d` | Hotfix fora do caminho de build, revisão local e cobertura 3074; diário durável por PCBA. A existência do diário não garante que o replay dispense navegador. |
| [#70](https://github.com/pedrokam700/Central-de-Controle-/pull/70) | `fddc754` | Evidências e candidatas sucessivas, restauração do clique 5s, auditoria e três contratos RED existentes. Nenhuma aprovação física transferível entre SHAs. |

Handoffs de referência: [PR69 recuperação](../handoffs/PR69_RECOVERY_20261030.md), [PR69 auditoria 05/11](../handoffs/PR69_AUDITORIA_3012_REUSO_20261105.md), [PR69/70 06/11](../handoffs/PR69_3012_REUSO_20261106.md), [fronteira 3012](../handoffs/PR70_3012_BOUNDARY_EVIDENCE_20261109.md), [técnicos](../handoffs/PR70_3022_3012_TECNICOS_ALERTAS_20261111.md), [regressão reuso/técnicos](../handoffs/PR70_REGRESSAO_REUSO_TECNICOS_20261112.md), [continuidade](../handoffs/PR70_CONTINUIDADE_20261112.md). O relato de sucesso de 10/11 é específico daquele job; não atesta este HEAD.

## 3. Caminho real do dado e acoplamentos

```text
3028: ocorrência + PCBA + código + Defect Time + linha/CPH/período
  → snapshot SQLite / revisão 3028 selecionada
  → agent_entry._run_deep_trace_job / scheduler MES FIFO
      ├─ engine_bridge / motor V0.16 → 3074 (vínculos) → 2114 (histórico)
      ├─ process_r11 → AmesBrowser/CDP → AmesNavigation → Tela3022
      │    ├─ callback por PCBA → DurablePCBAJournal / source_capture
      │    ├─ process_raw_events: todas as linhas retornadas
      │    ├─ process_events: passagens END LOT
      │    ├─ mes_process_timeline: passagens + eventos com operador explícito
      │    └─ process_defect_contexts: correlação por ocorrência
      └─ trace_3012_enrichment quando solicitado → repair_history_3012 + cobertura
  → canonical.export_revision: origem/linha/snapshot/revisão + datasets/contextos
  → API canônica → normalizeCanonical → store / state.ames
  → Monitoramento, Top3/FPY, Falhas, Rastreabilidade, Reuso, Processo,
     Base local, CORA; SN também dispõe de caminhos próprios:
      ├─ /sn-lookup: consulta independente, 3012 por padrão, trace + local_snapshot
      └─ /local/sn e /3012/history: histórico local, não limitado à revisão corrente
```

`factory-engine` não é outro agente, mas seus módulos **são importados e executados** por `process_r11.engine_support/collect_and_persist`; chamá-lo apenas de referência histórica no mapa ativo é insuficiente para avaliar impacto de mudanças.

Inventário de responsabilidades:

| Campo/fato | Extração/persistência | Projeção/consumo |
|---|---|---|
| `Tran User`, ID, `operator_name` | `operator_evidence.py`, `tela_3022.normalizar_evento_3022`, `process_r11`, `local_sn._hydrate_process` | `normalize3022OperatorRows`, `projectRepairTechnicianNames`, `provenRepairUserName`, `a6900TechnicianFor`, `a6900ObservedForSn`; SN, alertas, Reuso, leitura de reparos |
| `Repair User`, comentário e horário | `repair_3012.py` / tabela 3012 / `repair_association` | `sn-forensics.normalizeRepair`, `console-sn-history-detail`, `console-sn-live-context`, `console-sn-smart-alerts`, `console-reuse-cohorts`, `console-3012-fastlane`, `console-reading-period` |
| `hist_seq`, `defect_time` | 2114/3028, `store.py`, bruto | `board2114Timeline`, `sn-forensics`, comparativos Reuso; `Hist Seq` não cria data nem vínculo 3012 |
| Reuso e ordinal físico | `core/uso_pcba.py`, `reports/relatorio_v015.py`, insights via `engine_bridge` | `data/reuse-cohorts`, `data/sn-forensics`, vínculos/alertas; uso na falha separado de ciclos conhecidos |
| Hora produtiva por ocorrência | `process_defect_contexts`, `production_shift` | `production-evidence`, `daily-failure-analytics`, `daily-failure-summary`, prova temporal SN |

Acoplamentos a corrigir: duas tabelas de processo com semânticas diferentes lidas como se fossem intercambiáveis; resolução de pessoas dentro de renderizadores; cache local por PCBA sem escopo explícito enquanto snapshots canônicos são versionados; normalização de fonte repetida nos wrappers; recuperação local dentro do ciclo CDP. O scheduler serializa acesso ao MES, mas não unifica esses contratos de dados.

## 4. Achados, contratos violados e certeza

As linhas abaixo referem-se ao SHA fixado. Links permanentes estão na seção 10. **Comprovado** significa reprodução no código, não diagnóstico retrospectivo certificado do posto.

| ID / gravidade | Arquivo, função, linha | Evidência e impacto | Certeza / teste | Mitigação e dependências |
|---|---|---|---|---|
| F1 / P0 | `navigation.py:_main_page` 54–76; `agent_entry.py:_run_deep_trace_job` 207, 432 | Ausência de Home/host esperado lança erro; exceção geral evita agregação final por fonte/linha. Agente saudável não atesta CDP/login/view. | Fluxo comprovado; causa da seleção real de aba depende do inventário do posto. Contratos NAV existentes e caso pré-lote adicional no plano. | Pré-condições explícitas; conservar estágios já concluídos; erro recuperável por fonte/linha. Não abrir outra sessão/agente automaticamente. |
| F2 / P1 | `navigation.py:_has_visible` 37; `_wait_view` 78; `ensure_3022` 118 | Presença sem visibilidade para seletor genérico; seletor aceito fora da rota; 3022 aceita URL antes de controles renderizados. | 3/3 contratos NAV RED existentes reproduzidos. Ressalva de seletor `:visible` na seção 5. | Readiness de rota + controles visíveis + estado da view; preservar confirmação de resposta no coletor. |
| F3 / P0 | `process_r11.py` 216–223, 371–425; `local_sn.py:lookup` 93–107; `agent-client.mjs:cached3022Operators` 498 | Nome em evento não END LOT é salvo em bruto/canônico, mas não lido em `/local/sn`. Dashboard depende dessa rota; nomes históricos podem sumir apesar de já salvos. | **N4 RED integrado**: coleta/JS/adapter/SQLite reais, navegador simulado. Não prova que os nomes dos prints estejam nesse formato. | Ler evidência de operador completa, com identidade/proveniência, sem promover REPAIR END a passagem produtiva. Depende de contrato de leitura, não de nova coleta. |
| F4 / P1 | `console-sn-repair-evidence.mjs:provenRepairUserName` 44–65 e `projectRepairTechnicianNames` 68–84 | O primeiro aceita nome explícito no raw 3012; o segundo ignora esse mesmo raw e devolve null. O wrapper SN da tabela também omite `local_snapshot.process_events` (fastlane linha 150). | **N1 RED** para mesmo objeto e nome explícito. Caminho de wrapper demonstrado por código. | Resolver único por papel; os consumidores fornecem o mesmo conjunto de evidências, não só o mesmo helper. |
| F5 / P0 | `process_r11.collect_and_persist` 280–296; `agent_entry` 249–253 | Sementes confirmadas são reprocessadas só após conexão/navegação. Replay local falha com CDP indisponível. Em retomadas, sementes entram em `records_process`. | **R1 RED**: resposta íntegra local e connect que lança; processamento local nunca começa. | Separar alvos locais dos alvos MES antes de abrir CDP. Checkpoints, semântica de cobertura e reprocessamento devem permanecer idempotentes. |
| F6 / P1 | `tela_3022._consultar` 1034–1072; `process_r11` 328–331 | Campo ExtJS ausente esgota ~5s e retorna UNCONFIRMED; circuito só reconhece BLOCKED_VIEW_MASK/NOT_READY. Lote continua peça a peça embora seja falha da view. | **R2 RED**: quatro PCBAs, nenhum envio, terceira não é SKIPPED. Clock do harness, não UPH físico. | Classificar transição/ausência de campo como condição de sessão recuperável, orçamento por fase; sem aumentar timeout por peça. |
| F7 / P1 | `partial_retry.pending_pcbas` 110–133 | Caminho genérico aceita 3022 COMPLETE sem prova de query, embora `verified_3022_items` a rejeite. Pode omitir pendência em payload legado/incompleto. | **R3 RED**; bypass comprovado. Não demonstrei ocorrência desse payload em banco de fábrica; COMPLETE moderno é produzido após validação do adapter. | Distinguir captura bruta confirmada de projeção concluída com linhagem verificável. Não invalidar indiscriminadamente todos os checkpoints legados. |
| F8 / P1 | `console-reuse-cohorts` 154–171, 251–256, 309–335 | Comparativo já inclui história 2114; outra tabela completa 2114 é montada para a PCBA; 3012 entra em uma terceira seção. Repete conteúdo em vez da timeline solicitada. | **U1 RED**, executa mount e clique de KPI com DOM mínimo. A duplicação 2114 é no drilldown PCBA; no componente há comparativo + reparos e auditoria técnica, não o mesmo bloco `data-board-2114-timeline`. | Projeção única de eventos; agrupar apenas com prova. Comparação de UX e aprovação antes de alterar layout. |
| F9 / P1 | `data/production-evidence` 31–65; `console-sn-repair-evidence` 68–84 | Helpers ignoram conflitos explícitos de origem/linha/revisão/período. Normalizador de pessoas remove essa proveniência. | **S1 (5 casos) e N3 RED** no boundary. Não provam vazamento entre linhas pela API: há proteções canônicas a montante. | Rejeitar conflitos explícitos e transportar referência do evento. Política distinta para fato da revisão e identidade histórica observada. |
| F10 / P1 | `scripts/agent-3022-observability.test.py` 203, 253, 273; workflows | 3 testes existentes falham por regex de mensagem antiga. Suite não é chamada no Quality Gate ativo da PR70; está no workflow legado de outras branches. | 29 executados, 26 PASS/3 FAIL; YAML e runner de quality inspecionados. Não há alegação de CI remota executada aqui. | Atualizar asserções para status estruturado e manter contraprovas; incluir suite no gate ativo só após revisão. Não trocar texto para mascarar comportamento. |

F3 e F5 são causas de divergência/indisponibilidade demonstradas de ponta a ponta até os limites descritos. F1/F2/F6 são causas demonstráveis de falha da navegação/estado, sem prova de que tenham ocorrido em todas as sessões. F7/F9 são falhas de contrato de fronteira e compatibilidade, sem incidência física demonstrada.

## 5. O que confirmo, qualifico ou contesto na auditoria anterior

1. **Confirmo** o falso readiness por URL e a aceitação de seletor fora da rota. **Qualifico** a alegação sobre `count()`: os caminhos normais 3074 e 2114 passam seletores com `:visible`; nesses casos o seletor já filtra elementos ocultos. O teste genérico com elemento oculto é válido para o helper, mas não prova que esse mesmo elemento passe nas chamadas atuais. Trocar count por is_visible isoladamente não resolve a sessão e pode desconsiderar múltiplos matches.
2. **Contesto a inferência de resposta antiga aceita a partir do readiness sozinho.** `Tela3022._query_control` exige campo visível, confirma SN antes do envio e `_consultar` valida ciclo de resposta/grade. Os controles são reais. A view pronta cedo demais pode causar falha/latência; aceitar linhas velhas exige uma reprodução própria, não demonstrada aqui.
3. **Confirmo** que nomes e papéis têm projeções diferentes. **Acrescento** a seleção incompleta do cache (F3) e o desacordo sobre nome raw (F4), que fornecem mecanismos concretos além de “dados não carregados”.
4. **Qualifico a duplicação por tipo de drilldown.** O segundo bloco completo 2114 é condicionado a `rowKind==='pcbas'`; não se deve descrevê-lo como invariavelmente presente no drilldown de material. Há redundância real na PCBA, e fragmentação comparativo/3012 no material.
5. **Contesto tratar os 46/173 sem contexto como prova de mistura de origem.** `normalizeCanonical` valida linha/snapshot/revisão nos datasets e nos contextos diretos. Os consumidores diários recebem um snapshot por linha. Os helpers ainda precisam de defesa (F9), mas L2/L3 vazias podem refletir captura não feita, falha de projeção ou escopo selecionado. Não há payload para decidir qual.
6. **Rejeito causalidade direta “mudança em SN quebrou a navegação/3022” neste intervalo.** `navigation.py` tem a mesma identidade nas referências F22 e HEAD; sua última alteração é `5411535` (28/10). O diff F22→F78 não altera coletor 3022 nem `process_r11`. Mudanças posteriores no coletor são explícitas e separadas. Há acoplamento de apresentação/projeção; uma causa de navegação disparada por estado compartilhado exigiria trace adicional.
7. **Não aceito “classificador não mudou” para todo o intervalo F22→HEAD.** Entre F22 e F78 os três arquivos citados no handoff são idênticos; depois `data/reuse-cohorts.mjs` muda para expor ciclos conhecidos (`6e741e2`, `3277146`). Esse acréscimo não demonstra mudança de ordinal na falha nem explica retroativamente 98 indeterminados. A identidade da revisão/entrada continua pendente.
8. **Não recomendo um grande resolver universal com ligação automática entre eventos.** Resolver nomes por identidade, correlacionar ocorrências e montar uma timeline são três responsabilidades. Eventos podem compartilhar a mesma apresentação sem uma relação 1:1 inventada. Um ID de pessoa igual não prova autoria de outro evento, e uma revisão histórica pode fornecer identidade válida sem se tornar prova da ocorrência corrente.

## 6. Baselines, commits e desempenho reproduzível

Identidades Git completas, sem reconstruir ou gerar qualquer pacote:

| Referência | Commit |
|---|---|
| C1B13D | `c1b13dcc596b97b6cb10b904f282c4d8b840d061` |
| F22E344 | `f22e344bd2947bea6856076f0c5d8c9637c19376` |
| F78CE7CB | `f78ce7cbcbf6887db783c782cab69839c09ede12` |
| 60ECEF60 | `60ecef608826fcedba1c6a20a0d01f5d49143356` |
| 16980FB5 | `16980fb503573431c5ddcb4d5950b69459c34e21` |
| 7E49CC45 | `7e49cc45c5947dfabf7d70c049b8fada7be35082` |
| EEDACC65 | `eedacc65445dea9967a92085777b878c1ee9c123` |

Deriva semântica:

- **F22→F78:** reuso ganhou linhas por registro 2114/3028 e seção própria 3012 (`a6af82f`, `8318400`), nome por mesmo ID/PCBA em qualquer estação (`67dc06a`) e separação entre analista A6900 e reparador (`2c4a021`). Isso corrige inferência excessiva, mas fragmenta a experiência e muda o critério de nome. Não altera a navegação 3022.
- **F78→60ECEF60:** nomes em adapter aninhado (`323a7b9`), comentários/AT históricos em SN e ciclos físicos conhecidos distintos do ordinal na falha. Funções de apresentação/classificação derivada passam a exigir prova temporal antes de afirmar uso na ocorrência.
- **60ECEF60→16980FB5:** `5d5cee5` introduz `trial=True, timeout=650` antes do clique. O retry inicial só reconhece alguns textos; timeout genérico de estabilidade escapa e rejeita uma transição que o clique nativo aguardava. Causa de regressão de contrato reproduzida; não é estimativa sobre todas as 72 peças do relato.
- **16980→7E49:** tratamento de timeout genérico (`b26d6d9`/`233a883`), remoção do trial em `a25432f`; clique passa a ter teto de 12s. **7E49→EED:** `fd7a6a8` restaura 5s. O HEAD produtivo auditado mantém essa restauração.
- **F22→HEAD:** nove arquivos produtivos em `ames/` mudam, 336 adições/102 remoções. `console-reuse-cohorts` concentra 225 linhas alteradas. As mudanças de documentação posteriores não corrigem o runtime.

Atribuição adicional por `git blame`, distinguindo defeito herdado de regressão recente: a leitura de `process_events` em `local_sn` vem de `866f1864` (14/10); o projetor tabular que não lê nome raw vem de `703b8671` (21/10). A conexão anterior à preparação vem de `adb99b96`, a preparação antes do loop de `61affba0`; as sementes só foram inseridas em `abc87e1c` (06/11), depois dessas pré-condições. O caminho genérico COMPLETE da retomada e o segundo histórico 2114 também aparecem em `abc87e1c`. Esses trechos já existem no baseline F22. Blame localiza a linhagem do código; não transforma o último autor de uma linha no causador de todo incidente posterior. A duplicação atual resulta da composição desse histórico antigo com o comparativo ampliado por `a6af82f`, não apenas da adição de uma tabela 3012.

Ensaio com **clock simulado**, mesma fixture, mesma resposta em 240ms, execução do JS real do coletor; nenhum tempo abaixo é p50/p95 fabril:

| Coletor | Saudável | View instável por 2,4s | View permanentemente travada |
|---|---|---|---|
| C1B13D / F22 / F78 / 60ECEF60 | 240ms; 1 envio | 2640ms; 1 envio, CONFIRMED | 5000ms; 0 envios |
| 16980FB5 | 240ms; 1 trial + 1 envio | **650ms; TimeoutError, 0 envios** | 650ms; TimeoutError, 0 envios |
| 7E49CC45 | 240ms; 1 envio | 2640ms; 1 envio | **12000ms**; 0 envios |
| EEDACC65 | 240ms; 1 envio | 2640ms; 1 envio | **5000ms**; 0 envios |

O timeout de 5s é teto de uma ação, não duração total por peça. Há orçamento separado para input (até ~5s, com possível ultrapassagem da última chamada), resposta (18s), confirmações de vazio e polling. `process_r11` tem pausas de 0/30/120ms conforme perfil; o código não sustenta a descrição de “nenhuma pausa fixa” para todos os modos. Não alterei nenhum timeout ou pausa. O teste R2 demonstra custo repetido de input ausente; p50/p95 reais continuam não medidos.

Polling: F22 já separa `job-poll` de refresh pesado; esses módulos não mudam no diff produtivo F22→HEAD. Não atribuo ao coletor 3022 um congelamento de UI só porque abrir outra janela pareceu destravá-lo. Interação real com outras abas continua caso de integração a validar.

## 7. Contratos de aceite para a implementação

| Contrato | Autoridade e regra negativa |
|---|---|
| Ocorrência | 3028/2114 de identidade própria; PCBA+código+instante, contexto e linhagem. Hist Seq sem data permanece sem data. |
| Vínculo físico | 3074, Material SN explícito e intervalo comprovado. PN, tipo e quantidade de falhas não criam uso físico. Último vínculo histórico não vira montagem atual. |
| Pessoas | Nome explícito 3012 ou identidade MES 3022 verificável; papel sempre explícito. Mesmo nome no resumo, tabela, alerta e dashboard quando recebem a mesma prova. Ausente/contraditório continua desconhecido. |
| Relógios | Defect Time, Tran Time e Repair Time separados; offset explícito preservado. Janela aproximada A6900 continua candidata, não exata. |
| Cobertura | Terminar job não certifica fonte; transport_complete não certifica MES. Diferenciar não pedido, não carregado, parcial, erro, vazio confirmado e confirmado. Os 127/173 não aumentam sem evidência nova. |
| Escopo | Origem/linha/snapshot/revisão/período referenciam cada observação. Uma consulta histórica pode incluir outras revisões, mas conserva origem e não autentica silenciosamente o evento corrente. |
| Recuperação | Replay confirmado dispensa Chrome; apenas lacunas exigem MES. Erro de pré-condição não elimina êxitos, não reinicia fontes completas e não faz confirmado virar zero. |
| UX | Uma projeção de eventos por PCBA/material; campos e comentários visíveis. Eventos independentes mantidos independentes. Auditoria técnica não duplica a timeline operacional. |

Questão adicional já reconhecida no handoff de minuto 3012: cobertura até 23:59 consultada de manhã pode congelar dados futuros se não houver política de freshness. `mes_day_end`, cache e intervalo consultado devem ser auditados juntos. A correção dos 59 segundos não resolve essa questão por si só; não a usei como causa demonstrada dos nomes ausentes.

## 8. Testes executados e lacunas assumidas

Ambiente: Node **24.22.1**, Python **3.12.14**, Linux. Não instalado pacote novo, não inicializado agente. Suites novas em `scripts/audit/` não são incluídas automaticamente no CI e são especificações RED deliberadas.

| Comando/suite | Resultado observado |
|---|---|
| `python3 scripts/audit/ames_navigation_readiness_red.py` (existente) | 3 testes, **3 falhas esperadas** |
| `node --test scripts/audit/codex_cross_contracts_red.mjs` | 10 testes: **8 falhas, 2 controles passam** (N1/N3/S1/U1) |
| `python3 scripts/audit/codex_recovery_names_red.py` | 4 testes: **4 falhas** (N4/R1/R2/R3) |
| `agent-3022-observability.test.py` (existente) | 29: **26 PASS/3 FAIL**, todas por regex antiga; sem reinterpretar as asserções posteriores não executadas como aprovadas |
| SN repair evidence, reuse drilldown, temporal proof, trace scope, production analytics | **34 PASS** |
| reuse cohorts, SN history detail, smart alerts, source provenance | **48 PASS** |
| `agent-trace-target.test.py` | **12 PASS** |
| `agent-source-capture.test.py` | **7 PASS** |
| `agent-sn-3012-fallback.test.py` | **3 PASS** |
| `python3 scripts/audit/codex_latency_compare.py` | 21 cenários simulados, resultados anexos; extração do coletor diretamente do Git |

Total das suites existentes selecionadas: **133 testes, 130 PASS e 3 FAIL**. Especificações RED: **17 testes, 15 falhas e 2 controles PASS**. Não executei o Quality Gate inteiro, o build ou workflows que geram instalador. A busca do conector por runs do HEAD filtrada a `pull_request` retornou lista vazia; isso **não comprova ausência de runs `push`**, nem substitui leitura de resultados CI pelo SHA.

Reprodução: executar os comandos acima na raiz da branch de parecer. Saída resumida e clock comparativo: [CODEX_RESULTADOS_20261116.json](./evidence/CODEX_RESULTADOS_20261116.json). Os dois novos scripts RED importam runtime inalterado. N4 prova presença do nome no bruto/canônico **antes** de falhar na leitura local; R2 verifica nenhum envio MES antes de testar a interrupção. S1/N3 exercitam uma fronteira sem as proteções de normalização; U1 usa DOM mínimo, não Chromium.

**Não existe ainda uma golden fixture física anonimizada e atestada atravessando as nove views.** Os cenários sintéticos não a substituem. Fixture proposta: L1 snapshot11/r16, L2 snapshot12/r1, L3 snapshot13/r1; cinco fontes; PCBA atual e histórica do mesmo material; quatro Hist Seq sem data; reparos independentes com horário igual; analista diferente do Repair User; evento REPAIR END com nome; 127 referências válidas e 46 lacunas; uma fonte parcial e um FULL anterior. Acrescentar origem concorrente, retorno posterior e nome conflitante. A mesma fixture deve alimentar API, normalizador e DOM nas quatro superfícies críticas, com smoke das demais cinco; teste separado de Chrome sem Home/login/máscara e recuperação após retorno. Sem esse teste, não declarar fechamento integrado.

## 9. Plano por módulos, risco e rollback

| Ordem | Mudança futura, pequena e revisável | Gate de saída | Rollback |
|---|---|---|---|
| 0 | Congelar este SHA, contratos e saídas; obter somente evidência sanitizada de versão/escopo do incidente, sem nova coleta integral. | Causa proposta vinculada a caso e contraprova; PR70 DRAFT. | Nenhuma mutação operacional nesta fase. |
| 1A / P0 | `process_r11`: separar replay local de consultas; preservar bruto e checkpoints com CDP ausente. Não alterar seletor/3012. | R1 GREEN + regressão crash/restart; chamadas MES zero para sementes e uma por lacuna. | Reverter só patch do adapter; manter banco/checkpoints originais. |
| 1B / P0 | `browser/navigation/agent_entry`: estados de sessão e falha pré-lote/por linha. Aproveitar primeiro contexto correto por identidade autorizada; não recuperar login automaticamente. Classificar input ausente e conservar o clique nativo 5s. | NAV e R2 GREEN; login, Home ausente, OPC, rota sem controles, máscara transitória/permanente, falha entre PCBAs; latência saudável equivalente. | Reverter os commits de navegação/estado juntos; nenhuma alteração de guardian/rede. |
| 2 / P0 | `local_sn` + seleção canônica de operadores: ler evento não END LOT preservado, com prova e papel, sem fazê-lo produção. Primeiro corrigir perda de leitura, depois alterar UI. | N4 GREEN; END LOT/REPAIR END distintos; nomes históricos e outra PCBA/linha/fonte negativos. | Reverter projeção/API; bruto continua preservado; sem migração destrutiva. |
| 3 / P1 | Resolver puro de pessoas e adaptação de consumidores, mantendo analista/reparador separados. Preservar origem, nome raw e estado de cobertura. | N1/N3 e paridade SN/Rastreabilidade/Reuso/alertas; nomes ausentes/conflitantes e dois reparos com mesmo horário. | Reverter resolver e adapters de apresentação na mesma unidade; fontes intactas. |
| 4 / P1 | `partial_retry`, normalizadores, `production-evidence`: endurecer linhagem e conflito explícito, com compatibilidade documentada para legado. | R3/S1 GREEN no boundary + casos API/canônico positivos. Não transformar todas as referências históricas em inválidas por revisão diferente. | Reverter validação de leitura/planejamento; conservar versões/capturas imutáveis. |
| 5 / P1 | Uma projeção de eventos para PCBA/material, consumida por SN e Reuso. Timeline única com fonte/papel/horário/estado; nenhum join só por PCBA+código. | U1 GREEN e comparação visual F22 vs proposta; comentários visíveis, nenhum Hist Seq ganha data inventada; aprovação de UX. | Reverter render e projeção juntos; sem apagar histórico. |
| 6 | CI ativo: substituir regex frágeis por status estruturado; acrescentar fixtures cruzadas, limites de request e cenários de sessão. Avaliar freshness 3012 separadamente. | Suites antigas + novas do mesmo SHA; zero alterações em 3028/guardian/rede/SQLite operacional. | Reverter gate novo se inviável, registrando RED; nunca enfraquecer contrato para anunciar sucesso. |
| 7 / bloqueada para esta fase | Somente depois dos gates, planejar canário supervisionado pequeno, backup/rollback e evidência do SHA instalado/servido/revisão. | Usuário valida estado físico, nomes/cobertura e recuperação; nada de coleta integral diagnóstica. | Procedimento supervisionado preexistente e validado, sem copiar/mesclar SQLite manualmente. |

As fases 1A/1B são separadas: resgatar dados confirmados não deve esperar pela correção completa de Chrome. Também não é necessário refatorar todas as fontes para expor nomes já existentes. Cada correção deve publicar teste RED anterior, diff pequeno e GREEN sintético posterior. Esta auditoria **não autoriza nem executa** implantação, merge, pacote, mudança no guardian, rede ou migração de dados.

## 10. Evidências de código permanentes

Todas apontam ao SHA auditado, não à branch mutável:

- [Seleção da aba, presença e readiness](https://github.com/pedrokam700/Central-de-Controle-/blob/fddc75438796cdfcc8a133eb8193d08fa1d9b783/ames/factory-engine/ames/navigation.py#L37-L120).
- [Adapter: CDP antes das sementes, circuito e fase local](https://github.com/pedrokam700/Central-de-Controle-/blob/fddc75438796cdfcc8a133eb8193d08fa1d9b783/ames/agent/process_r11.py#L280-L425).
- [END LOT é subconjunto deliberado do histórico](https://github.com/pedrokam700/Central-de-Controle-/blob/fddc75438796cdfcc8a133eb8193d08fa1d9b783/ames/factory-engine/ames/tela_3022.py#L189-L226).
- [Input, clique e estados estruturados](https://github.com/pedrokam700/Central-de-Controle-/blob/fddc75438796cdfcc8a133eb8193d08fa1d9b783/ames/factory-engine/ames/tela_3022.py#L1025-L1127).
- [Leitura local só da tabela legada](https://github.com/pedrokam700/Central-de-Controle-/blob/fddc75438796cdfcc8a133eb8193d08fa1d9b783/ames/agent/local_sn.py#L93-L120) e [consumidor do Dashboard](https://github.com/pedrokam700/Central-de-Controle-/blob/fddc75438796cdfcc8a133eb8193d08fa1d9b783/ames/agent-client.mjs#L498-L505).
- [Resolvers de nomes divergentes](https://github.com/pedrokam700/Central-de-Controle-/blob/fddc75438796cdfcc8a133eb8193d08fa1d9b783/ames/console-sn-repair-evidence.mjs#L44-L84) e [wrapper da tabela SN](https://github.com/pedrokam700/Central-de-Controle-/blob/fddc75438796cdfcc8a133eb8193d08fa1d9b783/ames/console-fastlane-sn-reuse.mjs#L150-L154).
- [Bypass na decisão de pendência](https://github.com/pedrokam700/Central-de-Controle-/blob/fddc75438796cdfcc8a133eb8193d08fa1d9b783/ames/agent/partial_retry.py#L103-L143).
- [Tabelas redundantes da PCBA](https://github.com/pedrokam700/Central-de-Controle-/blob/fddc75438796cdfcc8a133eb8193d08fa1d9b783/ames/console-reuse-cohorts.mjs#L251-L259).
- [Proteções canônicas existentes](https://github.com/pedrokam700/Central-de-Controle-/blob/fddc75438796cdfcc8a133eb8193d08fa1d9b783/ames/data/canonical.mjs#L5-L36) e [helper de ocorrência sem chave de escopo](https://github.com/pedrokam700/Central-de-Controle-/blob/fddc75438796cdfcc8a133eb8193d08fa1d9b783/ames/data/production-evidence.mjs#L31-L65).
- [Captura/estado final por fonte vs exceção geral](https://github.com/pedrokam700/Central-de-Controle-/blob/fddc75438796cdfcc8a133eb8193d08fa1d9b783/ames/agent/agent_entry.py#L403-L433).
- [Gate ativo PR70](https://github.com/pedrokam700/Central-de-Controle-/blob/fddc75438796cdfcc8a133eb8193d08fa1d9b783/.github/workflows/quality-gate.yml) e [suite 3022 em workflow legado](https://github.com/pedrokam700/Central-de-Controle-/blob/fddc75438796cdfcc8a133eb8193d08fa1d9b783/.github/workflows/ames-integrated-quality.yml#L3-L9).

Registro final: relatório + testes de auditoria somente. **Main, branch de referência, versões históricas, SQLite operacional, guardian, rede e PR #70 DRAFT preservados. Nenhum merge, instalador ou GREEN físico.**
