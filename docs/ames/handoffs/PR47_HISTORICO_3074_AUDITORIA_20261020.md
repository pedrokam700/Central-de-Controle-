# PR47 — Auditoria de produção / histórico, 20-10-2026

## Fonte de verdade e segurança
- A única versão oficial distribuível é GitHub `main` + GitHub Releases/CLEAN.
- Branch `work/ames-history-usability-20261020`, PR #47 **draft**, sem alterações de dados em Firebase/SQLite. Não fazer merge, release ou implantação sem todos os gates do SHA exato.
- Screenshots de fábrica incluem Line2 TAN10102 último dia 19/10 07:00→20/10 07:00, FPY 94.46%, Check FPY 96.47%, quantidade 1390, falhas 77, snapshot 1; e 20/10 com fontes compartilhadas concorrentes na Line2 e Line3 e cartões vazios. Não são equivalentes a um resultado de coleta deste dia; data da captura e data da produção devem permanecer distintas.

## Mudanças executadas
1. O histórico de cada linha mostra painel independente `Última coleta disponível` quando Hoje está sem snapshot, com período original, data da coleta, origem, snapshot/revisão, KPIs e opção para abrir o período, sem contaminar KPIs de Hoje. Origem concorrente permanece opção manual, sem escolher por último timestamp. `ames/console-latest-capture.mjs` e `ames/console-legacy-parity.mjs`.
2. O período operacional real muda às 07:00 America/Sao_Paulo. A interface compara relógio do próprio store (mesmo relógio dos testes/fábrica) e atualiza Hoje no rollover. Não usa turnos do MES como definição do dia. `ames/console-view.mjs`, `ames/data/store.mjs`.
3. Selecionar um posto no conflito histórico abre a origem imediatamente; antes exigia botão extra. Preservar escolhas somente naquela linha+período e nunca misturar PCBAs, dias ou origem.
4. Top 3 passa a abrir ocorrências exatas da falha em tabela independente com CPH, PCBA e Defect Time, mesmo quando o painel analytics não consegue abrir o detalhamento. Não mexe na lista completa das falhas nem nos quatro códigos excluídos somente do ranking target.
5. Consulta SN: `provenPreviousFailures` exige precedência temporal/seq comprovada e exclui duplicatas da falha atual. O único defeito da PCBA não pode virar falha anterior. Evidências sem ordenação permanecem indeterminadas; não rotular como retorno/retrabalho.
6. Dashboard de tendências já existia: trazia leitura manual de 7/30 dias. Agora leitura automática padrão 93 dias na view reuso, opções 7/30/93, filtro por linha/CPH/material/tipo/part number/origem, dados históricos sob revisões imutáveis e lacunas não convertidas em zero; leitura em lotes concorrentes de seis dias. Métricas são somente ocorrências observadas e correlações. Impacto *causal* e denominadores populacionais de material bom/não falhou ainda não são comprovados pelas fontes completas. Não publicar taxas de falha sem denominador auditável.
7. Fonte 3022: captura também `tran_user_name` quando explicitamente presente na grade em colunas `Tran User Name/Desc`, `Employee Name`, `User Full Name`, etc.; preserva BRM ID e exibe nome apenas com evidência do mesmo registro. Se campo não existir, manter ID e nome não comprovado. Teste Python específico.
8. Estado parcial: uma consulta que falha depois de retornar linhas comprovadas é `parcial`, não sucesso nem zero. No detalhe das fontes SN mostra estado + registros observados ou — + falha, sem inventar período/origem.

## Auditoria da 3074 — nenhuma alteração do coletor consolidado
**Código de extração real:** `ames/factory-engine/ames/tela_3074.py` e `ames/ui_helpers.py`. 3074 abre A-MES, preenche SN, aciona View, examina ExtJS store/grade, exige retorno correspondente ao SN, distingue grade vazia estável (1.6s com marcador, 3.2s sem) de timeout, tenta novamente até 2 consultas, preserva linhas brutas. Consulta da própria PCBA é reutilizada entre suas falhas. `componentes_serializados` remove SN da PCBA, separa `Sn Type`, e consulta históricos dos componentes selecionados em seguida.

**Critério correto no estado atual:** `core/temporal_3074.py` compara vínculo e desvínculo ao **Defect Time da falha** (hora MES -03, campos brutos 3074 UTC); status Y/N informa só o vínculo no momento da consulta, não prova o vínculo passado. `Unbind == Defect Time`, múltiplos vínculos contraditórios e `N` sem Unbind Time ficam indeterminados. Para SN pesquisada diretamente, o último Defect Time da 2114 é referência *candidata* e não equivale automaticamente à ocorrência da 3028. Histórico de PCBA principal 2º/3º uso distinto de reuso de cada componente.

**Risco real e pendência física:** `extract_extjs_store_grid` informa `store_total_count` mas o coletor validado pode aceitar a grade carregada sem provar paginação integral quando `store_total_count > len(rows)`. Uma função de auditoria `ames/coverage_3074.py` e teste `scripts/agent-3074-pagination.test.py` distinguem página parcial. **O coletor original foi restaurado byte-for-byte** para respeitar CLEAN V3; NÃO dizer que o bloqueio de paginação já foi aplicado à coleta real. Validar fisicamente / total de páginas / como avançar na 3074 antes de alterar motor; preservar registros parciais com marcação auditável.

## Pendências e gate físico
- Confirmação real: 20/10 Linha2 e Linha3 hoje, conflito de dois source IDs, seletor de origem, snapshots e release/dia de origem; 07:00 seguinte com relógio real.
- Top3 Line2 ao clicar, mesma ocorrência exata do 3028; SN com uma falha 2114; relatório do 3022 com campo de nome AT real; comportamento de status dos cinco coletores.
- Limites de 3074 e comparação de uma PCBA/material com consulta visual integral no A-MES; materiais que *não* falharam não podem ser contados como zero sem população completa de componentes efetivamente usados.
- Rastreabilidade/dashboards mantêm histórico no SQLite e Firestore; testar três meses com mais de uma fonte (conflitos não são médias e não devem ser descartados). Testes simulados GREEN não significam validação física.
