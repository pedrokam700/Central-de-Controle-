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
