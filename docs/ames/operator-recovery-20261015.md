# Recuperação da tranche técnica — checkpoint do Bloco 1

Data: 2026-10-15. PR #27 OPEN / DRAFT / UNMERGED. Issue #28 e comentários
6194796421 / 6194874895 lidos. Autorização direta do usuário confirmada nesta sessão.

## Referências imutáveis

- Base oficial auditada: `1e65eb71d40a0d11a6f3bdcc81a36358ac5c4ed4`.
- Snapshot de recuperação (não promover): `dcb15570c2fdc2c12f404c4952ae6c93d9c06e79`.
- Parent do snapshot conferido: exatamente a base acima.
- Full Quality da base: run 38732307497, SUCCESS.
- UX Physical Candidate da base: run 38732307520, SUCCESS.
- Estes resultados NÃO validam o snapshot recuperado nem uma futura correção.
- Bootstrap/8765 fisicamente aprovado e congelado. Demais gates físicos PENDING.

## Compare/hash e recuperação

`operator-recovery-20261015-hashes.json` registra SHA256 das duas versões de todos
os 21 deltas (18 produto / 3 testes) e dos seis arquivos a preservar. Não houve
cherry-pick, cópia do snapshot para a branch, nem alteração de produto neste bloco.

Os cinco candidatos do handoff são byte a byte iguais entre base e snapshot:
daily-failure-analytics, console-sn-offline-fastlane, occurrence-view,
console-specialized-views e daily-failure-summary. defect-label também é idêntico;
nenhuma cópia antiga foi usada. Igualdade NÃO significa requisito satisfeito:
analytics/summary ainda aceitam classificação sem proveniência e usam Defect Time
como fallback; specialized-views ainda contém rótulos anteriores.

Não existe nesta sessão a árvore completa anterior alegada de 23 arquivos de
produto. Portanto não é possível certificar cinco deltas perdidos nem inventar
seus nomes. O snapshot preservado é recuperável por SHA; lacunas abaixo são
comprovadas pelo código/testes, independentemente daquela contagem.

## Deltas úteis, ainda não aprovados para integração

- production_shift: impede fallback por processo anterior por padrão.
- agent-contract: transporta campos de turno/proveniência e retorno genérico.
- sync: acrescenta process_contexts ao payload compartilhável.
- time-display: apresentação São Paulo/PT/EN sem mudar timestamps internos.
- advanced-table, base-view, failure-process, fastlane-sn-reuse, history,
  i18n-extra, legacy-parity, process-operator, shift-summary, console-view,
  reuse-table-view e sw: apresentação, navegação e uso desses campos.
- reuse-analysis: aceita turno apenas com source/basis esperados.
- sn-forensics: rascunho de alertas; NÃO integrar sem corrigir associação,
  ordem temporal, identidade de reparo e evidência individual.
- 3 testes: production-trust (Python), technician-context e operacional atualizado.

## Lacunas comprovadas e próxima sequência

### Bloco 2 — backend/dados

1. `process_r11._context_from_correlation` ainda chama classify com processo
   anterior; no snapshot o default novo bloqueia esse fallback, mas dados já
   persistidos/exportados precisam ser reclassificados na projeção com referência
   real. Não confiar somente em strings source/basis vindas de cache antigo.
2. `tela_3022.analisar_ciclo_reparo_apos_falha` não retorna `return_process`.
   `process_r11` lê apenas `return_a5201`; schema e persistência não têm campos
   genéricos. Implementar derivação pura sobre eventos comprovados, após reparo e
   antes da próxima ocorrência; não alterar waits/selectors/acceptance da coleta.
3. SQLite já guarda contextos e `canonical.export_revision` já os exporta;
   manifest/API e normalizador JS já os recebem. A projeção R12 perde campos de
   turno/retorno e sync remove o campo superior process_contexts na base.
4. `canonical.TABLES` não inclui process_defect_contexts nem repair_history_3012.
   A exportação reutiliza revisão quando epoch/projection_version não muda:
   testar atualização isolada de contexto/reparo, invalidação de cache e versão
   anterior imutável. Não basta acrescentar campos à UI.
5. Auditar sanitização com dados reais de contexto: remover raw/segredos e validar
   identidade de linha/snapshot/revisão. Preservar origem e UNKNOWN != ZERO.
6. 3012 Home já possui mapper/parser e Repair Comment; não refazer coletor.
   Verificar transporte de reason_desc/repaired_location/repair_desc sem atribuir
   comentário 3028 à 3012.

### Bloco 3 — investigação

Probes executados no snapshot confirmam:
- Reparo datado de 20/10 + falha atual 15/10, sem retorno comprovado, gera
  PCBA_MAINBOARD_REPAIR_RECURRENCE indevidamente.
- Um mesmo objeto de reparo associado a duas falhas gera
  PCBA_REPEATED_MAINBOARD_REPAIR com repair_count=2.
- repairsFor aceita qualquer reparo da mesma PCBA como candidato; candidato não
  deve virar prova de reparo daquela ocorrência. Alertas precisam preservar
  evidências, tempos, fontes reais, múltiplos componentes e ausência de causalidade.
- Regex de menção MainBoard não comprova por si só reparo concluído (negações e
  comentário precisam de tratamento conservador).

### Bloco 4 — UX/histórico

- Falhas agrupadas e defect-label são baseline a preservar.
- Corrigir filtros/analytics/summary para não inferir turno/dia/geração por
  Defect Time e não ocultar desconhecidos como se fossem zero.
- Completar rótulos/formatação nas superfícies que o snapshot não modificou.
- History do snapshot só consulta serviço compartilhado; provar leitura offline
  do SQLite existente, atualização de período e revisões preservadas.
- Atalhos Hoje/Ontem do snapshot fixam 07:30; calendário operacional existente
  tem teste explícito de limite 07:00. Reusar configuração existente, sem mudar
  calendário por conveniência.
- Contadores históricos usam arrays vazios como 0; precisam distinguir ausência
  de coleta e zero comprovado. Testar cliques/drill-down além de regex de markup.

## Testes executados

Base oficial:
- node --test scripts/ames-operational-context.test.mjs
  scripts/ames-sn-forensics.test.mjs scripts/ames-sync.test.mjs: 12 PASS / 0 FAIL.
- python scripts/agent-process-r11.test.py: PASS.
- python scripts/agent-operational-calendar.test.py: 8 PASS.

Snapshot isolado (não publicado):
- mesmos 3 arquivos Node + scripts/ames-technician-context.test.mjs:
  19 testes, 16 PASS / 3 FAIL.
- FAIL filtro de turno sem source/basis; FAIL rótulo Turno comprovado (3022)
  ausente em specialized-views; FAIL contrato Python KeyError return_process.
- python scripts/agent-production-trust.test.py: FAIL KeyError return_process.
- Probes de reparo futuro e reparo duplicado: falsos positivos reproduzidos acima.

Nenhum Full Quality pesado novo foi disparado manualmente neste bloco.
Nenhum CLEAN/ZIP gerado. Nenhum dado operacional/credencial anexado ao repositório.

## Evidência física recebida

Seis prints acessíveis e inspecionados: horários ISO crus/rótulos ambíguos,
Retorno A5201 fixo, cards SN e versão já com Falhas agrupadas. Cinco mapeamentos
3012 Home acessíveis: read_only=true/query_executed=false, grade grdDefectRepair,
campos defectTime/defectDesc/reasonDesc/repairComment/repairTime/repairUser etc.
São evidência de estrutura real; não provam a coleta completa do candidato.
Originais preservados, sem publicação de screenshots/dados de fábrica.

## Retomada segura

Checkpoint deste bloco contém SOMENTE este relatório e manifesto de hashes.
Último código oficial continua 1e65eb71; dcb15570 continua apenas snapshot auditado.
Revalidar HEAD/PR/Issue antes de escrever. Próxima ação: Bloco 2, começar pelos
testes de referência 3022 real + retorno genérico + SQLite/revisão/API/sync, depois
implementar apenas esse conjunto coeso. Registrar checkpoint e comentários em
#28 e #27 antes de iniciar o Bloco 3. Full Quality + UX Physical Candidate somente
na integração final. PR permanece draft/unmerged; fábrica PENDING.
