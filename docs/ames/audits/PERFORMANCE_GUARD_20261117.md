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
