# Issue #57 / PR #64 — transição supervisionada do guardian instalado (T1)

**Estado:** procedimento de aceitação PREPARATÓRIO, **não autorizado a executar no posto** até a presença e confirmação do operador. A PR #64 permanece DRAFT; sem merge, release, troca de arquivos, encerramento de processos ou alteração de dados da fábrica.

## Por que a evidência real é indispensável

- O guardian histórico em `e1edbfb:tools/ames-workstation/KEEP_AGENT_RUNNING.ps1` detinha apenas `Local\CentralAMES.OperatorGuardian`. Seu ciclo reiniciava por `START_AGENT_CANONICAL.ps1` sem consultar o mutex global de atualização nem `.ames-update`.
- O guardian candidato atual consulta `Global\CentralAMES.UpdateTransaction.8765` e `Test-Issue57RelaunchBlocked` sob o mesmo root; o launcher candidato também recusa claim persistente antes das operações de startup/stop.
- **Não é possível inferir qual script está realmente carregado na memória do guardian da fábrica pela versão do arquivo no disco.** Substituir o script no disco não prova que um processo PowerShell antigo adotou a nova lógica. O canal privado de enrollment precisa de confirmação do próprio processo e testemunho independente da identidade; um scanner não substitui isso.
- O `LAST_SAFE_SHA` `71de38c3dbb2eb8f7549e5374fdabf230b5d6213` valida a integração em fixtures Windows/Chromium, **não** atesta a instalação real. `update_authorized=false` permanece obrigatório.

## Fase A — observação física supervisionada, sem mudanças

Coletar somente a informação técnica necessária em um MES-PC conhecido, junto ao operador, **sem iniciar, parar, reiniciar ou modificar** guardian, launcher, agente, browser, Firestore, SQLite, token ou `source_id`:

1. Identificar positivamente a CLEAN efetivamente associada ao único listener `127.0.0.1:8765`, o PID e sua criação, a raiz e o entrypoint observados pelo Windows; detectar qualquer outra CLEAN ou processo concorrente. `INVENTARIAR_INSTALACOES_READONLY.ps1` é **diagnóstico**, e nenhum resultado pode sozinho declarar posse exclusiva.
2. Identificar **todas** as origens que podem relançar o agente: guardian na memória, execução direta do launcher/Python, `Run`/`RunOnce`, Startup, tarefas, serviços, supervisores opacos, contas e sessões Windows. `INVENTARIAR_GUARDIANS_READONLY.ps1` é somente leitura; uma lista vazia ou inacessível não prova cobertura global.
3. Verificar a identidade exata de guardian/launcher em execução e se cada processo efetivamente coopera com o **mesmo** mutex/journal/canal privado. Guardian legado, desconhecido, inacessível ou sem resposta autenticada **bloqueia T1**. Um hash atual do script no disco não prova o comportamento do processo já carregado.
4. Enumerar, com mínima exposição de dados, sessões/perfis Edge, abas legadas, origem da web, sincronização/outbox/Firestore, importadores/exportadores e outros escritores; indicar quais não participam da barreira e permanecem bloqueadores de T2.
5. Identificar os locais efetivos de dados, logs, imports/exports/checkpoints e runtime `.venv`, inclusive FORA da raiz escolhida, sem abrir ou copiar o conteúdo sensível. Local desconhecido, links/junction ou banco externo sem snapshot consistente **bloqueiam T3**.
6. Registrar apenas o resumo sanitizado: número de instalações, correspondência do listener, número/tipo de relançadores, contas/sessões cobertas ou não, perfis e escritores cobertos ou não, locais externos ainda desconhecidos e status `T1/T2/T3 = BLOCKED/PARTIAL`. Não compartilhar comando integral de processo, token, cookie, `source_id`, caminhos pessoais, SQLite nem SN de fábrica no GitHub.

**Nenhuma fase A aceita ausência de sinal como evidência de ausência de risco.** Se uma fonte negar acesso, o resultado é UNKNOWN/BLOCKED, não GREEN.

## Fase B — projeto da migração controlada, após evidência da fase A

Se a instalação executar guardian legado, a atualização silenciosa **não é segura**. Antes de qualquer piloto, preparar uma transição específica à topologia encontrada:

1. Operator escolhe explicitamente a instalação canônica e confirma uma janela ociosa; o coordenador não escolhe automaticamente uma raiz por nome ou versão.
2. Com plano de recuperação e autorização supervisionada **específica**, garantir que todas as origens de relançamento identificadas parem de reintroduzir o agente. Não usar `Stop-Process` por nome/regex ou trocar arquivo sob guardian antigo ativo. Processo desconhecido ou outra sessão não comprovada aborta a transição.
3. Só então validar a nova dupla exclusão, o journal persistente, o enrollment autenticado dos participantes reais, a identidade do PID que detém 8765, o drain de jobs e todos os escritores browser/outbox.
4. Confrontar backup completo e ensaio de restauração com dados preservados, runtime/externalidades, identidade local, candidato assinado e espaço/ACL, mantendo a evidência vinculada à mesma transação.
5. Ensaiar aplicação, `/ready`, recuperação após interrupções e rollback no layout representativo do Windows sem tocar nos dados do posto; depois planejar um único piloto físico G1–G6 com supervisão de Pedro. Todas as falhas preservam journal/claim e exigem recuperação explícita.

## Condições de recusa imediata

- Guardian carregado sem protocolo, outro relançador não controlado, sessões/perfis inacessíveis ou PID/porta/raiz conflitantes.
- Jobs MES, monitor, importação, outbox, publicação Firestore ou outro writer em andamento/não comprovado.
- Dados ou diretórios externos não inventariados, runtime divergente, backup/restore/ACL/rollback sem prova.
- Claim, mutex, identidade, challenge/ACK, código candidato ou relatório mudando durante a operação.
- Consentimento físico ausente, operador não presente, plano de reversão não aprovado.

## Encaminhamento mínimo para Pedro

O primeiro retorno útil é o **resultado sanitizado da Fase A**, obtido em teste físico supervisionado. A partir dele, adaptar **o coordenador existente** ao guardian e às origens *reais*; não criar atualizador paralelo nem autorizar antecipadamente a instalação. A implementação isolada pode continuar, mas os estados físicos seguem **PENDING** até esse retorno e a aprovação expressa de Pedro.

**Limite de governança:** manter PR #64 DRAFT após CI GREEN; não fazer merge, nova release, deploy, instalação, alteração de arquivos de produção ou publicação antes da homologação física e autorização explícita. Issue #66 e sua PR funcional seguem isoladas.
