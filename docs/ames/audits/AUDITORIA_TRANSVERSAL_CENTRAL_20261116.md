# AUDITORIA TRANSVERSAL — CENTRAL / A-MES — 16/11/2026

**Estado: REVISÃO ESTRUTURAL / SEM LIBERAÇÃO DE INSTALADOR.** Evidências físicas continuam pendentes. Não chamar PR #70, 3022, reuso ou nomes históricos de GREEN de fábrica.

## 0. Fonte, baseline e alcance
- Repo oficial: `pedrokam700/Central-de-Controle-`; `main` `b283b1764432f5d90486d38a7553b30542a5c118` (0.5.39, não alterar).
- Branch ativa `work/ames-3012-reuso-auditado-20261106`; HEAD inspecionado `eedacc65445dea9967a92085777b878c1ee9c123`, PR #70 OPEN/DRAFT. 60 commits entre `f22e344` e esse HEAD. Compare por arquivo, e não por tamanho de ZIP: `ames/console-reuse-cohorts.mjs` mudou 225 linhas; `console-sn-repair-evidence.mjs` 46; `console-sn-history-detail.mjs` 34; `tela_3022.py` 38; `process_r11.py` 22; módulos JS/Python com outros domínios não são independentes.
- Critérios permanentes: `docs/ames/ACTIVE_ARCHITECTURE_MAP.md`, `docs/ames/REQUISITO_CANONICO_CONSOLE_MES_9_VIEWS.md`, `docs/ames/handoffs/HANDOFF_CANONICO_3022_R12_20261020.md`. NOVE telas; uma Central, agente, SQLite e scheduler; 3028 07:00→07:00, 3074 vínculos, 2114 desmontagem/histórico, 3022 processo/operator, 3012 reparos e horários antigos. Falha ≠ nova montagem; parcial ≠ zero; associação ≠ autoria/causa.
- Comparação histórica mandatória: versões de campo C1B13D, F22E344, F78CE7CB, 60ECEF60, 16980FB5, 7E49CC45, EEDACC65. Não presumir que `main` é o pacote de fábrica. SHA instalado, SHA do módulo servido e snapshot devem ser verificados separadamente quando houver janela supervisionada.

## 1. Evidência fornecida em 16/11 (5 prints)
1. Rastreabilidade TAN10101: após 4s job registra `Aba principal do A-MES não encontrada no Chrome dedicado`, erro de execução com 3074/2114/3022 em `Aguardando`. Agente `127.0.0.1:8765` conectado NÃO equivale a navegador CDP/A-MES autenticado. Problema ocorre antes do coletor 3022.
2. O próprio Console propõe `Completo` com checkbox de recuperação seletiva marcado; snapshots exibidos para L1, L2, L3 têm revisões diferentes. O mecanismo precisa de um contrato inequívoco `mode/repair_partials/source_id/snapshot_id/revision/line/time-range`, não só estado do checkbox.
3. Falhas por horário: **127/173** ocorrências com referência produtiva 3022, **46 pendentes**; lista de L2/L3 `3022 sem contextos carregados para a linha/revisão`. Isso é cobertura/correlação incompleta; não inferir ausência física de processo nem preencher com horário de registro 3028.
4. Dashboard componente com duas PCBAs, registros 2114 `Hist Seq 0..3` sem `defect_time` renderizados como `—`; 3028 atual datada. O mesmo drill-down inclui **tabela adicional** com cinco reparos 3012, dos quais quatro antigos apenas BRM00079/BRM00102/BRM00093 e o reparo recente com nome `Jamesson Domingos`. A apresentação repetiu históricos e separou tabela sem solicitação. `Hist Seq` 2114 não corresponde automaticamente ao registro 3012, mesmo com código igual.
5. O operador relata regressão sucessiva: em versões anteriores, alguns operadores históricos apareciam com nome; alterações de Consulta por SN coincidiram com mudança de reuso/Rastreabilidade e, mais tarde, 3022. A coincidência temporal exige revisão de diffs; NÃO prova causalidade entre módulos isolados.

## 2. Findings de código comprovados (não são hipóteses de causalidade física)

### CRÍTICO A — CDP/navigation pronta ≠ página A-MES pronta
- `ames/factory-engine/ames/navigation.py:_main_page` (linhas 54–76): apenas procura URL `/asymes/home` ou IP literal `172.29.185.215`. Quando Home falta, lança antes de coletar. O substituto `u.replace("asymes","asymes")` não faz nada.
- `AmesNavigation._has_visible` (37–44) usa `locator.count()`; isso NÃO comprova visibilidade. `_wait_view` (78–92) pode aceitar o seletor sem exigir a rota correta, enquanto `ensure_main_view("3022",None)` aceita somente URL da rota sem verificar se o ExtJS terminou de renderizar. Isso dá falsas transições `pronto`.
- `ames/factory-engine/ames/browser.py` conecta no primeiro contexto CDP; `agent_entry._run_deep_trace_job` marca execução RUNNING antes da navegação, e qualquer exceção não encapsulada se converte em ERROR geral (`agent_entry.py` ~432), mesmo quando se trata de aba/sessão temporariamente indisponível. A falha não é de uma PCBA nem equivale a zero 3022.
- **Correção arquitetural P0:** uma máquina de estados de sessão `CDP_DISCONNECTED / CONTEXT_READY / AUTH_REQUIRED / HOME_MISSING / VIEW_LOADING / VIEW_READY / VIEW_BLOCKED`, preflight somente leitura antes de usar o MES. Status recuperável com ação clara, jamais reativar uma aba artificialmente ou iniciar segundo agente. Espera limitada e somente ao necessário, sem sleeps fixos por PCBA. Testes reais com DOM ExtJS mascarado/sem Home e inicialização do Chrome, além do mock sintético.

### CRÍTICO B — Identidade do profissional espalhada e dependente da consulta atual
- `ames/console-sn-repair-evidence.mjs` define `normalize3022OperatorRows`, `provenRepairUserName`, `projectRepairTechnicianNames`. Identifica nome estritamente pela **mesma PCBA e mesmo ID** e fontes carregadas em `result.trace_3022`/`local_snapshot.process_events`; se os registros 3022 antigos não foram carregados/projetados, retorna apenas BRM, mesmo quando o nome EXISTE na tela MES. `a6900-technician.mjs` mantém função separada baseada em estação/janela.
- `ames/console-sn-history-detail.mjs`, `console-sn-smart-alerts.mjs`, `console-reuse-cohorts.mjs` têm paths distintos de resolução e de exibição. Parte privilegia o operador A6900; outra `Repair User` 3012. **Papéis diferentes:** técnico que registrou falha, operador observado A6900, usuário que efetuou o reparo 3012. Não chamar todos genericamente de mesmo técnico.
- **Correção P0:** um único `operator/repair evidence resolver` read-only com retorno `{role,person_name,operator_id,pcba_sn,source_view,mes_event_time,provenance,status:proven|candidate|unknown,reason}`. Cada componente deve consumir o mesmo resultado. Recuperar do SQLite local 3022 por PCBA histórica/operador antes de assumir indisponibilidade. NUNCA mapa global BRM→nome, não cruzar PCs nem linhas sem identidade, não atribuir por similaridade de relógio.
- Teste de aceitação: mesmo BRM histórico presente com nome nas linhas 3022 armazenadas deve renderizar o MESMO nome em Consulta SN, Rastreabilidade, Dashboard e alertas; se nome ausente, BRM com mensagem **específica de cobertura**. Nome atual não pode contaminar quatro reparos antigos.

### ALTO C — Múltiplas projeções e tabelas de um mesmo histórico
- `ames/console-reuse-cohorts.mjs`: `renderBoardComparisonTable` monta 2114/3028; `data-reuse-3012-history` recebe nova tabela via `wireReuse3012Columns`; `data-board-2114-timeline` adiciona outro histórico 2114 no mesmo detalhe. Exatamente a duplicação apontada pelo operador.
- `matchCached3012Repairs` filtra por PCBA + código exato como CANDIDATO; ligação a `Hist Seq` não é comprovada. A saída não deve fabricar `defect_time` da 2114 nem copiar técnico/comment de um reparo para qualquer outra falha da mesma família.
- **Correção P1:** uma única timeline *de eventos* por PCBA (2114/3028/3012/3022/3074 em uma projeção canônica) com colunas `período/fonte/falha/ação/técnico/comentário/estado de prova`. Eventos independentes continuam linhas independentes; `Hist Seq` sem data aparece com `sem horário 2114`, sem associação inventada. Não criar outra planilha, hover ou `+N` para esconder valor obrigatório. A UI pode agrupar eventos comprovadamente vinculados sem duplicá-los. Material SN usa a mesma projeção com vínculo 3074 explícito.

### ALTO D — Cobertura e revisão de fonte x operação
- `ames/data/production-evidence.mjs:productionEvidenceGap` retorna `3022 sem contextos carregados para a linha/revisão` quando `contexts.length===0`. Prints mostram lacunas L2/L3 com 46/173 ocorrências sem geração comprovada.
- `ames/agent/agent_entry.py` combina coletas por linhas, versões de payload e reusos salvos. Revisão, origem, linha, intervalo MES e filtros precisam ser chave estável de todos os cruzamentos. Não substituir revisão FULL verificada por parcial posterior, não misturar L1 e L3; não inferir zero de contexto vazio.
- **Correção P1:** contrato de `coverage` por fonte/linha/snapshot/revision com estados `not_requested, not_loaded, partial, source_error, confirmed_empty, confirmed`, causas `no_chrome, no_mes_view, no_raw_rows, time_mismatch, unmatched_occurrence`. Mesmos números em Falhas do Dia, Rastreabilidade e Processos.

### ALTO E — Coleta parcial e recuperabilidade não são um único contrato
- `ames/agent/process_r11.py` entra no CDP e `nav.ensure_3022()` antes do loop de PCBA; um erro nessa preparação não recebe classificação de erro por peça. Já os bloqueios de `View` dentro do loop podem finalizar `partial`/pular após dois casos.
- `agent_entry.py` opera `repair_partials` + capturas de 3074/2114/3022 e, em exceções gerais, finaliza job `error`; o front mostra `Aguardando`. Não confundir `job failed` com `source absent`.
- **Correção P0:** fase de pré-condições do MES separada de `begin job`, retomada automática somente de lacunas com prova de origem/escopo; preservar checkpoint de cada PCBA, sem reexecutar 3028/3074/2114/3012 já comprovados. Performance com budget de latência real por fase, sem timeout fixo extra por PCBA; medir p50/p95 e quantidade de requisições reais.

### ALTO F — Gates CI não cobrem a experiência integrada na fábrica
- Atual Central Quality Gate aprova testes sintéticos (Node, Python harness, Firestore, 9-view UI). Os pacotes que geraram múltiplas regressões passaram nesses gates. Falta um golden fixture end-to-end que use `3028+3074+2114+3022+3012` COMPLETOS, com L1/L2/L3, Hist Seq sem data, três reparos antigos com nomes 3022 e um recente, mesmo defeito repetido, sem cruzar autoria nem timestamp.
- **Correção P0:** fixtures anonimizadas e verificadas, testando os MESMOS fatos nas 9 views e no Dashboard de reuso; teste de regressão visual/DOM com tabela ÚNICA + nomes/técnicos/comentários visíveis; versão do JS em execução deve coincidir com SHA do agente/manifesto. O teste de navegação real/fake precisa cobrir CDP sem Home, login, página mascarada e recuperação depois que o A-MES volta.
- **Bloqueador de release:** alteração num módulo de nomes ou timeline exige suíte cruzada Consulta SN + Rastreabilidade + Reuso + Processo + alertas. Alteração em coletor exige baseline de latência contra o ZIP de referência. Um CI GREEN sintético **não** autoriza GREEN físico.

## 3. Contratos que devem ser unificados ANTES de outra refatoração

| Campo ou conceito | Autoridade | Consumidor | Gate negativo |
|---|---|---|---|
| Falha/instante da falha | 3028 atual, 2114 histórico quando presente | Todas as timelines | 2114 sem data nunca recebe horário de 3012 |
| Material SN / vínculo | 3074 | reuso, alertas, Rastreabilidade | mesmo PN/tipo não prova mesma peça física |
| Reparo, Repair User e comentário | 3012 | Consulta SN, alertas, Dashboard | User 3012 não é automaticamente falhador A6900 |
| Passagem, operador, Tran User e hora de produção | 3022 | mesmos consumidores + FPY horário | 127/173 não vira 173/173 nem horário 3028 |
| Contagem de ciclos físicos de montagem | 3074 | PCBA/reuso/material | 7 ciclos conhecidos não prova 7º uso no instante da falha |
| Identidade da fonte | `source_id+line+snapshot_id+snapshot_revision+period` | todas | revisão/linha diferente não compõe evento exato |
| Estado do job | scheduler/agente | progresso, recovery | naveg. CDP sem Home não equivale a PCBA sem dados |

## 4. Plano de estabilização — execução pequena, reversível e por gates
**Fase 0 — congelar e observar:** PR70 DRAFT; manter todas as pastas, SQLite, credenciais, guardian, rotas e `main` intactos. Não gerar ZIP. Fixar baseline F22E344 e o último SHA usado fisicamente; auditoria de diffs dos módulos antes de código. Registrar a matriz anterior como contrato de aceite.
**Fase 1 — domínio/proveniência:** criar modelo read-only `EvidenceEvent`/resolver único; testes com 3+ reparos distintos, dois com mesmo relógio, operador BRM histórico, linha distinta, horário ausente. Não alterar motor de coleta.
**Fase 2 — consultas e telas:** usar MESMO resolver para quatro consumidores; preservar layout original e UMA timeline navegável, sem hover-only/planilha duplicada. Comparar screenshots baseline.
**Fase 3 — Chrome e 3022:** máquina de estados CDP/ExtJS; preflight detecta Home e view real; erros recuperáveis, checkpoint e retomada; manter um clique normal/rápido em cenário saudável. Testar navegador ausente e x-mask transiente/permanente.
**Fase 4 — revisão e cobertura:** identidade por fonte/linha/revisão, 3022 127/173 deve permanecer 127/173 até prova real; testes negativos contra mistura de snapshots.
**Fase 5 — canário de fábrica:** pacote integrado só após todos os testes do mesmo SHA; rollback e backup comprovados; uma PCBA histórica + uma atual + uma com componente 2º uso; testar nomes/horários/comentários, coleta seletiva rápida, tela responsiva, parcial recuperável. Somente usuário atesta GREEN físico.

## 5. O que NÃO fazer
- Não realizar downgrade/merge `main` às cegas, não restaurar ZIP antigo apagando dados recentes.
- Não inventar nome a partir de BRM sem 3022 ou nome explícito 3012; não fazer fallback de horário 3028 para `production`.
- Não aumentar timeout por PCBA de 5s para 12s nem inserir um segundo `trial=True` sem dado físico/latência.
- Não acrescentar outra tabela/perfil/filtro ao usuário para encobrir a falta de projeção única.
- Não atribuir causalidade a uma edição pelo simples fato de ter ocorrido antes do erro; comparar exato SHA e evidência da origem.

## 6. Status e encaminhamento
**Esta auditoria não implementa as correções estruturais.** Ela delimita o que está comprovado, o que permanece hipótese e as travas de aceite. A revisão independente deve contestar os achados lendo código e handoffs, produzir testes RED antes de mudar domínio ou UI, só depois propor PR pequeno e isolado para uma fase. Ver `CODEX_REVISAO_INDEPENDENTE_20261116.md`.

**Continuidade:** usar este documento e os handoffs físicos PR70, sem substituir o mapa canônico de 9 telas.
