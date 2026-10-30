# Consulta por SN — alerta organizado: restauração visual e quatro prioridades
Data: 28/10/2026. Base: prints históricos do operador em 21/10 e 22/10, imagem da Consulta por SN atual e lógica PR69. **PR69 permanece DRAFT.**

## O que foi restaurado
- Faixa lateral de **6px** colorida conforme nível; vermelho intenso para alertas altos, vermelho mais escuro para muito alto; fundo vermelho muito claro, cantos arredondados e cartões **brancos separados**.
- Cartões de `Falha atual / referência · 2114` e `Falha anterior · 2114` separados, mostrando descrição, tipo de análise e horário quando comprovado. `Hist Seq` detalhado fica na evidência expandida **somente uma vez por registro**.
- Cartões de cada Material SN e PCBA anterior para relação com componente, sem atribuir causa à peça.
- Uma seção **única** de comentários 3012/ATs da PCBA investigada, com código de usuário, nome **somente comprovado pela 3022**, horário e comentário; deduplicação por chave real da linha ou PCBA+usuário+horário+comentário+falha. Evita repetir os mesmos comentários em cada alerta ou dentro de evidência do componente.
- Evidência técnica extensa 2114/3012/3022/3074 fica em `Ver evidências`, com estado expandido preservado nos redraws; cap de 3 ATs visíveis e outros acessíveis; **nenhum alerta = nenhum painel**.
- Nunca gerar dados de técnico, causa, reparo, horário ou montagem não comprovados. Seq 2114 não associa AT a uma análise. Horários da 3028 são registro de falha, não geração.
- O próprio modelo forense não deve ser alterado pelo render: `buildSmartSnAlerts` clona evidência antes de tratar casos de clock igual.
- Cartões de comparação atual × anterior aparecem uma vez no conjunto de alertas, não uma vez por categoria de risco.

## Matriz de prioridade implementada
| Nível | Critério de alerta com evidência | Não significa |
| --- | --- | --- |
| Muito alta / critical | Três ou mais ocorrências 2114 distintas da **mesma falha** na própria PCBA (ordenação comprovada via lógica de forensics), ou três ou mais **Material SNs distintos** reutilizados com vínculo temporal comprovado e mesmo tipo de falha no histórico da PCBA anterior | Causa raiz confirmada |
| Alta / high | A mesma falha já ocorreu antes na própria PCBA; componente reutilizado vindo de PCBA anterior com a **mesma falha** e vínculo 3074 comprovado; retorno comprovado após MainBoard repair; múltiplas intervenções MainBoard distintas e comprovadas | Material culpado ou reparo causado pela ocorrência |
| Média / medium | Mesma família de falha na PCBA ou em Material SN anterior; três ou mais **falhas diferentes** na própria PCBA, sem correspondência igual/família; histórico MainBoard repair anterior comprovado | Que as falhas sem relação tenham a mesma causa |
| Baixa / low | Compatibilidade **física/tipo** entre componente reutilizado e subsistema da falha, sem coincidência histórica de falha comprovada | Falha do componente |
Todos os níveis exigem alerta criado pela correlação do forensics com evidências; caso nenhuma regra atinja o limiar, não mostrar painel.

## O que não foi alterado
1. **Consulta por SN:** última falha 2114 e vínculos atuais da 3074 são uma investigação individual. A recorrência própria da placa ainda pode ser visível mesmo quando existe montagem posterior, sem atribuir falha antiga aos materiais novos.
2. **Rastreabilidade:** âncora é a **ocorrência específica da 3028 do dia/linha/revisão**, selecionando o kit da montagem no instante da falha para consultar histórico de componentes; nenhuma função desse fluxo foi alterada aqui.
3. A consulta 3012 continua sendo histórico amplo por SN, não limitado às falhas do período da 3028; 3022 é origem das passagens de posto/turno.
4. Os códigos MES permanecem no modelo de dados e evidências técnicas (por rastreabilidade); o cabeçalho operacional utiliza descrição.

## Testes e critérios pendentes
- `scripts/ames-sn-smart-alerts.test.mjs`: 4 níveis, clones sem mutação, white cards, deduplicação dos ATs; `scripts/ames-sn-alert-compact.test.mjs` e `scripts/ames-sn-2114-two-analysis.test.mjs`: Seq 0/1/2, clock igual, prova, comentários de AT uma vez, presença de evidência profunda e limite de desconhecimento; CI das 9 views.
- Gate físico: comparar com prints 21/10 e 22/10; confirmar títulos e prioridades para PCBA com 2 e 3 falhas; scroll/colunas no Edge e celular; nenhum painel vazio; horários e nomes AT não atribuídos incorretamente; filtrar montagem atual Y após falha 2114.
- Riscos **fora do escopo da restauração visual**: o Cboard Motor/Vibra da 3074 no dashboard da Rastreabilidade, cobertura parcial de vínculo MES e 5 passagens faltantes da 3022 em 7 ocorrências. CI não prova resolução desses casos.

## Linha histórica
Esta mudança é **aditiva, não substitui o motor**. Diff e SHA exato na PR69. Layout antigo da faixa vermelha e blocos brancos foi preservado visualmente, com deduplicação e resumo compacto em vez de repetir todos os registros 3012 em cada categoria. Para qualquer regressão física, comparar este contrato e os ZIPs históricos antes de alterar a lógica de dados.
