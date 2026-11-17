# Preparação da homologação offline — instalação 0.5.39 → código PR90

**PLANO DOCUMENTAL. NÃO EXECUTADO. Homologação física PENDENTE.**
Data: 17/11/2026, America/Sao_Paulo. Base EXCLUSIVA:
`83f5db58438318c726c9b22a8d0a2d8d78124c81` (PR90, DRAFT).
Nenhum procedimento abaixo autoriza sua execução nesta missão.

Foram lidos integralmente o [handoff #90](../handoffs/PR90_DESEMPENHO_GUARD_20261117.md),
o [parecer e rollback #89](../audits/PR89_INTEGRACAO_69_88_20261117.md) e a discussão
#89, incluindo checkpoint independente 6950145034. O plano abaixo substitui, para
este ENSAIO OFFLINE FUTURO, a descrição resumida da #89; não modifica seu runtime.
O item de coleta dirigida da #89 NÃO pertence a esta homologação offline.

## Limite da auditoria e decisão atual

Leitura de fontes, AST, declarações de inventário, contratos e hashes de fontes
públicas. Nenhum import de agente/updater/builder, execução Windows, abertura de
SQLite, backup/restore, instalação, download de dependências ou homologação.

**Execução futura ainda BLOQUEADA:** D01/D02 e gates P01–P08 abaixo não estão
resolvidos por este documento. Não há novo pacote candidato gerado/aprovado.
CI estática PASS significa que o parecer reproduz a estrutura do código, não que
seja seguro executar os launchers existentes ou que Windows tenha sido validado.

[Recibo público estático](../audits/evidence/OFFLINE_PREPARACAO_ESTATICO_20261117.json)
contém somente código público/hash, fatos e pendências. O teste
`scripts/audit/offline-homologation-static.test.py` apenas lê fontes/AST; não
executa os caminhos auditados. Os testes de atualização existentes foram lidos,
NÃO executados nesta missão, pois eles simulam atualização/rollback.

## Achados, evidências e propostas isoladas

Os links fixam a fonte da PR90; nomes de função e linhas também estão no JSON.

| ID / severidade | Fato comprovado em fonte | Consequência / correção proposta, NÃO implementada |
|---|---|---|
| **D01 / ALTA** | [update_candidate.py:118–127](https://github.com/pedrokam700/Central-de-Controle-/blob/83f5db58438318c726c9b22a8d0a2d8d78124c81/ames/agent/update_candidate.py#L118): `rollback` chama `_restore_agent` antes de verificar existência de todos os `root_files`; cópias podem já ter ocorrido quando `Incomplete root backup` é lançado | Defeito de ordenação comprovado; backup incompleto pode deixar restauração parcial de código. PR isolada futura: RED com membro de raiz/agente ausente ou corrompido, zero mutações antes de validar TODOS os paths/hashes; staging e recuperação transacional. Não executar rollback legado para reproduzir nesta missão |
| **D02 / ALTA** | [ROOT_FILES do updater](https://github.com/pedrokam700/Central-de-Controle-/blob/83f5db58438318c726c9b22a8d0a2d8d78124c81/ames/agent/update_candidate.py#L12) omite `suporte/ames-workstation/ISSUE57_RELAUNCH_ENROLLMENT.ps1`; o [builder o lista](https://github.com/pedrokam700/Central-de-Controle-/blob/83f5db58438318c726c9b22a8d0a2d8d78124c81/scripts/build-r12-migration-bundle.py#L35), e launcher/guardian copiados fazem dot-source dele | Fechamento de dependências PowerShell não é garantido pelo updater. Se ausente no destino, startup falha; se antigo, preserva helper antigo com scripts novos. Não afirma que falta no posto real. PR futura: contraprova estática e sintética de fechamento payload→cópia→backup→rollback, destinos ausente/antigo; incluir dependência somente com RED/GREEN. O defeito não está no glob da CLEAN integrada |
| **P01 / BLOQUEADOR** | `START_LOCAL_CANDIDATE.ps1` chama rede, instalador/reparador, agente e Chrome; `INICIAR_POSTO_CENTRAL_V2.bat` pode consultar preview/produção e reparar rota. `01_INSTALAR_UMA_VEZ.bat /prepare` evita criar SQLite/config/token, mas ainda instala software e pode baixar Python/Chrome/wheels | Nenhum deles é dry-run offline. Bloquear todos até estratégia offline específica revisada. Não usar `/auto` ou `/prepare` como garantia de isolamento |
| **P02 / BLOQUEADOR** | `SAFE_STATE_TRANSFER.stage:119–138` copia config/token e mantém source_id; recibo `source_unchanged=True` não concede lease. `backup_operational_tree` exclui outbox do navegador; nesse caller `external_inventory` nem é fornecido | Transferência preservadora não é anonimização nem backup de máquina inteira. Separar backup privado fiel de derivado laboratorial sem identidade operacional; exigir inventário externo explícito |
| **P03 / BLOQUEADOR** | `agent.py:144` inicializa SQLite no import; hardened entry aplica hardening/índices/calendário/token antes do main. `agent_entry.main:571` recupera jobs, inicia monitor e NetworkGuardian | `python agent.py --help` ou importar entry NÃO é leitura neutra. Não iniciar sobre original/backup mestre. Sem flag offline universal validada; definir entrada laboratorial e conter efeitos antes de qualquer boot futuro |
| **P04 / ALTA** | `preflight.check` verifica `find_spec` e quick_check, não versões/tzdata/semântica JSON1; requirements têm intervalos abertos; factory-engine não declara tzdata | Presença de módulo/venv não é compatibilidade Windows. Exigir inventário travado das dependências e consultas funcionais no Python exato do clone |
| **P05 / BLOQUEADOR do shell frio** | `sw.js:40–51` exige fetch dos SDKs gstatic 10.8.0; `offline-bootstrap.mjs:1–3` importa URLs externas e inicializa Firebase/Auth | Perfil novo sem SDK provisionado não comprova boot offline; cache aquecido/login operacional não pode ser copiado. Harness sintético das nove telas não substitui shell/autenticação reais. Provisionamento offline de dependências públicas e transporte de laboratório requer solução isolada futura; não liberar internet para aquecer perfil |
| **P06 / ALTA** | `discover_engine` procura AMES_ENGINE_DIR/config/pastas pai/CWD; perfis Chrome têm caminhos padrão externos à instalação. Guardian registra Run e usa mutexes globais | Copiar pasta não isola motor/perfil/registro. Usar VM/conta/perfil exclusivos, paths explícitos de laboratório, sem mounts/variáveis herdadas; provar cada caminho antes do boot |
| **P07 / BLOQUEADOR** | `update_readiness` sempre retorna `update_authorized=False`/`maintenance_lease=False`; inventário guardian declara all_sessions/lease falsos. Backup online não congela outros arquivos/outbox; `mode=ro` SQLite não é lease nem garantia de ausência de efeitos em SHM | Precisa coordenação externa atestada e captura coerente do estado completo; não inferir quiescência de porta livre, job zero ou receipt do helper |
| **P08 / ALTA** | Falha de `TROCAR_PARA_PR69_NOVA.ps1` pode reiniciar a raiz antiga; esse bloco não reconcilia evidência gravada pela candidata. Rollback Python conserva SQLite corrente, mas restaura configuração/código e não prova compatibilidade de esquema | Voltar à raiz antiga pode deixar novas evidências apenas na candidata. Nunca retomar snapshot antigo silenciosamente; preservar gerações, verificar compatibilidade do código antigo com dados atuais ou INTERROMPER |

D01/D02 são defeitos de preparação/atualização demonstrados estaticamente, não
prova de dano no posto. P01–P08 descrevem contratos insuficientes para ESTE ensaio,
não necessariamente defeitos no uso fabril normal. Não foram removidas proteções
BRM/AT, recuperação, guardian ou regras de autenticação para contorná-los.

### Mapa dos scripts Windows e efeitos

| Grupo | Leitura estática / classificação para o ensaio futuro |
|---|---|
| `INVENTARIAR_INSTALACOES_READONLY.ps1`, `INVENTARIAR_GUARDIANS_READONLY.ps1` e helpers de signals | Observam metadados de processo/registro/tarefa/serviço/startup, sem parar processos. O primeiro busca Downloads/Desktop e nomes `AMES_Central_CLEAN_*`; fornecer raízes privadas explícitas. Paths, PIDs e observações ficam PRIVADOS. Não cobrem todas as sessões/persistências |
| `ISSUE57_PROCESS_WITNESS_READONLY.ps1` | Testemunho de imagem/PID/criação/argv, com campos derivados de conta/path; não atesta exclusividade. Não publicar esses campos/fingerprints |
| `DIAGNOSTICO_POSTO.ps1` | Faz TCP MES, consulta CDP/títulos/URLs, health e imprime CommandLine/logs; NÃO é coletor seguro para evidência pública nem entrada do ensaio sem MES |
| `VERIFICAR_VERSAO_CENTRAL.ps1` | Compara manifesto/SHA e hash de módulo via HTTP local; não prova banco nem cache do navegador. Usar somente depois de atestar proprietário da porta e versão do próprio script |
| `START_AGENT_CANONICAL.ps1`, `KEEP_AGENT_RUNNING.ps1` | Escrevem logs/estado, podem iniciar/parar agentes conhecidos e coordenam mutexes 8765. Claims `.ames-update` bloqueiam startup; não limpar claim para liberar teste. Guardian antigo pode ignorar contrato novo; enrollment atual é fixture-only |
| `TROCAR*`, `PR69_APLICAR_CODIGO`, `pr69_apply_code.py`, updater | Mutam código/registro/processos/estado; não servem para inventário. Caminhos diferentes, não equivalentes; hotfix PR69 não é migrador genérico 0.5.39 |
| Instaladores/reparadores/at-setup | Podem criar venv, instalar/download, inicializar SQLite e abrir sessão. Proibidos nesta missão; futura aquisição/instalação exige autorização própria |
| `ensure_ames_route.ps1`, `08/12_PREPARAR/APLICAR`, `ROTA_AMES_APLICAR/REMOVER` | Escrevem/removem rota /32 Active/PersistentStore, podem pedir UAC/conectar Wi-Fi/provar TCP. Apenas ler fontes agora; NUNCA executar para preparar o clone |
| `05_ABRIR_CHROME_AMES`, fallback HTTPS existente e templates fastlane | Abrem perfil/CDP/MES/HTTPS ou usam token existente. Não usar perfil/9222 operacional no laboratório |

O manifesto estático enumera hashes de todos os scripts Windows/Python de
`tools/ames-workstation` e templates, além dos módulos de inicialização/persistência.
PowerShell/BAT não foram interpretados pelo parser Windows; quoting, UAC, ACL,
cmdlets, processo e IO reais são gates futuros, não aprovados por grep/AST Python.

## Responsabilidade e evidência

Um operador responsável pela origem, um responsável pelo laboratório e um
revisor independente devem assinar o registro privado de cada gate futuro.
Preencher horários com fuso, run_id de laboratório, SHA e resultado, sem nomes
pessoais no GitHub. Nenhuma dessas assinaturas existe nesta missão.

Usar [template vazio](OFFLINE_GATES_TEMPLATE.json). Estados: `PENDING`, `PASS`,
`FAIL`, `STOP`. PASS requer referência privada verificável; UNKNOWN/NÃO MEDIDO
é PENDING, nunca zero. Aprovação estática do plano NÃO muda execution_authorized.

No GitHub: somente código público, fixtures sintéticas e resultado agregado
sem conteúdo operacional. NÃO publicar bancos/WAL/SHM, SNs, nomes/comentários,
source_id reais, contagens/revisões do posto, paths/perfis, CommandLine, cookies,
tokens, config, screenshots de produção ou hashes de identidade/config/backup
privados. Hash de segredo não o torna publicável. Guardar essas evidências em
cofre privado com ACL verificada; publicar apenas código de gate e motivo fixo.

## Gates e passo a passo — executar SOMENTE em missão futura autorizada

### G0 — Escopo, candidata e ambiente

- [ ] Autorização futura escrita identifica origem, janela e responsáveis; permite
  aquisição/cópia/desidentificação/ensaio explicitamente. Não derivar isso desta PR.
- [ ] Fixar código candidato PR90/SHA acima e CI 44113137883, sem interpretar a CI
  Linux sintética como prova de Windows. Manifesto completo de qualquer artefato
  futuro deve ser verificado por origem confiável; nenhum artefato foi gerado aqui.
- [ ] Identificar separadamente versão do pacote, SHA frontend servido, hashes de
  agente/engine/launcher, schema/projeção. `agent_version=0.5.23`, rótulo legado do
  updater ou shell 15.x NÃO identificam sozinhos instalação 0.5.39. A referência
  pública 0.5.39 no preflight é tag `ames-v0.5.39-multipc-20261022`, commit
  `b283b1764432f5d90486d38a7553b30542a5c118`; é referência, não atestado do posto.
- [ ] D01/D02 resolvidos por PRs isoladas ou caminho correspondente explicitamente
  excluído e substituído por procedimento revisado. Não executar updater legado
  como contorno; nenhuma correção produtiva foi feita nesta missão.
- [ ] VM Windows exclusiva, sem NIC ligada à fábrica/Internet, bridge/NAT, VPN,
  passthrough Wi-Fi, compartilhamento de disco/perfil/clipboard ou credenciais de
  domínio operacional. Evidência de contenção obtida fora da aplicação. Não alterar
  firewall, guardian ou rede do host/fábrica. Loopback local permitido só no guest.

**PASS:** ativos/destinos/SHA/escopo identificados e isolamento verificável.
**NO-GO:** pacote sem identidade, runner no posto fabril, segredo/mount herdado,
D01/D02 sem tratamento ou inexistência de estratégia offline P01/P03/P05.

### G1 — Identificar original sem modificá-la

- [ ] Somente metadados de arquivos/manifestos e inventário de processos, criação,
  imagem, sessões, proprietários da 8765, guardians, Run/RunOnce, tarefas, serviços,
  pastas Startup e launchers independentes. Usar scripts read-only auditados com
  raízes explícitas; preservar resultados em privado. Denegação de leitura = UNKNOWN.
- [ ] Registrar versão Windows/arquitetura, Python/venv usado, Chrome, permissões,
  disco livre, origem de engine e caminhos resolvidos SEM importar agente/engine.
  Inventário Python/SQL detalhado será feito em cópia isolada nos gates seguintes.
- [ ] Inventariar presença/tamanho de DB/WAL/SHM/journal e fontes externas de
  checkpoints, exports, logs, browser IndexedDB/outbox; não abrir SQLite original
  com Store/PRAGMA, não iniciar agente, não copiar perfil do browser para laboratório.
- [ ] Observar rotas ativas E persistentes e interfaces por metadados do Windows,
  sem executar ferramenta de reparo, netsh connect, TCP MES ou diagnóstico amplo.
  Não remover rota persistente para "isolar" a instalação original.
- [ ] Identificar pendências de coleta/sync em todas as sessões por observação
  apropriada e atestado do operador. Não clicar sincronizar/recuperar para zerá-las.

**PASS:** identidade sem ambiguidade e escopo de escritores/autostart conhecido.
**NO-GO:** múltiplas instalações indistinguíveis, PID não identificado, sessão/
origem de escrita desconhecida, inventário incompleto, dados fora do escopo.
Porta livre, COMPLETE ou jobs=0 não concedem lease. Este gate não para processos.

### G2 — Congelamento e backup consistente privado

Este é um ensaio FUTURO separado; nenhuma cópia foi feita. Corrige a ambiguidade
da sequência resumida #89: para o backup do estado completo, provar exclusividade
ANTES da captura. Backup online SQLite sozinho não congela arquivos/outbox.

- [ ] Após autorização específica de janela, obter coordenação externa de TODOS
  os escritores/relaunchers/sessões; confirmação do operador sobre outbox e
  atividades em curso. Segurar barreira durante parada/captura/verificação. Não
  supor cooperação do guardian instalado pela existência de mutex novo ou marker.
- [ ] Parar somente processos cuja imagem, raiz, PID e criação foram atestados;
  nunca taskkill genérico. Se não houver coordenação segura demonstrada, PARAR O
  PROCEDIMENTO sem parar componentes. Marcador desconhecido/abandonado = STOP.
- [ ] Atestar estado estável após parada. Gerar diretório privado NOVO e ACL
  restritiva ANTES de gravar dados, sem junction/reparse, com capacidade para
  captura + derivação + restauração e reserva; disco insuficiente = NO-GO.
- [ ] Capturar imagem coerente e estável do SQLite e WAL/SHM/journal presentes,
  mais inventário completo dos demais arquivos operacionais. Não copiar só .sqlite3
  com processo vivo, não misturar arquivos de instantes diferentes, não apagar
  WAL/SHM, não executar checkpoint/truncate/vacuum na origem. Journal de recuperação
  desconhecido exige análise, não exclusão automática. Se writers não permanecerem
  parados, abortar captura e conservar originais.
- [ ] Preservar a imagem bruta mestre imutável com hashes/ACL privados. Fazer
  cópia de TRABALHO desse conjunto, nunca abrir mestre/origem via SQLite. Em WAL,
  `mode=ro` não substitui contenção de SHM nem exclusividade. Não usar immutable=1
  para ignorar WAL e "resolver" recuperação.
- [ ] Na cópia de trabalho, API SQLite Backup gera destino NOVO autocontido,
  incluindo transações confirmadas do WAL. Verificar integridade completa,
  foreign_key_check e inventário lógico; ensaiar restauração em OUTRO destino
  vazio. O backup lógico normalizado não precisa reutilizar WAL/SHM de origem.
- [ ] Contraprova futura obrigatória: transação confirmada apenas no WAL aparece
  no backup/restauração; transação não confirmada não aparece. Backup truncado,
  hash divergente, destino existente, ACL ampla, symlink/junction, falta de espaço
  ou interrupção devem falhar sem tocar origem/mestre. Não rodamos esse ensaio aqui.
- [ ] Conferir byte hashes da imagem congelada antes/depois da captura, hashes
  do restante do estado e escopo externo. Hash do DB normalizado pode diferir
  fisicamente da origem: comprovar igualdade lógica, não exigir bytes idênticos.
  Não publicar os hashes/dados privados.

**PASS:** captura consistente, origem preservada, restauração independente válida,
inventário externo/outbox explicitamente coberto e evidência privada assinada.
`backup_verified`/quick_check isolado NÃO bastam. Backup que inclui identidade é
material privado de recuperação, NUNCA a imagem pronta do laboratório.

### G3 — Clone offline sem identidade operacional e pré-voo

- [ ] Preferência: reconstrução de esquema com fixtures sintéticas, grafos de
  referência coerentes e casos do histórico #86–90. Para derivado de backup real,
  exigir transformação desidentificadora validada separadamente; não existe aqui
  ferramenta certificada. Falta dela bloqueia a trilha, não autoriza levar bruto.
- [ ] Origem/mestre ficam privados fora da VM. Não transportar config/token,
  source_id, at_user_profiles/at_admin_auth, cookies/sessão/CDP, auth Firebase,
  browser profile, senhas, nomes, SNs, comentários ou artefatos operacionais.
  Busca por arquivos conhecidos não prova anonimização de JSON/DB/raw blobs.
- [ ] Usar IDs substitutos de laboratório com mapa consistente em todas as tabelas,
  JSONs e referências de revisão/hash/linha/snapshot. Revalidar hashes/proveniência
  conforme formato. Não fazer replace global nem inventar vínculos/horários para
  reparar referências quebradas. Sem transformação comprovada, usar só sintético.
- [ ] Criar dois derivados independentes e idênticos do conjunto sanitizado: A
  para baseline 0.5.39, B para candidata; mestre sanitizado C0 separado e imutável.
  Não compartilhar arquivos mutáveis, hardlinks/junctions, engine ou browser entre A/B.
- [ ] Conta/hostname de laboratório, env e CWD limpos, engine/perfil/temp/logs só
  dentro do guest. Remover herança de AMES_ENGINE_DIR e paths operacionais SOMENTE
  no guest. Config nova de laboratório com bind loopback, endpoints simulados e
  origens locais mínimas; token local novo não reutiliza credencial operacional.
- [ ] Nenhuma rota/perfil Wi-Fi/tarefa/serviço/Run operacional é importado. Snapshot
  ActiveStore/PersistentStore/registro do guest antes/depois deve permanecer igual.
  Não usar os scripts de rota para "testar"; Windows isolado pode usar 8765 sem
  conflitar com a fábrica. Atestar dono/raiz/criação e bind só 127.0.0.1/::1.
- [ ] Não copiar jobs/monitor habilitado esperando inatividade: boot chama
  recover_jobs e inicia monitor/NetworkGuardian. Estratégia offline revisada deve
  neutralizar agendamentos SOMENTE no derivado e impedir consultas reais/reparos,
  com delta documentado; não há flag offline genérica demonstrada. Não editar
  runtime às pressas para passar gate. Proibir Chrome/start, network/repair,
  pairing de produção, auth/sync Firebase e endpoints de captura real.
- [ ] Sem instalar agora. Para futura VM previamente provisionada, verificar Python
  Windows 3.12/bitness/build/executável exato, SQLite realmente carregado, Chrome
  versão/hash, stdlib sqlite3/zoneinfo, tzdata e imports das extensões no próprio
  laboratório. Não importar agente para esse inventário.
- [ ] Resolver requirements agente+engine conjuntamente, com versões e hashes
  transitivos aprovados. Interseções atuais: pandas >=2.2,<3; openpyxl >=3.1,<4;
  playwright >=1.55,<2; pyautogui >=0.9.54,<1; pyperclip >=1.9,<2; tzdata >=2025.2.
  Isso não é lockfile; não instalar por esses intervalos durante ensaio isolado,
  nem permitir fallback PyPI/download Python/Chrome se wheels faltarem.
- [ ] Validar JSON1 funcional em SQLite em memória/descartável no Python EXATO
  do guest, nunca no original. Não depender só de sqlite_version/compile_options:

```sql
SELECT json_valid('{"x":[1,2]}'), json_extract('{"x":[1,2]}','$.x[0]'),
       json_remove('{"x":1,"y":2}','$.x');
-- Esperado: 1, 1, {"y":2}
SELECT json_group_array(json_extract(value,'$.product'))
FROM json_each('{"datasets":{"defects":[{"product":"LAB-A"},{"product":"LAB-B"}]}}',
               '$.datasets.defects');
-- Esperado: ["LAB-A","LAB-B"]
SELECT json_extract('{"content_hash":"LAB-H","summary":{"period":{"mode":"LAB"}}}',
                    '$.content_hash','$.summary.period');
-- Esperado: ["LAB-H",{"mode":"LAB"}]
```

- [ ] Validar `ZoneInfo('America/Sao_Paulo')`, horário UTC/local, fronteira produtiva
  07:00→07:00 e turnos 07:30/17:30/03:30, sem alterar relógio/timezone do host.
- [ ] Pré-provisionamento offline de SDKs públicos exatos e harness de UI precisa
  aprovação e testes próprios. Não copiar perfil operacional nem ligar Internet
  para aquecer cache. Shell frio sem dependências = BLOQUEADO, não PASS pelo harness.

**PASS:** clone C0/A/B sem identidade operacional, runtime/dependências comprovados,
rede/rotas/autostart contidos e entrada offline aprovada. **NO-GO:** ausência de
qualquer prova; perfil frio ou autenticação produtiva indispensável à abertura.

### G4 — Comparar integridade, contagens e evidências antes/depois

1. Antes de executar qualquer código candidato, congelar inventário privado C0:
   tabelas/DDL/índices/triggers/schema_meta, user_version, hardening checksum,
   source_id LAB, linhas/períodos, máximos de IDs/epochs/revisões e estados/jobs.
2. Em cópia descartável, `PRAGMA integrity_check` deve retornar só `ok`;
   `foreign_key_check` deve retornar zero linhas. Violações já existentes na
   baseline não viram aceite automático: registrar e bloquear até classificação.
3. Enumerar todas as tabelas presentes, não só lista fixa. Conferir explicitamente
   snapshots/windows, defect_entities/observations, pcba_history/history_contexts,
   material_reuse, process_events/raw_events/contexts/timeline, 3012/nomes,
   snapshot_payloads/revisions, mes_revisions, jobs/monitor, artifacts/audit e
   arquivos externos de checkpoint/export. Tabela ausente = NÃO DISPONÍVEL,
   nunca contagem zero. Esquema exato deriva da instalação inventariada.
4. Registrar contagens por linha/snapshot/revisão/source/período/estado e digest
   lógico tipado, ordenado por chaves, de TODAS as linhas antigas. Preservar JSON
   bruto/texto, papéis, nomes sintéticos, comentários, datas e Hist Seq inclusive 0.
   Contagens iguais sozinhas não provam equivalência; DB byte hash pode mudar.
5. Executar futuramente baseline A e candidata B por entrada aprovada, sobre
   derivados iguais, SEM coletor/MES. Comparar delta com allowlist revisada ANTES:
   índices/hardening/calendário/audit de startup e jobs interrompidos são mudanças
   técnicas possíveis, mas precisam evidência; não aceitar qualquer mudança com
   rótulo "migração". Nunca esperar que iniciar agente seja operação read-only.
6. Reprojeção v14 pode acrescentar revisão derivada de evidência armazenada.
   Revisões/payloads/raw antigos e hashes antigos devem permanecer íntegros;
   não exigir mesmo número total de revisões após uma projeção autorizada, nem
   tolerar perda/reescrita de antigas. Verificar parent_hash/line/source/período.
7. Reexecutar inventário lógico após boot, leitura/export, reinício e recuperação.
   Nenhuma perda ou vínculo/horário novo sem prova; partições 1º/2º/3º/indeterminado
   e diagnostics 3022/nomes/timeline devem conservar identidade e conflitos.

**PASS:** zero perdas/alterações não aprovadas; todo delta técnico ou derivado
explicado. **NO-GO:** queda de contagem, digest divergente não autorizado, duplicação,
vínculo fabricado, mistura L1/L2/L3/source/revisão ou conversão de ausência em zero.

### G5 — Nove telas, recuperação, reinício, responsividade e SW

Executar depois de G0–G4 PASS, somente no futuro. Evidências em fixtures LAB.

| Verificação | Critério de aceite supervisionado |
|---|---|
| Nove telas | Monitor, Top3, Falhas, Consulta por SN, Rastreabilidade, Reuso, Processo, Base, Conhecimento; PT/EN, claro/escuro, navegação ida/volta/reload. Mesmos fatos/atores/relógios em todos os consumidores |
| Timeline/nome | Falhas independentes, mesmo código em passagens distintas, Hist Seq 0, sem data, comentários/papéis preservados; nenhum autor inventado ou histórico atrás de +N |
| 3074 | Primeiro/segundo/terceiro/indeterminado, Y/N, transferência entre PCBAs, múltiplas linhas/revisões, vínculos incompletos; sem deduzir uso de contador conhecido |
| 3022 | Antes/depois da falha, lacuna/fuso/turnos, AT/A6900 não substitui último posto produtivo; Defect/Repair Time não vira produção; diagnóstico explícito pendente |
| Recuperação parcial | Checkpoint confirmado reutilizado localmente sem MES; parcial mantém pendências; snapshot/revisão/source/período contraditório rejeitado. Interrupção controlada só no clone, preservar bruto e checkpoints |
| Reinício | Encerrar somente processo LAB atestado; capturar estado; reabrir via entrada offline aprovada. Jobs interrompidos não perdem bruto, leituras permanecem; nenhum auto-repair/novo coletor/rota |
| Responsividade | Medir 100/200/400/800/1600, múltiplas PCBAs/componentes, CPU/heap/RSS/pausas/SQLite wait, cinco repetições por volume; contagens/digests completos, mediana/p95 e máximo, sem descartar falhas |
| SW frio/quente | Separar perfis LAB limpos e provisionados; shell frio sem SDK é falha de gate, não aquecer pela produção. Testar instalação incompleta conserva worker anterior, ativação explícita, duas abas, worker restart/offline/reload, cache indisponível e erro 409 de cliente antigo |
| Dados do navegador | IndexedDB/drafts/outbox SINTÉTICOS permanecem após reload/troca de worker; não clear-site-data, não unregister/limpar cache como reparo. API POST não servido do cache; falha não consome outbox |
| Identidade de versão | Conferir SHA/hashes por leitura local fora do SW e também dentro de cada documento ativo. Query v, release-build e versão do agente são dimensões diferentes; cliente antigo não carrega módulos novos |

Proposta de orçamento LAB a aceitar ANTES do ensaio: zero crashes/timeouts/consulta
externa/perda; nenhuma ação local de UI >5 s; p95 de resposta visual ≤2 s em 1600;
maior pausa medida do event loop ≤1 s; RSS máximo da candidata ≤60% da RAM
reservada do guest e variação de RSS entre os últimos três de cinco ciclos
estabilizados ≤10%, sem crescimento monotônico não explicado. Esses limiares
são proposta para a candidata; medir a baseline mesmo quando excede o orçamento.
Registrar RAM/disco reservados e margem aprovados pelo responsável da VM. Se orçamento não tiver
sido aceito, resultado é PENDING, não GREEN por ajuste posterior do limite.
Baseline #90 sintética mediu pausa ~801 ms/1600 e não define SLO físico. Se a VM
não cumprir, reprovar a responsividade; nunca truncar históricos para passar.

Harness das nove telas pode provar projeção com transporte sintético. Não
certifica login Firebase, boot frio do shell produtivo ou integração MES real.
Essas provas devem ter gates separados, sem credenciais operacionais. Sem
solução offline validada para shell/autenticação, G5 completo permanece PENDING.

### G6 — Rollback sem sobrescrever dados novos

- [ ] Registrar geração A/C0/B, hashes/watermarks e diário privado antes de cada
  transição. Startup já pode gerar audit/schema/jobs; não chamar isso de zero writes.
- [ ] **R0: nenhum código candidato executado:** cancelar ensaio, preservar
  original/mestres e derivados; não há atualização para desfazer.
- [ ] **R1: candidata executou e há apenas deltas técnicos conhecidos:** preservar
  B integral primeiro. Retorno de código antigo só em NOVO diretório/VM vazio,
  com cópia dos dados ATUAIS de B e compatibilidade demonstrada em ensaio separado.
  Não restaurar C0 sobre B nem usar rollback legado com D01 aberto.
- [ ] **R2: nova evidência, job, checkpoint, outbox ou delta desconhecido:** STOP;
  congelar B e seus WAL/arquivos/browser LAB de forma consistente. Conservar A/C0
  e B separadamente. Não iniciar A com estado antigo como se incluísse evidência
  nova, não mesclar por SQL improvisado, não retomar sync e não restaurar backup
  antigo sobre dados correntes. Recuperação manual exige nova autorização/plano.
- [ ] No futuro teste negativo, gerar evidência sintética NOVA após boot (revisão,
  comentário/checkpoint/outbox LAB). Falhar boot/validação controladamente; provar
  que rollback/abort preserva o conteúdo novo e a geração antiga. Testar backup
  incompleto/hash errado/interrupção e proprietário desconhecido de 8765. Nenhum
  teste executado aqui; somente proposta.
- [ ] Registry/rota/guardian original nunca alterados neste ensaio offline. No
  guest, qualquer mudança imprevista bloqueia reinício; não resetar Windows para
  ocultar evidência. Reverter snapshot LAB só depois de preservar a geração nova
  e comprovar ausência de dado necessário; nunca tratar isso como restore fabril.

**PASS:** retorno ensaiado e verificado em destino vazio com dados correntes,
ou aborto seguro conserva tudo sem retomada incorreta. **NO-GO:** cópia sobre
destino existente, restore de snapshot antigo sobre novo, compatibilidade não
comprovada, PID/claim desconhecido ou falta do backup pós-falha.

### G7 — Decisão, interrupção e registro final

| Resultado | Regra objetiva |
|---|---|
| PREPARAÇÃO ESTÁTICA CONCLUÍDA | Documento, fontes, contraprovas AST e pendências revisados; sem executar qualquer gate físico. É o único resultado desta missão |
| APROVADO NO LABORATÓRIO | Todos G0–G6 PASS com evidência privada e orçamento previamente aceito; D01/D02 e P01–P08 tratados; revisores assinam G7. Autoriza apenas encerrar ensaio, não fábrica/distribuição |
| REPROVADO / NO-GO | Integridade/dados/identidade/versionamento/isolamento/rollback ou orçamento falham. Preservar evidência e classificar causa; não reduzir escopo depois para transformar falha em PASS |
| INTERROMPER / STOP imediato | Tráfego MES/Firebase/Internet, credencial/identidade operacional no guest/log público, rota/registro/guardian alterado, PID desconhecido, escrita na origem/mestre, corrupção, backup incompleto ou nova evidência em risco. Conter guest pelo controle externo, não matar processo do host/fábrica; preservar gerações e acionar responsáveis |
| PENDENTE | Autorizações, dependências, versão, shell frio, escrita/lease ou evidência não comprovadas. Não converter UNKNOWN em zero/ausência ou aprovação |

No encerramento FUTURO, registrar SHA real de cada artefato, runtime Windows,
resultado por gate, desvios e evidência privada. Publicar só recibo redigido sem
dados reais. Mesmo APROVADO offline: **homologação física PENDENTE** até missão
específica com evidência fabril. Sem merge, instalação fabril ou distribuição.

## Continuidade proposta por módulos — sem implementação

1. **Updater/rollback (D01):** RED sobre cópias sintéticas, validação integral
   antes de qualquer cópia, staging/journal e recuperação após interrupção;
   guard de distribuição preservado, nenhuma execução real nesta preparação.
2. **Dependências Windows (D02):** fechamento transitivo PowerShell + Python no
   inventário de entrega, cópia, backup e rollback; destino sem helper e helper
   antigo. Não repetir correção Python já feita na #89.
3. **Laboratório (P01/P03/P06):** entrada offline explícita e testável que não
   reinstale/repare/conecte MES nem referencie engine/perfil externos; isolamento
   externo continua obrigatório. Não implementar flag fictícia no checklist.
4. **Estado/backup (P02/P07/P08):** workflow privado de imagem coerente, inventário
   externo, derivação sanitizada, recibos de lease e rollback com dados novos.
5. **Shell/dependências (P04/P05):** inventário Windows travado, provas JSON1/
   tzdata e provisionamento offline exato dos SDKs públicos; distinguir shell
   completo de harness sintético e não introduzir login operacional no laboratório.

Cada implementação futura precisa autorização/branch isolada, contraprova antes
do runtime e revisão própria. Esta branch entrega somente plano/evidência/testes
estáticos/CI sem instalação. Vercel/Netlify suprimem auto-preview SOMENTE nesta
branch documental antes de publicá-la. Main e PRs anteriores preservadas.
