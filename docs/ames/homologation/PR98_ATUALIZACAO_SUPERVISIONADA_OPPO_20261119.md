# PR98 — identificação e atualização supervisionada da Central / MES OPPO

Data: 19/11/2026. **Preparação; nenhuma ação foi executada na estação real.**

A interface informada pelo usuário abre no **Microsoft Edge**, em
`http://127.0.0.1:8765/Central-de-Controle-/`. Windows e pasta ativa ainda não
identificados. Essa URL confirma o endereço usado, não a versão, raiz ou banco.
A sessão da interface Edge e uma eventual sessão MES/Chrome são estados distintos.
Não trocar de navegador ou origem para contornar autenticação ou pendências.

## O que fazer primeiro — autorização atualizada de 19/11/2026

O usuário confirmou controle do computador e liberdade para instalar programas.
**Não presumir TI como pré-condição.** Autorizou o novo ZIP integrado e o ensaio
Windows sintético; mudança de política e troca sobre dados reais continuam
exigindo sua confirmação explícita.

Na candidata integrada desta retomada, extrair em pasta NOVA e abrir somente
`00_CONFERIR_ATUALIZACAO.bat`. Informar status/motivo, sem enviar dados privados.
Não repetir PS1 avulso, procurar PIDs/pastas ou executar o atualizador para
identificar A. A entrada reutiliza o coordenador e não faz a troca.

Se houver bloqueio de execução, parar. O código histórico
`STOP_TI_EXECUTION_POLICY` indica a política, não uma exigência de acionar TI.
Neste computador, discutir a solução com o próprio usuário; nenhum Bypass ou
mudança de política está autorizado. Controle corporativo efetivamente existente
pode exigir seu responsável, mas isso precisa ser comprovado.

Depois da identificação: preparar C0 consistente/privado e restauração verificada,
conferir pendências e só então pedir a confirmação da troca. A candidata completa
nova somente pode ser oferecida com artefato final, hashes e CI Windows do mesmo
SHA/bytes; o fechamento da discussão da PR98 registra a referência vinculante.

## Candidata congelada e comprovada

| Item | Referência exata |
|---|---|
| Código e produto aprovados no LAB | `3ab8df55e03fa2b961df100649de6541d2232bd6` |
| Download completo | [Artefato final 14527418568](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44519337968/artifacts/14527418568), retenção informada até 19/12/2026 |
| Arquivo interno | `CENTRAL_AMES_CANDIDATA_3ab8df55e03fa2b961df100649de6541d2232bd6.zip` |
| Tamanho interno | 69.551.529 bytes; 393 membros; CRC OK |
| SHA256 do ZIP interno | `e503a42702a7931994b2a1f11d7ae01b668a8fc8a743d326871fe209c484a5a9` |
| SHA256 do transporte externo | `5f59cb38893032bcaf659f80ec788467833de773c2d73ea2f1ec9379dfc90f40` — não confundir com o ZIP interno |
| Windows/instalação/nove telas/entrega | [44519337968 — SUCCESS](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44519337968) |
| Integração Python/Node/Chromium | [44519337941 — SUCCESS](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44519337941) |
| LAB/D01/D02 | [44519337962 — SUCCESS](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44519337962) |
| P04 | [44519337991 — SUCCESS](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44519337991) |
| P08 | [44519338069 — SUCCESS](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44519338069) |
| Conferência adicional dos bytes baixados | [Checkpoint independente 7008796942](https://github.com/pedrokam700/Central-de-Controle-/pull/98#issuecomment-7008796942) |

O artefato contém `QUALIFICACAO_LAB.json`, `SHA256SUMS.txt` e recibos externos.
A conferência independente do download acima foi registrada no checkpoint; não
foi repetida nesta preparação. Não reconstruir ou modificar esse ZIP. O apoio de
identificação e este roteiro são suplementos, não uma nova versão do produto.

A referência histórica dos pacotes de teste é EEDACC65
`eedacc65445dea9967a92085777b878c1ee9c123`. Não presumir que A é essa versão,
nem escolher 0.5.39 como retorno padrão. A prova Windows usou A reconstruída das
fontes Git EEDACC65; o ZIP histórico original não estava disponível no ensaio.

**Atualização da evidência histórica:** a [auditoria posterior dos ZIPs reais](https://github.com/pedrokam700/Central-de-Controle-/pull/98#issuecomment-7013286618)
passou a dispor do EEDACC65 original e confirmou seus 345 caminhos presentes no
produto PR98: 48 novos, 47 antigos modificados e nenhum removido. Isso fecha a
comparação estrutural de pacotes, sem identificar qual versão está instalada.
A [matriz de 30 requisitos](../audits/PR98_MATRIZ_CONTINUIDADE_INSTALACAO_20261119.md)
confronta origem/PR, fonte, teste/CI, resultado e lacuna física. Não é necessário
refazer essa comparação para identificar a estação ou implementar de novo as
funções presentes. O identificador é apenas complemento da detecção já existente
no coordenador; a atualização continua sendo pasta nova + `01_TROCAR.bat`.

## 1. Conferência assistida no coordenador existente

### Controle do computador e política

A evidência anterior de PSSecurityException/UnauthorizedAccess é preservada.
Todos os escopos Undefined não provam permissão efetiva, mas tampouco provam
necessidade de TI. Uma assinatura isolada não torna Restricted permissivo.
A conferência não muda política; em caso de bloqueio, registrar o motivo e
propor ao usuário uma medida específica para autorização separada. Não executar
arquivos por conteúdo inline nem usar Bypass para contornar a restrição.

A autorização atual permite construir/publicar o ZIP e ensaiá-lo no LAB; não
permite tocar dados reais ou iniciar a troca sem confirmação. Nenhuma sessão,
coleta, rede ou banco do computador foi acessado nesta retomada.

### Uma única entrada, sem nova descoberta independente

Fonte: [00_CONFERIR_ATUALIZACAO.bat](../../../tools/ames-workstation/00_CONFERIR_ATUALIZACAO.bat)
→ `01_TROCAR.bat /identificar` → ramo seguro do BAT existente → mesmo
`TROCAR_PARA_PR69_NOVA.ps1 -IdentifyOnly`.

O ramo consulta somente o nome da política efetiva antes de executar qualquer
arquivo PowerShell. Sob `Restricted`, retorna `STOP_TI_EXECUTION_POLICY`, exit 77,
sem carregar o coordenador. O comando dessa consulta não lê/interpreta PS1.
Sob outra política, usa `-File` normalmente, sem mudar a política ou burlá-la;
assinatura/controle de aplicação ainda podem bloquear e exigem TI. Não usa IEX,
EncodedCommand, Unblock-File ou leitura do script para execução inline.

O coordenador reutiliza `Identify`, `RootFor`, parser nativo de argv e leitura
HKCU Run do fluxo existente. O ramo termina antes da rede, dependências, mutex
transacional, popup, paradas, registro, journal e transferência. O corpo da
transação aprovada permanece idêntico a 3ab8df55. Os três scripts públicos de
barreira de A são conferidos pelos hashes já aprovados; versão desconhecida
não é adotada por nome. Caminhos de rede e junctions são recusados antes da
travessia. Config, token, SQLite e WAL não são abertos nem têm bytes calculados:
só presença/metadados. A raiz apontada não comprova conteúdo, frescor ou C0.

| Resultado | Interpretação / próximo passo |
|---|---|
| `STOP_TI_EXECUTION_POLICY` / PSSecurityException / assinatura / AppLocker / WDAC | Parar e apresentar o bloqueio ao usuário responsável. Nenhuma mudança de política, Bypass ou troca implícita; envolver TI apenas se um controle corporativo realmente exigir |
| `NO_LISTENER_NO_PROVEN_ROOT` | Zero proprietários distintos e nenhuma raiz reconhecida. Preservar tudo; responsável autorizado precisa comprovar a origem por evidência privada. Não varrer pastas nem iniciar A para criar prova |
| `MULTIPLE_LISTENER_OWNERS` | Mais de um proprietário. Não escolher PID, encerrar processo ou adotar o registro como substituto |
| `UNKNOWN_LISTENER_OWNER` | O dono não foi reconhecido como agente da instalação. STOP mesmo havendo Run válido |
| `REGISTERED_ROOT_WITHOUT_ACTIVE_WITNESS` | Run aponta raiz candidata, mas pode estar obsoleto. Raiz mostrada privadamente, STOP; não é prova dos dados originais |
| `INACTIVE_ROOT_FOUND_DATA_UNVERIFIED` / `AGENT_NOT_LISTENING` | Guardian/processo aponta raiz sem listener; agente parado/transitório continua hipótese. STOP, sem relançar |
| `CONFLICTING_ROOT_EVIDENCE` / `GUARDIAN_NOT_REGISTERED` / `REGISTERED_ROOT_UNRECOGNIZED` | Run/processos não fornecem uma origem coerente. STOP sem corrigir registro ou escolher pastas |
| `OBSERVATION_UNAVAILABLE` / `OBSERVATION_CHANGED` | Consulta falhou ou testemunho mudou; não converter falta de evidência em zero/ausência |
| `PUBLIC_BARRIER_UNRECOGNIZED` / `ROOT_OR_STATE_METADATA_UNVERIFIED` / journal existente | Versão, armazenamento ou manutenção requerem revisão. Não criar arquivos vazios, editar hashes ou limpar journal |
| `IDENTIFIED_ACTIVE` | Um agente reconhecido atende 8765 e as referências observadas são coerentes. `update_authorized`, `maintenance_lease`, `browser_sync_attested` e `state_originality_proven` continuam **false**. Próxima etapa é baseline privada, não troca automática |

A saída contém raiz/caminhos privados. Não publicar JSON completo, linhas de
comando, registros, tokens, banco ou perfis. O resumo público só precisa do
estado e motivo. Nenhuma busca global, reinício ou seleção de pasta é solicitada
ao usuário. Não são verificados serviços/tarefas de todas as contas, integridade
do banco, outbox ou ACK nesta leitura; isso pertence aos gates seguintes.
O Windows pode gerar auditoria e o parser nativo existente pode usar temporários
do compilador .NET; não se promete ausência de eventos/artefatos do próprio OS.
Nenhum arquivo de instalação ou estado é criado por este ramo.

### Distribuição e limites desta retomada

A candidata anterior 3ab8df55 permanece preservada como referência. A nova
candidata incorpora a entrada em FIRST_RUN_FILES, manifesto/hash e verificação
independente, sem edição manual de arquivos aprovados. É qualificada por ensaio
Windows completo: entrada extraída do ZIP contra A real sintética, instalação,
SQLite/WAL, inicialização, nove telas, reinício, R0 e STOP R2 com dados novos.
Entrega exige todas as regressões do mesmo SHA e a matriz assistida 2022/2025.
O checkpoint final da discussão registra artefato/SHA256/CI e distingue as
aprovações históricas das provas efetivamente novas.

O BAT legado de troca normal contém ExecutionPolicy Bypass. A autorização para
este teste inicial não libera sua execução na estação nem qualquer contorno da
política. Primeiro conferência, depois C0 e pendências, e só com proposta clara e
confirmação explícita orientar a troca. Se um controle exigir alterar/assinar
arquivos e seus hashes, isso precisa de revisão íntegra qualificada; nunca editar
A/B ou hashes por tentativa. Homologação física/MES permanece PENDENTE.

O suplemento avulso e seus 22 contratos permanecem no histórico. Não pedir nova
execução/download separado: a etapa inicial pertence ao pacote completo novo.

## 2. Baseline privada da instalação A — antes de autorizar a troca

Responsável da estação e TI confirmam, sem adivinhar:

| Verificação | Evidência privada necessária / condição de parada |
|---|---|
| Raiz e versão | PID/entrypoint/raiz estáveis; manifesto e arquivos de código coerentes. SHA declarado ou rótulo da tela isolados não bastam. Manifesto ausente/divergente: versão NÃO COMPROVADA |
| Estado | SQLite real e WAL/SHM/journal presentes/ausentes identificados; config/token apenas localizados. Ausência não vira banco vazio nem autoriza criar identidade nova |
| Motor | `engine_dir`/override efetivamente usados e arquivos correspondentes; motor externo, relativo ou desconhecido exige análise. Não editar config para fazer o helper aceitar |
| Processos | agente, guardian, launchers, Run de cada conta, tarefas, serviços e demais sessões. Revalidar PID/criação/argv antes de qualquer parada. Porta livre ou um PID não prova todos os escritores |
| Retirada/journals | `.ames-update`, `.ames-switch`, claims/journals do updater: identificar fase e geração. Não excluir marcadores. Existência desconhecida bloqueia retomada |
| Windows e dependências | Windows/build/arquitetura, Python 3.12 x64 real, venv/pip, Chrome para MES e Edge para interface, espaço/ACL/antivírus/energia. Versão de arquivo não prova ABI/imports/SQLite/JSON1/tzdata |
| Escopo MES | linhas reais L1/L2/L3, modelos, período e fuso `America/Sao_Paulo`, host/porta/URL/rota/Wi-Fi aprovados. A estação e a linha não são inferidas do nome da pasta |

Os três contratos antigos de retirada devem coincidir com os da candidata.
O coordenador recusa divergência antes de parar A. Não copiar helpers novos por
cima de A para forçar o aceite. Os valores abaixo existem tanto em EEDACC65
quanto no produto aprovado da PR98:

| Arquivo em `suporte/ames-workstation/` | SHA256 |
|---|---|
| `START_AGENT_CANONICAL.ps1` | `56db5762c44525c5c7238d37aa24785b6b5a13792f5bc1b1f50830a8e25c71e4` |
| `KEEP_AGENT_RUNNING.ps1` | `af9234f9e044e84dda95b7e3a31790989badb7c68c092a13484f10b1bb856627` |
| `ISSUE57_RELAUNCH_ENROLLMENT.ps1` | `f16cfaf34125a26052635b6d0c422cb11a192e5d5c51b9f225a29a2a9093be00` |

Coincidência desses contratos permite avaliar a retirada; não certifica toda a
instalação nem substitui inventário do banco, navegador e demais relaunchers.

### Pendências antes de fechar o Edge ou confirmar o diálogo

- Identificar **o perfil Edge e a origem exata `127.0.0.1:8765`** em uso. `localhost`
  é outra origem de armazenamento. Não mudar host/navegador/perfil, sair da conta,
  limpar cache/IndexedDB ou copiar Auth manualmente. Preservar rascunhos/abas.
- Atestar jobs ativos/enfileirados, monitor/scheduler, recuperações parciais,
  checkpoints por PCBA e exportações. Trabalho confirmado é preservado e
  reutilizável; parcial permanece pendente. Não apagar jobs ou marcá-los COMPLETE.
- Conferir publicação MES compartilhada e outbox da Central para os UIDs/origens
  e perfis existentes; só zero com leitura válida e confirmação de envio é zero.
  Erro, acesso negado, conta anterior ou namespace desconhecido = PENDENTE.
- Referências de implementação para a revisão assistida: `central-ames-outbox-v2`
  / `pending`; `central-trabalho-offline` / `outbox-v2` e `queue`; fallbacks
  `central.offline.outbox.v2` e `centralAI.offline.queue.v1`; drafts e cache
  Firestore também precisam inventário. Não abrir/criar/migrar esses bancos por
  script improvisado para “contar”, nem remover filas legadas sem UID comprovado.
- A leitura/advisory de uma aba e o fence cooperativo não atestam outras abas,
  perfis, máquinas ou clientes antigos. `jobs=0`, “idle” ou o botão de confirmação
  do operador não substituem a coordenação externa dos escritores.
- Identificar separadamente Chrome/CDP/perfil/sessão MES. Preservar a sessão sem
  copiar cookies para o Edge, laboratório ou GitHub. Login OPPO real é manual.

## 3. Janela e preservação C0 — autorização específica ainda necessária

Antes de qualquer mutação, definir quem coordena escritores/relaunchers e mantém
exclusividade durante captura, troca e conferência. Pausa/encerramento somente
pelos controles normais autorizados e sobre processos atestados; sem taskkill
por nome, encerramento de PID desconhecido ou exclusão de claims.

C0 é o estado original privado fiel. B é a pasta nova; nunca sobrepor A ou C0.
Planejar capacidade real para C0 + backup do helper + B + cópia de trabalho e
ensaio de restauração, inclusive volumes grandes, WAL, checkpoints e perfis.
A pequena reserva interna do helper não é orçamento da estação inteira.

1. Inventariar todo o estado: `ames-agent/data`, banco/WAL/SHM/journal, config,
   identidade/token, checkpoints, revisões/raw, exports/logs necessários, motor,
   configurações externas, perfis Edge/Chrome e dados de navegador, autostart e
   tarefa/serviço. Incluir arquivos de contas AT existentes, como
   `ames-agent/data/at_user_profiles.json` e `at_admin_auth.json`, sem ler/divulgar
   senhas, redefinir administrador ou provisionar contas novas nesta preparação. Backup privado protegido por ACL/armazenamento aprovado; não
   anonimizar o backup de recuperação nem publicá-lo.
2. Definir com TI a captura coerente do conjunto, com todos os escritores sob
   controle. Não copiar somente `.sqlite3` ativo, não apagar WAL/SHM, não executar
   checkpoint/TRUNCATE/VACUUM na origem e não usar `immutable=1` para ignorar WAL.
3. Preservar imagem bruta C0 com hashes e proteção contra alteração. Só abrir
   uma cópia de TRABALHO descartável para recuperar WAL e usar SQLite Backup
   em destino novo. Verificar que as transações confirmadas no WAL estão nela.
4. Na cópia, exigir `integrity_check=ok`, `foreign_key_check` sem violações não
   classificadas, esquema/versão e inventário de TODAS as tabelas, arquivos e
   relações. Ensaiar restauração em outro destino vazio; manter C0 intacto.
5. Registrar contagens e digest lógico dos registros antigos por origem, linha,
   período, snapshot/revisão e identidade; contagens iguais sozinhas não bastam.
   Tabela/coluna ausente = NÃO DISPONÍVEL, nunca zero. JSON bruto, comentários,
   nomes/papéis, datas/Hist Seq/Y/N e vínculos têm de continuar identificáveis.

**Compatibilizar captura e entrada real:** `01_TROCAR` exige A identificável pelo
agente/guardian. Não parar tudo e depois clicar como se a entrada fosse detectar
uma pasta inativa. O plano deve definir captura coerente com esse estado ou uma
parada/reabertura controlada de A ainda em R0, antes de B, com scheduler/jobs
sob controle e nova baseline de qualquer escrita. Se isso não estiver comprovado,
NO-GO. Não inventar lease com um arquivo/mutex e não usar um terceiro migrador.

O helper do coordenador cria backup SQLite autocontido incorporando o WAL e
ensaia restauração; não copia WAL/SHM antigos sobre o banco novo. Mas seu caller
não fornece inventário completo externo, e o recibo declara `browser_sync_attested=false`
e não concede lease. Ele **não substitui C0 da estação, backup Edge/Chrome ou
coordenação de todas as sessões**. O consentimento visual também não os prova.

## 4. Troca controlada — só depois do GO explícito

Condições cumulativas: raiz/versão A comprovadas, escritores controlados,
pendências resolvidas/preservadas, C0 restaurável, contratos compatíveis,
Windows/dependências/Edge e rede aprovados, B nova e íntegra, autorização da janela.

- Extrair o ZIP aprovado em B nova, local, sem link/junction. Conferir manifesto,
  SHA e 21 wheels. Não copiar `.venv`, config, token ou banco manualmente para B;
  isso elimina a condição de candidata pristine e pode interromper o migrador.
- Autorizar o escopo real do fluxo **antes de iniciar**: a rota/Wi-Fi e preparo
  de dependências podem ocorrer ANTES do diálogo visual e da parada de A. O popup
  não é um dry-run. Python/Chrome ausentes ou dependências incompletas podem levar
  a instalação/download; se isso não estiver aprovado, NO-GO antes de clicar.
- Antes de clicar, verificar também o navegador padrão e o perfil que abrirão
  a URL: START_LOCAL_CANDIDATE usa Start-Process. Não supor que o padrão é o Edge
  já utilizado. Abertura em outra conta/perfil/origem pode ter estado diferente;
  sem plano aprovado para conservar a sessão Edge, NO-GO. Não mudar o navegador
  padrão ou copiar Auth para forçar o aceite.
- Executar uma vez `01_TROCAR.bat` da B. Usar o caminho normal com confirmação
  humana. Nunca `/lab` na fábrica, nunca automatizar o “Sim”. `/local` não é
  isolamento de rede nem teste MES e não substitui o caminho operacional aprovado.
- Acompanhar manifesto, exclusividade, jobs, preparação, parada atestada,
  backup/restauração/transferência, journal, motor B, listener e registro/guardian.
  Conservar o caminho do backup privado retornado pelo coordenador.
- `TROCA_PR69=SUCCESS` é o nome legado do resultado da troca, não um downgrade
  à PR69. Conferir a versão por SHA/manifestos/componentes do produto aprovado.
- Falha, journal desconhecido, listener concorrente ou troca de identidade:
  STOP. Não clicar novamente, editar manifesto, abrir A ou apagar marcadores.

## 5. Aceite local antes de coletar no MES

Confirmar agente/motor B, um proprietário correto de 8765, guardian/autostart
na raiz esperada e ausência de relauncher antigo em outra sessão. Registrar os
estados; não adicionar guardian se não existia um contrato aprovado em A.

No **mesmo Edge, perfil, conta e endereço `127.0.0.1:8765`**, conferir sessão,
permissões, IndexedDB/drafts/outbox e histórico. Se o worker avisar versão nova,
salvar trabalho e fazer a navegação/reload orientada pela interface após ativação;
não forçar skipWaiting, desregistrar worker ou limpar dados. 409 persistente,
CSS incompleto ou mistura de SHA = STOP, não exceção aceita.

Abrir as nove telas: Monitor, Top3/FPY, Falhas, Consulta por SN, Rastreabilidade,
Dashboards de reuso, Processo/3022, Base e Conhecimento. Comparar mesmos escopos
e revisões com a baseline: sem queda/reescrita de registros antigos, duplicação,
perda de comentários/atores ou horários convertidos. Novas revisões derivadas
podem ser legítimas; precisam explicar origem/parent/hash e preservar as antigas.
Desconhecido continua desconhecido; nenhum vínculo/uso/horário pode ser inventado.

Validar no Python realmente usado por B, em memória/cópia descartável, versões,
imports genuínos, SQLite/JSON1 e ZoneInfo/São Paulo. Não importar agente para
“testar dependência” sobre banco real. A CI Server 2025/Chrome não homologou a
versão Windows real nem a sessão Edge informada agora.

Reinício controlado só após preservar qualquer estado novo e revalidar ausência
de trabalho ativo; conferir novamente as evidências. Falhas de energia/corrupção
não serão provocadas na fábrica para repetir a CI sintética.

## 6. Piloto MES OPPO e liberação de uso normal

Exige autorização própria, responsável de produção e acesso/permissões válidos.
Não executar login, probe de MES, reparo de rota, View ou coleta nesta preparação.

1. Confirmar host/URL OPPO, Wi-Fi/rota/porta aprovados por TI e Chrome/CDP do
   perfil esperado, sem dois donos de 9222. Não alterar gateway/DNS ou elevar
   timeout/click para contornar falha. Não publicar URLs internas ou cookies.
2. Escolher com produção uma linha, período e conjunto pequeno conhecido de
   PCBAs, com referência manual independente. Registrar fonte/snapshot/revisão;
   não começar por lote geral, todas as linhas ou recuperação indiscriminada.
3. Executar só as consultas autorizadas, observar 3028 e complementos necessários
   3012/3074/3022/2114 sem reconsultar resposta confirmada reutilizável. Preservar
   o clique 3022 de cinco segundos e comportamento View; login MES é manual.
4. Comparar bruto, checkpoints, SQLite, export e nove consumidores: PCBA/linha/
   source_id/período/ocorrência exatos; nomes/papéis/comentários/timeline íntegros;
   Y/N e uso 3074 só com prova física; produção 3022 não usa AT/A6900, reparo ou
   Defect Time como substituto. Cobertura parcial/ausência é diagnóstico, não zero.
5. Confirmar persistência das novas evidências, recuperação local e sincronização
   autorizada com ACK. Preservar B e estado de navegador pós-piloto antes de avaliar
   retorno. Falha implica R2, nunca reabrir A desatualizada.
6. Somente com aceite registrado da estação e do piloto, ampliar gradualmente
   escopo e liberar coleta normal. A aprovação de um piloto não certifica todas
   as linhas/turnos/volumes. Registrar o que permanece sem comprovação física.

## STOP e retorno

| Situação | Ação segura |
|---|---|
| R0 — B comprovadamente não executou | Cancelar sem restaurar banco. A pode estar preservada/retomada pelo coordenador; conferir estado atual e efeitos prévios em rede/dependências/autostart. Não declarar “nada mudou” só porque B não abriu |
| R1 — apenas deltas técnicos comprovados | Preservar B inteira. Retorno de código só em destino novo, usando dados ATUAIS e compatibilidade demonstrada, sob recuperação supervisionada. Não há botão genérico de rollback liberado |
| R2 — B pode ter executado, dados novos ou estado desconhecido | Interromper novas operações pelo plano autorizado, preservar A/C0/B e WAL/navegador/journals. Não reabrir A, restaurar SQLite antigo, mesclar bancos ou apagar `.ames-update`/`.ames-switch` |
| PID/criação/raiz inesperados, corrupção, falta de espaço, pendência/ACK desconhecido, perda/duplicação | NO-GO/STOP; registrar fato privado e acionar responsáveis. Não matar PID desconhecido ou reduzir o escopo depois para rotular PASS |

A mera existência de `candidate-intent.json`, retirada de A ou incerteza de fase
exige tratar a candidata como possivelmente executada. Não inferir R0 de um único
campo de journal. Não usar `update_candidate.py rollback` para este ZIP CLEAN.

## Condições que ainda impedem a instalação operacional

| Gate da estação | Estado atual / como fechar |
|---|---|
| G0 — autorização, raiz/versão | PENDENTE: Windows e raiz não identificados. Fazer primeiro o inventário de leitura; depois atestar código instalado, sem presumir EEDACC65/0.5.39 |
| G1 — escritores e pendências | PENDENTE: todas as sessões/guardians/jobs/monitor/Edge/outbox e ACK ainda não observados |
| G2 — C0 completo e restaurável | PENDENTE: método coerente, exclusividade, ACL/capacidade, estado externo e restauração privada não comprovados na estação |
| G3 — compatibilidade | PENDENTE: Python/Windows/SQLite/JSON1/tzdata e dependências reais. Edge da interface ainda não foi homologado na estação; Chrome/CDP MES é outro processo |
| G4 — preservação | PENDENTE: baseline real e comparação de todos os registros/revisões/arquivos antes/depois |
| G5 — uso local | PENDENTE na estação: nove telas, Auth/perfil Edge, worker, reinício e resposta com volume real. Resultado sintético já aprovado permanece preservado |
| G6 — contingência | STOP R2 aprovado no LAB; exclusividade/captura e recuperação supervisionada da estação continuam PENDENTES |
| G7 — aceite MES | PENDENTE: autorização, conexão e piloto físico OPPO com referências independentes; só depois uso normal |

Além de URL local e Edge, há agora prova relatada do bloqueio de execução e de
propriedade de porta não única; zero e múltiplos ainda não foram separados no posto. P02 real, P04 real,
P05/P07/P08 reais e G0–G7 físicos não são concluídos por documentação ou CI.
Próxima ação única, após publicar o novo artefato qualificado: extrair em pasta
nova e abrir **00_CONFERIR_ATUALIZACAO.bat**; inventário somente leitura.
Nenhuma substituição, backup ou coleta automática está autorizada nesta etapa.

### Registro privado mínimo da sessão futura

Preencher localmente: data/fuso e responsáveis; resultado/código do identificador;
Windows/raiz/versão A e seus limites de prova; perfil/origem Edge e Chrome/CDP;
processos/autostart/sessões; jobs/checkpoints/outboxes/ACK; C0/capacidade/ACL e
recibo de restauração; autorização e escopo de rede/dependências/troca; hashes B;
comparação antes/depois; piloto por linha/período; dados novos B; decisão GO/
NO-GO/STOP e próxima ação. Publicar somente resumo redigido sem dados operacionais.

Fontes: [handoff PR98](../handoffs/PR98_INSTALACAO_WINDOWS_20261118.md),
[checklist histórico G0–G7](HOMOLOGACAO_OFFLINE_0539_PR90_20261117.md) e código
congelado do coordenador/SAFE_STATE_TRANSFER na revisão `3ab8df55`. O título
0.5.39 do checklist histórico não identifica a estação do usuário.
