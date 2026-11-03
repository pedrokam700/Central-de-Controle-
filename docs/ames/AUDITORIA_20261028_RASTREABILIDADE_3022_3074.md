# Auditoria técnica — 28/10/2026 — 3022 e 3074 por ocorrência

## Correção do requisito de horários (operador, 28/10)
**Não** exibir Defect Time da 3028 como gráfico alternativo de horários de geração. A 3028 fixa identidade da ocorrência e limite superior temporal, não a hora de geração. A referência de processo deve vir da **3022**: PCBA + CPH exato + código/descrição/família + modo de registro + última passagem concluída no posto pertinente antes da falha. A passagem anterior genérica, a detecção, a passagem de controle e a causa raiz são conceitos diferentes.

O gráfico na PR69 voltou a ser **somente 3022**. Agora mostra o total de ocorrências do filtro, total com hora comprovada e PCBA/linha/descrição sem correspondência; diagnóstico diferencia: (a) nenhum contexto 3022 carregado; (b) contexto 3022 sem identidade exata; (c) posto não mapeado; (d) passagem válida no posto não encontrada; (e) horário inválido/posterior; (f) referência sem prova suficiente. Sem fallback 3028. A cobertura "7 falhas/2 horas" é **incidente a investigar**, não resultado normal nem 5 zeros. Testes sintéticos verificam contagem 7→2, ausência 3022 2→0 e diagnósticos de motivos; **não** afirmam corrigido o caso da fábrica.

## Contrato original do histórico (PR42, 20/10)
Referência: `docs/ames/ASSEMBLY_SCOPE_DEFECT_3074_3022_20261020.md`; PR42 `ef43b72e`; main oficial 0.5.39 `b283b176`.

**Rastreabilidade:** ocorrência específica da 3028 (linha, PCBA, Defect Code, Defect Time), consultar grid bruto da 3074 para essa PCBA uma vez; selecionar **somente itens que pertenciam ao intervalo da montagem no instante da falha**; consultar cada Material SN selecionado individualmente na 3074; identificar PCBAs anteriores que usaram aquele material antes da falha; investigar histórico e correlação na 2114, com 3012/3022 como fontes independentes. Outras montagens da mesma PCBA principal não viram componentes da ocorrência atual. Mesmo material N hoje pode ter pertencido à falha se seu intervalo histórico comprovar. Nova montagem Y depois da falha deve ficar fora do conjunto atribuído. Casos sem Unbind confiável/conflitos continuam **candidatos indeterminados**, não zeros nem links causalmente confirmados.

**Consulta por SN:** usa a última falha 2114 e os vínculos atuais/visão individual de montagem; nunca redefine retroativamente o escopo de uma falha 3028. Esse fluxo independente deve ser preservado.

O `ames/factory-engine/core/fluxo_3028_3074.py` tem o mesmo blob em PR42, 0.5.39 e PR69, preservando o agrupamento de falhas por PCBA + extração por cada ocorrência. O arquivo `varredura_3074.py` era o mesmo blob em PR42 e main 0.5.39; PR69 manteve seleção temporal e adicionou diagnósticos de cobertura. Não se provou que um filtro temporal, isoladamente, causou o erro observado no posto.

## Regressão concreta da seleção de página 3074 no deep trace
Em PR42, main 0.5.39, PR67 e PR68, `run_deep_v016_records` abria 3074/Home, depois 2114/OPC e criava o coletor 3074 sem fixar a página Home. O objeto `SessionObject` não encaminha `__setattr__`, por isso atribuir `target_page` no wrapper não afetava a consulta real. PR69 fixa a página **no objeto real antes do proxy** e usa helper conservador nos caminhos de consulta individual. Teste dedicado `scripts/agent-deep-3074-page.test.py` reproduz Home seguida de OPC com 3074 impreterivelmente em Home. **Gate sintético não prova leitura física nem completude da grade ExtJS**, que pode estar parcialmente paginada. A visita manual da 3074 comprovou que um Cboard tem vínculos anteriores, mas não prova por si a correspondência temporal com a ocorrência 3028 sem cruzar Bind/Unbind.

## 3022: pontos concretos de diagnóstico
- `ames/agent/agent_entry.py`: `full` executa `process_r11.collect_and_persist`, e `process_only` também; `reuse_only` não coleta 3022. Não confundir com função legada `agent.py:_run_deep_trace_job` que informa `pending_adapter`; a rota candidata é fornecida pelo `agent_entry.py`.
- `ames/agent/process_r11.py`: o status `complete` da consulta 3022 significa que a consulta/processamento do MES foi concluída, **não** que TODAS as ocorrências receberam uma estação de referência.
- `ames/factory-engine/config/regras_processo_3022.json`: famílias funcionais como VIBRATION usam fallback A5150, que é estimativa operacional, não detecção/causa garantida. Se não encontra END LOT no posto, o sistema preserva a incerteza. Para câmera/impureza manual há regra A5162. Antes de alterar a matriz, conferir o histórico real 3022 e o posto esperado para o CPH/falha.
- `ames/data/production-evidence.mjs`: a prova temporal depende de identidade exata da ocorrência, origem 3022, base `reference_process`, posto e horário válido anterior à falha. Diagnóstico novo separa ausência de coleta, sem match, regra/estação, passage missing e eventos posteriores, sem promover contexto a horário gerado.

## Auditoria de versões e continuidade
- `main` e release oficial mais recente: tag `ames-v0.5.39-multipc-20261022` @ `b283b1764432f5d90486d38a7553b30542a5c118`. Nenhum merge na main/novo release nesta auditoria.
- PR42 @ `ef43b72e` é ancestral da candidata PR69. A comparação GitHub PR42 → PR69 reportou `behind=0`, `ahead=498`: linha de desenvolvimento preservada. O contrato de 3022 e 3074, 93 dias, Top3 e demais views precisa continuar coberto pelos gates.
- PR67 (Issue 66) @ `ca64094e` → PR68 @ `aed13562` → PR69. GitHub compare: PR67→PR68 `ahead=44 behind=0`; PR68→PR69 `ahead=72 behind=0` no checkpoint anterior às correções desta auditoria.
- PR35, PR36 e PR40 **continuam DRAFT**: trechos foram integrados seletivamente na PR42, mas não é correto afirmar que **todos** seus commits ou features isoladas foram importados. PR64 permanece DRAFT e exige autorização própria de update/guardian. CI GREEN não substitui homologação física nem autoriza merge.
- PR69 continuou DRAFT. Não acessar SQLite/token/config para os comparar; não copiar/substituir arquivos em instalações antigas sem gate de atualização seguro.

## Testes físicos obrigatórios antes de GREEN
1. Usar a revisão 3028 correta, linha/dia escolhidos; conferir número de falhas por modo.
2. Rodar apenas modo `process_only` na revisão selecionada (não reexecuta reuso) e investigar os SNs que continuam sem horário 3022. Para cada um: confirmar que a consulta foi realizada, `query_diagnostics` da 3022, passagem completa no posto específico, fuso/Hist Seq, `reference_status`, `reference_rule_id`, `reference_event_time` e correspondência por ocorrência. A meta é localizar o motivo dos faltantes, não contar os cinco pela 3028.
3. Em reuso, usar a PCBA com falha Motor/Vibra e o Cboard identificado manualmente. Inspecionar query 3074 da PCBA, `temporal_filter` (active, time_unknown, ended_before, bound_after), query 3074 do Material SN, `previous_pcbas`, `current_pcba_confirmed`, `coverage` e falhas 2114 das PCBAs históricas. Não promover histórico N como prova sem Bind/Unbind.
4. Conferir todas as mudanças visuais no modo operacional em PT/EN/Edge e dashboard da mesma linha/dia. Não declarar KPI ausente como zero.
5. Preservar o agente da fábrica, a base SQLite, token, config, mutex, guardian e lançamento anterior. Não instalar ZIP/atualizar em produção até gate físico autorizar. Nenhum dado MES real foi executado por esta auditoria.

## Checkpoint de código
PR69 branch `work/ames-pilot-integration-57-66-20261027`. Após a revisão, o gráfico 3022-only recebeu causa de ausência por PCBA e testes específicos. Revalidar HEAD exato, 3/3 CI e teste físico separado antes de qualquer release.
