# Handoff PR90 — Desempenho equivalente e guard de distribuição

17/11/2026, America/Sao_Paulo. **PR DRAFT; homologação física PENDENTE.**

- Base EXCLUSIVA: PR89, `b8a2b1e00193e2d5493d0fd14bfcbf41e89087ca`.
- Branch: `work/ames-performance-guard-20261117`.
- PR: https://github.com/pedrokam700/Central-de-Controle-/pull/90
- Base da PR: `work/ames-final-integration-audit-20261117` (branch da #89).
- SHA final dos dez arquivos produtivos: `574ddda79e5d40f84565604fcc7c3eaf6a7a91b2`.
- CI exata desse código: https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44111176286 — ambos os jobs SUCCESS.
- O checkpoint de fechamento na discussão da PR90 registra também o SHA HEAD
  que adiciona este handoff/evidências, a CI desse SHA e o estado DRAFT final.
  Esses commits posteriores não alteram os dez arquivos produtivos do manifesto.

[Relatório independente completo](../audits/PERFORMANCE_GUARD_20261117.md).
[Comparação final reproduzível](../audits/evidence/PERFORMANCE90_COMPARACAO_20261117.json).
[RED inicial](../audits/evidence/PERFORMANCE90_RED_20261117.json).

## O que foi comprovado e corrigido

Custo N×N de classificação por pares, reconstrução do mesmo Hist Seq por
falha independente, correspondência repetida de contextos/observações/componentes,
clonagem antecipada de revisões que não seriam selecionadas e decodificação de
datasets inteiros para metadata. A CI anterior NÃO carregava NODE_OPTIONS via
GITHUB_ENV: os dois jobs da #89 recusavam essa variável e continuavam verdes.

Agora os índices mantêm os mesmos candidatos e validam com os predicados
originais. Resultados de normalização pura/reconstrução imutável são reutilizados
em escopo controlado. Não há cache global de snapshots/técnicos/uso físico.
Não há mudança de esquema, epoch, transação, projection_version 14, coleta,
critério de qualidade, prioridade entre revisões ou conservação de evidências.
O shell da CI prova preload e bloqueio fictício antes de CADA workload; ausência
de proteção falha. Node filhos herdam a variável exportada no shell.

| Arquivo produtivo alterado | Mudança necessária |
|---|---|
| `ames/data/reuse-cohorts.mjs` | Contadores por descritor/Hist Seq/linhagem; índices locais; sequência preparada uma vez; mesma acumulação antiga de anteriores; reutilização de coortes para filtros |
| `ames/console-reuse-cohorts.mjs` | Modelo do mesmo mount reutilizado; índices PCBA/record_id sem substituir primeiro match ou campos originais |
| `ames/agent/production_shift.py` | Índice da igualdade real de ocorrência, inclusive datetime/UTC/local e ambiguidade |
| `ames/agent/production_diagnostics.py` | Índices locais e metadata dos pais referenciados do payload original |
| `ames/agent/material_trace_provenance.py` | Índice literal do contrato de vínculo 3074, sem normalização indevida de relógios |
| `ames/agent/store.py` | Ingestão usa esse índice; mesmos INSERTs e transação, sem tocar banco operacional |
| `ames/agent/canonical.py` | Contextos/candidatos indexados; histórico projeta metadata/produtos via JSON1 |
| `ames/agent/integrated_snapshot_history.py` | Pertinência por set; clona profundamente somente vencedores, com mesma seleção/independência |
| `ames/factory-engine/core/failure_taxonomy.py` | LRU limitada somente da transformação Unicode pura; regras/classificações continuam sem cache |
| `sw.js` | Revisão do cache de fonte avança; lógica de ativação/offline/POST/dados preservada |

Outros arquivos: workflow, `guarded-ci.sh`, `assert-distribution-preload.mjs`,
marker comprovável no guard, testes de preload/workflow/equivalência/orçamento,
seis scripts CLI de benchmark e um Chromium, helper do oráculo fixo #89,
este handoff/parecer/JSONs. Vercel/Netlify desativam auto-preview SOMENTE para
esta branch antes do primeiro push. A listagem exata é o diff da PR90; não
alterar configuração das branches antigas.

## RED → GREEN e evidência verificável

- RED inicial antes de runtime: `9ab7f61a12ae342294e326c5b8075470fd018d0e`,
  https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44100215788
- RED material: `8737246202169e68f6b8d91c5fc9751b616508fb`, comentário 6950924462.
- RED recuperação/Unicode: `12ba7e864fd5828e0809886c25e0d028a638229b`, comentário 6951207013.
- CI intermediária `44108636500`: contratos passaram; guard efetivo bloqueou
  gravação de ZIP tentada pelo instalador Playwright. Nenhuma exceção foi aberta:
  agora a CI exige Chrome preinstalado e falha se não existir.
- RED adicional: `c4279c62a10fa54408e39d688ad7848c3386eb52`,
  https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44110607826
  Falhou pelo orçamento Hist Seq 120998; nove telas passaram.
- GREEN final do runtime: `574ddda79e5d40f84565604fcc7c3eaf6a7a91b2`,
  https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44111176286
  Dois jobs SUCCESS, 876 contratos Node centrais, 109 testes do motor Python,
  todas as matrizes Python/Node da workflow e nove scripts Chromium.

Inclui timeline #86, classificação #87, horários #88, integração/offline #89,
identidade de técnicos, períodos/linhas/source/revisões, recuperação parcial,
checkpoints, autenticação/pareamento e Home/ExtJS/navegação. O Chromium percorre
nove telas × PT/EN × temas e cinco volumes 100/200/400/800/1600; todas as linhas
históricas/autores permanecem visíveis, inclusive após filtro.

São 65 comparações funcionais de benchmarks: 60 hashes integrais iguais e
cinco contagens de ingestão iguais. Diferencial de persistência também compara
linhas inteiras em bancos clonados, sem bancos operacionais. Não foi aplicado
novo critério de deduplicação nem escondido histórico em `+N`.

| Caso sintético | Antes | Depois final |
|---|---:|---:|
| Histórico 2114, 1600 | 119133 ms | 35 ms |
| 1600 falhas + 1600 históricos, mesma PCBA | 252076 ms | 361 ms |
| Mesmo caso, heap após projeção | ~757 MB | ~27 MB |
| 200 PCBAs/400 componentes/1600 históricos | 2800 ms | 296 ms |
| Export canônico, 1600 | 6426 ms | 418 ms |
| Espera de segundo escritor SQLite descartável, 1600 | 9248 ms | 531 ms |
| Maior intervalo heartbeat Chromium, 400 | 13559 ms | 280 ms |

Os números não são ganhos físicos: base parcialmente concorrente, candidata
CLI final sequencial, um ponto por tamanho/fase sem intervalo estatístico.
CPU/RSS/heap estão no JSON; RSS é cumulativo por processo e não melhorou em
todas as fases. O ensaio de segundo escritor inclui commit/liberação e busy
handler; o instrumento antigo de reserva encerrava antes do commit.

## Limites que devem acompanhar a candidata

- Ainda há custo linear para mostrar todas as linhas: em 1600, detalhe ~823 ms
  e pausa máxima sintética ~801 ms. Não declarar interface universalmente sem pausas.
- Escopos legados wildcard densos mantêm fallback potencialmente N×N de fatos
  pré-lidos; limite de memória do índice 64×N, sem limite de registros. Muitos
  instantes/contextos distintos ainda podem demandar comparações temporais reais.
- Cache de comparação: 4096 por projeção; Unicode: 1024 strings de até 2048
  caracteres. Texto longo passa integralmente sem cache. Configuração/regras
  continuam relidas; não há invalidação global entre revisões para administrar.
- Linux/fixtures não comprovam IO/RAM/Chrome/ABI SQLite na instalação Windows
  0.5.39 nem existência de vínculos/horários físicos adicionais.
- Seis suítes que chamam builder/ZIP continuam excluídas. Contratos estáticos de
  migração/update/rollback foram executados; empacotamento não foi executado.
- Guard é proteção dos workloads desta CI; não afirmar isolamento de segurança
  universal contra programas arbitrários. Checker sem preload e launcher fictício
  são contraprovas obrigatórias, sem chamar builder verdadeiro.

## Continuidade e homologação futura (NÃO executada)

1. Conferir PR90 DRAFT, SHA e CI do checkpoint final; conferir hashes dos dez
   arquivos no JSON. `git diff 574ddda..HEAD -- ames sw.js` deve estar vazio.
2. Reproduzir benchmarks/testes pelos comandos do parecer, somente em ambiente
   descartável e com oráculo #89 disponível via histórico Git completo.
3. Em missão futura explicitamente autorizada, homologar primeiro clone anônimo
   offline de 0.5.39, com integridade/contagens/source/revisões antes/depois e teste
   de recuperação após falha; medir pausas, RAM, tempo de export e contensão real.
4. Preparar rollback supervisionado com estado/executável anterior e cópia
   SQLite+WAL consistente com agente parado. Não aplicar candidata nem restaurar
   banco operacional durante esta missão. Seguir o plano de rollback da #89.
5. Prova física de primeira/segunda/terceira montagem, posto/horário produtivo,
   sessão Chrome e recuperação real permanece independente e PENDENTE.

## Preservação

Main: `b283b1764432f5d90486d38a7553b30542a5c118`.
PR70 DRAFT: `fddc75438796cdfcc8a133eb8193d08fa1d9b783`.
PR86 DRAFT: `5c19beee85125830e0b483c5cf9708eb8de25228`.
PR87 DRAFT: `fed8076b15f95d1a037ed369ce0a02aaf46b2280`.
PR88 DRAFT: `3a088ddad41be9e31b144e4ac4b0b73725141624`.
PR89 DRAFT: `b8a2b1e00193e2d5493d0fd14bfcbf41e89087ca`.
Todas abertas, sem merge e com HEADs preservadas na releitura.

Não houve coletor/MES real, instalação fabril, alteração SQLite/WAL operacional,
guardian/rede/Firebase/credenciais/outbox, clique 3022, merge, deploy, release,
ZIP, instalador ou execução de builder de distribuição. **Física PENDENTE.**
