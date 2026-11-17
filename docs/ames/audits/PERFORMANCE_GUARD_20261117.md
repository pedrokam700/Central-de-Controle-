# PR90 — Desempenho equivalente e proteção efetiva da CI

Data: 17/11/2026, America/Sao_Paulo. **Homologação física PENDENTE.**
Base exclusiva: PR89, `b8a2b1e00193e2d5493d0fd14bfcbf41e89087ca`.
Branch: `work/ames-performance-guard-20261117`, PR90 DRAFT contra a branch da #89.
Código final: `574ddda79e5d40f84565604fcc7c3eaf6a7a91b2`.
[CI do código: dois jobs SUCCESS](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44111176286).
O checkpoint final na discussão da PR90 identifica também HEAD documental/CI exatas.

Lidos integralmente o handoff e o parecer da #89, sua discussão e o
[checkpoint independente](https://github.com/pedrokam700/Central-de-Controle-/pull/89#issuecomment-6950145034).
As conclusões anteriores foram confrontadas com código, logs e execução sintética.

## Causas demonstradas e correções

| Severidade anterior | Mecanismo/evidência | Correção estritamente local | Contrato preservado |
|---|---|---|---|
| Alta | `reuse-cohorts.mjs:72` comparava anteriores em N×N, refazendo taxonomia textual; 200 registros: 100300 leituras de código | Descritores, contadores de identidade lógica por Hist Seq e linhagem; comparação original valida os descritores realmente observados | Mesmo Hist Seq não conta como anterior; todas as observações/autores/comentários permanecem; seq não vira ciclo físico |
| Alta | `buildReuseCohorts:325`: mesmos históricos reconstruídos por falha independente; 200×200: 120998 leituras Hist Seq | Preparar sequência/relógios uma vez por PCBA nesta projeção; acumular `prior_events` com EXATAMENTE a regra antiga: primeira posição da chave, último valor vence | Todas as falhas independentes e os históricos; mesma precedência entre linha original e anotação Hist Seq; sem nova deduplicação |
| Alta | `production_shift.py:124`: cada contexto filtrava todas as observações; 200 → 40200 chamadas | Índice de identidade com a mesma igualdade string/datetime e predicado final `same_occurrence` | PCBA/linha/código/instante, chave legada, duplicados e conflitos; sem alterar coletor/View/5s |
| Alta | `material_trace_provenance.py:46`, `store.py:755`: busca literal repetida por componente; 200 → 163200 leituras de campos | Índice por campos literais; mesmo teste final/modelo e fallback para iteradores | Esse contrato NÃO normaliza relógios textuais equivalentes; mantém ambiguidade, INSERTs e contagens |
| Alta | `canonical.py:199`, `production_diagnostics.py:8`: contextos/diagnósticos N×N e decodificação de todos os payloads antigos sob reserva de escrita | Índices locais; metadata dos pais efetivamente referenciados extraída do próprio payload; JSON inválido continua rejeitado | Epoch, BEGIN IMMEDIATE, atomicidade, source/linha/período/revisão/hash do pai; mesma projeção v14 |
| Média | `canonical.py:393`: índice de histórico materializava datasets antigos inteiros em Python | SQLite projeta metadata/produtos de cada revisão; ordenação/deduplicação de produtos continua em Python | Mesmas revisões e metadados; sem esquema novo nem dependência do operador SQLite `->` |
| Alta | `integrated_snapshot_history.py:129`: `any` sobre todas as chaves por item; deepcopy antes de selecionar vencedores | Set de PCBAs e seleção da mesma evidência antes de clonar profundamente | Qualidade/status/desempates/revisões, checkpoints individuais, independência dos objetos retornados e recuperação parcial |
| Média | Taxonomia Python normalizava a mesma string Unicode repetidamente | LRU somente da transformação Unicode pura: até 1024 strings de até 2048 caracteres; textos longos passam sem cache/truncamento | Configuração continua carregada como antes; classificações/uso físico NÃO são cacheados; descritores mutáveis continuam novos |
| Alta | Console reconstruía indicadores ao filtrar e fazia buscas repetidas de registros/record_id | Índices por PCBA e reutilização do modelo dentro do mesmo mount | Mesmo primeiro match, ordem, campos originais e filtros; sem cache global entre snapshots |
| Alta | CI #89 recusava NODE_OPTIONS em GITHUB_ENV nos DOIS jobs, mas terminava verde | Shell exporta NODE_OPTIONS diretamente; checker antes de cada workload exige preload e bloqueio de builder fictício; filho sem preload deve falhar | Guard não é considerado ativo só por configuração/marker; prova de bloqueio obrigatória; seis testes de builders continuam excluídos |

Referências de código imutáveis: [coortes](https://github.com/pedrokam700/Central-de-Controle-/blob/574ddda79e5d40f84565604fcc7c3eaf6a7a91b2/ames/data/reuse-cohorts.mjs),
[agente](https://github.com/pedrokam700/Central-de-Controle-/tree/574ddda79e5d40f84565604fcc7c3eaf6a7a91b2/ames/agent),
[CI/guard](https://github.com/pedrokam700/Central-de-Controle-/blob/574ddda79e5d40f84565604fcc7c3eaf6a7a91b2/.github/workflows/ames-pr76-cross-views.yml).

O perfil V8 concentrou amostras em describeFailure/normalize/compareFailures e
alocação/GC. cProfile confirmou repetição de pertinência e deepcopy na recuperação.
O profiler localiza custo; equivalência é sustentada separadamente pelos oráculos.

## Sequência RED antes de GREEN

1. [RED inicial](https://github.com/pedrokam700/Central-de-Controle-/commit/9ab7f61a12ae342294e326c5b8075470fd018d0e),
   [CI 44100215788](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44100215788): runtime ainda #89.
2. [RED de material](https://github.com/pedrokam700/Central-de-Controle-/commit/8737246202169e68f6b8d91c5fc9751b616508fb),
   [checkpoint](https://github.com/pedrokam700/Central-de-Controle-/pull/90#issuecomment-6950924462).
3. [RED recuperação/Unicode](https://github.com/pedrokam700/Central-de-Controle-/commit/12ba7e864fd5828e0809886c25e0d028a638229b),
   [checkpoint](https://github.com/pedrokam700/Central-de-Controle-/pull/90#issuecomment-6951207013).
4. Primeira candidata: [CI 44108636500](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44108636500)
   passou contratos; guard efetivamente carregado recusou a gravação do ZIP temporário
   tentada pelo instalador Playwright (`NO_DISTRIBUTION: ZIP write refused`).
   A ferramenta de testes passou a exigir Chrome preinstalado, falhando se ausente.
   Nenhuma exceção ZIP foi aberta; nenhum builder foi executado.
5. [RED adicional de falhas independentes](https://github.com/pedrokam700/Central-de-Controle-/commit/c4279c62a10fa54408e39d688ad7848c3386eb52),
   [CI 44110607826](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44110607826):
   contrato de trabalho falhou com 120998 leituras; nove telas passaram.
6. [GREEN código](https://github.com/pedrokam700/Central-de-Controle-/commit/574ddda79e5d40f84565604fcc7c3eaf6a7a91b2),
   [CI 44111176286](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44111176286): ambos SUCCESS.

Os limites RED são contadores de trabalho determinísticos, não milissegundos frágeis.
Com 200 registros, as leituras de código caíram 100300→1000, Hist Seq 120998→1597,
`same_occurrence` 40200→400, campos 3074 163200→6000, pertinência `any` 20100→0,
normalização Unicode repetida 200→1. Asserções de conteúdo são obrigatórias junto ao orçamento.

## Comparação final sintética

[Amostras RED originais](evidence/PERFORMANCE90_RED_20261117.json).
[Matriz completa antes/depois](evidence/PERFORMANCE90_COMPARACAO_20261117.json):
100/200/400/800/1600 por fase, CPU/parede/heap/RSS, contagens, hashes e manifesto
SHA-256 dos dez arquivos produtivos medidos. São **60 hashes integrais idênticos**
e cinco contagens de ingestão idênticas. A persistência também é comparada linha a
linha em bancos descartáveis clonados no teste diferencial.

| Caso, 1600 registros | PR89, ms | Candidata final, ms |
|---|---:|---:|
| Histórico 2114 de uma PCBA | 119133 | 35 |
| 1600 falhas independentes + 1600 históricos na mesma PCBA | 252076 | 361 |
| 200 PCBAs / 400 componentes / 1600 históricos | 2800 | 296 |
| Contextos 3022 | 2128 | 41 |
| Export canônico de ocorrências | 6426 | 418 |
| Reprojeção com oito revisões antigas | 5983 | 630 |
| Listagem de nove revisões | 645 | 262 |
| Recuperação de quatro revisões brutas | 1419 | 179 |
| Insights 3074 | 3802 | 1213 |
| Ingestão SQLite de 1600 componentes | 2620 | 79 |
| Canônico com 1600 componentes | 5697 | 434 |
| Classificação física própria 3074 isolada | 14 | 12 |
| HTML puro dos 1600 históricos | 364 | 203 |

Não atribuir ganho material à classificação física isolada de 14→12 ms;
o custo relevante removido estava nas correlações/reconstruções ao redor dela.

Memória: no caso de falhas independentes/1600, heap após projeção passou
~757 MB→27 MB e RSS instantâneo ~959 MB→136 MB. No processo Node da matriz
histórico/render/múltiplas PCBAs, pico cumulativo ~285→193 MiB; Python canônico
~135→83 MiB. RSS não melhora uniformemente: material canônico ficou ~55→56 MiB.
Picos são cumulativos por processo, mesma ordem crescente de cenários, sem GC forçado;
não são picos isolados de cada função nem garantia de memória fabril.

SQLite: a reserva medida pelo primeiro instrumento encerra ANTES do commit;
não representa todo o bloqueio. A contraprova adicional usa segundo escritor
real em banco descartável, iniciado DEPOIS do retorno de BEGIN IMMEDIATE,
com asserção de que a transação permanece aberta e o observador não adquiriu o
bloqueio antes do commit. Em 1600, espera ~9248→531 ms; export completo desse
ensaio ~9200→549 ms. Inclui escalonamento/busy handler/liberação. Nenhuma mudança
em esquema, WAL, timeout, conexão ou ordem/atomicidade dos INSERTs.

Chromium local, mesma fixture/ambiente: base executada **somente em 400**;
Falhas ~6672 ms, Reuso ~13602 ms, maior intervalo do heartbeat ~13559 ms.
Candidata/400: Falhas ~143 ms, Reuso ~156 ms, intervalo ~280 ms.
Candidata executou nove telas em todos os cinco tamanhos e verificou todas as
linhas/autores no DOM antes/depois do filtro. Em 1600, detalhe ~823 ms e intervalo
~801 ms: custo linear de DOM ainda existe, sem esconder linhas ou usar `+N`.

Os ensaios de base foram parcialmente concorrentes. A rodada final CLI da
candidata foi sequencial; import/JIT/caches/agendamento e workspace compartilhado
afetam tempos. Uma amostra por tamanho/fase, além das rodadas de desenvolvimento;
sem intervalo estatístico. Não são SLOs nem demonstração de ganho físico.

## Matriz de contratos e regressões

| Requisito | Validação executada | Resultado de software |
|---|---|---|
| Nomes/papéis/comentários/datas/Hist Seq/Y/N/identidades/conflitos | Oráculos de código fixado #89, 24 históricos aleatórios, 12 ordens de falhas independentes, metadados parciais/conflitantes, igualdade integral de objetos/HTML, ausência de mutação | PASS |
| Múltiplas PCBAs/componentes/transferências/filtros | Matriz cinco tamanhos; testes populacionais, proof aliases com espaços, UI com todos os históricos | PASS |
| 3022 e identidade temporal | Diferencial UTC/local/chave legada/duplicados; matrizes #88 e isolamentos source/linha/snapshot/revisão/período; AT não vira produção | PASS |
| 3074 primeiro/segundo/terceiro/indeterminado | Matrizes #87, paginação, múltiplos ciclos, scanner→SQLite→canônico→Chromium | PASS sintético |
| Recuperação parcial/checkpoints/revisões antigas/L1-L3 | Contratos de replay confirmado/misto, SQLite clonado, recuperação de quatro revisões, cópia independente dos resultados | PASS |
| Timeline #86 e SN | Timeline/browser, origem de nomes, 3012 candidatos, nove telas sobre evidências compartilhadas | PASS |
| Offline/SW/cache | Revisão de cache de fonte avança; grafo transitivo, duas abas, ativação explícita, restart/reload/offline/IndexedDB/API POST da #89 | PASS |
| Autenticação/pareamento/navegação/Home/ExtJS/clique único | Contratos Python/Node/Chromium existentes, sem coletor real | PASS |
| Motor Python e Node central | 109 testes do motor; 876 contratos Node centrais; demais suítes Python e Node da workflow | PASS |
| CI sem distribuição | Preload comprovado antes de workloads nos dois jobs; tentativa fictícia bloqueada antes do launcher; filho sem preload falha; Chrome existente obrigatório | PASS |
| Empacotamento/migração sem ZIP | Seis suítes builder continuam excluídas; contratos estáticos #89, update/readiness/rollback/crash recovery em banco descartável | PASS estático; pacote NÃO executado |
| Fábrica/0.5.39 Windows original/contensão e Chrome reais | Nenhum acesso autorizado nesta missão | PENDENTE |

## Reprodução segura

Execute na nova worktree; `--root` escolhe o runtime. Aponte BASE para uma
worktree descartável, somente leitura lógica, do SHA #89. Nunca use banco fabril.
Nenhum dos scripts chama builder, MES, deploy ou gera arquivo ZIP.

```bash
node scripts/audit/performance90.mjs --root=/caminho/base-ou-candidata
node scripts/audit/performance90-independent.mjs --root=/caminho/base-ou-candidata
python scripts/audit/performance90.py --root=/caminho/base-ou-candidata
python scripts/audit/performance90-recovery.py --root=/caminho/base-ou-candidata
python scripts/audit/performance90-material.py --root=/caminho/base-ou-candidata
python scripts/audit/performance90-sqlite-contention.py --root=/caminho/base-ou-candidata
```

Para CI local, use `bash scripts/audit/guarded-ci.sh /caminho/workload.sh` e
PYTHONPATH incluindo `scripts/audit/no_distribution` e `ames/factory-engine`.
O wrapper configura NODE_OPTIONS herdável; usar só `node --import` no pai NÃO
comprova herança de proteção para processos Node filhos.
Chromium: `PLAYWRIGHT_MODULE`, `PLAYWRIGHT_EXECUTABLE_PATH` para ferramenta já
instalada; `PERFORMANCE_OUTPUT` para JSON; `AMES_BROWSER_ROOT` escolhe base/candidata,
`AMES_PERF_SIZES=400` reproduz a amostra base. Não instalar/baixar navegador ZIP.

## Riscos remanescentes e continuidade

- **Médio — DOM extenso:** pausa sintética de ~801 ms em 1600 linhas ainda existe.
  Eventual renderização incremental precisa manter todas as linhas acessíveis,
  ordem, autores, navegação e estados; exige missão/testes próprios, sem `+N`.
- **Médio — metadados legados incompletos:** escopos wildcard podem formar grafo
  denso. Índice limitado a 64×N cópias de identidade; fallback ainda pode exigir
  N×N de fatos pré-lidos. Nenhum registro é truncado. Há contraprova de 300 escopos.
- **Médio — diversidade temporal/componentes:** muitos instantes/contextos reais
  ainda exigem comparações temporais; não se promete complexidade linear universal.
  Sem pool global de snapshots; caches de comparações limitados a 4096 por projeção.
- **Médio — Windows/SQLite/volume real:** validação Linux/JSON1 sintética não prova
  ABI do SQLite instalado em 0.5.39, IO, locks concorrentes, RAM/Chrome fabris.
- **Pré-requisito — homologação física:** instalação, coleta real, atualização,
  clique 3022 e recuperação em máquina fabril continuam PENDENTES. Nenhuma cobertura
  física foi elevada artificialmente; ausência de prova não virou zero ou uso.

Antes de futura homologação autorizada: fixar SHA candidata, validar em clone
anônimo/offline da instalação 0.5.39, comparar integridade/contagens/source/revisões,
medir nove telas e recuperação após falha, preservar cópia SQLite+WAL consistente
com agente parado e plano de retorno ao executável/estado anterior. O rollback
supervisionado da #89 continua sendo referência; nenhuma dessas ações foi executada.

Main e PR70/86/87/88/89 foram relidas: abertas/DRAFT e SHAs preservados no JSON.
PR90 permanece DRAFT. Configurações Vercel/Netlify desativam auto-preview SOMENTE
nesta branch, antes do primeiro push; sem bot/check de deployment na PR90.
Não houve MES, SQLite/WAL operacional, guardian, alteração de rede, Firebase,
credenciais/outbox, merge, deploy, release, ZIP, instalador ou builder de distribuição.
