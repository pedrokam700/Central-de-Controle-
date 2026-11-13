# PR #70 — 11/11/2026 — limite de minuto da 3012 e consulta indevida às 23:59

Status: **correção em código; NÃO validada no A-MES físico**. Não marcar 3012 GREEN sem um job de fábrica com SN, período HTTP e resposta comprovados.

## Evidência reportada

- Às 08:03 de 11/11/2026, a 3012 estava com `Defect Time Start=2026-11-11 23:59` e `Defect Time End=2026-11-11 23:59`, sem linhas no grid. O horário de início no futuro é inválido para recuperar histórico anterior. A imagem sozinha não demonstra se o agente havia enviado essa consulta ou se eram apenas valores remanescentes da interface.
- Os dois prints do dashboard não pertencem a um mesmo snapshot comprovado: um mostra 49 PCBAs (32 primeiro uso, 13 segundo uso, 4 indeterminadas) e outro 41 PCBAs todas indeterminadas. Não atribuir causalidade à 3012 sem inspecionar escopo, fontes e cobertura de cada job; preservar a 3074 e a classificação existente.

## Defeito reproduzido localmente

- Os dois caminhos automáticos da 3012, `exact_sn_history_window` e `collect_historical_3012`, solicitavam o fim do dia **23:59:59**.
- O formulário 3012 seleciona apenas **HH:MM**, e o coletor envia esse limite como **23:59**, equivalente a 23:59:00 no cache SQLite.
- Uma cobertura comprovada até `23:59:00` comparada com um pedido até `23:59:59` deixa uma lacuna artificial de `23:59:01–23:59:59`. Ela é enviada para o formulário arredondada como `23:59–23:59`, exatamente o formato do print.
- O teste com SQLite temporário comprova esse mecanismo de regressão. **Não comprova que ele foi a causa da sessão real**; para isso, é necessário obter as faixas e o estado do job de 3012, sem compartilhar credenciais, tokens ou dados brutos sensíveis.

## Ajuste cirúrgico

1. Os dois caminhos de coleta usam a mesma função `mes_day_end` e terminam em `23:59:00`, compatível com a precisão do formulário, sem segunda fração fictícia.
2. Teste Python demonstra que a cobertura íntegra não gera a lacuna de 59 segundos, e que o fluxo de múltiplas PCBAs usa o mesmo limite. Teste de contrato JS garante as chamadas por ambos os caminhos.
3. Sem alterações na lógica de equivalência de falhas, seleção de usuários AT, cobertura de 3074, dashboards, banco existente, prova HTTP de 3012, recuperação de jobs ou instalador.

## Limites e validação física

- Uma coleta inicial pode continuar usando **23:59 como fim do dia**. Isso não é um início válido quando o relógio ainda está às 08:03. Depois da correção, a tela não deve exibir **início 23:59 / fim 23:59** causado pela lacuna artificial.
- Ainda há uma questão independente para avaliar: marcar o resto do dia futuro como já consultado pode impedir nova consulta de reparos que surgirem à tarde. Tratar explicitamente num próximo ajuste com teste de coleta incremental, não inferir cobertura completa do futuro.
- Na fábrica, testar uma SN sob `Horários antigos`, verificar a faixa efetivamente solicitada, resposta HTTP e histórico da 3012; depois repetir no mesmo dia sem reabrir `23:59–23:59`. Se o erro persistir, coletar apenas código, estágio, contadores e horário do job.
- Preservar a instalação funcional e os dados SQLite/WAL; esta candidata não é automaticamente aprovada para instalação em produção.
