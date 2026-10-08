# V2 — status de implementação

Continuidade: Issue #21, PR draft #22, branch `v2/native-fusion`.

## Checkpoint atual — somente Produto/CPH nativo

Dashboard `2820bc17858d45b777cf5554c94f1df6d31e4d36` revisado e aprovado pelo usuário **para continuidade de desenvolvimento**. HEAD local/remoto e PR #22 reconciliados nesse SHA antes deste corte. Essa aprovação não é validação fabril. Novo shell: `15.1.13.43`.

- `ames/data/product.mjs` consulta o store existente com a chave canônica exata de `activeData().code`. `CPH2859`, `CPH2859V`, prefixos e valores vazios não se confundem. A consulta retorna partições por linha, sem KPI total entre linhas.
- `ames/product-view.mjs` incorpora ocorrências na Visão Geral da página Produto, sem nova aba MES/página/overlay. Cada linha apresenta origem, coleta, snapshot e cobertura parcial; contagens do snapshot inteiro são explicitamente da linha, não do CPH. FPY/quantidade da linha não são atribuídos ao produto.
- O contador disponível de cada linha abre exatamente seus registros do CPH, 25 por página. Sem snapshot difere de nenhum registro na lista parcial; nenhum desses casos prova ausência de falhas/produção. Troca de produto limpa detalhes; correção/substituição do snapshot, mesmo com ID igual, fecha o detalhe antigo e restaura foco. Clique sobre leitura substituída não abre evidência nova silenciosamente.
- Reports, escopos manuais configurados (inclusive família/base) e histórico preservados. Rótulos distinguem reports manuais, com atalho de consulta; abas cabem no mobile. A correspondência MES continua estritamente exata, independentemente do escopo manual.
- Disponibilidade de histórico PCBA/2114, materiais/reuso/3074 e processo/3022 organizada em detalhe de cobertura por linha. Sem calcular reuso/recorrência, sem novo adaptador 3022 ou confirmação de causa.
- `ames/evidence-view.mjs` compartilha somente a apresentação dos registros com Dashboard. Não é store. Mesmo Auth/listener/`state.ames`; nenhum novo fetch Firebase/MES. Render MES somente na página Produto com sessão; partições com mesma referência, origem, freshness e controles evitam reconstrução. Paginação limita DOM; logout limpa referências/controles e conteúdo.
- Assets de Produto e apresentação compartilhada incluídos no SW e no gate. Não houve mudança de `main`, Firebase rules, pacote ou funcionalidades de Falhas/Rastreabilidade/Dia/CORA.

### Validação do Produto

- `node --test --test-isolation=none scripts/ames-data.test.mjs scripts/ames-dashboard.test.mjs scripts/ames-product.test.mjs`: **30 testes passaram** (6 novos de Produto). Inclui variantes CPH2859/CPH2859V, vazio/prefixo/contém, separação de linhas/SN, referências exatas, cobertura parcial e limites dos agregados, origem/logout, função real do shell e callbacks da sessão.
- `node scripts/quality-gate.mjs`: **90 checks passaram**; aviso preexistente de um locale hardcoded permanece.
- `node scripts/ames-product.browser.mjs`: smoke Edge headless isolado com HTML/CSS, funções de Produto/escopo manual/abas reais, store real e fixtures sintéticas. Helpers auxiliares de formatação/status são substitutos de teste; Auth/Firebase não são carregados e rede de produção é bloqueada. Verifica 2 reports manuais (CPH + família) preservados, histórico, CPH base vs variante, duas linhas, ausência, paginação, escape de campos, foco/teclado, atualização e corrida antes de clique, deleção/logout e nenhuma exceção JS.
- Desktop/mobile: 360/390/768/1280 px, rotação entre larguras, labels/abas sem corte e conteúdo MES sem overflow, incluindo SN longo; zoom CSS 200%. Screenshots sintéticos locais revisados. Regressão `scripts/ames-dashboard.browser.mjs` também passou após extrair a apresentação compartilhada.
- Scripts de browser requerem Playwright/navegador e aceitam `PLAYWRIGHT_MODULE`, `BROWSER_CHANNEL=msedge`, `PRODUCT_SCREENSHOTS` ou `DASHBOARD_SCREENSHOTS`. Não fazem parte do job estático do CI. O SHA final e o resultado CI ficam registrados no PR #22/Issue #21.

### Limites e próximo passo seguro do Produto

**Parar antes de Falhas.** Revisar este Produto/CPH e executar smoke autenticado com snapshots reais de CPH2859V em uma e em mais de uma linha, conferindo o conjunto de registros com a fonte. Ainda não houve login/CRUD E2E, dispositivo físico, prova de cache offline completo, emulador de regras, pacote ou validação fábrica → Firebase → remoto. Não há benchmark de carga fabril; os checks de performance cobrem paginação e ausência de reconstrução em leituras inalteradas.

Export completo/coerente, IDs duráveis/revisão/evidência bruta, transporte local, publicação autorizada, onboarding, demais views e retirada do protótipo permanecem pendentes. **V2/V0.5.23/3022 NÃO GREEN. V0.5.20 permanece baseline documentada.**

## Histórico — Dashboard nativo (aprovado para continuidade de desenvolvimento)

Base reconciliada: `b76b8b40eceb15d51d7b9383d8c62944adb734d7`, igual ao HEAD do PR #22 no início. A solicitação desta fase limita a execução ao Dashboard; recomendações anteriores de começar pelo transporte não bloqueiam este consumidor conservador de leitura. **Parar para revisão antes de Produto/CPH.**

- `ames/data/dashboard.mjs` projeta o store existente; `ames/dashboard-view.mjs` renderiza dentro de `#dashboardView`, chamado por `renderDashboard()` e pelo listener já existente de `aiKnowledge`. Um único `state.ames` e Auth; sem iframe, overlay ou proxy para este fluxo.
- Uma linha explícita por vez, CPH exato e Defect Code (inclusive ausente). Trocar linha limpa filtros dependentes; filtros que deixam de ter registros não ampliam silenciosamente a consulta.
- FPY, Check FPY, quantidade e falhas informadas preservam os agregados da fonte, sem inventar numeradores/denominadores. Como o contrato legado não comprova o escopo por produto/defeito, esses agregados ficam indisponíveis quando há filtros.
- Cobertura parcial, registros carregados/rejeitados, total informado, origem, coleta e snapshot visíveis. Nenhum conjunto vazio é apresentado como zero de falhas da fábrica.
- KPI de ocorrências disponíveis e Top 3 abrem exatamente as referências da lista parcial filtrada, com 25 registros por página. Referências são limitadas à leitura; não são IDs duráveis. Qualquer substituição do snapshot, inclusive correção com mesmo ID, fecha o detalhe anterior antes de abrir novos registros. Exclusão/erro do listener limpa a leitura remota; logout limpa os controles e DOM.
- Reports manuais preservados e identificados como outro universo, sem aplicar filtros MES a seus contadores. Produto, Falhas, Dia, CORA e contrato 3022 não foram migrados neste checkpoint.
- Render MES somente com sessão e Dashboard ativo; mesma referência de snapshot/filtros/origem/idioma/freshness evita reconstrução do DOM. Sem novas consultas Firebase ou MES. CSS responsivo próprio e assets incluídos no SW; shell `15.1.13.42`.

### Validação deste checkpoint

- `node --test --test-isolation=none scripts/ames-data.test.mjs scripts/ames-dashboard.test.mjs`: **24 testes passaram**. Inclui isolamento/CPH/cobertura, referências dos KPIs, zero vs ausência, troca de origem e callbacks reais do shell após troca de sessão/erro.
- `node scripts/quality-gate.mjs`: **75 checks passaram**. Aviso preexistente de um locale hardcoded permanece.
- `node scripts/ames-dashboard.browser.mjs`: smoke isolado no Edge headless, com HTML/CSS reais e função de entrada real do Dashboard; dados sintéticos no store real. Filtros, paginação, teclado/foco, escape de campos, atualização com mesmo ID, ausência, deleção/logout e ausência de erros JS passaram. Sem overflow/corte MES em 360/390/768/1280 px, seletor acessível após transição do menu e zoom CSS de 200%.
- O script de navegador aceita `PLAYWRIGHT_MODULE` (caminho do módulo instalado), `BROWSER_CHANNEL=msedge` e `DASHBOARD_SCREENSHOTS` (diretório opcional). Não é executado pelo gate estático; exige Playwright e navegador. O teste bloqueia rede de produção e não carrega Auth/Firebase. Screenshots são artefatos locais sintéticos, não evidência fabril.
- SHA e resultado do CI deste checkpoint serão registrados no PR #22 e na Issue #21, sem confundir sucesso local com CI.

### Aberto / próximo passo seguro

Revisar este Dashboard e executar smoke autenticado com snapshots reais, conferindo linha, CPH, cobertura e referências no desktop/mobile. **Não avançar para Produto/CPH sem revisão.** Continuam pendentes transporte local, export coerente/paginado, IDs duráveis, evidência completa, autorização de publicação/regras em emulador, onboarding, demais views, retirada do protótipo e validação real de fábrica. Período/turno, Repair, reuso e recorrência não são calculados a partir de dados insuficientes. Nenhum deploy Firebase, alteração de pacote, novo adaptador 3022 ou merge na main.

**V2/V0.5.23/3022 NÃO GREEN. V0.5.20 permanece baseline documentada.**

## Auditoria entregue

`V2_AUDITORIA_ARQUITETURA.md`: baseline `8cbd5fee9558e5e60e312faea583a85435915dda`, 23 achados, modelo alvo, oito fases de implementação após a auditoria e matriz de gates. Primeiro checkpoint documental: `c352693`, publicado antes do código. Markers V2 antigos são históricos e não autorizam outra branch.

## Histórico — fundação de leitura (fase 1 parcial)

- `ames/data/contract.mjs`: projeção conservadora do schema legado, identidade por linha/snapshot, CPH exato, cobertura parcial e ausência de evidência explícita. Valores inválidos/desconhecidos não viram zero.
- `ames/data/store.mjs`: estado nativo em `state.ames`, seleção explícita local/remoto/cache e consultas por linha/produto/defeito/PCBA. Documentos remotos são substituídos integralmente para refletir deleções. Duplicatas ambíguas por linha são rejeitadas.
- `app.js`: reutiliza Firebase/Auth/listener aiKnowledge existentes; não cria segundo app ou coleção. Listeners protegem troca de sessão e respostas tardias. Logout limpa todas as coleções em state e o store MES.
- Contrato 3022 puro: eventos válidos da mesma linha/PCBA, tempo explícito e último evento <= Defect Time; empate sem ordenação comprovada permanece ambíguo. Não há coletor nem dado real 3022.
- Build do shell `15.1.13.41`; novos módulos incluídos no cache. Isso é versão técnica do shell, não promoção da V2 nem da release do agente.
- 18 testes comportamentais, incluindo execução dos listeners reais do shell em ambiente isolado, e 62 checks do Quality Gate local passam. O workflow existente executa a suíte nova via quality-gate.mjs.

## Limites registrados na fundação (histórico; próximo passo atual acima)

Nenhum transporte local foi ativado e nenhum upload novo foi criado. As APIs replaceLocalSnapshots/setLocalConnected estão preparadas para o adaptador real, mas não detectam a porta nem comandam MES. O store lê snapshots já existentes; as views ainda não usam esses novos seletores para métricas. Rastreabilidade, onboarding, dados estruturados CORA e remoção do protótipo seguem pendentes.

Não inferir normalização completa 3074/2114 a partir de contagens: os respectivos datasets permanecem unavailable no adaptador legado. Campos de revisão, IDs duráveis, timezone e bruto não podem ser inventados. Projeção do leitor não substitui sanitização/autorização da publicação. A fila offline antiga e dados persistidos/conversas fora de state ainda exigem revisão de identidade.

Próximo passo seguro: obter fontes/API reais do agente referenciado pelo GitHub e fixar export coerente/paginado, IDs e evidências sanitizadas; em paralelo conceitual, desenhar regras e testes em emulador. Depois migrar views por etapas com smoke autenticado, desktop/mobile e gate de cada checkpoint.

Sem teste autenticado/mobile/fábrica neste checkpoint. V2/V0.5.23/3022 NÃO GREEN. V0.5.20 permanece baseline documentada. Não fazer merge na main.

## Evidência de CI do código

Checkpoint `dbeb3a679af9e14e62afb3664d0e6f90916f0535`: [Central Quality Gate, run 37857100470](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/37857100470), concluído com sucesso. CI não substitui E2E autenticado, emulador de regras nem validação de fábrica.
