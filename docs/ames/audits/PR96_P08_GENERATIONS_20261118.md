# P08/G6 — auditoria independente anterior à implementação

18/11/2026, America/Sao_Paulo. Base EXATA #95:
48112ea9e408f5dce7fe85f951616b06ed4020e0. Branch isolada
work/ames-p08-generation-reconciliation-20261118.
Lidos integralmente handoffs #92–95, contratos D01/D02, updater e transferência,
G6/checklist e checkpoint independente
https://github.com/pedrokam700/Central-de-Controle-/pull/95#issuecomment-6978345613 .
Git/diff limpos na origem; worktree nova, sem reset/descarte/mutação de #95.

## Evidências e lacunas comprovadas (não atestado de dano fabril)

| Fonte na base | Fato | Tratamento desta missão |
|---|---|---|
| update_candidate._software/_transaction/rollback/recover | SQLite/WAL/data/checkpoints não entram no restore; código/config podem ser compensados; claim/journal e gerações impedem retomada não verificada | Preservar D01/D02. Isso não prova que código anterior interpreta dados atuais; novo mecanismo separado não chama installation/socket/rollback operacional |
| SAFE_STATE_TRANSFER.stage | Cópia de backup/identidade para candidato pristine; exige source_id igual e inventário, sem reconhecer evidência B produzida depois | Não usar para voltar snapshot C0/A sobre B; helper preservado, sem execução |
| issue57_update_preflight.backup_operational_tree | Backup lógico consistente e manifesto, browser_sync_attested=false/exclusive_lease=false/external_scope_complete=false | Mestre bruto separado; SQLite somente na cópia de trabalho. Nenhum atestado externo/lease inferido |
| Store.connect | Cria diretório, abre SQLite RW e faz commit; local_sn.lookup chama ensure_schema | Nem leitura SN é prova de ausência de writes. Não abrir fontes/mestres por Store/SQLite nem executar bootstrap |
| canonical.read_revision | Leitura por snapshot/linha/revisão EXATOS, sem substituir última versão | Provar leitor restrito por código congelado + leitura integral, não inferir boot/compatibilidade total do agente |
| canonical/provenance + 29 tabelas | Origem, linhas, períodos, epochs, snapshots, payloads/revisões imutáveis, técnicos, comentários, horas e vínculos carregam identidade | Comparar TODAS células/JSON bruto/DDL/arquivos, sem dedup nem normalização que esconda diferença |
| G6 R0/R1/R2 | Sem execução não precisa restore; só delta técnico comprovado permite avaliar cópia de dados atuais em destino NOVO; nova evidência/desconhecido/outbox/job = STOP | Nenhuma mesclagem automática; nunca iniciar A com histórico antigo como atual |
| P04 #95 | Núcleo runner PASS, workstation GUI BLOCKED e físico PENDING | Independente de GUI; preservar 50 contratos e nove contraprovas Windows, sem instalar nada fora da CI |

## Perfil sintético e decisão proposta

C0/A/B são capturas distintas e não sobrepostas de fixture pública de 29 tabelas,
mesmo source sintético conhecido. Contêm SQLite e WAL/SHM quando presentes,
checkpoints/config/perfis/tokens FAKE, browser/outbox, sync, código apenas como
metadado PASSIVO de referência e prova de execução sintética. Nenhum launcher,
serviço ou pacote instalável é criado. Estado externo não inventariado bloqueia.

- R0: ausência de execução é aceita só se B mantém estado igual a A/C0; não
  restaurar ou criar alvo. False com novos dados = R2, nunca ignorar evidência.
- R1: apenas delta técnico FECHADO: índice não único + audit de startup sintético
  exato, reproduzidos em cópia isolada de A. O arquivo SQLite resultante deve
  coincidir byte a byte com B; toda outra célula/arquivo permanece igual. R1 com
  WAL/execução/efeito não comprovado bloqueia. Copiar dados ATUAIS B para destino
  fixo NOVO; referência de software A e linhagem B ficam explícitas.
- Compatibilidade R1 é SOMENTE schema/DDL/linhas e leitor histórico congelado
  read_revision, com reprovação em conflito. Não é boot/GUI/update da instalação
  original nem declaração de compatibilidade de toda versão antiga 0.5.39.
  Alvo PASSIVO sempre start_allowed=false, sem executável/pointer ativo.
- R2: qualquer nova evidência/alteração não prevista, jobs/outbox/sync pendentes,
  identidade/esquema/conflito/ausência/corrupção = STOP. Preservar originais e
  capturas privadas; nenhuma troca/merge/dedup/restore em C0/A/B.

Claim exclusivo/journal persistente e cópias xb. Publicação multiarquivo não é
atômica. Interrupção mantém bloqueio. Recuperação explícita pode apenas finalizar
alvo JÁ completo e verificado, sem copiar/restaurar; caso contrário STOP. Escrita
nova em B invalida proposta anterior e impede finalização. Lease/VM/ACL/WORM e
power-loss continuam P07/físico, não são provados por hashes/claim local.

## RED inicial

43 contratos publicados antes da ferramenta: sem implementação todos falham na
asserção de existência. Isso prova lacuna de contrato, NÃO 43 comportamentos de
perda fabril. Após implementar, cada método deverá atingir causa/fase própria.
Matriz cobre R0/R1/R2, grafo completo, identidade e conflito, WAL commit/uncommitted,
outbox/jobs/sync, arquivo ausente/hash/DDL/corrupção, destino existente, I/O,
crash/finalização explícita, dados novos após crash e DB físico inexplicado.

Regressões herdadas: 876 Node/27 invocações Python/36 P02/30 LAB/27 D01-D02,
50 P04+contraprovas Windows. Só branch dos workflows e allowlists explícitas são
adaptadas, mantendo asserts e comandos anteriores. Preview suprimido antes do
primeiro ref. Nenhum código produtivo alterado; se necessário, apenas proposta.

P02 real/P04 completa-real/P05/P07/P08 real/G0–G7/homologação física PENDENTES.
Sem instalação/MES/Firebase/banco/credenciais/guardian/rede reais, launcher,
builder/ZIP/instalador/deploy/merge. A ferramenta nova não é o updater operacional.
