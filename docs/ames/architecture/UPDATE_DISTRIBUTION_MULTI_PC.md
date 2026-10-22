# Central / A-MES — distribuição sustentável para vários postos

Data: 2026-10-21. Estado: decisão arquitetural e contrato de implantação. **Não significa que o atual agente já tenha autoatualização segura instalada.**

## Problema físico comprovado
- A interface no GitHub Pages acessa loopback `127.0.0.1:8765` da máquina atual, não o notebook de outro operador.
- A Central local é origem HTTP e a oficial é origem HTTPS; sessionStorage, IndexedDB e permissões do navegador não são compartilhadas automaticamente entre origens.
- O token do agente só acompanha o launcher na aba aberta por ele, ou a confirmação **local** `/workstation/parear` que redireciona ao domínio oficial. Abrir o link manualmente em nova aba exige novo pareamento; isso não indica ausência do SQLite.
- FPY de Hoje, última revisão salva e histórico são escopos distintos. Fonte em conflito não é zero e não se resolve por timestamp mais recente de outra instalação.
- Substituir pastas ZIP de usuários a cada atualização é inseguro para SQLite, automação de fábrica e escala.

## Contrato de produto
1. **Frontend**: única URL pública de operação: `https://pedrokam700.github.io/Central-de-Controle-/`; publicação GitHub Actions baseada na release e SHA comprovado. Atualiza na próxima navegação/recarga (com proteção contra SW cache). Não exigir reinstalação de Windows para CSS, texto, análise e UI que usem APIs já disponíveis.
2. **Agente do posto**: instalação **única** com caminho de dados persistente fora da pasta versionada; inicialização opcional pelo Windows já existente. Toda interação MES/SQLite fica no PC coletor; não publicar material bruto, cookies ou Repair Comments no Firebase.
3. **Pareamento**: usuário abre a página oficial; caso haja agente local detectado e não conectado, exibir ação principal “Conectar agente deste PC”. Abrir o mesmo navegador na tela de confirmação local, validar nonce, voltar via HTTPS para **a mesma aba**, token em fragmento descartado da barra e salvo apenas na sessão local. Nunca enviar token para GitHub/Firebase ou URL de analytics. Parear novamente após troca de navegador/aba quando necessário.
4. **Atualizações de backend**: não comparar apenas `release-build.sha` do frontend com o SHA do agente. Expor contrato de capabilities versionado e versão mínima do backend. Se compatível, continuar usando agente antigo normalmente. Se incompatível, mostrar atualização necessária.
5. **Atualizador Windows futuro**: componente confiável **fora da pasta substituída**, instalado uma vez. Consulta **somente** releases finais GitHub oficiais em HTTPS, valida tag, SHA de commit, digest SHA-256 de asset e formato/allowlist. Faz download para staging temporário, backup verificado de arquivos+SQLite, checa coletor/MES/job sem execução, mutex/porta única, encerra apenas processo canônico próprio, troca binários atomicamente, preserva token/config/dados e reinicia, prova /ready e funcionamento, rollback automático em falha. Sem admin, sem executar código baixado sem digest, sem sobrescrever `.venv` ou SQLite às cegas.
6. **Ciclo**: detectar atualização e **notificar** no posto; disponibilizar “Instalar quando ocioso” com consentimento, prazo/adiamento e rollback. Nunca trocar durante coleta 3028/3074/2114/3022/3012, sessão AT, sincronização pendente ou sem backup comprovado. Em rede MES isolada, baixar quando internet disponível sem bloquear a coleta.
7. **Muitos usuários**: cada coletor possui source_id estável e fila local, viewers leem snapshots sanitizados publicados sob autenticação e regras Firebase. Mesmo dia/linha com múltiplos produtores: o operador escolhe origem de modo explícito, persistindo preferência **local ao navegador**. Uma escolha anterior nunca autoriza sobrescrever outra instalação. Validar paridade A/B por line_id + período + source_id + snapshot_id + snapshot_revision + hash + registro de recebimento.
8. **Histórico**: exibir automaticamente a última revisão verificável na tela se não houver head válido do Hoje. Sempre rotulada “última coleta salva”, com período/origem/revisão; não promover métricas anteriores a Hoje. Conflitos oferecem seletor; zero só com prova de cobertura.

## Gates para habilitar o atualizador Windows
- G1: tests Node/Python + integração Edge HTTPS->loopback + anti-CSRF/PNA, nunca expor token.
- G2: Windows clean install, atualização compatível UI-only **sem ZIP**, backend update mock com verificação SHA e rollback.
- G3: agente ativo com jobs em andamento **recusa** aplicar update; nunca descarta SQLite nem reordena dados.
- G4: interrupção de energia no meio de staging e troca com recuperação; preserva configurações e histórico.
- G5: dois postos coletores + um viewer em computadores diferentes; troca de perfil Edge e reabertura; mesmo dia dois publicadores, histórico distinto.
- G6: 24h/7 dias de observabilidade e recovery no piloto de fábrica, antes de oferecer "atualização em um clique" a todos.

## Escopo desta correção
Pareamento visível no cabeçalho e recuperação do preview de última captura sem remontar o componente a cada refresh; uma revisão de Hoje salva mas sem snapshot atual pode aparecer como **última coleta salva**. Ainda **não existe** autoaplicação Windows; esta exige implementação e validação separadas, rastreada na Issue própria.

## Incremento executado em 22/10 — PR #64 (A), não confundir com updater completo

**Evidência física:** `/api/v1/ready` no PC devolveu CANONICAL-R11-BATCH, fluxo 3, PID 15212; shell local SHA `dbe424da` (0.5.36). Inspeção local **somente leitura** confirmou `PAREAMENTO: VERSAO ANTIGA` e `CORS: VERSAO ANTERIOR`. A 0.5.38 publicada já contém os arquivos corrigidos, mas um link HTTPS não atualiza automaticamente o Python residente no PC.

### Experiência final (decisão aprovada para implementação incremental)
- **Viewer:** abre uma única URL GitHub Pages. Nova versão web é baixada em cache como um conjunto indivisível e recebe uma faixa discreta `Nova versão disponível · Atualizar página / Depois`. Aceitar recarrega; adiar não interrompe relatórios. Não instala CLEAN, SQLite ou motor.
- **Coletor com motor compatível:** mesma experiência da web, sem ZIP novo. Um SHA novo no site **não** significa motor novo.
- **Coletor com motor incompatível comprovado:** a Central avisa `Atualização do agente necessária` e, **apenas quando o atualizador tiver passado os gates**, oferece `Atualizar quando ocioso` e `Depois`. Nunca executa script remoto dentro da aba e nunca reinicia durante coleta.
- **Agente sem versão do contrato comprovável:** não fingir que é antigo ou novo. Estado `Revisão não comprovada`, com diagnóstico permitido; fluxo 3 sozinho existia na 0.5.36 e na 0.5.38.
- **Uma vez por PC coletor:** registrar um atualizador Windows confiável fora da árvore substituída e uma área de dados persistente. O operador não precisará baixar manualmente ZIP em futuras atualizações aprovadas. A primeira recuperação de instalações existentes requer migração/registro explícito e backup.

### Prioridades técnicas antes de habilitar atualização executável
B1. Inventário read-only de **todas** as raízes existentes, sem revelar token/source_id em logs; selecionar o PID/raiz efetivamente em uso. Nunca adotar automaticamente a CLEAN de maior versão ou timestamp.

B2. Contrato versionado de capabilities independentes do build UI, estado de jobs, envio pendente e versão mínima compatível; detector sem alterar MES, SQLite ou Firestore.

C1. Canal de distribuição somente GitHub Releases oficial e imutável, com manifesto de API, digest SHA-256 do ZIP, paths allowlisted e checagem do SHA da release. Proibir preview, branches ou URL arbitrária.

C2. Atualizador fora do processo alvo: baixar para staging isolado, verificar hashes antes de executar; obter exclusividade e **recusar** se qualquer job/sync estiver ativo; fazer backup SQLite consistente (API SQLite), config, token e estado de origem/filas, mantendo-os fora do diretório versionado; verificar backup antes da troca.

C3. Trocar apenas binários compatíveis; gravação com journal de transação para recuperação após queda de energia; reiniciar somente processo canônico de identidade conferida; health e capabilities pós-upgrade + comparação source_id/snapshot/SQLite; rollback automático se o gate falhar. Não alterar SQLite, token ou source_id por default.

D. Piloto primeiro em um coletor, depois segundo coletor e um viewer, com prova de mesmo dia/linha em origens múltiplas, rollback e rede offline; só após gates físicos G1–G6 liberar o botão para todos.

### Estado atual
PR #64 entrega **detecção/aviso read-only** e atualização **web opt-in** protegendo trabalho em andamento. **Não oferece execução do atualizador do motor**. A reparação do agente físico que o operador mostrou ainda precisa passar pelo fluxo B/C e gate piloto; não mandar substituir arquivos da 0.5.36 enquanto PID 15212 estiver ativo.

### Incremento B1/B2/C1/C2 experimental — 22/10/2026 (PR #64, sem habilitar update)

- **B1 parcial**: `tools/ames-workstation/INVENTARIAR_INSTALACOES_READONLY.ps1` faz inventário explícito de múltiplas pastas CLEAN, presença de arquivos essenciais e processos/porta 8765; não lê conteúdo de token, config, SQLite ou argumentos completos. Somente observação; `updater_eligible=false` em todos os resultados. Precisa ser validado em Windows e ampliado para registro confiável de todas as instalações e guardian antes de qualquer troca.
- **B2 parcial**: `ames/agent/update_readiness.py` adiciona diagnóstico autenticado `/api/v1/workstation/update-readiness`; cruza scheduler, jobs em memória e tabela `jobs` persistida. Mesmo `idle_observed=true` **NUNCA** autoriza troca: `update_authorized=false`, porque sincronização do navegador, guardian e novas admissões ainda não possuem lease exclusivo compartilhado. O agente antigo no posto não contém esse endpoint; ausência de contrato equivale a bloqueio.
- **C1/C2 ensaio offline**: `tools/ames-workstation/issue57_update_preflight.py` fixa a release oficial 0.5.39 por tag/SHA/asset/digest, verifica SHA-256, todos os hashes do `CANDIDATE_MANIFEST.json` e caminhos allowlisted. Faz staging somente em pasta nova e isolada. Oferece backup SQLite pela API nativa (`mode=ro`, incluindo WAL), `quick_check` e restauração em memória, além de cópia privada comprovada do token/config. Nenhuma função promove arquivos ou executa novo agente.
- **Limite obrigatório**: backup `backup_core_identity` tem `data_tree_complete=false`; ainda não captura de forma integral checkpoints, exports, fila externa, browser sync e demais arquivos operacionais. O journal durável de troca, interrupção de energia, bloqueio de guardian, stop/start por identidade e rollback de produção **NÃO existem** neste incremento. Não executar essas rotinas no posto de produção nem habilitar `Atualizar quando ocioso`.
- **C3 modelo não implantável**: `scripts/issue57_transaction_simulation.py` simula journal, duas renomeações de slots, interrupção antes/depois de cada uma, falha no health e restauração do slot anterior sem remover a versão nova. Aceita exclusivamente um diretório de teste com marcador descartável; não conhece processos, Windows service, SQLite ou caminhos reais. Não é um updater físico nem prova crash-durability real, apenas contrato de recuperação a adaptar sob lease confiável.
- **Ensaios locais**: suíte sintética verifica recusa de path traversal, token em ZIP, digest falso, overwrite, banco WAL, restauração e preservação de configuração/token. O ZIP **real** 0.5.39 confirmou hash oficial e 288 membros íntegros no ambiente de desenvolvimento; não equivale a homologação Windows/fábrica.

O próximo bloco precisa prover um protocolo de lease de manutenção atômico entre scheduler, servidor HTTP, guardian e sincronização da web, incluindo drenagem de jobs e impossibilidade de nova admissão, backup completo com ACL testada no Windows, journal recuperável e teste de rollback com interrupção simulada. Só então se desenha o fluxo de consentimento do operador.

### Incremento B2/C2 — cerca de admissão e guardian preparatório (PR #64; não implantado)

- `ames/agent/maintenance_admission.py` introduz uma barreira em memória: `mutation()` conta requisições mutantes aceitas; `begin_drain()` recusa novas admissões, não cancela as existentes, e `release_drain()` exige o token interno por identidade. **Não há endpoint HTTP nem execução externa capazes de iniciar esse drain.** O contrato não persiste após reinício.
- `HardenedHandler.do_POST` cruza a barreira, inclusive import, config, uploads, pareamento e rotas delegadas; durante um drain retorna HTTP 503 sem criar novo trabalho. `_launch_new_mes_job` cerca a reserva do monitor e a gravação do job na fila SQLite; o loop de monitor cerca a passagem inteira e não modifica `next_run_at` quando o drain já começou. Requisições aceitas antes do drain podem finalizar e continuam contadas durante a admissão.
- O diagnóstico autenticado de readiness agora registra `new_admissions_fenced` e `inflight_mutations`; mutações em andamento impedem `idle_observed`. **`update_authorized=false` continua obrigatório**, mesmo com admissão cercada e jobs zerados: ainda faltam outbox/sync, processo externo, guardian antigo, dados fora do SQLite, identidade do processo e lease durável.
- O `KEEP_AGENT_RUNNING.ps1` **novo** confere mutex `Local\CentralAMES.UpdateTransaction` a cada rodada, ANTES de chamar o launcher, e recusa reinício se encontrar `.ames-update\transaction.json`. O marcador persiste em queda de energia e sua presença bloqueia relançamento até recuperação validada. Mutex `Local\` cobre somente a mesma sessão Windows. **Um guardian antigo já instalado (como o do posto do §14) não conhece esse contrato; este código não é evidência de proteção do posto.** Um futuro updater deve identificar e coordenar o guardian real e a transação em raiz estável, antes de qualquer parada.
- Testes concorrentes isolados: drain recusa novos escritores, mutação aninhada aceita termina, titular errado não remove bloqueio, job manual/monitor bloqueados sem inserir linha no SQLite; contrato Windows do guardian, parser PowerShell em CI, testes de readiness e packaging. Não instalar nem habilitar o botão por causa desse incremento.

**Faltante no próximo bloco:** protocolo externo autenticado e atestado, pausa/verificação da fila de sincronização web+Firestore, lease durável multi-sessão entre updater e guardian efetivamente instalado, backup integral da árvore e verificação ACL/restore, journal de produção com restart e recuperação testados no Windows. Na ausência de qualquer um, abortar update.

### Incremento C2 — backup de árvore do agente e CI exclusivamente GitHub (PR #64, 22/10)

- `backup_operational_tree()` em `tools/ames-workstation/issue57_update_preflight.py` amplia o ensaio de preservação: faz backup consistente SQLite incluindo WAL; cópias privadas separadas de `config.json` e `local_agent_token`; inventário determinístico e cópia verificada de arquivos regulares em `ames-agent/data`, incluindo `checkpoints`, `imports`, `exports` e backups históricos. Recusa links, reparse points, arquivo não regular, capacidade excedida, destino existente e mutação detectada por hashes durante o processo. Nunca instala, para processo ou toca no diretório de origem.
- `verify_operational_backup()` relê o manifesto de arquivos e realiza `quick_check` em uma cópia SQLite. O token fica fora do manifesto de digests. Resultado deliberadamente retorna `agent_data_tree_verified=true` mas **`browser_sync_attested=false`, `exclusive_lease_held=false`, `update_authorized=false`**. Não prova cobertura de logs externos, perfis Edge/IndexedDB, outras instalações ou guardian; Windows ACL ainda requer teste físico supervisionado.
- O PR workflow `quality-gate.yml` deixou de exigir `deploy-preview-...netlify.app`: uma PR ainda **não** é release oficial, portanto não existe uma publicação Pages dessa revisão para teste HTTP público. Os três jobs de contratos/browser/Firestore seguem obrigatórios; o único teste de publicação definitiva permanece no workflow `publish-github-pages.yml` após release imutável da `main`, com SHA exato, home/index/bootstrap HTTP 200. Nenhuma release ou site foi publicada por esta alteração. O teste `ames-github-only-ci-contract.test.mjs` impede que a dependência externa volte por engano.
- Esta etapa é preparatória e executada em fixtures isoladas; não deve ser interpretada como autorização do atualizador físico nem substitui os gates B/C/G1–G6.

### Incremento B3 — observação de fila IndexedDB da Central (PR #64, 22/10)

- `indexedQueue().countAll()` usa transação **readonly** do object store `pending` na origem da página. Conta entradas de **todos os UIDs daquele perfil**, inclusive após logout e mesmo que a sessão atual não possa publicá-las. Não enumera payloads, remove entradas, força login, sincroniza ou altera a versão do banco IndexedDB.
- `createMesSync().inspectUpdateReadiness()` relata `pending_entries`, uploads Firestore, capturas locais e leituras remotas em voo, com contadores que sobrevivem ao `stop()` da sessão até as promises antigas concluírem. Falhas de acesso ao IndexedDB retornam `pending_entries=null` e bloqueiam inferência de ausência de fila; troca de sessão durante leitura invalida `observation_stable`.
- **Mesmo se `advisory_no_pending=true`**, `multi_tab_attested=false`, `other_browser_profiles_attested=false`, `exclusive_lease_held=false`, `update_authorized=false`. A consulta é observacional; não impede novas publicações, não cobre todas as abas/perfis, não prova confirmação no servidor nem coopera com o guardian Windows antigo. Não expor como botão de instalar.
- Novos contratos Node cobrem usuários diferentes, logout durante upload/captura e falha na inspeção. O teste Chromium existente de recuperação/reload verifica IndexedDB real e confirma que a observação não autoriza atualização. A atualização física continua bloqueada.

### Incremento C3a — diário e trava transacional duráveis em fixture isolada (PR #64, 22/10)

- `tools/ames-workstation/issue57_maintenance_ledger.py` implementa o **contrato de persistência**, sem qualquer entrypoint de atualização. Aceita **somente** raiz com marcador de teste específico sob diretório temporário dedicado; rejeita explicitamente nomes de CLEAN. Não é executado na fábrica e não conhece PID/serviço real.
- A reserva usa criação exclusiva (`O_EXCL`) de `.ames-update/claim.lock` e depois diário `.ames-update/transaction.json`, ambos fsync; se cair entre esses passos, a presença isolada da trava bloqueia novas tentativas. O diário mantém UUID de transação, hash de identidade sintética e revisão/estado. Transições usam trava exclusiva adicional e troca atômica de documento em fixture. Não armazenar source_id, token, configuração ou SQLite nos metadados.
- Recuperação do ensaio é **somente inspeção**: sem apagar trava, resolver automaticamente jornal divergente, desinstalar versão nova ou reiniciar processo. Interrupção antes/depois de gravar um estado, arquivo desconhecido, link, identidade divergente, duas reservas, fase ilegal e arquivo incompleto terminam bloqueados. **Todas** as saídas, inclusive `recovered_fixture_only`, preservam `update_authorized=false`.
- O caminho do marcador é compatível com o check de `.ames-update\transaction.json` do **guardian novo**. Isso **não prova** que o guardian antigo do posto respeita esse marcador, nem que o mutex `Local\...` protege outra sessão Windows. Em particular, existe um intervalo entre criar `claim.lock` e `transaction.json`; um updater real teria de dominar o mutex/guardian instalado ANTES de entrar nessa transação. Este protótipo não resolve essa ordem de produção.
- CI verifica o ensaio em Ubuntu e Windows, incluindo exclusão entre processos, falha de energia simulada e nenhum toque nos sentinelas de dados. Pendentes: lease externo autenticado e cross-session comprovado, sincronização de navegador/Firestore, ACL privada Windows, processo por PID comprovado, backup de todas as origens externas, recuperação de journal de produção e piloto físico G1–G6.
