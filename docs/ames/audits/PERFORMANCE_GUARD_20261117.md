# Desempenho e guard de CI — RED contra PR89

Base exclusiva: `b8a2b1e00193e2d5493d0fd14bfcbf41e89087ca`.
Branch isolada: `work/ames-performance-guard-20261117`, contra a branch da #89.
Lidos integralmente handoff/parecer da #89 e discussão, incluindo o
[checkpoint independente](https://github.com/pedrokam700/Central-de-Controle-/pull/89#issuecomment-6950145034).
Runtime produtivo ainda idêntico à base neste checkpoint.

## Reprodução antes da otimização

[Amostras completas](evidence/PERFORMANCE90_RED_20261117.json): 100/200/400/800/1600
registros, tempo de parede e CPU, heap/RSS, contagens e SHA-256 dos resultados.
Os ensaios foram parcialmente concorrentes; valores não são SLO nem ganhos
físicos. Pico RSS é cumulativo por processo; não atribuir cada amostra a pico
isolado. Memória de payload/hash fora do trecho cronometrado também afeta RSS.

| Mecanismo | Evidência na #89 | Contraprova |
|---|---|---|
| Histórico 2114/coortes | board2114Timeline percorre anteriores por registro e refaz classificação textual por par | 400 ~8365 ms; 800 ~29214 ms; 1600 ~119133 ms. 200 registros leem código 100300 vezes, orçamento 8000 |
| Contextos 3022 | project_contexts filtra todas as observações a cada contexto | 200 → 40200 chamadas same_occurrence, orçamento 1600; 1600 → ~2128 ms |
| Export canônico | agrupamento por defect_key e diagnóstico refiltram contextos; leitura de todas as revisões em JSON | 1600 → ~6426 ms, reserva BEGIN IMMEDIATE ~6405 ms |
| Reprojeção/seleção | diagnóstico decodifica payloads antigos integrais; índice de histórico decodifica datasets para metadata | 1600 + 8 revisões: reprojeção ~5983 ms; listagem de 9 revisões ~645 ms |
| Grupos/renderização | cada filtro reconstrói indicadores; buscas de PCBA/ocorrência repetidas | 1600 históricos/200 PCBAs/400 componentes: ~2800 ms; render puro dos 1600 eventos ~364 ms |
| 3074 e recuperação | classificação física e reconciliação local medidas separadamente | 1600 vínculos próprios ~14 ms; recuperação de 4 revisões ~1419 ms; insights 1600 PCBAs ~3802 ms. Não alterar significado físico |
| CI Node | logs dos dois jobs da #89 recusam NODE_OPTIONS em GITHUB_ENV e seguem verdes | Contraprova exige preload ativo e simula builder com launcher-sentinela; nenhum builder real executado |

Perfil V8 sintético confirma concentração de amostras em describeFailure,
normalize e compareFailures; também há alocações/GC. O algoritmo de comparação
não é prova de uso físico. O primeiro alvo é eliminar comparação repetida de
mesmas descrições, sem apagar eventos/revisões/autores.

## Prova RED

- `node --test scripts/ames-performance90.test.mjs scripts/ames-distribution-preload.test.mjs`
- `python scripts/agent-performance90.test.py`
- `node --import=./scripts/audit/no-distribution-guard.mjs scripts/audit/performance90.mjs`
- `python scripts/audit/performance90.py`
- `python scripts/audit/performance90-recovery.py`

Os testes de trabalho usam contadores determinísticos, não limiares instáveis
de milissegundos. O teste de preload falha antes de tentar qualquer subprocesso
se a proteção não estiver comprovada. A tentativa simulada usa caminho que
nunca existe; a prova de implementação substitui o launcher por sentinela antes
de carregar o guard. Nenhum builder ou ZIP é criado.

## Plano restrito por módulo

1. Coortes: indexar PCBA/ocorrência e acumular contagens de descritores por Hist
   Seq/linhagem compatível; preservar deduplicação exata já existente e todos os
   registros restantes. Reusar resultado no mesmo mount ao mudar filtros.
2. 3022 local: índice da mesma identidade aceita por same_occurrence; manter
   verificação exata e duplicados/conflitos. Não alterar coletor, View ou 5s.
3. Canônico/diagnóstico: índices locais por ocorrência e defect_key; carregar
   somente metadata de revisões realmente necessária. Reduzir tempo de reserva
   de escrita pela remoção do trabalho redundante; manter atomicidade/epoch.
4. CI: shell de testes exporta NODE_OPTIONS diretamente, sem GITHUB_ENV; cada
   shell comprova preload ativo e bloqueio simulado. Falta de proteção falha.
5. Diferencial contra código da #89: nomes/papéis/comentários/datas/Hist Seq,
   Y/N, conflitos e todas as identidades; nove telas Chromium e responsividade.

## Restrições preservadas

O commit inicial desativa auto-preview SOMENTE para esta branch em vercel.json
e contexto Netlify, antes da publicação. A discussão da #89 contém preview
automático anterior; não repetir esse efeito nesta missão. Sem executar build.
Main e branches antigas mantêm seus próprios arquivos/configurações intactos.

Sem MES, SQLite/WAL operacional, guardian, rede, Firebase, credenciais/outbox,
merge, deploy, release, ZIP ou instalador. Sem redução de registros, `+N` ou
supressão de conflitos para ganhar velocidade. **Física PENDENTE.**

## Otimizações implementadas após os checkpoints RED

- Histórico: contadores de identidades lógicas anteriores por Hist Seq e
  linhagem compatível, descritores normalizados e comparação original. Nenhuma
  observação é removida além da deduplicação exata já existente na #89.
  Código normalizado/família/subtipo/negação/ambiguidade só indexam contagens;
  a comparação ainda recebe código e descrição realmente observados.
- Escopos completos usam índice pelo campo mais seletivo; metadados legados
  parciais podem formar grafo denso. O índice tem orçamento de 64×N cópias de
  identidade; excedido esse orçamento, calcula contagens com fatos pré-lidos,
  sem limitar registros. Esse caso patológico ainda pode ter custo N×N em
  operações simples, mas não aloca índice quadrático nem recompõe descritores.
- Coortes: índice por PCBA e ocorrência, cache de comparação só nesta projeção
  (4096 entradas), filtro do mesmo mount reutiliza o modelo. Não há cache global
  de snapshot ou resultados de técnico/uso físico. Proveniência e ordem mantidas.
- Renderização: índice para os registros originais e record_id, preservando o
  primeiro match e a política de IDs legados com espaços/aliases dos helpers.
- 3022: índice com exatamente a igualdade de string/datetime de same_occurrence,
  mantendo a validação final, duplicados e conflitos. Não normaliza relógio ruim.
- 3074/SQLite: índice de candidatos para a chave legada por campos literais,
  preservando a distinção entre relógios equivalentes e strings diferentes
  exigida por esse contrato. Persistência faz os mesmos INSERTs, no mesmo bloco;
  nenhuma mudança de esquema/dados operacionais, conexão, WAL ou timeout.
- Recuperação: seleciona a mesma evidência vencedora antes de clonar; retorna
  cópias profundas independentes. Pertinência da PCBA usa set, sem varrer todas
  as chaves. Qualidade/status e escolha entre revisões não foram modificados.
- Taxonomia Python: cache LRU de no máximo 1024 strings de até 2048 caracteres,
  SOMENTE da transformação Unicode imutável. Texto longo não é truncado; passa
  sem cache. Configuração continua lida/revalidada como antes e classificações
  não são cacheadas. Não altera regras, códigos, papéis, versão ou lógica 3074.
- Canônico: contexto/diagnóstico indexados; pais referenciados são validados pela
  metadata do próprio payload (não pela coluna contraditória). JSON inválido
  continua rejeitado. Listagem projeta metadata/produtos no SQLite, sem carregar
  datasets inteiros em Python. BEGIN IMMEDIATE, epoch e atomicidade preservados.
- SW: apenas revisão do cache de fonte avança para evitar shell antigo em leitura
  direta; mecanismos #89 de abas/restart/offline permanecem e são retestados.
- CI: defaults.run.shell usa guarded-ci.sh, que exporta NODE_OPTIONS dentro do
  shell e executa assert-distribution-preload ANTES de cada workload. O processo
  filho sem preload é uma contraprova negativa obrigatória; o com preload deve
  bloquear caminho fictício. Nenhum GITHUB_ENV é usado para NODE_OPTIONS.

## Primeira comparação GREEN de software (medições sintéticas)

| Caso, 1600 registros | #89 | Candidata medida | Prova de resultado |
|---|---:|---:|---|
| Histórico 2114 | 119133 ms | ~40 ms | SHA-256 integral idêntico |
| 200 PCBAs/400 componentes/1600 históricos | 2800 ms | ~424 ms | SHA-256/contagens integrais idênticos |
| Contextos 3022 | 2128 ms | ~149 ms na primeira rodada | Mesmas linhas/diagnósticos/conflitos |
| Canônico de ocorrências | 6426 ms | rodada final em consolidação | Hash integral idêntico |
| Recuperação de quatro revisões | 1419 ms | ~196 ms | Hash integral idêntico |
| Insights 3074 | 3802 ms | ~981 ms | Hash integral idêntico |
| Ingestão de 1600 componentes, SQLite descartável | 2620 ms | ~90 ms | Mesmos INSERTs/contagens e igualdade em clones |
| Canônico com componentes | 5697 ms | ~592 ms | Hash integral idêntico |

Chrome: caso base medido com 400 registros, nove telas: pausa máxima ~13559 ms;
na candidata com 400, ~180 ms. A candidata também percorreu nove telas com
100/200/400/800/1600 históricos e confirmou todas as linhas e autores no DOM,
inclusive depois de filtrar. Com 1600, abertura completa do detalhe ~839 ms e
pausa ~607 ms na primeira rodada. Custo linear de HTML/DOM permanece: não se
ocultam linhas nem se usa +N. Não afirmar ausência universal de pausa.

A matriz final anexa tempos/CPU/RSS e hashes, com limites de medição. Resultados
parciais concorrentes não são promessa de ganho físico; custo de commit SQLite
não está integralmente incluído no primeiro instrumento de reserva. Não usar
esses números como SLO fabril ou certificado de instalação.

A primeira rodada local dos contratos integrados passou; validação de código
exato/CI e handoff serão registrados ao fechar a PR DRAFT. **Física PENDENTE.**
