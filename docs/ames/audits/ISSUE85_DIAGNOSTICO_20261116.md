# Issue #85 — diagnóstico antes da implementação

Base exata PR84 `3a736b57230ec3dd14ff48ac00106a857c1fb7a6`; CI 43901362618 SUCCESS 2/2 conferida no GitHub.
Branch independente `work/ames-issue85-reuse-event-timeline-20261116`. Main/PR70/PR84 não alteradas.

## Comprovado no código atual

- PR80 já removeu a segunda tabela 2114. Não reimplementar esse fix.
- `renderBoardComparisonTable` e `renderComponentComparisonTable` exibem 2114/3028; `wireReuse3012Columns` cria OUTRA tabela só de reparos. A cronologia se fragmenta e o reparo de código diferente é filtrado mesmo pertencendo à mesma PCBA.
- O enriquecimento de reparo por A6900 acrescenta uma pessoa observada a uma linha 3012; não oferece seu próprio evento 3022 com relógio/papel. Esta tarefa o manterá como evento independente, sem associação por proximidade.
- `sourceIdentity` e a consolidação do componente não incluem origem/linha/snapshot/revisão/papel. Podem apagar observações diferentes. `board2114Timeline` e `binding_history` são projeções de classificação e omitem campos originais. A nova leitura de apresentação usará registros fontes disponíveis, sem mudar esse classificador.
- Falhas de cache 3022 viram `[]` silenciosamente; indisponibilidade de 3012 pode substituir o placeholder mas não deve apagar os eventos já carregados.
- Campos de nome raw já foram corrigidos em PR78; nomes REPAIR END em leitura local em PR74/76; replay/checkpoints e preflight 3022 corrigidos até PR84 serão preservados byte a byte.

## Contrato proposto

Uma projeção de apresentação de eventos 2114/3028/3012/3022. Cada evento conserva identidade, pessoa e papel próprios, clocks independentes, campos completos, metadados e vínculos observados. Ordenação por instante comprovado; sem horário em grupo explícito, Hist Seq apenas secundário. Remover somente duplicata de identidade/conteúdo equivalentes, sem colar técnico/comentário de reparo a uma falha do mesmo código. Não recalcular uso físico.

RED será executado em unitários e Chromium usando fixture sintética (3 históricos, 2 falhas, 2 reparos diferentes, um operador A6900 distinto). Complementar os negativos de cache, origem, linha/revisão, nomes conflitantes e componentes. O resultado físico continua PENDENTE; nenhum MES/SQLite operacional acessado.

## Saída RED registrada antes de código produtivo

- `node --test scripts/ames-reuse-event-timeline.test.mjs`: 4 testes, 4 FAIL (8 eventos ausentes da mesma projeção; identidade/revisão/autor colapsados; sem horário não explícito; vínculo/proveniência perdidos).
- `node scripts/ames-reuse-timeline.browser.mjs`: FAIL, `2 !== 1`, duas tabelas no detalhe da PCBA em Chromium real com transporte sintético.
- Controle no mesmo runtime: 29 PASS (reuso/paridade/nomes); `ames-experience.browser.mjs` PASS, nove telas × PT/EN × claro/escuro, mobile e fluxos existentes.
- Workflow PR76 estendido exclusivamente para esta branch e o novo cenário Chromium; continua sem empacotamento/instalador.
