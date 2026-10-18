# PR #36 — Gate temporal da ocorrência (2026-10-17)

Esta PR é empilhada sobre a **PR #35** e não altera os candidatos físicos da **PR #33** ou da **PR #35**.

## Problema e contrato
- Uma evidência `2114` só pode ser rotulada **falha anterior** quando estiver vinculada à mesma PCBA e ambos os horários `Defect Time` forem interpretáveis e estritamente ordenados.
- Um drilldown `mesma falha / mesma família` só pode ser promovido à ocorrência de `Falhas` com identidade exata de **PCBA + Defect Code + Defect Time**. Falta de qualquer campo não pode criar correlação positiva.
- A reutilização da própria placa é um **fato sobre a PCBA**, não necessariamente sobre a falha: portanto uma linha de uso associada à PCBA pode aparecer sem Defect Time, desde que nenhum código/horário opcional informado conflite com a ocorrência.
- A evidência bruta não é apagada: o registro incompleto deve continuar consultável na fonte e sua ausência de comprovação aparece como `—` na cadeia, não `0`.
- Nenhuma correlação vira diagnóstico de causa raiz.

## Gate automatizado
`scripts/ames-failure-occurrence-evidence.test.mjs`: passado remoto, futuro, tempo inválido, PCBA divergente, drilldown sem PCBA, sem Defect Code, sem Defect Time, match completo, reutilização própria em escopo PCBA e PT/EN. Manter todas as suítes A-MES Node, Python, CLEAN V3, navegador e Agent+Firestore GREEN.

## Gate físico
Somente após teste da PR #33 e da PR #35:
1. Uma PCBA com falhas históricas datadas e ocorrência atual, comparando 2114 com Página Falhas.
2. Uma linha de histórico sem horário (ou fonte parcial) deve permanecer desconhecida, nunca "falha anterior comprovada".
3. Um mesmo código em outra PCBA deve **não** produzir alerta para a PCBA atual.
4. Reuso comprovado da PCBA (3074) deve permanecer visível se o registro não possuir vínculo específico a uma falha.
5. Anexar SHA, prints, horário da fábrica, SN, linha, estado de fonte e PASS/FAIL/BLOCKED.

Não alterar coletores 3012/3022/3028/3074/2114, Firebase, porta 8765, `main` nem os pacotes físicos das PRs anteriores. Não mergear antes de teste físico e CI apropriados.
