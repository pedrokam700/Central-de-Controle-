# PR #70 — incidente da 3012, limites da evidência e nova fronteira de execução

Status: candidata de diagnóstico, **NÃO VALIDADA NO A-MES FÍSICO**. Não promover ou instalar sobre a 0.5.39. A PR #64 não faz parte deste trabalho.

## O que os ensaios de 09/11 de fato demonstraram

- A 3022 em fase `processamento local` significa cruzamento das leituras já recebidas com SQLite; o navegador do A-MES não precisa mudar nesta fase.
- Em consultas 3012 reais, os contadores reportaram `HTTP=1 SN=1 OK=1 datas=0 janela=0`, seguidos de `3012_QUERY_PERIOD_MISMATCH`. Houve chamada HTTP bem-sucedida com SN reconhecida, **mas não houve prova no agente de que o período solicitado foi enviado exatamente**. Isto não comprova que os campos saíram vazios.
- **Novo diagnóstico físico de 09/11 (15:35):** o modo `Horários antigos` conseguiu abrir a 3012 e registrou `HTTP=1 SN=1 OK=1` com `body:from=numeric_timestamp` e `body:to=numeric_timestamp`, sem datas reconhecidas. Esse é um fato novo: os valores estavam presentes, porém serializados numericamente; o parser de `f0b8fe7`/`0cf60ac` só reconhecia datas textuais.
- A tela A-MES mostrava as datas de janeiro a novembro. Data visível na interface não certifica o corpo da requisição.
- As telas 3074, 2114 e 3022 produziram evidências parciais ou completas distintas. Falha da 3012 não deve obrigar repetição daquelas consultas.
- `job done` e `100%` representam fim de execução, jamais a confirmação da cobertura de cada fonte. `Uso indeterminado` no painel de PCBAs é outra deficiência de classificação e não pode ser transformado em primeiro uso por suposição.

## Mudança historicamente associada à regressão

O gate de período na 3012 foi endurecido na consolidação `abc87e1` (06/11) e em `bfd4c8c`, com prova de Ajax, combinação de datas e falha obrigatória. Os ajustes `7add050`, `41f2ff4`, `29ba3ea` e `f0b8fe7` alteraram detecção de formulários/controles ocultos. Os testes sintéticos passaram, porém vários ensaios físicos permaneceram parciais. Portanto **a introdução do gate é comprovada no histórico, mas a causa específica de serialização da requisição MES continua sem comprovação**.

## Separação implementada

1. `Completo` é 3074 + 2114 + 3022; `Reuso` é 3074 + 2114. A 3012 não bloqueia esses modos por padrão. Uma opção explícita avançada ainda permite executá-la junto, com estado de cobertura separado.
2. `Horários antigos` permanece uma etapa 3012 independente, com cache por SN e retomada das lacunas, sem nova consulta 3028/3074/2114/3022. A necessidade de 3074/2114 prévia é verificada.
3. O indicador percentual usa pesos das etapas realmente selecionadas. Fontes faltantes continuam identificadas como não executadas/sem cobertura; nenhuma fonte é inferida completa.
4. O observador passivo de HTTP 3012 compara valores por origem (URL/corpo), preserva duplicidades, distingue formatos de data e rejeita conflitos. A prova final requer **uma mesma requisição de SN e período exatos, resposta HTTP de sucesso e término**. Dados capturados não são substituídos por zero.
   - Após o diagnóstico físico de 15:35, o parser também reconhece Unix timestamps em segundos (10 dígitos), milissegundos (13) ou microssegundos (16), convertidos explicitamente de UTC para `America/Sao_Paulo`, com minutos exatos. Datas numéricas fora da janela, com segundos extras ou deslocadas de fuso continuam reprovadas. Nenhum corpo da requisição foi preservado.
5. Diagnóstico expõe somente categorias de formato (`empty`, `numeric_timestamp`, `iso_day_only`, `other_text` etc.), nomes filtrados de campos e contadores; não inclui corpo, senha, token, cookies ou SN consultada.

## Não comprovado / próximos gates

- Identificar no A-MES real como o navegador serializa os valores de `dteFromDate`, `dteToDate`, `__Data`, parâmetros aninhados e eventual timezone. **Não alterar a forma de envio com base apenas em simulação.**
- Validar uma SN real com período comprovado e campos históricos de Defect/Repair; somente então concluir `3012 GREEN`.
- Validar no posto sem afetar instalação antiga: revisão, 9 views, rota persistente TAXXX_5G, 3074/2114/3022 e reuso (incluindo segunda utilização e alerta). SQLite/WAL, token, identidade/source_id, cache offline e filas anteriores devem permanecer intactos.
- O teste de navegador com Playwright só é executável num ambiente que tenha a dependência e o navegador; testes de unidade não substituem esse ensaio.

Não confundir **mudança de contrato com falha de leitura**: o bloqueio pode ser novo porque a exigência de prova é nova, mesmo quando a consulta continua exibindo registros. A correção física depende de demonstrar qual representação de data realmente viajou pelo HTTP, não de desabilitar a proteção de cobertura.
