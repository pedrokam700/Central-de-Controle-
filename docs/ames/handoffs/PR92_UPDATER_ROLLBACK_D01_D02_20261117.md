# PR92 — updater/rollback D01 e dependência PowerShell D02

17/11/2026, America/Sao_Paulo. **PR DRAFT; P01–P08 e homologação física PENDENTES.**
Base EXATA PR91: `1ecc8daae2e1d8e055f36135cfe460817b0d69d9`.
Branch: `work/ames-updater-rollback-d01-d02-20261117`.
PR: https://github.com/pedrokam700/Central-de-Controle-/pull/92
Código final: `92601eb20a65c90248ac97b7cfb75d17b692c124`.
[CI desse código](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44151330007).
O checkpoint de fechamento registra também o HEAD documental e a CI desse SHA
exato. O manifesto anexo fixa hashes de fontes; o updater não muda após o SHA acima.

Lidos handoff/checklist #91 e checkpoint independente
[6955933207](https://github.com/pedrokam700/Central-de-Controle-/pull/91#issuecomment-6955933207).
Na retomada após limite, Git/diff foram inspecionados e arquivo/patch salvos em
cópia temporária antes de editar. O updater local estava completo (470 linhas,
AST válido); não foi necessário restaurá-lo. Sem reset --hard ou descarte.

## Resultado e garantias delimitadas

D01/D02 estão corrigidos em software e cobertos por testes sintéticos. O agente,
coleta, nomes, timeline, classificação 3074, horários 3022, UI, esquema SQLite,
service worker, guardian e scripts Windows produtivos não foram modificados.
Só `ames/agent/update_candidate.py` muda no runtime; o guard Python alterado é
exclusivamente ferramenta de testes. Nenhuma instalação/homologação foi iniciada.

| Cenário | Comportamento da correção |
|---|---|
| Membro intermediário do agente ou membro de raiz ausente | Validação de TODO o backup antes do plano/staging; zero mudanças de código/config no destino |
| Conteúdo corrompido, inventário incompleto/duplicado, target diferente ou prova inválida | Recusado antes da restauração; não se aceita existência do arquivo como integridade |
| Origem muda entre preflight e staging | Cópia deve coincidir com hash já validado; não adota o conteúdo corrompido como novo esperado |
| I/O durante cópia de agente/raiz, incluindo bytes parcialmente copiados | Copia para temporário no diretório de destino; substitui um arquivo por vez; tenta compensar e verifica a geração anterior completa |
| I/O/interrupção durante compensação | Pode existir árvore mista, MAS claim/journal permanecem; retomada automática bloqueada, backup/staging preservados, recuperação supervisionada explícita |
| Interrupção após preparação, troca de agente/raiz ou verificação | Journal e gerações seladas persistem; teste também usa os._exit em outro processo. Recuperação pendente retorna à geração anterior, sem restaurar banco antigo |
| Falha ao arquivar transação já COMPLETE | Claim permanece. Recuperação verifica a geração concluída e apenas finaliza; não reverte silenciosamente um update concluído |
| Segunda recuperação com updater ainda ativo | Lock do SO recusa concorrente. ID exato da transação também é obrigatório; ID não é credencial ou lease fabril |
| Alteração externa de código/config ou corrupção de staging | Recuperação recusa sobrescrever; conserva claim/dados/evidências para análise |
| Abertura do destino SQLite de backup falha | Origem fechada explicitamente, mesmo se o destino não chegou a abrir; nenhuma geração instalada alterada |
| Helper ausente no destino | Instala o helper do candidato e registra ausência anterior; rollback verificado o remove |
| Helper antigo no destino | Backup da versão antiga, cópia da versão candidata, rollback da versão antiga; não executa PowerShell |
| Helper ausente/manifesto de candidato contraditório | Preflight falha antes de mudar destino. Fechamento dot-source→builder→updater→cópia→backup→rollback verificado estaticamente e em diretórios sintéticos |
| Requirements/frontend extras | Inventário, cópia, backup e rollback incluem os extras realmente alterados; não são omitidos do backup retornado |

**Não é transação atômica multiarquivo.** Entre substituições a árvore pode ficar
mista. O controle é: impedir entrada nos agentes/guardians que já respeitam
`.ames-update`, compensar e verificar quando possível, ou manter bloqueio e exigir
recuperação. O guardian antigo pode ignorar a barreira: P07/exclusividade externa
continua obrigatório. Porta livre e claim local NÃO concedem lease de manutenção.

O runner Windows registra o filesystem do diretório sintético via API Windows,
sem comando operacional. Testes de lock, rename, I/O e morte de processo em NTFS
não provam atomicidade global, power-loss, hardware, ACL ou instalação 0.5.39.
Não há teste físico fabril nem certificação de durabilidade após perda de energia.

## Formato e recuperação

`central-updater-backup-v2` registra target, todos os arquivos presentes/ausentes
do escopo e SHA-256 dos membros salvos. Inclui o snapshot SQLite de backup, quando
presente, mas **nenhum banco/WAL de backup entra no plano de restauração**.
O inventário de geração usado na operação é ancorado pelos hashes dos
manifestos de staging registrados no journal. Hashes detectam corrupção em origem confiável; não são assinatura nem
autenticam um manifesto que atacante substituiu junto dos arquivos. Proveniência,
ACL privada e custódia ainda pertencem a G0/G2/P07.

A operação prepara gerações `before` e `desired`, seus manifestos/hashes e
`transaction.json` sob `.ames-update`, antes de substituir código/configuração.
Estados: PREPARING → PREPARED → APPLYING → COMPLETE; em erro, COMPENSATING →
COMPENSATED ou RECOVERY_REQUIRED; preparação sem mutação pode ser CANCELLED.
Claim desconhecido, metadata ilegível ou estado não verificável não é limpo para
"liberar" startup. Sem resolução automática segura, não retomar.

Somente após uma geração inteira verificada o diretório da transação é movido
para `candidate-backups/transaction-<id>`. O seletor legado considera apenas
pastas com `backup.json`; não confunde journal arquivado com backup restaurável.
Não há limpeza automática de backups/evidências para liberar espaço.

Novas APIs/CLI do updater:

- `inspect-backup`: informa integridade conhecida, sem autorizar restauração.
- `recover`: exige target e `--transaction` exatos; verifica claim, lock, schema,
  escopo, hashes e geração corrente antes de recuperar/finalizar.
- `rollback --backup`: exige backup verificado; fallback hashless implícito foi
  retirado. Ferramenta e backup devem vir de proveniência aprovada.

Essas interfaces foram executadas apenas em fixtures LAB pela suíte. Não são
instruções para executar no posto. Uso operacional continua bloqueado por P01–P08.
Metadata/cópias incompletas, alteração externa ou staging corrompido podem exigir
reconstrução/validação supervisionada; não há `force` que ignore integridade.

## Backups antigos

Sem schema v2/hashes confiáveis: `LegacyBackupUnverified`, inspeção sem restauro;
nenhuma mutação de código/config. Não transforma rehash do backup encontrado em
prova de que ele contém a versão histórica correta.

Compatibilidade controlada: `--legacy-proof` aceita recibo independente
`central-updater-legacy-proof-v1`, com hash do `backup.json` legado e manifesto
v2 completo já confiável para os mesmos membros/target/ausências. Inventário
incompleto ou divergência de qualquer conteúdo continua recusado. A prova deve
vir de custódia/registro independente; não é gerada automaticamente pelo updater.
Prova e hashes privados não devem ser publicados. O teste preserva uma prova
confiável ANTES de corromper a cópia e verifica recusa após a corrupção.

## Preservação de novos dados

Rollback/compensação/recuperação aplicam somente geração de software/configuração.
Rejeitam SQLite/DB/journals, `ames-agent/data` e saídas/logs/screenshots operacionais
do engine como alvos. SQLite corrente, WAL, token e checkpoints nunca recebem
snapshot antigo. Testes criam linhas e checkpoint NOVOS após update/interrupção
e comprovam conservação integral após recuperação. Antes de rollback, a geração
atual de código/config é salva; config segue o contrato explícito de rollback.
Se config/código mudar externamente enquanto pendente, recuperação para e não
sobrescreve a mudança. Estado externo/outbox real não foi acessado ou homologado.

## RED/GREEN verificável

- RED publicado antes do runtime: `c6f8b1ef17eed0f1dbd9f28782d46e8a3dfb6235`,
  [CI 44140363559](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44140363559).
  Linux: 13 testes, 16 falhas de asserção contando subcasos. Windows parou antes
  dos testes: guard de testes Popen-função incompatível com asyncio. Não contar
  essa falha de infraestrutura como RED Windows de produto.
- Guard corrigido para subclasse, mantendo MESMA recusa antes do launcher e
  proteção ZIP. Contraprova própria: falta de contrato de classe falhou; dois
  testes passaram depois. Nenhum builder real é executado pela sentinela.
- Primeira candidata `8da8fdf96dba660b403c46885f9fdf808971568d`,
  [44150272238](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44150272238):
  Linux PASS; Windows revelou handles das fixtures não fechados e alias 8.3 no
  fault injector. Corrigidos os testes, sem ignorar erros/afrouxar asserções.
- Fixtures corrigidas `4fe52d96f82ba573ac3076a6b09b91480202964b`,
  [44150853469](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44150853469):
  Linux/Windows SUCCESS; Windows NTFS, 26 testes + 13 estáticos + 2 guard.
- Código final `92601eb20a65c90248ac97b7cfb75d17b692c124` fecha também a origem
  SQLite se o destino do backup falhar ao abrir; matriz ampliada a 27 testes.
  [CI 44151330007](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44151330007):
  Linux/Windows SUCCESS, 27 casos; Windows NTFS. CI do HEAD documental exato
  será registrada no checkpoint final.

Regressões locais finais do mesmo runtime: 20 passos Python/Node da workflow
integrada #90 (876 contratos Node centrais, motor Python e recuperação/hardening/
identidade), além de 27 casos do updater, 13 estáticos e 2 do guard. Nove scripts
Chromium incluem nove telas PT/EN/temas, timeline #86, 3074 #87, 3022 #88, SW/restart/
offline #89, reuso volumoso #90, sync/pareamento/conclusão 3028. Dependências já
existiam; não houve pip/npm/setup/instalação. A CI desta PR roda matrizes Windows/
Linux e regressões stdlib/Node pertinentes; nove scripts Chromium completos e
seleção integrada completa são prova local, não execução Windows fabril.

[Recibo de validação](../audits/evidence/PR92_D01_D02_VALIDACAO_20261117.json)
conserva nomes/comandos/contagens, fontes e recibos públicos sintéticos; logs
externos completos estão nos links Actions. Paths locais não são links externos.
Nenhum screenshot ou dado operacional foi enviado.

## Checklist e continuidade

G0–G7 e template atualizados: D01/D02 corrigidos em testes; **todos os gates de
homologação continuam PENDING**, `execution_authorized=false`. P01–P08 continuam
pendentes (entrada offline, desidentificação, monitor/guardian, JSON1/dependências,
SDK frio, paths, lease e reconciliação externa). Não remover guardas/limites para
converter pendência em aprovação. Homologação offline NÃO iniciada.

Arquivos: updater; matriz D01/D02; compatibilidade do guard/test-only guard Python;
suíte estática #91; workflow CI específico sem instalações; checklist/template;
parecer/handoff/JSON de validação. Vercel/Netlify apenas suprimem auto-preview desta
branch. Scripts Windows/builders apenas lidos/AST; não foram executados/modificados.

Main/PRs anteriores são reconferidas no checkpoint final, preservadas, abertas e
DRAFT. PR92 permanece DRAFT contra #91. Sem MES, dados/SQLite operacional,
credenciais, instalação real, guardian/rede/Firebase, builder, ZIP, instalador,
release, deploy ou merge. **Homologação física PENDENTE.**
