# PR98 — identificação e atualização supervisionada da Central / MES OPPO

Data: 19/11/2026. **Preparação; nenhuma ação foi executada na estação real.**

A interface informada pelo usuário abre no **Microsoft Edge**, em
`http://127.0.0.1:8765/Central-de-Controle-/`. Windows e pasta ativa ainda não
identificados. Essa URL confirma o endereço usado, não a versão, raiz ou banco.
A sessão da interface Edge e uma eventual sessão MES/Chrome são estados distintos.
Não trocar de navegador ou origem para contornar autenticação ou pendências.

## O que fazer primeiro

1. Na próxima etapa autorizada, executar somente o identificador abaixo. Ele
   descobre a pasta pelo PID dono de 8765; não exige escolher uma instalação.
2. Conferir versão, pendências e preservação privada com o responsável da estação.
   **IDENTIFIED não significa autorização para atualizar.**
3. Só depois de fechar os bloqueadores e autorizar a janela, executar a troca
   normal, verificar os dados e fazer um piloto pequeno de coleta no MES OPPO.

Não executar `01_TROCAR`, instalador, reparador, guardian, diagnóstico MES,
backup, abertura de banco ou alteração de rede nesta fase de identificação.

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

## 1. Identificação automática, somente leitura — futura autorização de inventário

Usar o suplemento [IDENTIFICAR_CENTRAL_8765_READONLY.ps1](../../../scripts/install98/IDENTIFICAR_CENTRAL_8765_READONLY.ps1).
Salvar isoladamente numa pasta de apoio/Downloads, **fora de A, B e backups**.
Não é necessário instalar Python, escolher a pasta da Central ou abrir SQLite.
Hash SHA256 do suplemento:
`b655315610ac3459f7a3a91e592c6333f00ba75f6b2bd306c2f10217be27eb51`.
Se o download não coincidir, STOP; não executar HTML salvo como PS1 ou normalizar
bytes para forçar o hash. Somente este apoio tem esse hash, não o ZIP da Central.

Validação isolada: [CI 44549705564](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44549705564),
22 contratos em CADA Windows 2022/2025, SHA de apoio
`2912b3c064cedb516462f5bfb12eac1330b4832f`, SUCCESS. Sintaxe nativa, metadados
sintéticos, arquivos privados opacos travados contra leitura, PID reutilizado,
links e listener real não agente; sem iniciar Central/MES ou abrir SQLite.
A discussão da PR registra a última CI específica do HEAD documental. Isso não
é novo teste da candidata, instalação na estação nem concessão de exclusividade.

No Windows PowerShell, quando autorizada a identificação:

```powershell
Get-FileHash -LiteralPath "$env:USERPROFILE\Downloads\IDENTIFICAR_CENTRAL_8765_READONLY.ps1" -Algorithm SHA256
powershell.exe -NoProfile -File "$env:USERPROFILE\Downloads\IDENTIFICAR_CENTRAL_8765_READONLY.ps1"
```

A localização acima é apenas a do suplemento baixado; a raiz A vem do processo.
Não elevar privilégios automaticamente, alterar ExecutionPolicy ou usar Bypass.
Se permissões/política impedirem a leitura, parar e tratar com TI. Não executar
scripts existentes da instalação para tentar obter o mesmo resultado.

O suplemento:

- lê a tabela TCP local e exige um único PID em 8765; IPv4/IPv6 do mesmo PID
  contam como um processo. Não faz requisição HTTP nem conexão ao listener;
- exige metadados CIM de imagem/criação/linha de comando e o formato canônico
  estrito `python.exe -u <entrypoint absoluto>` (ou `pythonw.exe`), com
  entrypoint `<raiz>\ames-agent\agent_hardened_entry.py`;
  nomes parecidos, argumentos adicionais ou formato não reconhecido dão STOP;
- deriva a raiz do entrypoint absoluto, recusa caminhos de rede e links/junctions,
  verifica a presença dos arquivos de estado por **metadados**, sem ler seus bytes;
- lê só o manifesto de código e hashes dos scripts públicos de suporte. O SHA
  do manifesto é uma **declaração**, não prova completa dos arquivos instalados;
- repete a observação de porta/PID/criação/argv e hash do entrypoint. Mudança
  durante a observação dá STOP. Não concede lease/exclusividade global;
- informa Windows/build/64 bits, raiz, metadados SQLite/WAL/SHM e presença de
  journals; não abre banco/config/token/perfis e não lê source_id ou credenciais;
- não inicia/para processos, importa agente, instala software, modifica arquivos,
  registro, rede, rotas, firewall ou sessões. O Windows pode manter sua auditoria
  normal; não se promete ausência de eventos do próprio sistema operacional.

Saída `IDENTIFIED`, exit 0: raiz observada, **operational_update_authorized=false**.
Saída `STOP`, exit 2: preservar a situação e informar o código; não procurar uma
pasta por nome/data e não executar a instalação. Um formato antigo legítimo pode
ser recusado: isso exige análise, não significa que os dados desapareceram.

A saída é PRIVADA e mostra caminhos. Guardá-la localmente de modo aprovado.
No GitHub, compartilhar apenas estado/código, versão Windows e SHA declarado
sem dados pessoais; nunca JSON completo, CommandLine, token, banco ou perfis.

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
   tarefa/serviço. Backup privado protegido por ACL/armazenamento aprovado; não
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

Os fatos novos conhecidos são somente URL local e Edge. P02 real, P04 real,
P05/P07/P08 reais e G0–G7 físicos não são concluídos por documentação ou CI.
Próxima ação única: **inventário assistido somente leitura**, após autorização
para essa observação; nenhuma substituição, backup ou coleta automática.

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
