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

## Correção adicional — fuso horário de fábrica / identidade exata

- As datas `Defect Time` sem fuso são interpretadas com a regra canônica da fábrica (`-03:00`) e não pela timezone do navegador ou do runner. Valores com `Z`/offset preservam o instante real.
- Horário ausente, somente data (`YYYY-MM-DD`) ou horário inválido **não** comprovam falha anterior nem vínculo à ocorrência.
- Comparações entre uma data 2114 sem fuso e uma data 3028 com offset devem reconhecer o mesmo instante ou uma ordem válida.
- Ao localizar a ocorrência apresentada na tabela Falhas, exigir PCBA + código + horário comprovados e uma **única** ocorrência correspondente. Sem essa prova exibir `não correlacionado` preservando a linha 3028, sem escolher a primeira ocorrência parecida.
- Checar casos 09:50 local (antes de 13:00Z), 10:10 local (depois de 13:00Z), data sem hora, PCBA/código divergentes e duplicidade; o resultado não pode variar com timezone do PC.

Essas alterações são exclusivamente do consumidor de evidência e testes; os coletores congelados permanecem intocados.

## Bloqueio de colisão de `defect_key` entre PCBAs

Um `defect_key` só pode complementar a identidade de uma ocorrência quando a PCBA coincide explicitamente na fonte de falha e no contexto 3022. Se ambas as fontes trouxerem código/horário, divergência de qualquer um invalida a correlação mesmo quando a chave é igual. Chave compartilhada em outra PCBA ou PCBA ausente **não comprova processo/turno** da placa atual.

Contrato focalizado em `scripts/ames-production-evidence-analytics.test.mjs`:
- `defect_key` idêntico com PCBA diferente → `false`;
- PCBA ausente em qualquer lado → `false`;
- mesma chave/placa mas falha/hora explicitamente conflitantes → `false`;
- mesma chave/placa/hora expressa em UTC vs. horário da fábrica → `true`;
- dois contextos 3022, primeiro de PCBA diferente com chave colidente e segundo exato → somente o segundo fornece estação/turno.

**Não se aplica a coletores, não cria nova lógica de turno e não diagnostica causa raiz.**

## Gate adicional — seleção de referência 3022 (sem arbitragem por ordem)
- Um contexto só comprova a referência de processo quando a própria linha possui `production_shift_source=3022`, `production_shift_basis=reference_process`, posto e timestamp válido **até o Defect Time** da ocorrência.
- Um contexto parcial que venha primeiro não esconde o contexto comprovado que venha depois.
- Dois contextos comprovados, porém divergentes na estação, momento, turno ou dia operacional, deixam **a referência desconhecida**; não selecionar o primeiro, o último, o mais próximo nem inferir por heurística.
- Múltiplas representações equivalentes da mesma evidência, inclusive UTC versus horário da fábrica, podem comprovar o mesmo contexto.
- Não combinar a estação de uma linha com o horário de outra para sintetizar prova. Um evento posterior à falha ou horário inválido nunca comprova geração/turno anterior.
- Regressões específicas em `scripts/ames-production-evidence-analytics.test.mjs`. Fonte bruta preservada, sem intervenção no coletor 3022.
