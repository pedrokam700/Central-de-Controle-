# REQUISITO CANÔNICO — PARIDADE DO CONSOLE MES (9 VIEWS)

Data de registro: 2026-10-09

## Regra principal

A Central V2 deve preservar as 9 views operacionais da automação atual como baseline mínima de funcionalidade e experiência.
A V0.5.22 funcional é a referência mínima comprovada de comportamento. A automação local 3022-R12 é a referência operacional atual para as evoluções posteriores, especialmente 3022, coleta seletiva, rastreabilidade e bootstrap.

Se algo funciona na V0.5.22 e não existe de forma equivalente ou melhor na Central V2, a migração ainda não está completa.

## As 9 views obrigatórias

1. Monitoramento
2. Top 3 & FPY
3. Falhas
4. Consulta por SN
5. Rastreabilidade
6. Dashboards de reuso
7. Processo / 3022 & AT
8. Base local
9. CORA conhecimento

## Regras de preservação

- As 9 views devem continuar existindo dentro da Central V2.
- Não basta preservar apenas os nomes: as funções, controles e fluxo operacional de cada view também devem permanecer.
- A interface pode ser melhorada visualmente e funcionalmente, mas não simplificada de forma que perca capacidades existentes.
- A aparência final deve continuar claramente reconhecível para quem já usa a automação local.
- Se uma nova solução estiver apenas “diferente”, manter a referência da automação.
- Se estiver mais bonita mas perder função, manter a referência da automação.
- Se estiver claramente melhor e preservar tudo, apresentar comparação antes de substituir a experiência atual.
- A V0.5.23/R12 e candidatos seguintes podem fornecer melhorias adicionais, mas somente quando não reduzirem a paridade.

## Distinção crítica de Dashboard

O “Dashboards de reuso” da automação NÃO é o Dashboard geral da Central.

Ele é uma área especializada para análise de segundo uso/reutilização, incluindo PCBA e componentes/materiais reutilizados.

Portanto:
- Dashboard geral da Central = visão operacional ampla.
- Dashboards de reuso = análise especializada de segundo uso/reutilização.

Os dois devem coexistir.

## Conteúdo/fluxo que deve ser preservado

Entre os controles e comportamentos que não devem desaparecer:
- seleção de linha;
- Linha 1 / Linha 2 / Linha 3 independentes;
- FPY;
- Check FPY;
- Quantity;
- ocorrências;
- Top 3;
- atualização do dia anterior;
- monitoramento recorrente;
- atualização N/Y;
- rastrear 3074 + 2114 + 3022;
- coleta completa, somente 3022 e somente reuso/histórico quando o agente suportar;
- consulta SN com 3074/2114/3022;
- históricos;
- reuso de PCBA separado de reuso de Material SN;
- dashboards/matriz de reuso;
- drill-down que identifique os itens exatos por trás do indicador;
- horário real/processo 3022 separado do Defect Time;
- Excel;
- base local;
- CORA conhecimento;
- demais controles funcionais existentes na automação atual.

## Processo / 3022 & AT

A view deve continuar existindo e preservar evidência temporal sem converter correlação em causa.

Na referência 3022-R12 o coletor real já existe localmente e deve ser consumido pela Central quando disponível. A Central deve distinguir:
- Defect Time = detecção/registro;
- processo/posto relevante = evidência temporal;
- montagem/teste até A5700 vs pós-teste/packing;
- Manual/Automatic;
- regras configuráveis por CPH/família de falha;
- múltiplas passagens/retrabalhos e seleção da passagem válida anterior à ocorrência atual.

Ausência de 3022 continua sendo “não coletado”, nunca zero e nunca dado inventado.

## Arquitetura

A integração deve ser nativa dentro da Central.

Não usar:
- iframe;
- segunda aplicação paralela;
- segundo Firebase/store;
- segundo Auth;
- segundo agente.

Usar o mesmo:
- state.ames;
- Auth;
- agent client;
- scheduler global;
- SQLite;
- contratos canônicos;
- coletores existentes.

## Regra de aceitação

A migração do Console MES só pode ser considerada completa quando:

1. As 9 views existirem.
2. Cada view preservar suas funções atuais ou oferecer uma alternativa comprovadamente superior.
3. Nenhuma função útil da V0.5.22 funcional tiver desaparecido.
4. O Dashboard de reuso continuar separado do Dashboard geral.
5. A experiência permanecer próxima e reconhecível em relação à automação atual.
6. Melhorias posteriores da V0.5.23/R12/candidato forem incorporadas quando realmente superiores.
7. A interface isolada antiga só puder ser removida após paridade funcional confirmada no posto real.

## Resumo em uma frase

Mesmo motor + mesmas funções + mesmas regras + interface integrada e melhorada, sem perder a experiência operacional que já funciona.
