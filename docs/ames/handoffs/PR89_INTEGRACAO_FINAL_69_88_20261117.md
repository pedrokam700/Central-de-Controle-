# Continuidade PR89 — auditoria independente de integração #69–88

**PR:** [#89 DRAFT](https://github.com/pedrokam700/Central-de-Controle-/pull/89).
Branch: `work/ames-final-integration-audit-20261117`, contra
`work/ames-3022-production-time-audit-20261117` da #88.
Base exata: `3a088ddad41be9e31b144e4ac4b0b73725141624`.

**Código validado:** `0738da7a40818f3cc692b29d8b1ca1ec67731f10`.
CI desse SHA: [44076900986](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44076900986),
ambos os jobs SUCCESS. O commit posterior deste handoff contém documentação/
evidências; seu SHA e CI próprios são registrados no comentário final da PR.
Não confundir o SHA de código, o HEAD documental ou o merge de teste do GitHub
com merge executado. Nenhuma PR foi mergeada.

## Resultado e limites

A fase inicial foi somente leitura. A auditoria revisou história #69–88 e
contratos, sem assumir que CI histórica prova integração ou homologação.
146 commits entre #69 e #88; #74 foi integrada por cherry-pick `a7002afb`, com
conteúdo de nomes locais idêntico; #85 é issue. Todos os HEADs anteriores,
estados OPEN/DRAFT e main foram reconferidos e preservados.

Parecer completo, severidades, matriz de requisitos, estática de migração e
plano de homologação supervisionada/rollback **não executado**:
[PR89_INTEGRACAO_69_88_20261117.md](../audits/PR89_INTEGRACAO_69_88_20261117.md).
Inventários e resultados: [evidence](../audits/evidence/PR89_CI_20261117.json).

| Falha comprovada | Antes | Correção limitada |
|---|---|---|
| I1, CRÍTICA para futura atualização | canonical importava production_diagnostics, omitido do inventário do updater | Incluir o módulo em FILES; fechamento AST e import isolado em cópia descartável |
| I2, ALTA/preflight | Mapa de migração omitia KEEP_AGENT_RUNNING exigido na raiz | Uma entrada de mapeamento ao arquivo existente; sem mudar ou executar guardian/builder |
| I3, ALTA | Aliases/espaços de operador/linha/END LOT contornavam a proteção AT | Reutilizar normalização, conservar guardas dos campos legados contraditórios; BRM continua excluído |
| I4, ALTA | Outra aba antiga recebia módulos do worker novo após claim/limpeza | Guard de IDs de documentos persistido no cache estático; 409 para módulo novo até recarga explícita; persiste após restart |
| I5, ALTA | Horário/autor explícitos 2114 ficavam no bruto; projeção de grupos descartava ator/linhagem e colapsava revisões | Hidratar apenas fatos explícitos no canônico, preservar propriedades e usar identidade existente da timeline; cópias de revisão não somam recorrências |
| I6, ALTA | A6900 tinha horário de produção no canônico e SN legado | Preservar horário de evento/nome/papel observado, retirar rótulo produtivo; adapter marca elegibilidade e canônico revalida |

Projeção canônica **v14**, sem alterar esquema SQLite persistido. Revisões
antigas continuam imutáveis e legíveis. Classificação física 3074, clique único
3022 de cinco segundos, pré-lote Home/ExtJS, checkpoints e coleta não foram
reimplementados. Ausência de contexto/prova continua pendente, nunca zero.

## RED antes de GREEN

- `5923436e6b1729ced7708b90d750f34bd3abb166`: [CI RED I1–I4](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44073778046).
- `43a3ec14b22c4ad4b339b605d161b264c2888ff4`: [CI RED I5/I6](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44074760518).
- `bd71e4625ef05dbca385e42df625171bc34cbf80`: RED local de
  `ames-integration-history-projection.test.mjs`, publicado antes da correção;
  autor undefined e 1 versus 3 observações. O gate anterior impede sua execução
  na CI desse SHA; não atribuir um RED de CI inexistente a esse teste.
- `0db9f807ade9bc58d06deccf38d13b4fe74e0cf8`: [RED de compatibilidade](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44076780131),
  duas contraprovas detectaram regressão introduzida na primeira normalização.
  O alias preferido ocultava um segundo rótulo/ID legado. Corrigido em 0738da7;
  não usar o primeiro GREEN 42eaba1 como candidato final.
- `0738da7a40818f3cc692b29d8b1ca1ec67731f10`: [GREEN de código](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44076900986).

A primeira tentativa 44073537104 falhou antes do checkout por ordem do preload,
corrigida antes do RED útil. Não é defeito do produto nem prova comportamental.

## Validação executada

CI: 862 testes na seleção principal Node, mais filtros/contratos separados;
416 execuções unittest Python contabilizadas, incluindo repetições, mais scripts
de asserts próprios. Não apresentar essa soma como casos únicos.

Oito scripts Chromium: nove telas/idiomas/temas, multitab/restart/offline,
timeline #86, 3074 #87, produção #88, sync/reload, pairing e conclusão 3028.
A fixture compartilhada usa scanner 3074 sintético + Store real descartável,
2114, 3012, replay confirmado 3022 sem conectar navegador MES, canônico,
Dashboard/Falhas/SN e renderização da tabela de reuso.

Migração sem pacote: AST/literais/inventários/hashes, import canônico isolado,
update/rollback, hardening/crash recovery, state-transfer, readiness, calendário
e índices em diretórios/SQLite descartáveis. Nunca inicializa agente de fábrica.

Excluídos explicitamente os seis testes que chamam builders/ZIP: migration-bundle,
r12-capture, offline-shell, release-build, deploy-routing, stage-vercel.
Preloads Node/Python recusam builders e escrita de .zip. Upload-artifact removido
para não criar compactação implícita. CRC/layout/assinatura do futuro pacote,
wrappers Windows, rota persistente e guardian real seguem sem execução.

## Arquivos produtivos/preparação alterados

- `ames/agent/update_candidate.py`: somente inventário de dependências.
- `scripts/build-r12-migration-bundle.py`: somente entrada do mapa estático;
  builder nunca importado/executado.
- `ames/agent/process_r11.py`: elegibilidade por aliases/linha e rótulos de passagem.
- `ames/agent/production_shift.py`: distinção de passagem AT/inelegível.
- `ames/agent/local_sn.py`: revalidação de rótulo AT em legado.
- `ames/agent/canonical.py`: v14, fatos explícitos 2114 e rótulos AT.
- `ames/data/reuse-cohorts.mjs`: observações históricas preservadas sem inflar recorrência.
- `sw.js`: isolamento de documentos entre versões e revisão de cache.

Demais mudanças: testes/fixture/medidas, relatório/evidências e workflow de
validação sem distribuição. O diff produtivo total é pequeno: 88 linhas
adicionadas e 18 removidas em oito arquivos em relação à #88.

## Pendências e próximo trabalho

1. **R1/MÉDIA:** provar papel físico de um eventual BRM em END LOT legítimo.
   Rótulo de montagem sintético não comprova produção. Não remover a proteção
   AT, não inventar horário ou elevar cobertura por inferência.
2. **R2/ALTA:** custo quadrático anterior de históricos extensos. 400 históricos
   de uma PCBA: base ~6,6 s, candidata ~6,8 s; não é SLO fabril. UI síncrona e
   projeção sob BEGIN IMMEDIATE podem bloquear. Perfilar, indexar ocorrência/
   revisão e definir orçamento/volume antes de homologar lote grande. Scripts
   `scripts/audit/integration-scale.{py,mjs}` e JSON guardam amostras/limitações.
3. **R3/BLOQUEADOR:** inventário/backup/restore/Windows/rotas da instalação
   0.5.39 e evidência de retomada real ainda não existem nesta missão. Seguir
   plano supervisionado do parecer somente sob autorização futura específica.
4. Rollback futuro deve preservar o SQLite corrente após novas escritas;
   nunca restaurar base antiga sobre dados novos, matar PID desconhecido ou
   trocar instalação original sem backup verificado e ensaio de restauração.

**Homologação física PENDENTE.** Nenhum ZIP, instalador, release, pacote,
builder de distribuição, merge, deploy, MES, banco operacional/WAL, mudança
em guardian, rede, Firebase, credenciais ou outbox operacional nesta missão.
