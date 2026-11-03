# PR #69 — Auditoria das regressões e nova candidata 28/10/2026

**SHA exato:** `0e97170b50a6438374228287959ce2ebbb58107f`. **CI GitHub:** `40749284538`, 3/3 SUCCESS. **Estado:** PR DRAFT; sem merge/release/GitHub Pages. Gate MES físico pendente.

## Base verificada

Arquivos CLEAN antigos `39e0956b`, `44d0b326`, `246b58b3`, `05da735a`, `dbe424da` e `56a6d09a` comparados com o último PR69. O núcleo `factory-engine/core/fluxo_3028_3074.py` estava idêntico nessas versões; a regressão observada está ligada à coleta parcial e ao modo como a camada de projeção/visão tratava os resultados, não foi demonstrada uma substituição do motor congelado.

## 1. Rastreabilidade (âncora 3028)

A coleta começa nas ocorrências exatas da 3028 **do período/linha selecionados**. A 3074 revela vínculos dos materiais; 3022 informa passagens reais e horários do processo; 2114 compara falhas da própria PCBA e das PCBAs anteriores quando coletadas; 3012 complementa reparos e comentários. Material N, vínculo incerto, consulta 2114 parcial ou horário não recuperado **não podem ser contados como 2º uso comprovado**. Ao mesmo tempo, não podem desaparecer como suposto zero.

Nesta candidata a exportação `canonical.py` mantém uma **projeção de auditoria** para candidatos temporais da 3074, separada dos indicadores oficiais. Essa projeção sai do JSON bruto armazenado, respeita a PCBA e a `defect_key` da ocorrência 3028, é limitada a 500 linhas, carrega Material SN, tipo, horário/posto de ligação e PCBAs históricas *somente quando a fonte já as retornou*. Em consulta/contagem incompleta, a prova continua indeterminada. Não há consulta invasiva extra nem vínculo causal inventado.

A Rastreabilidade exibe `Vínculos 3074 a investigar` na área de evidências e, após coleta de uma linha única, seleciona essa mesma linha, corrigindo a permanência visual na linha anterior. Os dados confirmados da 2114 e material 3074 continuam acessíveis nos seus atalhos antigos.

A 2114 **não aceita uma grade ExtJS vazia antiga** como no-data válido sem um novo `load` bem-sucedido após consultar a PCBA. Ausência de resposta vira parcial/erro em vez de zero definitivo. Versão de projeção 10 gera nova revisão imutável, sem sobrescrever revisões salvas.

**Limite:** isso recupera a evidência visível e melhora o diagnóstico da cobertura, mas a confirmação da reutilização do Cboard Motor/Vibra nas PCBAs anteriores exige dados reais da montagem e da 2114. Essa confirmação física ainda não ocorreu.

## 2. Falhas do dia e FPY

- O gráfico de horas continua usando **somente 3022**, nunca `Defect Time` da 3028 como substituto.
- Ao mudar de linha, o sistema limpa a seleção de modo de falha quando aquele código não existe na nova linha e limpa a hora antiga. Ao selecionar outro modo, a hora antiga também é limpa. Isso evita painel vazio causado por filtros de outra linha/dia.
- O Top 3 e o modo filtram as barras e permitem abrir o detalhamento logo abaixo; o campo operacional é `Modo da falha`, não `Defect Code`.
- Rodapé da Central agora identifica **`UI 28.10 · RAST-FPY-SN3`**, independentemente da etiqueta antiga `CANONICAL-R11-BATCH` do agente. Se esse marcador não estiver visível, você pode estar acessando outra interface/cache/pasta.

**Limite:** essa correção não gera horários 3022 que o MES não retornou; o caso das 7 ocorrências versus 2 horários continua exigindo rastrear a captura das passagens reais.

## 3. Consulta por SN (não confundir com Rastreabilidade)

Preservada a análise por último histórico 2114 e vínculos atuais da 3074. O alerta segue o layout aprovado: borda lateral vermelha, fundo claro e cartões brancos, com prioridades muito alta/alta/média/baixa e sem painel vazio. Componentes reutilizados com vínculo comprovado passam a mostrar, quando presentes nas evidências, **falha anterior da outra PCBA, horário 2114 e comentário/hora/identificação da 3012 somente se `repair.pcba_sn` for exatamente a PCBA anterior**. Sem esses dados, não se atribui indevidamente o técnico ou reparo de outra placa; essa investigação precisa de fonte efetivamente coletada.

## 4. Instalação segura

1. Finalize as coletas, guarde a pasta antiga e **não** execute o antigo agente/guardian em paralelo.
2. Extraia o ZIP numa pasta nova e abra `CENTRAL_AMES_PR69_COMPLETA`.
3. Execute somente `01_TROCAR_PARA_PR69_NOVA.bat`. Em conflito de agente/porta 8765, não force.
4. Confirme `TROCA_PR69=SUCCESS` e veja no rodapé `UI 28.10 · RAST-FPY-SN3`.
5. Teste uma coleta do dia na Linha 3 e o Cboard comprovado manualmente. Confira os vínculos em auditoria 3074 e a cobertura da 2114. Confira o Top 3/hora da 3022. Compare alertas da Consulta por SN com os prints antigos.

Este ZIP **não migra automaticamente** SQLite, token/config/outbox/histórico local. Não delete a pasta antiga. A versão oficial permanece a anterior; estes são arquivos de validação **candidata**.

## 5. Evidências e testes

- `scripts/agent-3074-projection-audit.test.py`: casos sintéticos do Cboard, isolamento por linha/falha, sem contagem falsa.
- `scripts/ames-sn-smart-alerts.test.mjs`: falha/timestamp da PCBA anterior e técnico 3012 somente com associação pela placa correta.
- Quality Gate completo e 9 views/agent sync: **3/3 SUCCESS** no SHA informado.
- Linha histórica preservada em `docs/ames/history/LOGIC_CHANGELOG.jsonl` (MES-HIST-014).

**Não declarar segundo uso/mesma falha como GREEN fisicamente, nem a 3022 resolvida, até validação com evidências da fábrica.**
