# HANDOFF MESTRE — Central de Trabalho + A-MES / Issue #57 / PR #64

**Data de corte:** 23/10/2026 (America/Sao_Paulo).  
**Finalidade:** permitir que outra conversa continue **exatamente** o desenvolvimento do atualizador Windows seguro, sem repetir testes físicos, perder alterações da PR #65 ou confundir o GitHub com a máquina da fábrica.  
**Regra de precedência:** o GitHub remoto (`main`, Release, PR e CI do SHA exato) é a fonte de verdade para código publicado; o último **teste físico comprovado** está no §14 do documento histórico. Revalidar o remoto antes de trabalhar. Este documento descreve o checkpoint B2m anterior ao commit documental; o próximo SHA de handoff deve ser confirmado via GitHub e seus próprios checks.

## 1. Por que o ajuste cresceu tanto — explicação e correção de rumo

O pedido inicial era corrigir o POST de pareamento no Edge (`/workstation/parear`, HTTP 403 em navegação real `Origin: null`). Isso **foi corrigido** na PR #65 e publicado na **0.5.39** com preservação de nonce de uso único, host loopback, navegação iniciada pelo usuário e anti-CSRF. Mas publicar a **página** não troca o **Python local**: o computador da fábrica continua usando agente anterior. O ZIP oficial 0.5.39 instala uma pasta CLEAN completa, **não** aplica uma migração transacional da instalação em uso.

Uma troca ingênua pode causar perda/fragmentação de SQLite+WAL, token, `config.json`, `source_id`, filas/exports e histórico; um guardian legado pode religar o Python durante o update e disputar a porta 8765; jobs MES e publicação Firestore/IndexedDB podem estar ativos. Por isso o trabalho passou do ajuste de pareamento para a Issue #57 de atualização Windows confiável.

**Correção de prioridade aceita para a continuidade:** não adicionar indefinidamente novos diagnósticos B2 sem ligá-los à entrega. Consolidar tudo em **um único caminho canônico**:

1. **Migração inicial supervisionada de um posto existente**, com guardian realmente identificado, downtime aprovado, exclusão, backup/restore e rollback verificados. Manter a operação atual até o gate permitir. Não criar um CLEAN de demonstração paralelo.
2. **Atualizador reutilizável instalado fora da pasta versionada**, no mesmo projeto, para futuras versões sem reinstalação do CLEAN. UI expõe a ação somente após contrato de capabilities e pré-condições comprovadas.
3. **Piloto multi-PC** (primeiro coletor, segundo coletor, viewer) e gates G1–G6 antes de distribuição ampla; operação offline continua, GitHub fornece somente distribuição/release, nunca depende de Netlify.

Atalhos temporários de pareamento conectaram uma aba do Edge, mas não são atualização do Python nem homologação do botão normal na 0.5.39 física.

## 2. Estado remoto oficial confirmado antes deste handoff

| Elemento | Estado |
|---|---|
| Repositório | `pedrokam700/Central-de-Controle-` |
| `main` | `b283b1764432f5d90486d38a7553b30542a5c118` |
| Release GitHub | `ames-v0.5.39-multipc-20261022`, commit acima, publicada |
| Asset oficial | `AMES_Central_CLEAN_b283b176.zip` |
| SHA-256 do ZIP | `4407332be1d7e6ed78ee11ad2cf7dca893d2ba9c72e55bf4b93d453892cc482a` |
| Página oficial | `https://pedrokam700.github.io/Central-de-Controle-/` (GitHub Pages) |
| PR #65 | merged; corrigiu pareamento Edge. **Não reabrir nem desfazer** |
| Issue #57 | OPEN — atualização Windows segura |
| PR #64 | OPEN/DRAFT, mergeable=true, **NÃO merged** |
| Branch PR #64 | `work/ames-update-readonly-inventory-issue57-20261022` |
| HEAD B2m já aprovado | `07c6447b0a99ac3656b8f6e4cfa4036e0f0fff3f` |

Links: [PR #64](https://github.com/pedrokam700/Central-de-Controle-/pull/64), [Issue #57](https://github.com/pedrokam700/Central-de-Controle-/issues/57), [Release 0.5.39](https://github.com/pedrokam700/Central-de-Controle-/releases/tag/ames-v0.5.39-multipc-20261022).

**CI do B2m no SHA `07c6447b`:** [A-MES Operational History #39937249020](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39937249020) **4/4 SUCCESS**, incluindo Windows e marcador final `Issue57 Windows fixtures: guardian + mutex + dual-lock ledger + coordinator crash + direct launcher + backup ACL end-to-end GREEN`; [Central Quality Gate #39937257941](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39937257941) **3/3 SUCCESS** (estático, browser, Firestore). A CI avalia fixtures descartáveis, **não** prova o computador da fábrica.

**CI anterior B2l:** SHA `f270d97c8380d940050ff6c50021e7d2f0e6cb77`, [A-MES #39931116973](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39931116973) **4/4 SUCCESS**, [Quality Gate #39931122393](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39931122393) **3/3 SUCCESS**. O primeiro SHA B2l `b0ea7785` teve Quality Gate RED por erro **de fixture** (literal `${fixtureDay}` não interpolado); erro corrigido no SHA `f270d97c`, sem esconder a regressão.

**Nota de CI:** `package-pr42` SKIPPED em PR não é falha; workflow de release/Pages pertence à `main` publicada. Não tratar um SHA anterior GREEN como aprovação automática de commit novo. O histórico registra inclusive falsos GREEN antigos por `exit $null` em PowerShell, depois corrigidos com marcas terminais obrigatórias.

## 3. Último estado **físico** da fábrica: evidência de 22/10, não repetir inventário

- PC MES: agente **antigo** respondia em `127.0.0.1:8765`, `/api/v1/ready` retornava `Build=CANONICAL-R11-BATCH`, `Versao=0.5.23`, PID **15212 naquela medição** (PID não é estável). O pacote instalado era `AMES_Central_CLEAN_dbe424da` (identificador de pacote 0.5.36), associado ao Python `ames-agent/agent_hardened_entry.py`.
- Test-Path confirmou SQLite `ames-agent/data/ames_local.sqlite3`, `ames-agent/config.json`, token local, agente antigo e pasta nova separada. **Existência não significa backup/integridade.** Nenhum conteúdo secreto foi publicado.
- ZIP oficial 0.5.39 foi **baixado e conferido com SHA-256 correto**, e extraído separadamente como `AMES_Central_CLEAN_b283b176`. **NÃO INSTALADO.** O agente antigo não foi encerrado e nenhuma raiz foi sobrescrita.
- O botão normal no Python antigo ainda apresentava HTTP 403 para a navegação Edge `Origin:null`; a PR #65 resolveu **no código oficial**, não no processo físico. O pacote temporário de conexão permaneceu como alternativa operacional testada.
- Não existem evidências físicas novas de idle, backup restaurável, guardian cooperativo, atualização aplicada, pareamento normal 0.5.39, sincronização multi-PC ou das três linhas. **Não inferir** que o estado ainda é o mesmo agora sem novo teste autorizado quando chegar a etapa física.

**Não solicitar de novo** os comandos PowerShell de hash, `/api/v1/ready`, `Get-CimInstance` ou `Test-Path` executados. Não pedir screenshots de token, SQLite, cookies ou URL contendo token no fragmento. Não iniciar nova CLEAN, não matar agentes antigos, não tocar em `source_id`, dados/SQLite/token/config do posto e não começar coleta para testar atualizador.

## 4. Código entregue na PR draft até B2m — função e limites

| Área | Arquivos canônicos | Entregue apenas na PR #64 |
|---|---|---|
| B1 inventário Windows | `tools/ames-workstation/INVENTARIAR_INSTALACOES_READONLY.ps1`, `INVENTARIAR_GUARDIANS_READONLY.ps1`, `ISSUE57_GUARDIAN_SIGNALS.ps1` | Raízes/PID/porta, guardian/processos/tarefas/serviços/registro/Startup, atalhos `.lnk` inspecionados sem executar; categorias sanitizadas, nenhuma autorização |
| B2 inatividade/agente | `ames/agent/update_readiness.py`, `maintenance_admission.py`, `agent_hardened_entry.py`, `agent.py` | Readiness autenticado, barreira de admissão e contagem até o fim de jobs/thread; drain somente interno, sem endpoint público para armá-lo |
| B2 navegador/sync | `ames/sync.mjs` | Web Locks cooperativos `shared` para gravação IndexedDB e publicação Firestore, `exclusive` de diagnóstico na ordem upload→outbox; somente mesma origem/perfil e abas com código novo |
| C1 staging/release | `tools/ames-workstation/issue57_update_preflight.py` | Versão 0.5.39 pinada, SHA do ZIP+manifesto allowlisted, staging **isolado**, nunca promoção de binários |
| C2 backup | Mesmo `issue57_update_preflight.py`, `VERIFY_PRIVATE_BACKUP_ACL.ps1` | SQLite online consistente incluindo WAL, arquivos em `ames-agent/data`, token/config, ACL privada verificada, restauração ensaiada apenas em diretório temporário |
| C3 journal/rollback | `issue57_maintenance_ledger.py`, `scripts/issue57_transaction_simulation.py` | Claim/journal persistentes e rollback com slots/digests, **somente fixtures**; recuperação power-loss real ainda não comprovada |
| Guardian/launcher novos | `KEEP_AGENT_RUNNING.ps1`, `START_AGENT_CANONICAL.ps1` | Mutexes Global, guarda de claim/journal, prevenção de bootstrap cooperativo durante recuperação, mas **guardian físico antigo não participa** |
| Testes | `scripts/issue57-*.test.ps1`, `scripts/agent-issue57-*.test.py`, `scripts/ames-issue57-browser-outbox.test.mjs`, `scripts/ames-sync-reload.browser.mjs` | Windows CI, Node, Python, Chromium, em fixtures descartáveis; resultados específicos nos links acima |

O B2m especificamente corrigiu o *falso negativo* de um `.lnk` com nome genérico apontando a `KEEP_AGENT_RUNNING.ps1`, e passou a marcar `-EncodedCommand`/`python -c`, atalhos quebrados e scripts desconhecidos como bloqueadores. Checkpoint remoto + evidências: [comentário PR #64](https://github.com/pedrokam700/Central-de-Controle-/pull/64#issuecomment-6362571607).

**Invariantes:** `update_authorized=false`, `updater_eligible=false`, `installed_guardian_cooperation_attested=false`, `exclusive_maintenance_lease_held=false` em todos os diagnósticos de preparação. O legado `ames/agent/update_candidate.py` **NÃO** atende o contrato, não é atalho para atualização. Não alterar bootstrap consolidado fora da proteção pontual documentada, não retomar PR #23 e não refazer os blocos validados.

## 5. O que falta para um atualizador **real**, agrupado em caminho crítico

1. **T1 — Autoridade sobre processos reais (principal bloqueio):** escolher instalação canônica por PID/raiz/porta/assinatura; identificar positivamente **o guardian já instalado**, seus relançadores e sessão/conta, incluindo caminhos de bootstrap direto. Garantir que a exclusão Windows/claim que o coordenador detém é obedecida pelo guardian efetivo ou recusar. O scanner por si só não prova cooperação.
2. **T2 — Drenagem autenticada:** coordenador externo fora da árvore motor, autenticado, pede drain ao agente que realmente atende a porta, mantém a admissão fechada, espera jobs MES/monitor/HTTP e gravações, verifica novamente PID/raiz. Abranger upload Firestore e IndexedDB em **todos os perfis/abas realmente envolvidos**; Web Locks da versão candidata não abrangem aba antiga/outra origem/perfil nem outro PC. Ausência de confirmação = veto, não timeout permissivo.
3. **T3 — Inventário/backup completo e consentimento:** relacionar arquivos mutáveis **fora** de `ames-agent/data` (logs úteis, exports/checkpoints externos, configuração de guardian, browser/outbox) com política de backup/proteção/ACL. Backup SQLite consistente com `quick_check`, restauração em ensaio, capacidade livre e comprovante; identidade `source_id` e filas imutáveis. Operador aprova manutenção quando o posto estiver ocioso.
4. **T4 — Aplicação recuperável Windows:** atualizador separado em local fixo, release GitHub final com SHA pinado, staging isolado, journal durável e swap **allowlisted**, mantendo dados fora da troca. Parar **somente** o processo identificado, impedir relançamento concorrente, testar crash/energia no Windows/NTFS, reiniciar e confirmar `/ready`, capabilities, versão/pareamento, SQLite/identidade e rollback/recuperação se algo falhar. Não oferecer mecanismo incompleto na UI.
5. **T5 — Piloto físico G1–G6:** primeiro posto atual com operador presente, depois segundo coletor e viewer, validação de três linhas, histórico/sync e offline. Monitorar recuperação antes de liberar `Atualizar quando ocioso` para todos.

**Próxima ação recomendada (não ampliar lateralmente o escopo):** desenhar e implementar **T1/T2 como uma única interface mínima de coordenação local**, reutilizando `maintenance_admission.py`, `issue57_maintenance_ledger.py` e mutexes existentes; iniciar por ensaio isolado Windows com guardian/launcher realmente participantes, e **recusa por padrão** se o guardian físico for desconhecido. Não habilitar stop/start na instalação real antes da prova de guardian antigo e do fluxo de consentimento. Só após T1/T2 se avança para instalação efetiva; manter PR draft, sem merge.

## 6. Método de trabalho e checkpoints — sem perder contexto

1. Consultar GitHub remoto antes de editar: `main`, Release, Issue #57, PR #64, branch HEAD, checks do HEAD e mergeability. Ler **este handoff integralmente**, o documento histórico `docs/ames/handoffs/ISSUE57_PR64_MIGRACAO_20261022.md` (em especial **§14, §37 e §38**) e arquitetura `docs/ames/architecture/UPDATE_DISTRIBUTION_MULTI_PC.md`.
2. Reaproveitar módulos e testes existentes. Fazer alteração coesa na **branch PR #64**, sem force push, sem atualizar a `main`, sem criar versão oficial a cada ensaio. Checkpoint com mensagem, SHA, diff verificado e link CI. Guardar evidência de RED e correção; não declarar GREEN antes de ver o SHA exato e log de Windows.
3. `main`+Release+GitHub Pages são os **únicos** canais oficiais; **Netlify não é parte** deste produto/validação. A CI interna de PR pode executar jobs de prévia irrelevantes; não confundir um HTTP401 de preview privado com falha do pareamento.
4. Distinguir **implementação**, **CI**, **release**, **publicação Pages** e **homologação física**. No corte atual só B2m está implementado+CI GREEN **na branch draft**; a web 0.5.39 foi released/publicada; o update físico não ocorreu.
5. Não fazer ou pedir PowerShell repetitivo de produção. Sem acesso ao Windows real, qualquer teste aqui é simulação. Só solicitar novo dado físico mínimo (sanitizado) quando um gate o tornar necessário e quando o operador estiver presente.
6. GitHub está configurado pelo usuário como **Permitir todas as ações**, mas a interface da sessão tem exibido confirmações recorrentes; não alegar que se corrigiu a origem dessas permissões nem contornar proteção. Reduzir chamadas de escrita, agrupar commits e usar permissões existentes; se bloquear, explicar qual controle pediu autorização. Não mexer em privilégios de administrador/UAC sem necessidade concreta.
7. Há uma cópia local de trabalho em `central-repo` com **muitas mudanças e arquivos não rastreados de checkpoints já enviados por integração** e `.git` possivelmente atrasado. Preservar a árvore, não usar `git reset --hard`/`git checkout --` nem um push local cego. Comparar o GitHub remoto, enviar somente os arquivos do incremento pretendido e usar atualização de ref com SHA esperado.
8. Manter as nove views e o comportamento A-MES existente (3028, 3074, 2114, 3012, 3022, alertas e histórico, FPY/Top 3, separação de source_id/origens, reuso de PCBA e componentes). Não mudar sem escopo/teste. Dados MES são locais; publicação remota deve continuar sanitizada.

## 7. Mensagem pronta de retomada para outro chat

> Continue integralmente o projeto Central de Trabalho + A-MES no GitHub `pedrokam700/Central-de-Controle-`. Leia INTEGRALMENTE `docs/ames/handoffs/ISSUE57_PR64_HANDOFF_MESTRE_20261023.md` e `docs/ames/handoffs/ISSUE57_PR64_MIGRACAO_20261022.md`, priorizando §14, §37 e §38; confira `docs/ames/architecture/UPDATE_DISTRIBUTION_MULTI_PC.md`. Revalide GitHub antes de editar. Fonte oficial `main`/release 0.5.39 no SHA `b283b1764432f5d90486d38a7553b30542a5c118`; PR #65 merged e não pode ser perdida; Issue #57 OPEN; PR #64 OPEN/DRAFT em `work/ames-update-readonly-inventory-issue57-20261022`, B2m GREEN no SHA `07c6447b0a99ac3656b8f6e4cfa4036e0f0fff3f` (verifique HEAD novo se o handoff gerou commit posterior). A versão 0.5.39 está baixada, hash comprovado e extraída separadamente no computador da fábrica, NÃO instalada. Agente antigo estava ativo na porta 8765 no último teste físico, com SQLite/token/config/source_id preservados. Não repetir PowerShell nem iniciar novo CLEAN; não parar guardian/agente, não alterar dados reais. Prossiga pelo caminho crítico T1/T2 de coordenação positiva guardian/launcher/agente/browser com teste isolado e recusa conservadora; depois backup completo, swap/rollback Windows e piloto G1–G6. GitHub Pages e Releases são os únicos oficiais, sem Netlify. Implementar diretamente quando seguro, registrar SHAs/CI, não dar merge/release/homologação física sem provas. Responder em português técnico e objetivo, evitando passos repetidos e aprovações desnecessárias.

## 8. Atualização deste arquivo

Após cada novo checkpoint relevante, anexar adendo com **SHA real**, CI do mesmo SHA, resultados físicos separados e bloco seguinte. Não apagar histórico nem reescrever retrospectivamente estados RED. Quando a conversa atual ultrapassar o limite, entregar este link e a mensagem de retomada; não depender da memória do chat para reconstruir o estado.

## 9. Retomada T2 — protocolo de drenagem autenticada entre processos (23/10/2026)

**Base recuperada e verificada:** PR #64 OPEN/DRAFT, `fb5d1bc5eff64e3baf6b2321e9757039b6e48c41`; main/release oficial 0.5.39 em `b283b1764432f5d90486d38a7553b30542a5c118`. A-MES #39940727855 SUCCESS; Quality #39940735202 CANCELLED, não GREEN. O checkout antigo `central-repo` não estava disponível nesta execução; branch recuperada do remoto em checkout próprio, preservando o diretório da Issue #52. Nenhum reset/clean/force-push.

**Governança obrigatória do operador:** manter PR #64 em **DRAFT inclusive depois de T1–T5 e CI GREEN**. Merge, nova release oficial e publicação dependem de homologação física e aprovação explícita posterior. Nenhum arquivo do computador da fábrica pode ser instalado/substituído sem homologação supervisionada. Implementação, CI, release, Pages e homologação são estados separados.

**Implementação coesa deste checkpoint (T2 parcial, não T1/T2 concluídos):**
- `ames/agent/maintenance_protocol.py`: sessão de manutenção autenticada com chave independente aleatória de 256 bits; HMAC SHA-256 com domínios separados request/response, binding de transação, identidade da instalação, PID + nonce da encarnação do processo e sequência monotônica. Usa a barreira existente `MaintenanceAdmission` e diagnóstico fornecido por `update_readiness.observe`. Só suporta begin/poll/cancel-before-update. Payload limitado a 4096 bytes, JSON/bytes, sem pickle, token de browser/MES ou porta TCP nova.
- `tools/ames-workstation/issue57_drain_coordinator.py`: caminho externo reutiliza **o ledger existente**, cria claim antes de solicitar drain e mantém journal até recuperação explícita. O ledger continua restrito a fixtures; não aceita CLEAN real. Após quiescência do agente, aguarda atestação externa e retorna guardian/browser não comprovados. Não substitui o guardian/launcher, não executa stop/start ou swap.
- Falha de conexão, ACK perdido, replay, identidade/seq divergentes e timeout não liberam o drain nem apagam claim. Cliente com resposta ambígua exige recuperação, sem retry/cancel automático. Cancelamento autenticado antes de qualquer update libera apenas a barreira em memória; claim persistente continua bloqueando o bootstrap cooperativo até recovery futura.
- `scripts/agent-issue57-drain-protocol.test.py`: 13 testes, incluindo dois processos via IPC real, SQLite sintético/readiness real, job ainda queued, trabalho em background, chave errada, PID reutilizado/nonce distinto, outro root/transaction, replay/reflection, resposta adulterada e perda do coordenador. Integrado aos dois workflows; Ubuntu + Windows no A-MES.

**Evidência local:** 13/13 protocolo; 11/11 admission; readiness e ledger PASS. CI do commit que introduz esta seção deve ser consultado no SHA exato; o comentário de checkpoint da PR registra esse SHA e os runs. Não herdar GREEN da base. Arquivos alterados: os três acima, `.github/workflows/ames-operational-history.yml`, `.github/workflows/quality-gate.yml` e este handoff.

**Limites e estado real:** T1 segue parcial (autoridade sobre guardian instalado não atestada); T2 agora possui protocolo entre processos exercitado, mas **sem registro em HTTP/startup do agente**, sem enrollment/ACL operacional e sem fence global de todos os perfis. T3/T4 mantêm somente os ensaios anteriores de backup/staging/rollback, sem atualização executável. T5/homologação física PENDING. `update_authorized=false` em todas as respostas. main, release 0.5.39, Pages, coletores, bootstrap, SQLite/token/source_id da fábrica e PR #65 intocados.

**Próximo passo executável:** validar o Windows CI deste checkpoint e integrar o transporte ao ensaio de dupla exclusão existente, comprovando journal + drain no mesmo intervalo de posse de UpdateTransaction→CanonicalBootstrap. Depois, implementar enrollment local seguro com identificação positiva do guardian/launcher efetivos e seu processo/conta; recusar legado desconhecido. Não ativar o protocolo na porta 8765 ou na UI nem promover arquivos enquanto guardian/browser/consentimento e recuperação não estiverem completos. Não repetir o inventário físico §14. T3/T4 só podem aplicar mudanças reais após esses gates, e T5 exige operador presente.

## 10. T2 — journal e IPC dentro da dupla exclusão Windows (23/10/2026)

**Checkpoint anterior recuperável:** `d881256ce05c639cdf983919f54ccf84fe882736`, árvore `2f17356fb8e7735de646453a27e069c604bfb693`. [A-MES #39943486985](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39943486985) **4/4 SUCCESS** (package SKIPPED), [Quality #39943494975](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39943494975) **3/3 SUCCESS**. Log Windows do job 120380358224 confirma 13 testes de IPC e conclusão das fixtures Windows. Prova sintética apenas.

**Incremento:** o ensaio Windows existente `issue57-dual-lock-ledger.windows.test.ps1` passa a invocar o coordenador/ledger/protocolo do §9 enquanto o processo PowerShell mantém simultaneamente os dois mutexes Global aleatórios, na ordem UpdateTransaction→CanonicalBootstrap. Foi removido o claim JSON fictício daquele teste: agora o claim/journal são produzidos pelo ledger canônico e a drenagem ocorre em processo Python independente via IPC. Esse processo abre os mutexes já existentes com OpenMutexW e exige WAIT_TIMEOUT (ocupados pelo titular) no startup e durante as leituras de readiness; não cria mutex de produção nem confunde nome com prova de posse. Após desconexão, o agente sintético permanece cercado e o journal em recovery_required. Só então PowerShell libera os mutexes e comprova que ambos os relançadores sintéticos ainda recusam entrada pelo claim persistente.

**Arquivos:** fixture PowerShell acima, `scripts/agent-issue57-drain-protocol.test.py`, contrato Node `ames-windows-readonly-inventory.test.mjs`, workflow A-MES e este handoff. TEMP/TMP são ajustados somente durante o subprocesso de CI para a raiz descartável RUNNER_TEMP e restaurados no finally. O teste exige GitHub Actions/Windows, magic marker, raiz GUID e mutexes GUID de fixture; nenhum nome 8765 é aceito. Workflow exige marcador terminal próprio, evitando falso GREEN por script que não terminou.

**Validação local:** 13/13 protocolo/IPC, 6/6 contrato Node; diff sem erros. Prova integrada Windows **PENDING no novo SHA** até consulta do workflow. Este incremento não ativa HTTP/IPC no agente operacional, não atesta contas/sessões/guardian físicos ou browsers, nem concede update. PR segue DRAFT, main/release/Pages e fábrica intocadas.

**Próxima ação:** conferir marcador Windows `Issue57 authenticated drain: dual mutex + IPC + journal + disconnect fenced; production forbidden` no log do SHA exato e registrar resultado na PR. Depois ligar enrollment/identidade do guardian realmente instalado e escopos browser ao mesmo coordenador, antes de habilitar transporte no agente. T3 precisa inventário externo/backup completo; T4 permanece sem swap operacional; T5 físico PENDING. Não declarar T1–T5 concluídos com esta simulação. Governança §9 continua obrigatória mesmo após CI GREEN.

## 11. Retomada após limite do Work — T3, integridade do backup sintético (23/10/2026)

**Última evidência externa confirmada ao retomar:** PR #64 `OPEN/DRAFT`, branch HEAD `a4019ca1d96b8ce3cb3cace85d895e885924b1fc` (ensaio de drain autenticado sob dois mutexes), `main`/Release 0.5.39 em `b283b1764432f5d90486d38a7553b30542a5c118`. Quality Gate #39944131874 `SUCCESS` no SHA `a4019ca`; o resultado final do A-MES desse mesmo SHA precisa ser consultado separadamente, sem inferir GREEN. A cópia local anterior `central-repo` estava suja e foi **preservada**; este incremento foi preparado em checkout novo da branch remota. Não houve acesso à fábrica.

**Defeito real identificado pelo Work antes do limite:** a verificação do backup operacional checava digests de `ames-agent/data` e `quick_check` SQLite, porém não conferia o conteúdo de `config.json`, token ou snapshot SQLite contra evidência estável. Uma mutação de conteúdo estruturalmente válido podia passar.

**Correção candidata neste incremento:** `issue57_update_preflight.py` grava um `runtime-backup-manifest.json` **v2** no diretório privado, com SHA-256 dos três arquivos críticos; a verificação independente recusa campos ausentes, esquema antigo, hashes inválidos, divergência de conteúdo e links/reparse do manifesto. Não expõe conteúdo de credencial ou hash em resposta/log; fingerprints permanecem na raiz protegida pela ACL. A restauração sintética sempre começa pela verificação do backup. O fingerprint detecta corrupção sem constituir autenticação contra um invasor com escrita no próprio backup. Sem atestação de inatividade, cobertura de browser/externos e guardian real, `update_authorized=false`.

**Testes candidatos:** `scripts/agent-issue57-update-preflight.test.py` agora prova rejeição de adulteração de `config.json`, token e **SQLite ainda válido para `PRAGMA quick_check`**, e de manifesto incompleto, legado ou divergente. O ensaio integrado de restore e protocolo T2 permanecem separados. **O SHA de commit e a CI deste incremento devem ser preenchidos por comentário no PR após a publicação real**; não confundir passagem local com Windows CI.

**Próxima ação segura após CI:** continuar T3 com inventário dos arquivos mutáveis externos e comprovação de estabilidade sob lease; em paralelo conectar T1/T2 à identidade positiva do guardian legado e ao enrollment autenticado. T4/T5 continuam bloqueados para fábrica. PR **DRAFT até homologação física e aprovação explícita do operador**, sem merge, release ou GitHub Pages.

## 12. T3 — estabilidade observável da identidade durante a cópia (23/10/2026)

**Base remota:** checkpoint T3 de manifesto privado v2 no SHA `ceb90d9a5e5ee15f23fbf2460a7c96cf8dd35b29`, [Central Quality Gate #39946041494](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39946041494) 3/3 SUCCESS. O workflow A-MES/Windows específico desse SHA deve ser comprovado separadamente. PR #64 segue aberta/draft; `main`/Release 0.5.39 continuam intactos.

**Risco remanescente no mesmo fluxo:** cópia fiel de um `config.json` ou token **já alterado durante o próprio processo de backup** poderia produzir um manifesto consistente dos bytes errados. `backup_core_identity()` agora captura hashes dos dois arquivos de origem antes do backup SQLite, rejeita arquivos de origem irregulares/reparse e confirma novamente o hash de origem e de cada cópia depois da leitura. Diferença => `private_identity_changed_during_backup`, sem emitir valores/hashes em erro ou devolver `update_authorized=true`.

**Teste determinístico e isolado:** `agent-issue57-update-preflight.test.py` altera deliberadamente o `config.json` e o token **sintéticos** entre a cópia e a verificação; as duas situações devem ser recusadas, sem tocar a instalação real. Também exercitar restauração integrada e drenagem autenticada para regressões.

**Limite:** dupla comparação não substitui guarda transacional. Uma alteração entre verificações ou em outros arquivos externos ainda exige lease exclusivo, guardian real e atestação do navegador. O backup aqui continua preparatório; T1/T2/T3 externo, T4 e T5 permanecem abertos. A CI do novo commit deve ser validada e comentada pelo SHA exato antes de declarar GREEN remoto.

## 13. T1/T2 — testemunho independente da encarnação do processo (23/10/2026)

**Base oficial deste incremento:** PR #64 OPEN/DRAFT no SHA `e30dcad136754caaff9283d6ba660b1f44ae4857`. [Central Quality Gate #39947722792](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39947722792) 3/3 SUCCESS no SHA exato; **A-MES/Windows não comprovado para este SHA** na consulta realizada. Foi publicado o [checkpoint da PR](https://github.com/pedrokam700/Central-de-Controle-/pull/64#issuecomment-6364092928). Main/Release oficial seguem 0.5.39, e a fábrica permanece no último estado do §3.

**Contrato adicional preparatório:** `FixtureDrainCoordinator` agora exige um observador de processo **independente** do agente e da resposta IPC assinada. Antes de armar o drain, imediatamente depois, antes/depois de cada poll e antes de cancelar, o observador deve associar mesmo PID, identidade da instalação, marcador estável de **criação do processo** e propriedade do endpoint à mesma encarnação. Dado ausente/divergente faz o journal persistir em `recovery_required`; nunca infere permissão de atualização. O protocolo HMAC ainda oferece identidade do canal, não atestação de kernel do processo que escuta na porta.

**Prova local descartável:** 15 testes de protocolo, incluindo processo separado com IPC, identidade autodeclarada sem testemunha confiável, listener divergente, marcador de encarnação alterado durante drenagem e recuperação com barreira persistente. Os ensaios de backup/restore/admissão/Node também passaram; **CI Windows deste novo commit ainda precisa ser comprovada**. No fixture, o observador é a testemunha externa do processo criado pelo próprio teste; **não existe ainda implementação operacional** da leitura atômica de PID/creation-time/porta no Windows nem cooperação do guardian antigo ou dos navegadores. Isso **não** conclui T1/T2, não registra comando de instalação e não conecta o protocolo ao agente em produção.

**Próxima ação crítica:** implementar observador read-only Windows independente e autenticação do guardian realmente instalado, sob os dois mutexes e journal; recusar conta/sessão, criação/porta, raiz ou relançadores não comprovados. Exigir ainda drenagem do navegador e consentimento físico antes de qualquer atualização real. PR continua **DRAFT**, sem merge, release, Pages ou alteração do posto.
