# Handoff operacional consolidado — Central + A-MES — 12/11/2026

> **Checkpoint de continuidade, não homologação de produção.** Antes de agir, consultar a PR #70 e o SHA remoto exato. O handoff antigo `AMES_HANDOFF.md` (15/10), `docs/ames/HANDOFF_MESTRE.md` (08/10) e `docs/ames/ESTADO_ATUAL.json` (14/10) são registros históricos e não identificam mais a branch de execução atual.

## Fonte de verdade / versões

- Repositório: `pedrokam700/Central-de-Controle-`.
- `main` oficial em 12/11: `b283b1764432f5d90486d38a7553b30542a5c118` — release 0.5.39 (não substituir sem homologação).
- **PR #70 DRAFT**, branch `work/ames-3012-reuso-auditado-20261106`, baseada na PR #69 (`work/ames-pilot-integration-57-66-20261027`). SHA funcional de referência ANTES DESTE HANDOFF: `f22e344bd2947bea6856076f0c5d8c9637c19376`.
- PR #69, PR #64 e demais PRs históricas não devem ser silenciosamente mergeadas, reescritas ou promovidas. PR #64 (Issue #57) conserva escopo separado de updater/guardian.
- Gate de `f22e344`: workflow **A-MES PR70 Safe Installer Gate** run `43210024172`, 2 jobs SUCCESS (instalação simulada Ubuntu/Windows), artifact `central-ames-pr70-qa-f22e344...`. Testes focalizados de polling e motor Python documentados na discussão da PR #70. **O Central Quality Gate completo no SHA exato não foi comprovado por esse workflow.**
- O empacotador `scripts/build-integrated-candidate.py` gera frontend/Service Worker e identidade SHA do pacote a partir do commit exato. Sua saída precisa ser verificada por manifestos e SHA, sem inferir conteúdo por tamanho do ZIP.
- Pacotes relevantes: `c1b13d` (11/11, troca supervisionada), `56af000` (12/11, recuperação 2114), `f22e344` (12/11, redução de carga). Os dois últimos são avanços na mesma linhagem. Não instalar candidatos antigos apenas porque estão na Library.

## Mapa ativo e contrato de 9 views

A arquitetura ativa está em `docs/ames/ACTIVE_ARCHITECTURE_MAP.md`; paridade em `docs/ames/REQUISITO_CANONICO_CONSOLE_MES_9_VIEWS.md`.

- Shell `index.html`/`app.js`; Console nativo em `ames/console-view.mjs` e `ames/console-specialized-views.mjs`; integração local `ames/integration-session.mjs`, `ames/agent-client.mjs`; sincronização sanitizada `ames/sync.mjs`/`ames/firebase-sync.mjs`; `state.ames` único.
- Agente em `127.0.0.1:8765`: `ames/agent/agent_hardened_entry.py` e `agent.py`; um SQLite operacional (`ames/agent/store.py`), scheduler FIFO serial (`mes_scheduler.py`); Chrome/CDP dedicado, login MES humano; `ames/factory-engine/` é motor de referência/regressão, não segundo serviço.
- Nove telas inseparáveis: **Monitoramento; Top 3 & FPY; Falhas; Consulta por SN; Rastreabilidade; Dashboards de reuso; Processo/3022 & AT; Base local; CORA conhecimento.**
- Linha 1 = TAN10101, Linha 2 = TAN10102, Linha 3 = TAN10103; KPI por linha e escopo, sem mistura. Um seletor de linha é preferível a três blocos concorrentes.
- Fontes: **3028** ocorrências/FPY no dia operacional 07:00→07:00; **3074** vínculos físicos/material; **2114** histórico PCBA/AT; **3022** passagens/horário real; **3012** reparo/comentário/Repair Time e históricos antigos.
- A ordem lógica de enriquecimento é 3028 → 3074 → 2114 → 3022 e/ou 3012 quando explicitamente selecionada, com evidências persistidas antes da publicação. `Completo` é 3074+2114+3022; `Reuso` é 3074+2114; `Horários antigos` executa 3012 sem refazer o lote; Consulta por SN mantém 3012 própria por padrão.
- Reuso de PCBA e de componentes são universos distintos; `unknown`/parcial/fonte não programada **não são zero**. Vínculos históricos podem ser apresentados com rótulo, jamais promovidos a montagem atual sem Y comprovado.
- Alertas da Consulta por SN devem separar falha atual/anterior, PCBA, material, técnico da falha **3022 A6900**, Repair User da **3012**, horários e comentários com proveniência. Igualdade/família/correlação é indício, não causa raiz.
- Dia anterior operacional não substitui Hoje, histórico avançado não toma a posição do dia atual, e revisões FULL comprovadas prevalecem sobre parciais do mesmo dia; origem compartilhada não pode sobrescrever revisão local exata.

## Achados confirmados em campo e em código

1. **3012, 10/11:** screenshot da TAN10103 registrou job `a164a2ecd5c1`, 3074 27/27, 2114 28/28, 3022 27/27, 3012 28/28 com cobertura completa daquele escopo, em 06m06s. O print não mostra SHA instalado; não extrapolar GREEN para outras linhas/datas/candidatos.
2. **Reuso, 11/11:** job TAN10103 mostrou 37/37 3074, 46/46 2114, 37/37 3022, 46/46 3012, mas 37 PCBAs indeterminadas por `LOCAL_INSIGHT_BUILD_FAILED_KEYERROR_CLASSIFICAR_HISTORICOS_L86`. Corrigido em código `052a66e`: relação 2114 `INDETERMINADA` não estava declarada no contador. Deve reprojetar do SQLite já salvo, **sem recolher MES**; gate físico ainda pendente. Linha 2 tinha 30 primeiro uso, 13 segundo+, 4 indeterminadas (outro escopo), e não deve regredir.
3. **Instalador, 11/11:** `c1b13d` mantém `01_TROCAR.bat` supervisionado, prepara dependências antes de parar, faz backup verificado e transferência de SQLite/config/token, mantém pasta antiga e tenta rollback conhecido; teste sintético/Windows não equivale à troca fabril. Outbox do navegador precisa estar sincronizada pelo operador.
4. **Interrupção 12/11:** TAN10101 teve 3074 95/95, 2114 95/95 PARTIAL, 3022 95/95, 3012 95/95. TAN10103 teve 3074 33/33 PARTIAL, job ERROR após ~1h27, `Nenhuma aba válida da AWIP2114 foi encontrada`. `95/95` ou `33/33` é progresso, não certificado de cobertura. `56af000` introduz pin de view OPC validada, recuperação de navegação única e limitada, falha segura para ambiguidade/Shift, e adia a abertura 2114 até 3074 ser concluída.
5. **Travamento 12/11:** relato de retomada aparente ao abrir A-MES em outro navegador não demonstra causa. Auditoria encontrou causas concretas de custo de UI: polling ~850ms disparava `sync.capture()`, redraw de dashboards e leitura pesada SQLite ~2,2s. `f22e344` distingue `job-poll` de `job-finished`, remove capture/redraw pesado em polling, limita repaint visível ~1,6s e releitura durante job a ~15s, preservando refresh terminal. Teste Node focal passou; **resultado físico permanece pendente**.
6. **Linha compartilhada:** o rótulo observado na Linha 1 ainda não determina se o operador selecionou cabeçalho Firebase antigo ou revisão local. Verificar `line_id`, período, source/origin e snapshot/revision lado a lado **somente leitura** antes de alterar identidade, apagar outbox ou republicar.
7. **Tamanho de ZIP:** comparação `c1b13d`→`56af000` registrou 343→344 entradas, nenhuma removida; apesar de comprimir ~2.401 bytes melhor, o conteúdo não comprimido cresceu ~5.219 bytes. Não alegar downgrade com base no tamanho, mas sempre auditar manifestos, hashes e regressões reais.

## Gates e próxima execução segura

**Estado:** PR70 DRAFT; laboratório/CI parcial PASS onde explicitado; **fábrica RED/PENDENTE para o HEAD recente**. Nunca alterar `main`/Pages/Release/Firebase Rules, desativar guardian desconhecido, instalar sobre a pasta ativa, limpar SQLite/WAL/token/source_id/outbox, ou iniciar coleta grande como diagnóstico.

**Ordem de trabalho**:
1. Verificar HEAD PR70 e jobs de CI do SHA exato (não apenas do pai); rodar Quality Gate completo e regressões direcionadas de 9 views, scheduler, fontes, polling e pacote. O safe-installer gate isolado não cobre a Central inteira.
2. Verificar que pacote CLEAN é integrado (não mini-app), contém 01_TROCAR, 08_PREPARAR_REDE, backups/rollback, SW/cache SHA, todos os módulos e sem arquivos operacionais/secretos. Nunca trocar candidato com jobs/sync/guardian em conflito.
3. No posto com autorização e sem jobs ativos, inventário/read-only de versão, fila, rota, origem e revisões; backup/transferência assistida somente após sync comprovada. Não solicitar ao operador repetição da coleta de 95/33/37 PCBAs.
4. **Teste físico mínimo dirigido:** uma linha, poucas PCBAs, entrada 2114/Shift e confirmação da persistência 3074; observar progresso verdadeiro, latência e ausência de bloqueio por aba OPC. Confirmar UI responsiva sem necessidade de abrir outro navegador.
5. Reprocessar projeção de reuso já salva da TAN10103 e confirmar KPIs/drill-downs sem nova coleta; comparar TAN10102 com o checkpoint 30/13/4. Conferir Consulta SN com A6900 e comentário 3012 do histórico existente.
6. Auditar separadamente "compartilhada" Linha 1: origem do snapshot e seleção Hoje/Último dia/Avançado. Não redefinir source_id nem forçar publicação como solução.
7. Só depois considerar teste de produção maior, instalação em mais PCs e promoção; gate verde exige evidência fabril da versão instalada e das 9 views.

## Documentação complementar em ordem de prioridade

- `docs/ames/handoffs/PR70_UNKNOWN_2114_CLASSIFIER_20261111.md`
- `docs/ames/handoffs/PR70_INSTALADOR_SEGURO_20261111.md`
- `docs/ames/handoffs/PR70_3022_3012_TECNICOS_ALERTAS_20261111.md`
- `docs/ames/handoffs/PR70_3012_MINUTE_BOUNDARY_20261111.md`
- `docs/ames/handoffs/PR70_3022_TENDENCIAS_QUALIDADE_20261110.md`
- `docs/ames/handoffs/PR70_3012_BOUNDARY_EVIDENCE_20261109.md`
- `docs/ames/handoffs/PR69_3012_REUSO_20261106.md`
- `docs/ames/ACTIVE_ARCHITECTURE_MAP.md`
- `docs/ames/REQUISITO_CANONICO_CONSOLE_MES_9_VIEWS.md`

**Regra de continuidade:** nunca confundir versão instalada no posto, candidato da PR e release pública; não reproduzir ou "corrigir" problema antigo sem confrontar o HEAD atual e sua evidência.
