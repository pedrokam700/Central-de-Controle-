# PR70 — REGRESSÃO FÍSICA DE REUSO / AT HISTÓRICO E ALERTA BAIXO (12/11/2026)

**Estado físico: RED / PENDENTE. Não existe pacote desta correção liberado para instalação. PR #70 OPEN/DRAFT.**

## Evidência real de 12/11

O operador enviou prints do Dashboard de reuso ANTES e DEPOIS da troca `F22E344` → `F78CE7CB`.

- Antes: drill-down da mesma falha exibiu PCBAs classificadas como **1º e 7º uso**.
- Depois: revisão selecionada exibe **98 PCBAs investigadas, 98 com uso indeterminado, 36 com falha histórica 2114 e 9 com mesma falha anterior**. **825 componentes físicos** aparecem todos como primeiro uso e zero como reutilizados. Exemplo `00253330682535E200007853` indica 2114 2 registros, 3022 66 passagens, mas montagem temporal ausente. A UI não pode converter uso indeterminado em zero e tampouco inferir 2º uso a partir de várias falhas.
- Comparação real de dois ZIPs `CENTRAL_AMES_PR70_F22E344_FLUIDEZ_CANDIDATA_TESTE(2).zip` e `CENTRAL_AMES_PR70_PASSAGENS_F78CE7CB_TESTE.zip`: **`ames/data/reuse-cohorts.mjs`, `engine_bridge.py` e `reports/relatorio_v015.py` iguais**. Portanto a regressão do índice não decorre de alteração no classificador entregue entre esses dois pacotes. A entrada de dados, seleção do snapshot, recuperação de revisões ou transferência do estado precisa ser conferida. Não declarar causa raiz antes de conferir cópias locais do SQLite.
- Para `trace_insights`, o agente regenera os indicadores `integrated_v016` a partir da revisão salva. Se existe mais de uma revisão, `recover_snapshot_line` recompõe evidência somente para a **mesma** `snapshot_id` + linha + PCBA + código + horário. Dados ausentes na revisão selecionada produzem uso indeterminado. A recuperação pode existir em revisões antigas; não é permitido importar ciclo de outro snapshot sem identidade e prova.
- Caso SN anterior, conhecido do histórico 11/11: PCBA `002527005C1635F300002313`: três registros 3012, dois com mesmo Repair Time `2026-11-09 10:12:09`, e 3022 inclui nomes de operadores históricos A6900; consulta anterior apresentava nome na última ocorrência mas não nos primeiros registros. A mesma falha/solução pode repetir, mas horário igual não prova dois reparos distintos nem permite ligação arbitrária a Hist Seq.
- Alertas de baixa prioridade não podem esconder o técnico e comentário 3012 se disponível, embora técnicos da A6900 e usuários de reparo 3012 representem papéis distintos.

## Correções de código já feitas (na branch PR70, sem MES nem dados operacionais)

1. `ames/console-sn-repair-evidence.mjs`: `normalize3022OperatorRows` encontra nomes e IDs de `provenance.adapter.operator_evidence` e `operator_events`, além de campos diretos/raw, com PCBA explícita. `provenRepairUserName` e `projectRepairTechnicianNames` usam a identidade de **mesma PCBA + MES ID exato**, inclusive em posto diferente de A6900. Rejeitam outra PCBA, nomes contraditórios e linha sem nome.
2. `ames/console-sn-history-detail.mjs`: apresenta separadamente **todos** os técnicos observados em eventos A6900 com horário próprio e os atendimentos 3012 sem ligação individual, completos por reparo/horário/técnico/comentário; não duplica intervenções comprovadamente vinculadas. Não afirma que operador A6900 é o Repair User ou qual Hist Seq ele executou.
3. `ames/console-sn-smart-alerts.mjs`: preview de AT/comentário em alerta `low` mesmo se outro card for mais prioritário; quarta e demais linhas 3012 visíveis sem expandir +N; 3022 histórico exibido sem esconder primeiras passagens. Associação a falha específica continua qualificada.
4. Testes ampliados em `scripts/ames-sn-repair-evidence.test.mjs`, `scripts/ames-sn-history-detail.test.mjs`, `scripts/ames-sn-smart-alerts.test.mjs`, `scripts/ames-sn-alert-compact.test.mjs`.
5. `scripts/ames-pr70-state-transfer.test.py`: snapshot sintético com 7 autovínculos datados 3074 deve manter **todos os 7** na origem, no destino e no `snapshot_payload_revisions` após transferência; não altera SQLite real.

**Não modificados:** classificador de reuso `ames/data/reuse-cohorts.mjs`, reuso físico do factory-engine, 3028/3074/2114/3022/3012 coletores, scheduler, portas, rede, guardian, banco, `main`, Firebase Rules.

## Investigação do reuso sem nova coleta

Criado ZIP externo `CENTRAL_AMES_AUDITORIA_REUSO_SEM_COLETA.zip` com `01_AUDITAR_REUSO_SEM_COLETAR.bat`, Python stdlib em SQLite `mode=ro` e **nenhuma chamada MES/network ou escrita**. Examina apenas pastas `CENTRAL_AMES_PR70_*` sob Downloads (profundidade 2). Exibe: nome da instalação, hash curto de source_id (não o valor), quantidade de snapshots, digest curto do payload, **número** de PCBAs com linhas próprias 3074 e com vínculo físico datado, e mesma contagem em até 12 revisões `integrated_v016` dos três snapshots mais recentes. **Não exibe SNs, operadores, comentários, config, tokens, SQL bruto nem payloads JSON.**

**Próximo gate**: operador executa o ZIP sem coleta e envia print. Comparar se a base `F22E344`/backup e `F78CE7CB` preservam origem/snapshot/revision e onde o número de autovínculos datados desapareceu. Só então escolher recuperação **somente leitura** das revisões do MES/SNAPSHOT de identidade idêntica ou reparo no classificador baseado em evidência real. Se os registros não existirem, uso continua INDETERMINADO, jamais falsificar 1º ou 7º.

## Segurança

Instalação real ficou ativa com `F78CE7CB` após troca supervisionada e backend 8765. **Não desinstalar, não sobrescrever SQLite, não executar `00_INICIAR_AQUI`, não tentar coletar tudo novamente**. Manter `C1B13D`, `F22E344`, `F78CE7CB` e backup privados. O classificador de reuso é um gate separado dos testes de UI; mesmo CI GREEN não torna a versão factory GREEN. Antes de entregar novo pacote: exigir CI success no HEAD exato e encontrar a causa da classificação física.
