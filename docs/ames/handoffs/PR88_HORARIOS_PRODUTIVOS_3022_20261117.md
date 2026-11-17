# PR88 — horários produtivos 3022 e diagnóstico das lacunas

**PR DRAFT. Validação física PENDENTE. Sem merge, deploy ou acesso ao posto.**

## Identidade e checkpoints

- Repositório `pedrokam700/Central-de-Controle-`.
- Base obrigatória preservada: [PR87](https://github.com/pedrokam700/Central-de-Controle-/pull/87),
  `fed8076b15f95d1a037ed369ce0a02aaf46b2280`; CI base
  [43925495554](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/43925495554).
- Branch isolada: `work/ames-3022-production-time-audit-20261117`;
  [PR88 DRAFT](https://github.com/pedrokam700/Central-de-Controle-/pull/88) contra a branch da #87.
- Parecer anterior a runtime:
  [PR88_HORARIOS_3022_DIAGNOSTICO_20261117.md](../audits/PR88_HORARIOS_3022_DIAGNOSTICO_20261117.md).
- RED publicado primeiro: `337032024912f1af677af6950bda8b00c4f118cd`;
  [CI RED 44064493878](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44064493878).
  Somente diagnóstico, testes e workflow nesse commit. Python: 10 testes com
  12 falhas de asserção, contando subcasos; Node local: 7 falhas/9 testes.
  O navegador antigo passava; ele não detectava essas falhas de correlação.
- Runtime e provas ampliadas: **`45b32053159378fe4da29e8e853afc1d8cadcf80`**;
  [CI 44068056618](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44068056618),
  **2/2 jobs SUCCESS**: 861 contratos Node, 393 testes unittest Python, gates
  standalone, auditorias extras e sete roteiros Chromium. [Screenshots sintéticos](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44068056618/artifacts/14321671842).
  O checkpoint final da PR registra também o SHA/CI do commit documental que
  contém este handoff. Não confundir SHA de código, SHA documental e aceitação física.

As contraprovas adicionais de revisão/período, checkpoint vazio posterior,
duplicidade direto/aninhado e data sem relógio foram registradas na discussão
antes dos respectivos ajustes. Uma data JS impossível (30/02) também recebeu
teste contra rollover; um teste de preservação impede que o filtro produtivo
elimine o retorno AT do contexto separado.

## Conclusão independente

Há mecanismos reproduzíveis que **perdem uma referência existente** e outros que
**aceitam uma referência que deveria permanecer pendente**. Não são o mesmo defeito.
Os 127/173 e 46 pendentes pertencem à revisão histórica citada na auditoria de
16/11. Não foi fornecido nem acessado seu SQLite/payload/identidade; esta missão
não mede novamente aquela população nem atribui suas 46 lacunas a uma causa única.

O caminho auditado é 3028 → ocorrência → confirmação individual 3022 → bruto e
checkpoint → correlação local → SQLite → revisão canônica → normalização JS →
Dashboard/Falhas/Processo/Rastreabilidade/Consulta SN. Falhas 3012/2114, reparo e
detecção não suprem um horário produtivo ausente.

## Antes versus corrigido

| Mecanismo demonstrado | Correção e limite |
|---|---|
| CONFIRMED aceitava SN, linha, source_id, snapshot, revisão ou período explicitamente contraditórios | O replay e a leitura nova confrontam as contraprovas. Campos opcionais ausentes em legado não são inventados. Revisão antiga existente no mesmo escopo permanece reutilizável sem CDP. Página individual parcial não vira completa. |
| Planejador trocava histórico positivo por leitura vazia posterior | Mantém a resposta anterior íntegra. Não une páginas nem soma linhas de consultas distintas. CONFIRMED_EMPTY permanece observação de uma leitura, não retratação de todas as passagens históricas. |
| Posto mapeado aceitava END LOT de outra linha ou explicitamente AT | O adapter filtra a elegibilidade da referência; bruto, operadores e timeline ficam integrais. Processo anterior e ciclo reparo/retorno são preservados separadamente usando o histórico integral quando necessário. View e correlacionadores originais não foram editados. |
| Chave legada diferente da chave SQLite deixava horário da ocorrência vazio | Projeção reassocia somente uma identidade única por PCBA+linha+código+instante equivalente. Chave original fica no SQLite e como proveniência. Chave atual contraditória ou correspondência ambígua não recebe vínculo novo. |
| Defect Time local e UTC contraditórios eram aceitos; AT podia receber rótulo produtivo | Validação preserva conflito de relógio e recusa referência A69xx. Não desloca fuso para enquadrar a passagem. UTC ingênuo da grid e horário local da falha continuam dimensões distintas. |
| Data sem relógio virava meia-noite; JS aceitava calendário impossível | Exige relógio interpretável e data válida antes da prova. Mantém bruto e pendência, sem preencher 00:00. |
| Map por defect_key descartava contexto conflitante; contexto aninhado era carimbado com outro snapshot | Valida identidade explícita antes da contextualização; referências diferentes sobrevivem para produzir conflito. Duplicatas equivalentes SQLite/adapter, incluindo Hist Seq string/número e 0/false, não viram nova ocorrência. |
| Falhas/SN escolhiam primeiro contexto, divergindo do cálculo diário | Um seletor compartilhado usa a ocorrência exata e todas as provas compatíveis. Parcial anterior não oculta referência boa; dois valores comprovados diferentes permanecem conflito. Prova na própria ocorrência não contorna conflito posterior. |
| Contextos vazios geravam uma única explicação genérica | Novo diagnóstico derivado por ocorrência separa estado de consulta, correspondência e prova. Não certifica ausência física nem completude do MES. |

A projeção passa a **v13**, para regenerar o derivado sem nova consulta MES.
Exports antigos continuam imutáveis; não há migração de schema, limpeza de cache
operacional, reescrita de bruto ou alteração de identidade da fonte.

## Classificação verificável das lacunas

`canonical.production_diagnostics` contém PCBA, ocorrência, origem, linha,
snapshot/revisão, `code`, `query_state`, quantidade de contextos e duplicatas.
`physical_absence_proven` permanece **false**. A 3022 não prova ausência global
de passagem só porque o contexto está vazio ou o evento não está no retorno.

| Classe solicitada | Diagnóstico / ação segura |
|---|---|
| Contexto não carregado | `CONTEXT_NOT_LOADED`: há resposta salva/bruto observado, falta projeção local. Reprocessar com resposta confirmada já disponível, sem forçar nova coleta. |
| PCBA não consultada | `PCBA_NOT_QUERIED`: não há evidência de consulta nesse escopo. O nome do código não afirma inexistência física de passagem. |
| Consulta parcialmente recuperada | `PARTIAL_QUERY` para página individual não confirmada/completa. Uma PCBA confirmada dentro de lote parcial continua independente e reutilizável. `query_state` separa CONFIRMED, CONFIRMED_EMPTY, RAW_OBSERVED, PARTIAL e UNKNOWN. |
| Ocorrência sem correspondência | `NO_EXACT_OCCURRENCE`: chave/PCBA/linha/código/instante não permitem vínculo exato e único. |
| Posto não mapeado | `REFERENCE_UNMAPPED`: não ampliar matriz para produzir cobertura artificial. O fallback de montagem já existente continua identificado como estimativa operacional. |
| Passagem não encontrada | `NO_REFERENCE_PASSAGE`: nenhuma referência elegível anterior na evidência usada; não é zero global nem prova de que a peça nunca passou pelo posto. |
| Horário inválido | `INVALID_DEFECT_TIME` / `INVALID_REFERENCE_TIME`: faltante, ilegível ou sem relógio; não preencher com data da 3028 ou hora de reparo. |
| Fuso divergente | `TIMEZONE_CONFLICT`: relógios explícitos não concordam; manter originais e pendência. |
| Conflito de revisão/prova | `CONFLICTING_REFERENCES`: duas referências diferentes da mesma ocorrência; manter ambas e consultar export histórico exato, sem escolher ordem do array. |
| Evidência duplicada | `identical_duplicates` registra repetição equivalente. Não aumenta ocorrências nem gera conflito artificial. |

`AT_REFERENCE`, `FUTURE_REFERENCE` e `UNVERIFIED_REFERENCE` são diagnósticos
adicionais de referência recusada. `PROVEN` exige prova temporal válida;
ele não significa causa raiz, completude da população ou homologação física.

Os diagnósticos entram na leitura canônica local e no motivo das pendências
do gráfico de horários, com PT/EN. A publicação compartilhada mantém sua whitelist
anterior: não foi alterado `sync.mjs`, Firebase, regras ou backend remoto. Assim,
revisões compartilhadas que omitam o novo diagnóstico continuam com a explicação
conservadora anterior; referências e conflitos continuam validados pelos helpers.

## Provas e regressões

```sh
python3 scripts/agent-3022-production-evidence.test.py
node --test scripts/ames-3022-production-evidence.test.mjs
node scripts/ames-3022-production-evidence.browser.mjs
```

Fixture exportável: `python3 scripts/agent-3022-production-evidence.test.py --fixture`.
Usa varredura/correlação e export reais, com respostas sintéticas e SQLite novo
em `TemporaryDirectory`; patch de CDP falha se uma consulta não autorizada for
tentada. Não importa bootstrap do agente nem abre Chrome/MES da fábrica.

Matriz ampliada: **14 testes Python e 10 Node**. Duas linhas, SNs semelhantes,
mesmo código em duas falhas, passagens anteriores/posteriores, REPAIR END/A6900,
AT usando código de montagem, retorno pós-reparo, UTC versus horário local,
turnos/07:00, datas inválidas, checkpoint confirmado/parcial, chave legada,
revisão antiga, período errado, contextos conflitantes e duplicados.

O mesmo SQLite alimenta os quatro consumidores. Na fixture, **3 de 13** ocorrências
possuem prova e **10 permanecem pendentes**; são números sintéticos, não a atualização
de 127/173. Duas ocorrências GOOD recebem 09:00 e 10:30, respectivamente; eventos
futuros/reparo não substituem esses horários. A revisão anterior continua sem o
enriquecimento posterior, e a outra linha não toma a referência emprestada.

O Chromium novo monta o gráfico real de Falhas do dia, inspetor de Falhas,
prova temporal SN e Processo, verifica 3/13, motivos PT/EN, horários por ocorrência
e paridade de contagem nos temas claro/escuro. O gate também executa as nove telas
completas, timeline #86, classificação 3074 #87, sync/reload, autenticação/pairing
e conclusão 3028. Artifact contém somente screenshots sintéticos.

O workflow `.github/workflows/ames-pr76-cross-views.yml` inclui todos os contratos
funcionais anteriores, os testes novos, 109 testes do motor, observabilidade 3022
(29), replay puro/misto, checkpoints, nomes, Home/CDP/ExtJS, navegação, N1/N2/N3/U1/S1,
preservação de revisões e transferência de estado. Contagens finais e links dos
dois jobs do SHA exato estão no checkpoint final da PR.

**Exceção deliberada ao gate herdado:** `ames-r12-migration-bundle.test.mjs` é
excluído porque chama um builder de instalador. A primeira execução ampla
herdada criou um ZIP temporário, removido pelo próprio teste; nenhum pacote foi
preservado/publicado. Esse teste não volta a ser executado no gate desta missão.
Build e distribuição continuam fora do escopo. Os demais contratos permanecem.

## Arquivos e preservação

- Agente: `process_r11.py`, `partial_retry.py`, `production_shift.py`,
  `canonical.py`; novo `production_diagnostics.py` somente de leitura/projeção.
- Dados JS: `canonical.mjs`, `production-evidence.mjs`.
- Consumidores: `console-failure-evidence.mjs`, `console-failure-process.mjs`,
  `console-fastlane-sn-reuse.mjs`, `console-specialized-views.mjs`,
  `daily-failure-analytics.mjs`, traduções e revisão do cache em `sw.js`.
- Provas: dois testes da matriz, novo Chromium, ajuste do teste estático SN
  que exigia literalmente o primeiro item do array, workflow e documentos.

Sem diff contra #87 em **todo o factory-engine**, coletores 3028/3022, View,
timeout do clique, browser/navigation/Home/ExtJS, `agent.py`/`agent_entry.py`,
`store.py`, timeline #86, classificador/cohorts 3074, resolvers de técnicos e
história SN, sincronização, auth/Firebase e ferramentas do posto.
Não foi iniciada instalação, guardian ou processo do agente operacional.

Referências preservadas: main `b283b1764432f5d90486d38a7553b30542a5c118`, PR70
`fddc75438796cdfcc8a133eb8193d08fa1d9b783`, PR86
`5c19beee85125830e0b483c5cf9708eb8de25228`, PR87
`fed8076b15f95d1a037ed369ce0a02aaf46b2280`. Não foram editadas essas branches/PRs.
Nenhum dado operacional, SQLite/WAL, credencial, rede, outbox ou Firebase foi alterado.

## Limitações e continuação

1. Falta evidência da revisão fabril histórica: SHA servido, source_id, linha,
   snapshot, revisão, período, ocorrência e respectivos brutos/checkpoints. Não
   afirmamos quais dos mecanismos ocorreram nas 46 lacunas nem a contagem atual.
2. Referência 3022 comprovada é passagem/detecção/estimativa operacional conforme
   regra e confiança originais. Não vira instante de introdução do defeito nem
   causa confirmada. A matriz não foi expandida sem evidência do processo real.
3. Calendário preservado: dia 07:00→07:00; turno atual 17:30→03:30 e intervalo fora
   da escala conforme testes posteriores. Documentos históricos até 07:30 não
   autorizam mudar a configuração fabril nesta investigação.
4. Resposta completa de uma PCBA não torna a linha/população completa. Dados brutos
   existem em revisões locais; recuperação continua limitada ao mesmo SQLite,
   snapshot, linha e período. Não há busca global nem união de fontes/PCBAs.
5. Diagnósticos novos são locais; transporte compartilhado legado pode omiti-los.
   Nenhuma ausência de diagnóstico autoriza preencher hora, turno ou referência.

Rollback de código: reverter commits próprios sobre #87. Sem migração nova de
schema ou reversão de bruto. Revisões v12 e anteriores continuam disponíveis;
a v13 é uma nova projeção. Revisão da PR e conferência supervisionada de evidência
já armazenada são os próximos passos. **GREEN sintético não é GREEN físico.**
