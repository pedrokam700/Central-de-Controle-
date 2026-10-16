# Requisito oficial — Falhas do Dia / 3012 / Analytics

Este documento faz parte do escopo da branch integrada `work/ames-integrated-clean-v5-20261013` e deve ser implementado sem criar uma 10ª view.

## 1. 3012 — estratégia para Consulta por SN

Para SN exato, suportar `AMES_START_DATE` configurável até agora. No ambiente atual, o valor inicial pode ser `2026-01-01`, mas não deve ficar hardcoded permanentemente.

Regras:
- tentar primeiro o intervalo completo para um SN exato;
- se houver timeout/lentidão, dividir automaticamente em janelas menores;
- continuar de onde parou;
- unir os resultados;
- persistir no SQLite;
- em consultas futuras, usar a base local/cache e buscar somente lacunas temporais;
- para coleta ampla sem SN, nunca consultar um ano inteiro de uma vez: usar chunking/checkpoint.

## 2. Evoluir Top 3 & FPY sem criar nova view

Manter o route/id existente por compatibilidade, mas evoluir a experiência para algo equivalente a **Falhas do Dia & FPY**.

Top 3 continua disponível como resumo, porém o ranking principal não deve ficar limitado a três.

Oferecer pelo menos três modos da mesma base:
1. Ranking de falhas;
2. Ocorrências detalhadas;
3. Linha × turno.

## 3. Ranking de falhas

Cada falha deve mostrar, quando disponível:
- Defect Code;
- nome/descrição da falha;
- quantidade;
- percentual das falhas no escopo;
- taxa por quantidade produzida quando houver denominador confiável;
- linhas afetadas;
- divisão 1º/2º turno;
- PCBAs únicas;
- PCBAs com histórico de reuso relevante;
- componentes reutilizados com histórico de falha.

Cada item deve ser expansível para mostrar as ocorrências/PCBAs que formam a quantidade.

## 4. Informação necessária por ocorrência

Mostrar, quando sustentado pelas fontes:
- nome da falha;
- PCBA;
- linha;
- horário da falha;
- horário de produção/processo 3022;
- turno de produção;
- comentário AT / Repair Comment 3012;
- Repair User;
- se a própria PCBA possui uso anterior com histórico de falha;
- nome da falha anterior da PCBA;
- componentes reutilizados;
- PCBA anterior de cada componente;
- falha antiga ligada à PCBA anterior;
- relação: MESMA FALHA / MESMA FAMÍLIA / OUTRA FALHA.

A visão operacional padrão deve priorizar reuso com histórico de falha/evidência relevante, sem descartar reuso simples da base.

## 5. Reuso e conjuntos

Não supercontar placas quando vários Material SN pertencem ao mesmo conjunto físico.

Preservar simultaneamente três granularidades:
1. PCBAs únicas afetadas;
2. famílias/conjuntos de componente;
3. vínculos Material SN individuais.

Exemplo: Screen + Sub Board + Speaker reutilizados na mesma PCBA podem representar 1 PCBA afetada, 1 conjunto/família e 3 vínculos Material SN.

## 6. Associação não é causa

Categorias permitidas:
- REUSO PRESENTE;
- REUSO COM HISTÓRICO DE FALHA;
- MESMA FALHA;
- MESMA FAMÍLIA;
- OUTRA FALHA;
- CAUSA CONFIRMADA somente com evidência suficiente/AT/classificação.

Nunca rotular automaticamente `falha causada por segundo uso`.

## 7. Gráficos como complemento

Não substituir tabelas e drill-downs.

Falhas do dia:
- Pareto/ranking de todas as falhas;
- quantidade + percentual;
- percentual acumulado;
- taxa por produção quando denominador válido existir;
- falhas por turno/horário;
- comparação Linha × Turno.

Dashboard de reuso:
- percentual de PCBAs com evidência de reuso;
- PCBA reutilizada com histórico de falha;
- componente reutilizado com histórico de falha;
- ambos;
- famílias de componente mais associadas às PCBAs com falha.

Para componente/conjunto, o gráfico padrão deve contar PCBAs únicas e permitir alternar `PCBAs únicas | Vínculos de material`.

## 8. Localização da analytics

- Console MES: detalhe operacional/forense.
- Central principal: somente agregados gerenciais/resumos.

Não duplicar toda a investigação MES na Central principal.

## 9. Interação e filtros

Filtros da view:
- período;
- linha;
- turno;
- CPH;
- Defect Code;
- nome da falha;
- Repair User;
- PCBA;
- família de componente;
- reuso;
- relação histórica.

Clicar em barra, KPI ou falha deve aplicar filtro ou abrir drill-down correspondente.

Objetivo de UX: `bater o olho → identificar problema → expandir → entender as PCBAs envolvidas`.

Não sacrificar densidade operacional nem criar excesso de cards.
