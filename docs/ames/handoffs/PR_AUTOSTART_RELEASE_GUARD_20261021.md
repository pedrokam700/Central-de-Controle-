# A-MES — Agente permanente e conferência de versão (candidato 21/10/2026)

## Objetivo
Após UMA instalação autorizada do CLEAN no computador coletor, a Central deve poder ativar/desativar o início automático do agente por usuário Windows. Fechar a aba não encerra o processo local. Ao entrar novamente no Windows, um guardião leve verifica a porta 8765 e usa somente o bootstrap canônico do MES, sem abrir A-MES, executar coleta, reparar Windows silenciosamente ou utilizar credenciais MES. A Central continua sendo a única interface.

## Implementação isolada
- Endpoint local `GET /api/v1/workstation/autostart`, `POST` com `{"enabled":true|false}`. O próprio `HardenedHandler` exige token de workstation/origin permitida; não é endpoint público.
- A ação explícita na Central configura `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\CentralAMESOperatorAgent`, sem elevação de privilégio e sem copiar tokens. O valor aponta somente para `KEEP_AGENT_RUNNING.ps1` dentro **da mesma pasta**.
- Em logon do usuário, o guardião tenta iniciar o agente se a porta não responder; usa o starter já protegido `START_AGENT_CANONICAL.ps1`, que verifica PID/origem/versão e não assume a porta ocupada por software desconhecido. Nunca executa atualização, Chrome ou comando MES.
- Registro estrangeiro com a mesma chave de inicialização é `conflict` e bloqueia substituição automática.
- A interface indica se a *configuração* foi gravada; isso **não** prova que o Windows executará a tarefa em todos os logons nem que Chrome/MES estarão autenticados.
- Sem Windows ou agente antigo, o controle permanece indisponível e não declara ativação.

## Separação importante
O agente consegue trabalhar com SQLite offline e pode permanecer ativo sem aba. **O Firestore não é publicado sem a sessão autenticada do navegador** no mecanismo atual. Isso exige solução futura de publicação autenticada independente de aba, com critérios de segurança e autorização próprios; não registrar nenhuma credencial de usuário no guardião.

## Versão oficial
- Em 21/10/2026, Vercel production alias `central-cora-v2.vercel.app` READY e GitHub `main` apontavam ambos para `39e0956be7cfc1979c2a67f825c563e4bc891976` (0.5.29).
- O arquivo correto está em **`/release-build.json`** na raiz da hospedagem. O caminho `/Central-de-Controle-/release-build.json` retorna 404 e não deve ser usado como evidência de falha do deploy.
- A Central exibe o resultado da comparação exata entre release mais recente **verificada** pela API GitHub e SHA do build da Vercel. Quando a consulta falha, mostra *não comprovado*; quando difere, alerta. Essa camada é somente leitura e **não publica deploy automaticamente**.
- O projeto Vercel mantém `git.deploymentEnabled.main=false`; ligar auto-deploy indiscriminadamente antes de gates SHA+release seria regressão de governança. Um deploy oficial precisa continuar vinculado a release, CI e verificação de alias no SHA exato.

## Gates antes de uso físico
1. Testes Python isolados para HKCU fake, conflito, enable/disable/idempotência e Linux fail-closed.
2. Parse real de PowerShell em GitHub Actions Windows.
3. Contratos das nove views, localhost, Auth, browser, Firestore e ZIP CLEAN, todos no SHA exato.
4. No PC da fábrica, backup de SQLite/outbox/identidade, com único agente na 8765. Instalar candidato separado e comparar SHA. Após pareamento, clicar **Ativar início automático**, conferir mensagem de confirmação e reiniciar o Windows em janela autorizada. Sem abrir pasta, confirmar /ready, versão e identidade; abrir URL oficial, parear se necessário e consultar histórico já salvo. Não repetir MES por padrão.
5. Desativar pelo mesmo controle e reiniciar para provar reversibilidade. Não sobrescrever pasta anterior. Se a política corporativa bloquear HKCU Run, registrar bloqueio; não elevar privilégios nem contornar TI.

Este documento não certifica testes físicos nem muda a main/produção.
