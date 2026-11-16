# PR #70 — incidente da 3012, limites da evidência e nova fronteira de execução

Status: candidata de diagnóstico, **NÃO VALIDADA NO A-MES FÍSICO**. Não promover ou instalar sobre a 0.5.39. A PR #64 não faz parte deste trabalho.

## O que os ensaios de 09/11 de fato demonstraram

- A 3022 em fase `processamento local` significa cruzamento das leituras já recebidas com SQLite; o navegador do A-MES não precisa mudar nesta fase.
- Em consultas 3012 reais, os contadores reportaram `HTTP=1 SN=1 OK=1 datas=0 janela=0`, seguidos de `3012_QUERY_PERIOD_MISMATCH`. Houve chamada HTTP bem-sucedida com SN reconhecida, **mas não houve prova no agente de que o período solicitado foi enviado exatamente**. Isto não comprova que os campos saíram vazios.
- **Novo diagnóstico físico de 09/11 (15:35):** o modo `Horários antigos` conseguiu abrir a 3012 e registrou `HTTP=1 SN=1 OK=1` com `body:from=numeric_timestamp` e `body:to=numeric_timestamp`, sem datas reconhecidas. Esse é um fato novo: os valores estavam presentes, porém serializados numericamente; o parser de `f0b8fe7`/`0cf60ac` só reconhecia datas textuais.
- A tela A-MES mostrava as datas de janeiro a novembro. Data visível na interface não certifica o corpo da requisição.
- As telas 3074, 2114 e 3022 produziram evidências parciais ou completas distintas. Falha da 3012 não deve obrigar repetição daquelas consultas.
- `job done` e `100%` representam fim de execução, jamais a confirmação da cobertura de cada fonte. `Uso indeterminado` no painel de PCBAs é outra deficiência de classificação e não pode ser transformado em primeiro uso por suposição.
- **Novo ensaio físico de 09/11 (16:47):** o job de recuperação seletiva terminou em cerca de 1 segundo, mostrou `3022` apenas em processamento local e `3012: Não programada pelo agente`, com 3074/2114/3022 sem comprovação nesse job. Esse print **não exercitou o parser de timestamps da 3012**; pertence à orquestração/escopo de etapas.

## Mudança historicamente associada à regressão

**Auditoria adicional de ZIPs disponibilizados em 10/11:** as candidatas de 03/11 e a `CENTRAL_AMES_MATRIZ_COMENTARIOS_fe82688` de 05/11 ainda continham o mesmo `ames_3012_live.py` (SHA-256 prefixo `b6374546c7b`). A candidata `CENTRAL_AMES_3012_PERIODO_CORRIGIDO_b9f4c64` de 05/11 é a **primeira versão fornecida** em que o coletor mudou (SHA-256 prefixo `be9778afaaa`), juntamente com `agent_3012_patch.py`, `ames_3012_strategy.py`, `repair_3012.py` e `trace_3012_enrichment.py`. Ela introduziu a prova mais rígida de período e invalidou a confiança de cobertura antiga sem excluir as linhas históricas do SQLite. Em 06/11, `48959f0`, `abc87e1` e `bfd4c8c` deram continuidade ao gate e às tentativas de recuperação. É uma janela de regressão em código, não demonstração de que o A-MES tenha enviado período incorreto.

O gate de período na 3012 foi ampliado em `abc87e1` (06/11) e `bfd4c8c`, com prova de Ajax, combinação de datas e falha obrigatória. Os ajustes `7add050`, `41f2ff4`, `29ba3ea` e `f0b8fe7` alteraram detecção de formulários/controles ocultos. Os testes sintéticos passaram, porém vários ensaios físicos permaneceram parciais. Portanto **a introdução do gate é comprovada no histórico, mas a causa específica de serialização da requisição MES continua sem comprovação**.

## Consulta por SN — auditoria e proteção adicional (10/11)

- O endpoint `/api/v1/sn-lookup` mantém **`include_3012=True` por padrão**, incluindo PCBAs atuais e relacionadas (limite 25). A separação da 3012 dos modos de *Rastreabilidade* `Completo/Reuso` **não** a desativa na Consulta por SN; são fluxos diferentes com coletor histórico compartilhado.
- Foi reproduzida em código uma falha independente de exibição: `run_sn_lookup` engolia a exceção da 3012, concluía o job e deixava `trace_3012` ausente. Mesmo com reparos/comentários armazenados em `repair_history_3012`, a História completa consultada ao vivo podia deixar de mostrá-los. O botão **Consultar base local** permanecia separado, mas isso não restaurava os itens na consulta ao vivo.
- O fluxo de falha da Consulta por SN agora busca somente as PCBAs pertinentes no SQLite existente, sem alterar linhas ou falsificar cobertura. Com registros disponíveis, devolve `trace_3012.status=partial`, `source=LOCAL_SQLITE_3012_UNVERIFIED` e `error=3012_LIVE_QUERY_UNVERIFIED`; sem registros, `status=error`, nunca `zero`. A associação aos componentes é marcada `same_pcba_candidate`, não evento exato. A UI avisa da fonte não comprovada antes da História completa.
- A leitura local degradada é limitada a 200 linhas por PCBA na resposta, com aviso de truncamento; a consulta à base local oferece histórico mais amplo. O sucesso normal e o `include_3012=False` explícito permanecem inalterados.
- Teste isolado com SQLite temporário e A-MES simulado exercita a rota, os três estados (falha com cache, falha sem cache, sucesso), a preservação da 2114/3074/3022 e a ausência de dados de uma PCBA não relacionada. Teste JS confirma proveniência parcial/erro, sem transformar ausência em zero. **Nenhum desses testes é validação física da 3012.**

## Separação implementada

1. `Completo` é 3074 + 2114 + 3022; `Reuso` é 3074 + 2114. A 3012 não bloqueia esses modos por padrão. Uma opção explícita avançada ainda permite executá-la junto, com estado de cobertura separado.
2. `Horários antigos` permanece uma etapa 3012 independente, com cache por SN e retomada das lacunas, sem nova consulta 3028/3074/2114/3022. A necessidade de 3074/2114 prévia é verificada.
3. O indicador percentual usa pesos das etapas realmente selecionadas. Fontes faltantes continuam identificadas como não executadas/sem cobertura; nenhuma fonte é inferida completa.
4. O observador passivo de HTTP 3012 compara valores por origem (URL/corpo), preserva duplicidades, distingue formatos de data e rejeita conflitos. A prova final requer **uma mesma requisição de SN e período exatos, resposta HTTP de sucesso e término**. Dados capturados não são substituídos por zero.
   - Após o diagnóstico físico de 15:35, o parser também reconhece Unix timestamps em segundos (10 dígitos), milissegundos (13) ou microssegundos (16), convertidos explicitamente de UTC para `America/Sao_Paulo`, com minutos exatos. Datas numéricas fora da janela, com segundos extras ou deslocadas de fuso continuam reprovadas. Nenhum corpo da requisição foi preservado.
5. Diagnóstico expõe somente categorias de formato (`empty`, `numeric_timestamp`, `iso_day_only`, `other_text` etc.), nomes filtrados de campos e contadores; não inclui corpo, senha, token, cookies ou SN consultada.
6. **Regressão de auto-retomada reproduzida e corrigida em código:** a mudança `0cf60ac` introduziu `include_3012=false` em Completo/Reuso, mas `trace_auto_resume.needs_continuation()` ainda considerava o `3012:not_run` como falha. Uma execução completa podia assim gerar um novo job `repair_partials`, fazer apenas trabalho local e terminar com a falsa impressão de coleta completa. O planejador agora calcula as fontes obrigatórias a partir de `trace_mode` + `include_3012`, com compatibilidade conservadora para jobs legados. A tela de progresso também deixa de cobrar uma 3012 explicitamente excluída. Foram incluídos testes para a recuperação legítima de etapas realmente parciais, a exclusão intencional e `history_only`.

## Não comprovado / próximos gates

- Identificar no A-MES real como o navegador serializa os valores de `dteFromDate`, `dteToDate`, `__Data`, parâmetros aninhados e eventual timezone. **Não alterar a forma de envio com base apenas em simulação.**
- Validar uma SN real com período comprovado e campos históricos de Defect/Repair; somente então concluir `3012 GREEN`.
- Confirmar que o usuário selecionou `Horários antigos` quando pretende executar a 3012; o modo `Completo` da candidata deliberadamente não a agenda sem a opção avançada. O print de 16:47 não permite distinguir visualmente qual modo estava selecionado.
- Validar no posto sem afetar instalação antiga: revisão, 9 views, rota persistente TAXXX_5G, 3074/2114/3022 e reuso (incluindo segunda utilização e alerta). SQLite/WAL, token, identidade/source_id, cache offline e filas anteriores devem permanecer intactos.
- O teste de navegador com Playwright só é executável num ambiente que tenha a dependência e o navegador; testes de unidade não substituem esse ensaio.

Não confundir **mudança de contrato com falha de leitura**: o bloqueio pode ser novo porque a exigência de prova é nova, mesmo quando a consulta continua exibindo registros. A correção física depende de demonstrar qual representação de data realmente viajou pelo HTTP, não de desabilitar a proteção de cobertura.
