# V2 — status de implementação

Continuidade: Issue #21, PR draft #22, branch `v2/native-fusion`.

## Checkpoint atual — somente Dashboard nativo

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
