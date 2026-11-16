# PR70 — KeyError em histórico 2114 indeterminado (11/11/2026)

## Evidência física (não homologação)

- Operador selecionou todos os modos de falha após teste seletivo de três PCBAs.
  Não atribuir a regressão de massa a seleção incompleta sem provar o escopo do job.
- TAN10103, snapshot local: job `a232c4a71593`, duração aproximada 29m25s,
  mostrou 3074 `37/37 COMPLETE`, 2114 `46/46 complete`, 3022 `37/37
  PROCESSED` e 3012 `46/46 complete`.
- O dashboard exibia 37 PCBAs com uso indeterminado, sem insights, embora as
  fontes tivessem registros salvos. Código seguro retornado pelo agente:
  `LOCAL_INSIGHT_BUILD_FAILED_KEYERROR_CLASSIFICAR_HISTORICOS_L86`.
- TAN10102: 47 PCBAs, 30 em 1º uso, 13 em 2º+ uso e 4 indeterminadas;
  não converter essas quatro para 1º uso por heurística.

## Causa confirmada no código

`core.failure_taxonomy.compare` retorna `classification=UNKNOWN` em evidência
negada/insuficiente ou subtipo ambíguo. `core.correlacao_falhas.comparar_falhas`
traduz isto para `relation=INDETERMINADA`, mas o dicionário `counts` em
`classificar_historicos` só declarava `MESMA_FALHA`, `FALHA_SIMILAR` e
`FALHA_DIFERENTE`. A linha `counts[cmp["relation"]] += 1` lançava `KeyError`,
invalidando toda a projeção de reuso de uma linha física.

`reports.relatorio_v015._reuse_analysis` também tratava históricos 2114 reais,
cuja relação era indeterminada, como `SEM_HISTORICO_2114` ao calcular a relação
mais forte, o que podia induzir erro em categorias de componentes sem histórico.

## Correção isolada e testada localmente

- Contagem de `INDETERMINADA` independente e preservação explícita em
  `unknown_count`/`prior_unknown_count` no mecanismo de falhas.
- Relação indeterminada não conta como mesma falha, mesma família ou falha
  diferente e não equivale a ausência de histórico.
- Material antigo com relação indeterminada segue como histórico não classificado,
  sem entrar no contador de PCBA sem histórico.
- Testes novos reproduzem o KeyError antigo, exercitam a view V0.15 e os KPIs
  V0.16, e previnem falsa recorrência e falsa ausência de histórico.
- Central Quality Gate executa regressões Python do motor por padrão.

## Verificações e limites

- V0.16 engine unittest: 103 testes, PASS.
- Focais Python 2114/3074, recuperação local e contrato canônico: PASS.
- Os resultados acima são **somente testes sintéticos locais**, não aprovação
  da atualização em fábrica. CI por SHA exato e gate físico continuam pendentes.
- **Não repetir a coleta MES para testar este fix.** O exportador canônico já
  reprocessa uma projeção `ready=false` mesmo sem novo epoch MES, desde que
  o builder esteja disponível. Verificar nova revisão local após atualização
  segura da instalação; não sobrescrever o SQLite, WAL, configurações ou tokens.
- Aceitação física: para TAN10103 com o mesmo snapshot, passar a gerar grupos,
  KPIs e drill-downs sem nova consulta 3074/2114/3022/3012; conferir 1º/2º uso
  somente nas PCBAs com evidência temporal própria e verificar TAN10102 sem regressão.
