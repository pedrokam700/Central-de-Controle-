# Recuperação da tranche técnica — checkpoints dos Blocos 1–3

## Atualização prioritária — Bloco 3 concluído, 2026-10-15

Parent remoto revalidado: `403b5878f3000b9c363c9e4eca63fe1b51175cbf`.
O commit que contém esta seção é o checkpoint do Bloco 3; seu SHA completo será
registrado nos comentários da Issue #28 e PR #27. Blocos 1 e 2 preservados.

### Recuperação e escopo

Antes de qualquer checkout/reset foram executados git status e git diff.
operator-audit estava detached exatamente no parent acima, com alteração local
somente em ames/data/sn-forensics.mjs (76 inserções / 9 remoções). Esse trabalho
inacabado do Bloco 3 foi inspecionado, preservado e continuado. Outras cópias locais
não foram alteradas. Não houve reset, descarte ou reaplicação dos Blocos 1/2.
Comentários canônicos 6194796421 e 6194874895 lidos integralmente.

### Causas e correções comprovadas

- O rascunho aceitava data ausente como passado; agora histórico precisa de hora
  completa estritamente anterior à ocorrência atual. Timestamps equivalentes
  UTC/local são normalizados para comparação, sem regravar os dados de origem.
- Reparos da mesma PCBA permanecem candidatos; associação exata exige PCBA,
  Defect Code e Defect Time. Alertas só usam Repair Time >= falha de origem e
  < próxima ocorrência conhecida daquela PCBA e < falha atual. Reparo futuro,
  sem hora ou cruzando o ciclo não vira evidência nem comentário do alerta.
- row_key da 3012 inclui comentário/metadados, portanto não identifica uma
  intervenção. Contagem usa PCBA + instante de reparo + código de reparo + usuário;
  várias falhas/observações da mesma intervenção não multiplicam repair_count.
  Dois registros indistinguíveis nesses campos são conservadoramente um só;
  sem identificador de intervenção na fonte não se inventa uma segunda passagem.
- Alertas cobrem mesma falha e mesma família da própria PCBA, histórico MainBoard,
  múltiplas intervenções e nova falha após reparo explícito. Nome no comentário,
  negação, suspeita, plano e substituição não comprovam reparo MainBoard realizado.
- A sequência reparo 3012 → nova falha 2114 permite o indício pós-reparo. NÃO
  afirma retorno a um posto: retorno permanece null até haver contexto 3022 da
  mesma PCBA/ocorrência/reparo, com passagem após reparo e antes da próxima falha.
- Cada componente mantém alerta próprio e evidência de PCBA/falha anterior,
  vínculos 3074, Repair Comment/User/Time quando exatos e temporalmente válidos.
  Caso FPC/LCM coberto por fixture; nenhum componente vencedor é escolhido.
- Lista previous_pcbas/label agregado não comprova vínculo no instante da falha.
  Usam-se query.rows/component_usage já coletados na 3074 e raw_json local já
  persistido. Exigem-se vínculos da placa atual e anterior nos instantes pertinentes.
  Intervalo agregado com event_count > 1 pode esconder lacunas e é recusado.
  Sem comprovação, histórico permanece visível e correlation_limits explica a
  ausência do alerta. Nenhuma coleta/contrato de backend foi alterado.
- Família só vem de campo explícito/contexto da ocorrência exata ou relação
  individual calculada na consulta; OUTRO/UNKNOWN não forma família correlata.
  Nenhuma família é deduzida do tipo do componente ou de label agregado.
- Todo alerta inclui evidence, classification=correlation e
  root_cause_confirmed=false. Nenhum dado operacional é promovido a causa raiz.
- Renderer compartilhado em evidence-view exibe todas as evidências ao vivo e
  offline em PT/EN, com texto escapado. Exportação da investigação local inclui
  alertas/limites sanitizados. Cards distinguem candidatos de associação exata.

### Arquivos deste bloco

Produto (apenas): ames/data/sn-forensics.mjs; ames/evidence-view.mjs;
ames/console-fastlane-sn-reuse.mjs; ames/console-sn-offline-fastlane.mjs.
Teste novo: scripts/ames-sn-correlations.test.mjs (18 casos).
Continuidade: este arquivo, AMES_HANDOFF.md e docs/ames/ESTADO_ATUAL.json.
Bootstrap/8765, todos os coletores/factory-engine, backend/SQLite/sync intactos
em relação ao parent. Sem nova view, agente, DB ou cache.

### Validação direcionada

Node v24.19.0, 30 PASS / 0 FAIL:
`node --test scripts/ames-sn-correlations.test.mjs scripts/ames-sn-forensics.test.mjs scripts/ames-source-provenance.test.mjs scripts/ames-offline-central.test.mjs scripts/ames-evidence-shortcuts.test.mjs`

Inclui reparo futuro, data ausente, associação candidata, duplicação entre falhas
simultâneas/revisões, dois reparos reais, limite do próximo ciclo, família explícita,
negação/plano/substituição, retorno 3022 opcional comprovado, dois componentes
FPC/LCM, vínculos futuros/encerrados/ausentes, label agregado, timezone, equivalência
live/projeção SQLite/cache, ausência != zero, evidência PT/EN e escape de comentário.
O teste live/local inicialmente expôs uma fixture live incompleta (uma ocorrência
por componente, ambos na mesma PCBA). A fixture foi completada com as duas
ocorrências que a consulta real retorna para cada componente; lógica não relaxada.
Sintaxe Node dos quatro arquivos de produto + git diff --check: PASS.
Nenhum Full Quality/Candidate pesado disparado manualmente; nenhum ZIP gerado.

### Pendências e próxima ação exata

- Bloco 3: concluído em código/contratos direcionados, sem certificação física.
- Blocos 4 e 5: PENDING, NÃO iniciados neste checkpoint.
- Full Quality + UX Physical Candidate da integração final: PENDING; qualquer CI
  automático deve ser conferido no SHA exato, nunca inferido dos testes locais.
- Bootstrap físico continua GREEN/congelado; demais gates físicos PENDING.
- Próxima ação: revalidar PR #27/HEAD, ler este checkpoint e os comentários
  canônicos. Começar exclusivamente Bloco 4 (semântica UI/histórico conforme seção
  própria abaixo), preservando Blocos 1–3. Não refazer investigação nem promover
  snapshot dcb15570 integralmente. Não gerar CLEAN antes dos gates finais GREEN.

As seções abaixo preservam a evidência histórica dos Blocos 1 e 2 e não redefinem
o estado atual. Esta atualização tem precedência sobre suas próximas ações antigas.

## Atualização — Bloco 2 concluído em código e contratos direcionados

Parent seguro: `b10c533ce68bf9c966186d235da02053c5194f8e` (auditoria do Bloco 1).
Este commit implementa somente backend/projeção/transporte; os blocos 3–5 ainda
estão PENDING. Não usar o snapshot dcb15570 inteiro.

- production_shift ignora processo anterior e revalida referência/posto/tempo
  compatível com a falha antes de classificar contexto persistido. Passagem
  genérica tem basis=process_passage, distinta de reference_process.
- process_r11 usa o posto da passagem real, migra/persiste retorno genérico e
  reclassifica contextos antigos também no catálogo local. Consulta SN usa a
  mesma projeção de contexto da coleta em lote.
- tela_3022 altera somente a função pura analisar_ciclo_reparo_apos_falha:
  primeira passagem após reparo comprovado, limitada pela próxima falha; mantém
  campo legado A5201 separado. Comparação AST comprovou que nenhuma outra função
  ou classe mudou, inclusive espera, seletores e acceptance de coleta.
- canonical instala triggers para contexto e reparo independentemente da ordem
  de criação das tabelas. Contexto invalida seu snapshot; 3012 invalida clocks
  existentes, pois seu histórico global pode enriquecer diferentes períodos.
  Projeção 6 força revalidação de classificações antigas sem apagar revisões.
- API/manifest já transportavam contextos; projeção R12 e sync agora preservam
  turno/basis/retorno/contextos. Normalizador rejeita mistura de linha/snapshot/
  revisão. Sanitização remove raw/debug/segredos e preserva raw_ref/proveniência.
- 3012: reasonDesc mapeado para reason_desc com migração aditiva; repair_desc,
  repaired_location e reason_desc chegam à evidência canônica junto do comentário.
  reason_desc não altera row_key existente; não duplica observações antigas.
  Coletores/navegação 3012 não foram refeitos. Evidências continuam candidatos da
  mesma PCBA; associação forte e alertas pertencem ao próximo bloco.

Arquivos de produto: ames/agent/{ames_3012_live.py,canonical.py,process_r11.py,
production_shift.py,repair_3012.py}, ames/data/{agent-contract.mjs,canonical.mjs},
ames/factory-engine/ames/tela_3022.py, ames/sync.mjs.
Testes: scripts/agent-production-trust.test.py (novo),
scripts/ames-production-transport.test.mjs (novo),
scripts/agent-integrated-v5.test.py (contrato anterior exigia fallback agora
proibido; fixture positivo recebeu posto real, sem enfraquecer a validação).

Validação local:
- production-trust Python: PASS (referência ausente/futura, posto real,
  retorno não-A5201, ausência de reparo, limite pela próxima falha, SQLite,
  invalidação isolada, reparo/comentário, revisão antiga e restart).
- production-transport Node: PASS (SQLite real → publicação → outro store,
  projeção R12, segredos removidos, raw_ref preservado, identidades rejeitadas).
- canonical Python 5/5; integrated-v5 5/5; process-r11 PASS;
  calendário 8/8; offline-catalog 4/4; package-contract 7/7.
- 14/14 Node: sync, process-provenance, process-r11, failure-process,
  3012-mapper e 3012-navigation.
- Sintaxe Python/Node e git diff --check PASS.
- Bootstrap/workstation e 3028 byte a byte iguais ao checkpoint anterior.

Full Quality / UX Physical Candidate da tranche final ainda PENDING; não foram
disparados manualmente neste bloco. CI de pushes, se iniciado automaticamente,
não substitui a integração final nem o físico. Nenhum ZIP gerado.

Próxima ação exata: revalidar HEAD e iniciar Bloco 3 com contraexemplos de
reparo futuro, duplicado, candidato sem vínculo, negação MainBoard e vários
componentes; recuperar e corrigir somente sn-forensics/alertas com evidência.
Depois Bloco 4 (UI/histórico) e Bloco 5 (integração/gates). Código de produto
pendente da recuperação continua exclusivamente no snapshot remoto dcb15570;
nenhum produto correto desta sessão deve ficar só local após este checkpoint.

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
