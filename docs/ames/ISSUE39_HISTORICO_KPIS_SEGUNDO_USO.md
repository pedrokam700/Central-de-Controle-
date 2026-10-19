# A-MES — Histórico Operacional Integral + KPIs de Segundo Uso
**Checkpoint 0 — especificação de execução / 19-10-2026**

- Issue canônica: [#39](https://github.com/pedrokam700/Central-de-Controle-/issues/39).
- Branch exclusiva: `work/ames-operational-history-kpis-20261019`.
- Base imutável inicial: PR #38 `9e4c531bcbb46a6b99e875035220494ad9036bf3`, branch `work/ames-identity-operational-history-20261019`. PR #38 permanece **draft e não validada fisicamente A→B**.
- Este documento não conclui nenhuma função. Nunca alterar `main`, PR #37, PR #38, PR #35/#36, Firebase Rules/Hosting/Auth ou instalação da fábrica em consequência da análise.
- Objetivo da execução: integrar a memória histórica COMPLETA dos resultados pesquisados em 3028, 3074, 2114, 3022, 3012 em todas as nove views, com KPIs de reuso capazes de análises por material/SN/part number, período, linha, CPH, histórico de reparo e séries temporais.
- Persistir cada bloco com commit e checkpoint; não trabalhar por horas sem salvar; `HEAD + gates + pendências` deve ser suficiente para outro chat/Work retomar.

## Semântica principal
1. **Visualização não é extração:** selecionar Hoje / Último dia produtivo / Período não navega o MES. Uma ação separada e explícita `Atualizar período` coleta novamente no computador autorizado.
2. **Produção 07:00→07:00 America/Sao_Paulo**, independentemente de turnos 07:30/17:30. Último dia produtivo segue calendário de trabalho e exceções. Toda consulta pertence a `period_id`, `line_id`, `source_id`, `snapshot_id`, `revision`, `view`, `scope`, `collected_at`, `coverage`.
3. **As nove views compartilham um contexto temporal** explicitamente versionado; não pode haver mistura de hoje/ontem no Top3, falhas, SN, rastreabilidade, dashboard ou AT. Navegação histórica somente leitura; mudanças posteriores não sobrescrevem ocorrência/FPY original.
4. **Preservação local primeiro:** fontes e revisões efetivamente coletadas ficam no SQLite com indexação por dia/linha/SKU/fonte; replica sanitizada no Firebase para PC B depois de upload e autenticação. A Central mostra `Local`, `Compartilhado`, `Pendente`, `Parcial`, `Não coletado`. Ausência/indeterminação nunca equivale a zero. Fila mantém dados até confirmação real; source_id distinto gera conflito explícito.
5. **Recorte avançado é outra identidade de consulta**, com critérios salvos, não atualiza Today nem é confundido com fechamento diário.
6. `3012` representa reparos efetivamente comprovados por dados da fonte e candidatos de associação por PCBA; não atribuir um reparo à falha somente pelo mesmo SN sem vínculo temporal/semântico. Manual/Automatic na 2114 é modo de registro pós-caracterização, não reparo.

## Duas populações de segundo uso, **nunca confundir**
### A. PCBA principal (SN PCBA original)
- Identificador: `pcba_sn` principal; multiplicidade de usos/vínculos no tempo; classificar primeiro, segundo, terceiro e usos adicionais com evidências exatas.
- Numeradores/painéis: PCBAs 2º+, 3º+, PCBAs reutilizadas que apresentaram falha **no uso atual**, PCBAs com falha em uso anterior, falhas recorrentes da mesma categoria, PCBAs com múltiplos eventos e tempo até falha. Distinguir o evento atual da falha histórica (2114).
- Denominador de taxa `falhou / não falhou` exige coorte de TODAS as PCBAs de segundo uso produzidas/observadas no escopo, inclusive sem falha, com prova de cobertura; 3028 baseado só em defeitos fornece apenas amostra das que falharam. Se cobertura não provar população total, exibir `sem denominador válido`, `falha não observada` como indeterminado — nunca `sem falha comprovada`.
- Métricas `quantos deram falha`, `quantos sem falha comprovada`, `quantos indeterminados`, `taxa` quando elegível, por dia/semana/linha/CPH/categoria.

### B. Material/componente vinculado (SN item e tipo)
- Identificador de item físico por `item_sn` + tipo/`material_type` + contexto de fabricante quando necessário. Part number, lote, descrição e grupo como dimensões; **não deduplicar só por part number** nem considerar componentes de kit como um único componente físico.
- Por item: PCBAs vinculadas anteriores/desvinculadas, ordenação bind/unbind, usos da peça, uso atual e anterior, histórico de falhas associadas, qual falha e em qual PCBA, reparos comprovados, origem/evidência.
- Indicadores: itens 2º+, 3º+; número de itens reutilizados com falha registrada no uso atual, histórico anterior, sem falha comprovada (somente coorte completa), indeterminados; materiais com falha repetida; Top 10 `part_number`, `item_type`, `material_sn` por frequência e **taxa somente com universo completo**; evolução diária do conjunto investigado.
- Distinguir `componente reutilizado presente em PCBA com defeito` de `falha atribuída ao componente`. Associação ≠ causa. Sem diagnóstico de componente explícito, chamar `associado a ocorrência` e não `peça causou falha`.
- Exemplo: **kit LCD** pode originar múltiplas linhas e materiais: preservar vínculos originais; contar `material_SN` único por categoria para contagens de peças e `event_id` para eventos, sem inflar contagens pela junção SQL.

### KPIs canônicos auditáveis
- `cohort_size_proven` / `population_coverage` / `source_completeness`.
- `reused_distinct_items`, `reused_distinct_pcbas`, `second_use`, `third_plus_use`.
- `observed_current_failure` por SN/material com escopo/ocorrência exata.
- `prior_failure_history` distinto de `observed_current_failure`.
- `verified_no_failure` somente quando foi possível observar o universo completo e desfecho.
- `unknown_outcome`; nunca forçar `unknown = 0` nem `unknown = no_failure`.
- `failure_rate` somente quando `cohort_size_proven` e captura de resultado para todo o denominador.
- `reuse_affected_failures_count` significa ocorrência envolvendo item reutilizado; **não** efeito causal no FPY.
- Tabela/drilldown por indicador com `row_id / component_sn / pcba_sn / defect_code / defect_time / production_date / source_view / source_revision`; contagens devem reconciliar com linhas exatas.
- Comparação homogênea por `line_id + CPH + period + source_coverage`; não comparar taxas com denominadores incompatíveis, nem calcular tendência para dias sem coleta.

## UX de operação
- Na **Central das Linhas**, seletor compacto: `Hoje | Último dia produtivo | Período…` acima das três linhas; data operacional visível. Modo avançado opcional com calendário, CPH, fontes e escopo.
- Dois verbos distintos, discretos: `Ver histórico salvo` e `Atualizar período`. Ao trocar período todas as nove views respeitam o mesmo escopo; navegar nunca coleta/reescreve. Dia atual é inicial.
- Detalhes históricos completos ficam disponíveis por período (não só resumo), com opção de comparar dois dias ou semanas. Estado de dados por fonte: 3028/3074/2114/3022/3012, indeterminado distinto de 0.
- Dashboard existente recebe FPY, Check FPY, produção, falhas por mil unidades, Top3 e tendência 7/30 dias; PCBA reutilizada e material reutilizado em painéis SEPARADOS; filtro material específico/SN/part number; comparações dia-dia e semana-semana.
- Sem novo console paralelo, sem duplicar as nove views, mantendo PT/EN, mobile, filtros de linha/CPH, drilldowns e leitura remota autenticada.

## Retenção segura
- Política inicial proposta: **14 dias produtivos de revisões completas em consulta rápida + 12 meses ou mais de resumos diários**; **NÃO implementar apagamento automático** enquanto não houver export verificado, testes de restore e critérios aprovados. SQLite mantém versões anteriores e a política futura de arquivamento não altera source_id.
- Reparos tardios 3012 vinculam-se ao dia da ocorrência original por revisão derivada, sem recalcular arbitrariamente FPY original; guardar `derived_at` e `source_collected_at`.

## Blocos com commits pequenos e checkpoints obrigatórios
Cada bloco requer **1–3 commits de mudança funcional no máximo**, testes automatizados, checkpoint na PR vinculando SHA exato, conclusão e limitações. Se houver falha: não maquiar; salvar evidência do erro e menor correção, depois próximo checkpoint.

- **A (Modelo temporal):** contexto de leitura explícito com snapshot histórico por linha e switching seguro das nove views; UI compacta Central das Linhas; sem coletar ao navegar. Testar alternância Hoje/Ontem/Hoje, reload, isolamento de conta e linha, consultas custom não promovidas.
- **B (Persistência de cinco fontes):** indexar e recuperar por período/linha/CPH e fonte 3028, 3074, 2114, 3022, 3012; roteamento da rastreabilidade `snapshot_id` explícito e imutável, sem `latest_snapshot_ids_by_line` acidental. Testar enriquecimento parcial, kit LCD, reparo tardio, backup/rollback SQLite.
- **C (Agregação/reuso):** material e PCBA independentes, cohort outcome `failed / verified_no_failure / unknown`, drilldowns, integridade de contagem, fonte e denominador; filtros materiais específicos/PN/SN. Testar coorte sem denominador (não exibir taxa nem 0), multi-vínculo e associação ≠ causa.
- **D (Dashboards e tendências):** trend 7/30 dias, dia/semana, FPY/Check FPY, falhas por 1000, índices de reuso com comparabilidade/coverage; cache incremental/latência e testes mobile/idiomas.
- **E (Remoto/gate):** Firebase e leitor B indexados/autenticados, revisão imutável, conflitos de origem, testes Firestore/Windows, sem tocar o ambiente físico; prova A→B somente com autorização de operador e dados reais. Não promover a PR por testes de emulador.

## Handoff à prova de interrupção
Manter em `docs/ames/handoffs/ISSUE39_ESTADO_ATUAL.md`:
1. Timestamp e SHA `HEAD`, branch, PR/Issue e última suite CI.
2. Blocos concluídos e testes que realmente passaram no SHA exato.
3. Arquivos alterados e contratos invariantes (source_id, SQLite, 8765, data, FPY).
4. Ponto exato de retomada (arquivo/função, próximo teste) e bugs ainda abertos.
5. Status da fábrica separado do CI: GREEN simulado != GREEN físico.
6. Nenhuma promessa de executar em segundo plano fora da sessão Work. Quando tempo/contexto acabar, fazer commit/checkpoint primeiro, depois fornecer handoff completo sem recomeçar.

**Prioridade:** visibilidade e integridade do trabalho já coletado antes de relatórios bonitos; a taxa de falha de 2º uso é importante, mas só é válida quando existe universo real auditável.