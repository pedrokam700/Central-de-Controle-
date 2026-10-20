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
- PR33 `failure-group-evidence.mjs` e alterações amplas em agrupamento/filtro de falhas e parte do motor R12 **não foram portadas/validadas como equivalentes**: fora do diff seletivo. Não alegar paridade completa das branches originais até reconciliar cada item. 

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

Ao retomar, conferir HEAD remoto e Actions exato da PR #42, PR38 PR40 e Issue #41. Se o CI do documento estiver GREEN, registrar LAST_SAFE_SHA no comentário da PR42/Issue41. Não recriar branch ou port já feito. Próxima ação real: coletar evidência física sanitizada da fábrica e revalidar regressões; só então decidir port adicional de módulos exclusivos #33 e ordem de merge PR37→38→40→42 conforme dependências/autorizações.
