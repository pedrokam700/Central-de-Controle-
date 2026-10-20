# Issue #41 — PR #42, integração seletiva para gate A-MES conjunto

**Status em 19/10/2026 (BRT):** PR #42 `work/ames-pr35-pr36-integration-20261019`, OPEN/DRAFT, base PR #40 congelada em `8cdab2f2faa3e827af09b671beff26920ce970fa`. **Não foi feito merge ou deploy**. Commit de código seguro `fbbee9b4a90b2c00e7ae492320012bea8f5d2e69`, [Actions 39351013580](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39351013580) **4/4 GREEN** no SHA exato: contratos Linux Node/Python, 9 views em navegador, Windows isolado (inclui SN 3022), Firestore Emulator A→B. O SHA muda ao salvar este documento; validar novamente CI do último HEAD antes de chamar de LAST_SAFE_SHA.

## 1. Topologia e reconciliação — sem merges cegos

| Origem | Status/função | Tratamento na PR #42 |
| --- | --- | --- |
| PR #34 | MERGED na main, manifesto de release fail-closed | **Já contida** na base PR40: `package_available=false`, pacote/hash/URL vazios. Não foi reaplicada |
| PR #33 | DRAFT, base da #35; contém suporte ao SN ao vivo e mais UX | Somente helpers de leitura `console-sn-repair-evidence`, `console-sn-material-bindings`, `console-sn-live-context` e ponte limitada `sn_lookup_context.py` foram selecionados, com teste Python. O restante não foi mergeado automaticamente |
| PR #35 | DRAFT, em cima da #33 | Port seletivo de proveniência de fonte, cadeia de evidências por falha, história PCBA/material, alertas SN, temporalidade e respectivos testes |
| PR #36 | DRAFT, em cima da #35 | `ames/data/production-evidence.mjs` foi portado no estado temporal conservador do HEAD da #36, incluindo guardas sobre mesma PCBA/código/tempo e retorno/prova 3022; testes portados |
| PR #37 → #38 → #40 | #37 base do #38, #38 base do #40; todas DRAFT e dependências já existentes | PR42 é **filha da PR40**, preserva fluxo de A→Firestore→B, revisões/dia 07:00→07:00, 3012 local, dashboards C/D, source_id e rollback existentes. Não reescreveu coletor nem sincronização |

## 2. Arquivos de integração efetivamente alterados na PR #42

- Novos na branch: `ames/data/observation-provenance.mjs`, `ames/console-failure-evidence.mjs`, `ames/console-sn-source-provenance.mjs`, `ames/console-sn-history-detail.mjs`, `ames/console-sn-smart-alerts.mjs`, `ames/console-sn-temporal-proof.mjs`, `ames/console-sn-repair-evidence.mjs`, `ames/console-sn-material-bindings.mjs`, `ames/console-sn-live-context.mjs`, `ames/agent/sn_lookup_context.py` e scripts isolados de regressão.
- Atualizados **somente nesta branch**: `ames/data/production-evidence.mjs`, `ames/console-view.mjs` (módulos dentro das nove views existentes), `ames/console-sn-offline-fastlane.mjs`, `ames/agent/agent_hardened_entry.py` (instala uma vez a ponte pura, sem nova navegação MES), `sw.js` (imports transitivos offline), `.github/workflows/ames-operational-history.yml` (gates na branch da PR42).
- Testes adicionados ao gate de contratos: `ames-failure-occurrence-evidence`, `ames-observation-provenance`, `ames-sn-source-provenance`, `ames-production-evidence-analytics`, `ames-sn-history-detail`, `ames-sn-smart-alerts`, `ames-sn-temporal-proof`, `ames-sn-live-context`, `ames-sn-material-bindings`, `ames-sn-repair-evidence`. Python `agent-sn-lookup-context.test.py` executado no Linux e Windows isolados.
- O gate do primeiro port `5c4bdfcd858277807c2ffdc1e52c5e3a06c589c8` passou 4/4 (39350341945). A extensão completa inicialmente falhou **1/137** porque o teste exigia a ponte pura do agente da PR33; foi adicionada e a execução subsequente `fbbee9b...` passou **4/4**. Nenhum teste foi desativado para alcançar o GREEN.

## 3. Semânticas e limites de evidência preservados

- PCBA principal 2º/3º+ uso **não é a contagem de componentes reutilizados**; não duplicar kit LCD ou material físico por part number.
- `3012`: PCBA igual só cria evidência **candidata**, nunca reparo confirmado da ocorrência; `2114 Manual/Automatic` não representa tipo de reparo.
- A hora da falha MES é distinta da passagem/geração 3022. Prova temporal de produção só com PCBA/código/instante compatíveis, referência real anterior à falha, sem horário/estação fixos inventados. Evidência futura ou conflituosa não comprova associação.
- Fonte parcial, não coletada ou cached **não é ZERO**. Sem coorte completa de PCBAs e materiais com desfechos, taxa populacional e `verified_no_failure` continuam indisponíveis.
- `CPH2859` ≠ `CPH2859V`. Dashboards da PR40 já recusam comparações heterogêneas; a PR42 conserva essa regra.
- Fonte autoritativa local SQLite/agent. B vê réplica **sanitizada** por conta autenticada, não raw local 3074/2114/3022, journal 3012 integral ou controle remoto do MES de A.
- PR33 `failure-group-evidence.mjs`, ordenação por contagem e Top3 já foram **reconciliados posteriormente**. A versão integrada usa renderização direta da tabela e correlação tripla PCBA/código/instante, em vez do observer antigo, sem afirmar cobertura completa. Consultar seção 6 para o estado mais recente.

## 4. Gate físico conjunto para amanhã — ordem segura

**Prerequisito obrigatório:** primeiro usar o roteiro já existente `docs/ames/bloco-3-gate-fisico-linha3-historico-20261019.md` e verificar a candidata congelada PR38 no A/B. Não instalar PR42 em cima do posto A sem pacote de SHA exato, backup/rollback comprovado, conferência de origem/cache/agent version e autorização do operador; CI GREEN é só emulador/Windows isolado. Evitar segundo agente na porta 8765, limpeza de SQLite e redefinição de source_id.

1. **Preflight A:** obter diagnósticos sanitizados, versão frontend SHA, versão agent, autenticação e autoridade de origem, rota OPPO e único launcher/agent. Backup SQLite/outbox e rollback testável, antes de qualquer instalação.
2. **Temporal:** Hoje/último produtivo/Período; Linha 1/2/3 e duas famílias de CPH; produção 07:00→07:00; alternar 9 views e Today→Ontem→Today sem fazer extração automática nem sobrepor snapshots; horário de turno separado.
3. **Cinco fontes e SN:** comparar casos reais autorizados da 3028, 3074, 2114, 3022, 3012; verificar PN/material SN e PCBAs anteriores, múltiplas falhas, registros Y/N, hora MES vs passagem 3022, 3012 candidata, uso próprio PCBA, vínculos LCD e todos os painéis de histórico/fonte/alertas da PR42. Fonte ausente = desconhecido, não zero.
4. **B sem MES:** verificar revisão sanitizada da mesma `line_id/source_id/snapshot_id/revision`, acesso autenticado, Today e revisões imutáveis antigas, conflitos, ausência de acesso ao localhost de A. Linha 2 continua válida; Linha 1 não coletada não gera zero. Uma consulta avançada isolada em B não modifica Today.
5. **Offline e UX:** após cache/bootstrap online válido, navegação offline e retorno à internet sem perda, cache transitivo de módulos PR42, PT/EN, mobile, nove views, segurança de valores SN/html, histórico SN e drilldowns por revisão.
6. **Métricas e recuperação:** coletar latências p50/p95 somente com amostras e relógios confiáveis; restauração real e replay de revisão AT quando houver evento autêntico; sem simular reparo ou inseri-lo em Firebase de produção.

**Se qualquer passo produzir origem conflitante, regressão 3028/3074/2114/3022/3012, erro do agente, perda de SQLite, referência temporal sem prova ou vazamento entre contas, status RED/PENDING e rollback.** Não declarar Factory GREEN, merger/squash/cherry-pick em `main` ou deploy de Firestore/Hosting/Auth antes de evidência e aprovação explícita.

## 5. Continuação sem refazer

Ao retomar, conferir HEAD remoto e Actions exato da PR #42, PR38 PR40 e Issue #41. Se o CI do documento estiver GREEN, registrar LAST_SAFE_SHA no comentário da PR42/Issue41. Não recriar branch ou port já feito. Próxima ação real: coletar evidência física sanitizada da fábrica e revalidar regressões; só então decidir a promoção ordenada PR37→38→40→42, sem merge automático ou instalação por esta documentação.


## 6. Reconciliação final de diferenças e dependências (checkpoint 19/10/2026)

**Pré-checkpoint de código/empacotamento:** `9b15050fcd09c65a50cf08b4666804adfd83d97d`, [Actions 39354472800](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39354472800) **cinco jobs GREEN: contratos, navegador, Windows isolado, Firestore Emulator e build CLEAN de ZIP exato**. O SHA **final** será o commit que salvar esta seção; confirmar seus próprios cinco jobs e artefato, e atualizar LAST_SAFE_SHA na PR #42/Issue #41 **sem novo commit após a geração do ZIP**.

### 6.1. Tabela final de cobertura — sem aplicar branches antigas inteiras

| PR / origem | Estado de integração | Decisão técnica e prova |
| --- | --- | --- |
| **#27** | Já MERGED na `main`, portanto herdada | Não reaplicar o antigo onboarding/bootstrap ou alterar porta 8765 |
| **#30** | CLOSED, não merged | **Não cherry-pick**. Conceitos de pareamento, atualização e caminho Windows cobertos pelos códigos da base #37/#38 e agora por gates extras `ames-agent-pairing`, `ames-workstation-bootstrap`, `agent-package-contract`, `agent-origin-policy`; não reabrir candidato antigo e seu runtime |
| **#32** | OPEN/DRAFT, não merged | **Não duplicar** a UI antiga `automation-support` no Monitor: saúde/origem/cobertura/backup e runtime já são exibidos em `console-data-health.mjs` e `console-monitor-runtime.mjs`. A leitura detalhada adicional do histórico de jobs da #32 não foi portada; é melhoria opcional que exigiria revisão de pareamento/permissões e UX própria, não dependência do gate #42 |
| **#33** | Port seletivo completo do escopo compatível, não merge integral | Falhas agrupadas agora suportam os 4 modos `sortFailureGroups`, mais contagens **mínimas observadas** de PCBA principal/item físico e relações de falha com tripla PCBA/código/Defect Time. Última ocorrência exibida no fuso de fábrica, técnico preservado na tabela de ocorrências. `Top 3` mantém o ranking ao abrir detalhe sem alterar `store.context().defect`. Alertas SN usam sumário visível e prova recolhida. `F1_9999` segue bruto, sem hardcode. SN context, repair user/bindings e ponte Python já estão nesta branch. Não portamos a mutação extra do DOM dentro de `console-failure-process`: coluna de evidências calculada na própria tabela, sem MutationObserver duplicado |
| **#34** | MERGED na `main`; base já correta | `ames/releases/latest/release.json`: `package_available=false` e `package_name`, `sha256`, `download_url` vazios. Não sobrescrever manifesto e não anunciar candidato como release pública |
| **#35** | UX e proveniência importadas seletivamente | Falhas com cadeia de evidências, SN live provenance 3028/3074/2114/3022/3012, PCBA/material/PN e 2114/3012/3022 como fontes distintas, sinais de alerta e provas temporais, PT/EN, cache offline; módulos, contratos e navegador executados na PR42 |
| **#36** | Guardas temporais portadas | `data/production-evidence.mjs` fail-closed; mesmo PCBA/código/instante, referência 3022 real anterior à falha, nenhuma associação por chave isolada ou mesma placa; casos negativos e antigos de reparo/retorno testados |
| **#37→#38→#40** | Encadeadas como **base existente** da #42 | Identidade e dia operacional, revisões imutáveis, five-source local, Firestore sanitizado A→B, taxas C/D conservadoras e proteção CPH2859 ≠ CPH2859V; não fazer novos merges/commits nessas PRs |

### 6.2. Problema grave prevenido pelo gate de pacote

O teste de contrato que não era executado no CI antigo detectou que `ames/agent/update_candidate.py` não listava **quatro imports ativos** exigidos por `agent_hardened_entry.py` e sua cadeia: `repair_3012_capture.py`, `repair_association.py`, `source_capture.py`, `sn_lookup_context.py`. Isso quebraria um pacote do atualizador sem que o teste genérico de interface percebesse. A lista `FILES` foi corrigida apenas na branch PR42; os builders `build-agent-candidate.py` e `build-r12-migration-bundle.py` consomem essa lista única. O CLEAN integrado copia todos os `.py` e verifica manifestos/hashes e ausência de arquivos privados. A CI agora inclui `agent-package-contract.test.py` tanto no Linux como Windows, além de origem, bootstrap, pareamento e manutenção.

### 6.3. Evidências conjuntas e cobertura não mascarada

- Regressões diretas de UI Playwright: navegar 9 views preservando o mesmo período; alternar Today/último dia; 7/30 dias; clicar grupos com `1+` e `—` e trocar ordenação; abrir um item do Top3 sem colapsar o ranking compartilhado; Consulta por SN ao vivo monta **proveniência recolhida**, histórico detalhado, prova temporal e alertas no mesmo resultado sem coletar MES; SN salva e leitura de metadados não invocam acesso ao posto remoto.
- Contratos Node/Python: códigos F1 originais atravessam transformação e SQLite sem alteração; SN/PCBA/material da PR33/35/36; correlação temporal indevida barrada; formato de reuso do novo snapshot (`2º uso`, `3º uso`) aceito sem assumir que falha representa uso; todos os scripts de performance, origem e arquivo de atualização.
- Windows isolado: histórico SQLite, 3012, source capture, SN 3022, pacote de dependências e origem; emulador Firestore autentica A/B, preserva revisões e Trends C/D sem controlar MES do A.
- **Distribuição para amanhã:** a branch PR42 gera um ZIP `AMES-PR42-<SHA>` automaticamente **somente se os quatro gates passarem**, com `CANDIDATE_MANIFEST.json` e ZIP hash testados. Artefato GitHub Actions armazenado por sete dias. Não é deploy, publicação em Firebase ou aprovação para instalação na fábrica. Não executar dois agentes simultaneamente na porta 8765; usar apenas ambiente de teste/instalação independente, após preflight PR38 e backup/rollback autorizados.

### 6.4. Limitações que seguem abertas por exigirem prova externa

1. **Gate físico PR38 A/B** não foi executado nesta conversa, nem a prova PR42 pós-baseline. Exigem operador, origem autorizada, backup/rollback e testes com 3028/3074/2114/3022/3012 reais. Uma falha na prova física mantém todos os merges BLOQUEADOS.
2. **Coorte populacional e causalidade** de componentes/PCBAs reutilizados, ausência de defeitos e retenção 14 dias/12 meses ainda não podem ser certificados sem dados, amostragem e monitoramento reais. O Console mostra apenas observado/indisponível.
3. **PR32 histórico extra de jobs** não duplicado. **PR30** encerrada não foi reaberta; funcionalidades antigas não prevalecem sobre segurança/testes mais novos. Isso é exclusão intencional, não falha de cherry-pick.
4. Não há merge ou deploy para `main`, Firebase produção, Rules/Hosting/Auth, agente/SQLite/outbox físico ou fonte `source_id`. A candidata integrada da PR42 permanece **DRAFT**, independente da instalação antiga.

**Retomada:** ler HEAD e CI da PR42 e a seção 6 antes de qualquer trabalho. Se cinco jobs GREEN no SHA final, atualizar descrição PR42 + Issue41 com link do artefato de mesmo SHA; preparar somente validação física autorizada, não inventar novos blocos nem reabrir commits já testados.
