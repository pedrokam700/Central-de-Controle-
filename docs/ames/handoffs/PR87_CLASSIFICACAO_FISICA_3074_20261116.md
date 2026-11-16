# PR87 — investigação e correção da classificação física 3074

**DRAFT; homologação física PENDENTE. Sem merge, deploy, instalador ou coleta no posto.**

## Identidade verificável

- Repositório: `pedrokam700/Central-de-Controle-`.
- Base exata: [PR86](https://github.com/pedrokam700/Central-de-Controle-/pull/86),
  `5c19beee85125830e0b483c5cf9708eb8de25228`, CI de referência
  [43907084203](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/43907084203).
- Branch: `work/ames-3074-physical-use-audit-20261116`;
  [PR87](https://github.com/pedrokam700/Central-de-Controle-/pull/87) baseada na branch da #86.
- Fase inicial, sem runtime alterado: RED `13676a742bc926b12c79c985ec1b5299766e9bf8`;
  [CI RED 43923391833](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/43923391833).
- Correção de runtime e testes: **`2424f8c2e87125159091fc759bf0db1c9da3f26f`**;
  [CI 43925011200](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/43925011200).
  Nessa primeira CI os contratos passaram; o job visual parou por falta de
  `openpyxl` na preparação do runner. O workflow foi corrigido para instalar as
  mesmas dependências Python já usadas pelo job de contratos e pela fixture local.
  Este handoff é documentação posterior; o checkpoint final da PR registra também
  o SHA/CI que contém o próprio handoff, a preparação corrigida e o resultado dos dois jobs.
- Parecer anterior à implementação:
  [diagnóstico e plano por módulos](../audits/CLASSIFICACAO_FISICA_3074_DIAGNOSTICO_20261116.md).
  Não atribui os mecanismos sintéticos à instalação fabril sem prova local.

## Resultado efetivamente corrigido

| Fronteira | Antes reproduzido | Comportamento corrigido |
|---|---|---|
| Revisões brutas → recuperação | Três self-rows sem data venciam uma montagem datada já salva; classificador perdia o uso | Seleção prioriza montagem interpretável de consulta PCBA confirmada. Brutos/head/revisões não são reescritos. União existente continua limitada aos self-bindings confirmados, sem importar materiais de outra página. |
| Relatório por ocorrência | Última captura do mesmo SN, de outra linha, substituía a base da linha selecionada | Base localizada por SN+linha+código+instante. Não muda a identidade 3028 ou liga atendimentos por semelhança. |
| Normalização reversa 3074 | `Aut Cmf1=PCBA` com `Sn Type` vazio era aceito para própria PCBA, mas ignorado no histórico do componente | Os três leitores reversos aceitam o mesmo marcador PCBA explícito. Barcode sem marcador não passa a ser PCBA. |
| Ciclos PCBA → ordinal na falha | Último ciclo encerrado era usado durante lacuna; sobreposição escolhia o último arbitrariamente | Contagem conhecida preservada; exige intervalo único para ordinal. Lacuna/sobreposição permanece indeterminada e reusos anteriores na falha ficam `None`. |
| Componentes → relatório → insights | `None` e confirmação ausente viravam zero+1 em duas camadas | Desconhecido continua desconhecido; histórico conhecido não vira primeiro uso na falha. Fallback legado de usos conhecidos também exige confirmação atual explícita. |
| Ingestão/índice canônico | Zero de legado explicitamente parcial podia virar primeiro uso | Ingestão não aceita esse zero como uso comprovado; projeção também defende linhas legadas já persistidas. Bruto continua disponível no payload. |
| Cache da projeção | Insights `ready:true` v11 poderiam permanecer após correção sem nova coleta | Versão derivada 12 força nova projeção local; revisão antiga permanece acessível e imutável. Sem migração de schema nem limpeza de dados. |
| Insights → Dashboard | Linha era verificada, mas origem/snapshot/revisão explicitamente conflitante ainda entrava e recebia referência da raiz | Usa a mesma proteção de linhagem explícita já existente em evidência de produção. Ausência de campo opcional legado não vira autenticidade nova. |

Arquivos funcionais: `ames/agent/{integrated_snapshot_history,canonical,store}.py`,
`ames/factory-engine/core/{uso_pcba,temporal_3074}.py`,
`ames/factory-engine/reports/{relatorio_3028_3074,relatorio_v015}.py`,
`ames/data/{reuse-cohorts,production-evidence}.mjs` (neste último só exportação
do helper existente). `sw.js` renova a revisão do cache para evitar cliente antigo
após uma futura entrega; nenhum cache instalado foi limpo ou acessado.

## Evidência RED/GREEN e reprodução

RED anterior às correções: **9 falhas de asserção / 12 testes Python**, sem erro de
execução; a CI RED confirma as nove falhas no job de contratos. Node local:
**1 falha / 2 testes**. O navegador da base passa no mesmo RED; não se alega
que o teste antigo das nove telas detectava estas lacunas do classificador.

Após correção, a matriz foi ampliada com um controle de legado sem confirmação
e um percurso real de projeção: **13 testes Python e 3 Node PASS**. A fixture
executa `executar_varredura` com respostas sintéticas 3074, grava SQLite novo,
relê o bruto, constrói insights, exporta revisão canônica, normaliza com o
adaptador JS real e calcula/renderiza o Dashboard. Não importa o startup de
`agent.py` nem depende de credenciais ou de um SQLite pré-existente.

Matriz: usos 1/2/3, Y e N históricos, operações duplicadas, componente transferido,
datas ausentes/inválidas/futuras, sem vínculo próprio, lacuna, sobreposição,
histórico incompleto, confirmação ausente, duas linhas com mesmo SN, revisões
com riqueza diferente, outro snapshot vazio, export antigo imutável e metadados
explicitamente conflitantes. Não inventa vínculo a partir de falha 2114/3022.

```sh
python3 scripts/agent-3074-physical-classification.test.py
node --test scripts/ames-3074-physical-classification.test.mjs
node scripts/ames-3074-physical-classification.browser.mjs
```

Para inspecionar a fixture canônica sem dados reais:
`python3 scripts/agent-3074-physical-classification.test.py --fixture`.
Seu `source_id` é gerado pelo SQLite descartável e não representa posto real.

Gate completo está em `.github/workflows/ames-pr76-cross-views.yml`:

- 852 contratos Node da Central PASS, incluindo as três novas provas.
- 109 testes do motor Python PASS. Suite cruzada Python: 142 testes PASS;
  suites adicionais 3074/histórico/transferência: 86 testes PASS, mais gate
  standalone de paginação. Ao todo, 337 testes unittest, sem contar duplicatas
  eventualmente exercidas por subprocessos do gate Node.
- N1/N2/N3, U1, S1, nomes, escopo de produção, autenticação e pareamento PASS.
- 3022 replay puro/misto, prova de checkpoint, duas tentativas sem campo,
  observabilidade (29 testes), Home/CDP, navegação/OPC/ExtJS PASS.
- Chromium: nove telas × PT/EN × claro/escuro, timeline #85, sync/reload,
  pairing e conclusão 3028 PASS. Novo Chromium 3074 valida contadores e partições
  conservados e os detalhes 2º/3º/indeterminado em quatro combinações idioma/tema.
  Exemplo sintético: componentes `4 = 1 primeiro + 2 reutilizados + 1 indeterminado`;
  o indeterminado preserva duas PCBAs conhecidas sem receber ordinal na falha.
- Artifacts da CI contêm somente screenshots sintéticos, nome
  `ames-3074-browser-<SHA>`. Não há pacote, instalador ou artifact operacional.

O motor inicialmente detectou dois contratos V013 de lotes sem Bind que a nova
verificação de sobreposição afetava. Foram preservados e os 109 testes voltaram
a passar. O gate hash também acusou corretamente a alteração deliberada da
política temporal; seu pin foi renovado com justificativa, sem trocar manifesto
CLEAN V3 ou afrouxar hashes dos coletores congelados.

## Preservação e rollback

Conferidos sem diff contra #86: timeline e montagem de detalhes da Issue85,
`agent.py`, `engine_bridge.py`, nomes/reparos SN, `tela_3022.py`, fluxo congelado
3028→3074 e coletores 3028. Clique 3022 de cinco segundos não foi alterado.
Nenhuma chamada ao Chrome/MES fabril foi executada; Chromium é headless local,
com servidor HTTP e dados sintéticos. Sem alteração do guardian, rede, instalação,
identidade/outbox ou SQLite/WAL operacional.

Referências remotas conferidas: main `b283b1764432f5d90486d38a7553b30542a5c118`,
PR70 `fddc75438796cdfcc8a133eb8193d08fa1d9b783`, PR84
`3a736b57230ec3dd14ff48ac00106a857c1fb7a6`, PR86 `5c19beee85125830e0b483c5cf9708eb8de25228`.
A branch da #87 é a única referência movida nesta missão; todas as PRs continuam
sem merge. Rollback de código: reverter os commits próprios sobre a #86. Não há
rollback de schema ou bruto. Export v12 é novo registro derivado; exports antigos
não foram convertidos retroativamente em novos fatos.

## O que continua dependendo de comprovação

1. **Causa das capturas fabris específicas.** Não tivemos SQLite/captura, SHA
   servido, source_id, snapshot_id e revisão dos prints 98/825. P1–P8 demonstram
   caminhos possíveis, não a incidência de cada um no posto. Uma comparação
   verificável deve usar os mesmos bytes brutos e a mesma identidade completa,
   anotando diferenças entre export antigo imutável e nova projeção.
2. **Horário de lote.** O contrato histórico V013 aceita Batch Id+Prod Time
   da própria PCBA como `pcba_batch_prod`. Foi preservado com essa base explícita;
   não se criou Bind/Unbind. Sua equivalência ao instante físico exato de montagem
   exige validação do significado dos campos MES.
3. **Histórico completo e ciclos repetidos na mesma PCBA.** Componentes contam
   PCBAs distintas conforme contrato existente, não todas as remontagens possíveis
   da mesma peça na mesma placa. Históricos parciais e união de páginas só provam
   observações/lower bounds. Quantidade observada não certifica ordinal absoluto
   de toda a vida útil nem completude populacional. Não alteramos silenciosamente
   esses contratos para produzir contadores desejados.
4. **Lacunas e dados contraditórios reais.** Datas ausentes, sessões sem fronteira,
   timezone fora do contrato e sobreposições precisam de evidência da 3074;
   contagem de falhas/estações não supre vínculo físico ausente. Desconhecido
   permanece desconhecido; nenhuma nova coleta integral foi feita para ocultá-lo.

Próximo passo: revisão da PR DRAFT e comparação supervisionada de evidência já
armazenada com identidade/SHA comprovados. O resultado aqui é GREEN de código e
regressões sintéticas. **Não é GREEN físico e não autoriza instalação/deploy.**
