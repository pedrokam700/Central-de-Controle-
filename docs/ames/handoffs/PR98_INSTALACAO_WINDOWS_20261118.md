> **Fechamento LAB confirmado em 19/11/2026:** produto congelado
> `3ab8df55e03fa2b961df100649de6541d2232bd6`, cinco CIs SUCCESS e download final
> conferido no checkpoint 7008796942. Homologação física/operacional PENDENTE.
> As seções antigas abaixo preservam a cronologia RED/GREEN; não são instruções
> para repetir trabalhos já aprovados. Ver o fechamento e a próxima etapa ao final.
> [Roteiro supervisionado OPPO](../homologation/PR98_ATUALIZACAO_SUPERVISIONADA_OPPO_20261119.md).
> [Matriz de continuidade — 30 requisitos](../audits/PR98_MATRIZ_CONTINUIDADE_INSTALACAO_20261119.md).

# Instalação Windows — continuidade após PR97, 18/11/2026

Base exclusiva 52efc38182401e708dd9f80c6c57a27e7b8726ab. Checkpoint obrigatório
https://github.com/pedrokam700/Central-de-Controle-/pull/97#issuecomment-6988262193
lido integralmente. Usuário autoriza execução REAL de instalação/atualização
somente em Windows descartável, isolado e sintético. Não autoriza fábrica.

Esta missão não confunde download/CRC/AST com funcionamento. Primeiro ensaio:
24 inputs oficiais com URLs/SHA256 fixos, 13 wheels P04 e seis fontes GUI reais,
PyMsgBox/Pillow e ferramentas de build. Depois de download verificado, exigir
Windows Firewall + prova WFP de bloqueio de conexão por PID, com loopback positivo.
Sem essa prova, não executar fonte GUI, builder ou agente. Não desativar checks
para fazer o runner passar. Não usar módulos falsos.

Após contenção, construir as seis wheels genuínas offline, preparar instalações
A (fontes EEDACC65) e B (candidata desta branch), executar 01_INSTALAR /prepare,
importar backend GUI real/screenshot, iniciar START_AGENT_CANONICAL de A,
parar processo próprio, produzir WAL sintético confirmado, preservar C0, executar
SAFE_STATE_TRANSFER real, iniciar B e conferir SQLite/identidade/históricos,
reiniciar B depois de nova evidência. Provas parciais não qualificam 01_TROCAR
inteiro nem nove telas renderizadas: essas etapas ficam explicitamente pendentes.

RED independente já reproduzido antes de correção: config.engine_dir absoluto
de A é copiado sem atualização para B; nova versão continua carregando motor A.
Seis testes/um FAIL, preservação/backup anteriores PASS. Também foi identificado
no código retorno automático A depois de tentativa de iniciar B; ainda requer
contraprova e correção antes de qualificar rollback com dados novos.

Fonte da fixture EEDACC65 é Git, não bytes do ZIP antigo ausente. Banco e todos
os dados/identidades usados são sintéticos. Nenhum SQLite/MES/PC/credencial real.
Isolamento por programa cobre processos auditados; não é promessa de sandbox
universal contra código hostil. Runner sem prova WFP = STOP, não GREEN.

Próxima ação exata: conferir CI da branch work/ames-windows-installation-20261118,
provas GUI/contenção/instalador e primeiro boot; corrigir somente causas
demonstradas, sem perder dados novos e sem retirar barreiras produtivas. Exigir
regressões anteriores no SHA final antes de qualquer declaração de candidata.
G0–G7/homologação física e uso no computador da fábrica PENDENTES.

## Checkpoint: motor e contenção

RED publicado 64e19f77b6b87e0a42a1c66930792034a6c38cb7, CI
https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44376199516
(uma falha real em seis contratos). Correção mínima do helper: reconhecer apenas
engine_dir absoluto dentro da geração A e planejar B/factory-engine; recusar
override externo/relativo e candidato incompleto antes de gravar. Configuração
original e backup privado continuam fiéis; os demais campos e SQLite/token não
mudam. 13 contratos sintéticos de transferência e quatro anteriores passam
localmente; isso ainda não é GREEN Windows nem qualificação do pacote final.

O primeiro runner recusou prefixos de firewall e o segundo não encontrou o log
imediatamente; ambos pararam ANTES de GUI/agente. Contraprova com espera limitada
do audit log nativo passou em c6847c72c07e1297bf46030a3f828b990b0dd089,
https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44377550040:
loopback positivo e evento WFP de bloqueio vinculado ao PID. Build GUI real
prosseguiu; seus resultados e boot ainda devem ser conferidos integralmente.

## Ensaio real: dependências e recusa do primeiro boot

Em 81cec4f51e79fa00c04616dbaeec1914aea6aaea, run
https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44379328512,
ambos os instaladores /prepare, GUI nativa e screenshot 1024x768 passaram.
Pillow 11.3.0 é provisionado apenas para a captura adicional do TESTE; não é
importado pelo runtime da Central nem justificativa para mudar requirements.
O primeiro boot real de A foi recusado: `Processo criado nao confirmou a
identidade do entrypoint atual`; a tentativa de cleanup recusou UNKNOWN_OWNER,
corretamente sem matar PID não comprovado. Assim, inicialização NÃO passou.

A captura inicial por pipes ficava aguardando descendente; saídas em arquivos
permitiram obter recusa em ~6 segundos. Runs antigos 44378093893, 44378330966,
44378718476 foram cancelados para diagnóstico e NÃO contam como PASS. Recibos
parciais preservados em Actions; novo harness conserva estado/eventos de startup
e observa CIM independentemente. Canonical launcher de EEDACC65 e PR97 tem o
mesmo blob `eeb97b51796056ef4e56924d2327ed902546d8c4`: investigar a causa nativa,
não liberar PID desconhecido nem alterar agente para fazer o teste passar.

No SHA 3ea8012160474fdf0cda61a760a0ecef3d0f4c6a passaram regressões integradas
44378718606 (Node/Python/nove telas), P04 44378718651 e P08 44378718428.
Esses resultados não substituem a exigência de SHA final e instalação inteira.
Transfer helper continua único arquivo funcional alterado até este checkpoint;
agente, motor, UI, requisitos e entry LAB preservados integralmente.

## Causa imediata da recusa nativa (sem relaxar o launcher)

Contraprova 482e0cc1ab478ca3cf6add3b1b7b089ec061e12c / run 44380671098:
observação CIM independente confirma PID/birth/entry corretos. A execução dos
helpers reais revelou `Get-FileHash: CommandNotFoundException`. Get-KnownPackage
recusa corretamente quando a prova dos coletores congelados não é executável.
Assim, a hipótese inicial de atraso de PID NÃO está comprovada. Verificar host
Windows PowerShell 5.1 e evitar PSModulePath herdado de pwsh7 no harness antes
de propor alteração produtiva. Nenhuma verificação de hash/PID foi removida.

## Primeiros boots reais e correção da contraprova de rollback

ac432e1b035220a3f5876cccc207d0111154a60d / 44381194443 confirmou em Windows:
Get-FileHash nativo disponível, A e B com /ready + H1 + root correto, WAL
confirmado preservado em backup/C0 e todos os históricos iguais, B usa motor B,
frontend servido e B reinicia preservando evidência nova. Nenhum agente/launcher
precisou ser modificado para obter esses PASS de componentes.

LIMITAÇÃO descoberta: rollback-probe falhou antes de executar seu trecho real
(PSScriptRoot indisponível no scriptblock extraído). O PASS anterior baseado
apenas em ausência de listener era inválido. Corrigir binding do root, exigir
marcador de execução do trecho REAL e retorno esperado; somente aceitar STOP
explícito + ausência de A + B preservado. Nem erro do harness nem ausência de
listener comprovam recuperação segura. O workflow não deve terminar aprovado
com a troca completa PENDENTE. Nove telas da suíte Linux passaram, mas render
sobre agente REAL Windows ainda está pendente. Nada qualifica uso fabril.

## RED comprovado de retorno desatualizado e correções restritas

f71fff9fb57f7fd345163880fbf37fa778c62efc, CI 44381813261, job
135075824620: trecho REAL de rollback executado, A reiniciou com sucesso depois
de B produzir comentário novo. Recibo `old_generation_serving:true` e B inteiro
preservado: RED é a visão antiga apresentada como atual, não perda de B.

Correção do coordenador: qualquer possível execução B bloqueia retorno e
restauração de HKCU Run antigo. Antes de lançar B, journal CreateNew/Flush(true)
e barreira persistente .ames-update em A sob mutex CanonicalBootstrap; exigir
launcher/helper/guardian antigos idênticos aos contratos conhecidos. A fica
retirada; nenhuma remoção automática da barreira. Falha/abrupto exige supervisão.
NÃO é transação atômica de diretórios nem mesclagem de bancos. R0 anterior ao
limite conservador mantém retorno existente; R2 preserva todas as gerações.

RED adicional publicado em 680e27f9049f19736396fffa42c27da75ee10254: entrypoints
não oferecem partida explícita dos históricos locais sem exigir rota fabril,
embora boots reais tenham comprovado que a aplicação local funciona sem MES.
`-LocalOnly` é entrada explícita de troca/partida local e `-NoBrowser` permite
controle supervisionado sem abrir navegador padrão. NÃO são sandbox: agente e
suas regras permanecem iguais, e isolamento no ensaio é provado pelo firewall.
Fluxo normal conserva a validação de rede e Chrome/CDP; partida local exige
configuração já existente/verificada e não abre Chrome MES automaticamente.
Boot/rota/MES da fábrica continuam PENDENTES.

## Retomada 19/11 — execução integrada da entrada real

Checkpoint independente 6990006741 lido integralmente. Worktree local estava em
01537b0 com nove arquivos modificados; os nove eram idênticos ao remoto cdb0b34.
Cópia privada de recuperação foi preservada antes de sincronizar o HEAD.
No SHA cdb0b34, R2 realmente executou e confirmou STOP_NEW_OR_UNKNOWN_EVIDENCE,
A ausente e B novo preservado; não reimplementar nem enfraquecer essa correção.
As quatro matrizes anteriores desse SHA passaram; qualificação completa segue
pendente somente enquanto entrada completa e nove telas reais não passarem.

RED novo d9131a059d9fae8e4d22fdd9ea70303a1a66c47c: alias descartava argumentos;
wrapper não oferecia escopo LAB verificável nem propagava comprovadamente RC.
Correção proposta/executada somente em runners descartáveis: 01_TROCAR /lab
encaminha -Laboratory -LocalOnly -NoBrowser ao coordenador REAL. Exigir GHA
Windows, raiz RUNNER_TEMP/LAB exata, marcador sintético explícito, evento WFP
nativo por RecordID/PID/destino, regras ativas por executável e configuração
sintética loopback. Não executar preparador de rede fabril. A autorização LAB
é separada de consentimento operacional: OPERATOR_DIALOG=NOT_EXERCISED, sem
clique automático nem aprovação visual simulada. Fora do LAB, recusar /lab.
O fluxo normal conserva o diálogo e a validação de rede anteriores.

A próxima CI executa a cadeia BAT inteira contra instalação sintética A ativa,
guardian e HKCU Run reais do runner. Contraprovas de escopo, WFP e manifesto
precisam preservar A/PID/dados/Run. O caso positivo precisa provar stage,
backup, journal, retirada de A, START_LOCAL real, guardian/Run da candidata,
reinício após registro adicional e recusa do launcher original de A retirado.

Nove telas: abrir o HTML original entregue, sobre agente REAL Windows, perfil
Chrome novo e Playwright genuíno; nenhuma injeção de Auth ou datasets, nenhuma
substituição de app.js/offline-bootstrap. Requests externos são ABORTADOS como
contenção, nunca respondidos com bibliotecas/dados falsos. Registrar screenshots
reais e recibo de cada view. Auth/SDK offline, se bloquear, deve manter a
qualificação FAILURE/PENDING com causa e artefato; não confundir HTML 200 com UI.
Não gerar nova candidata distribuível até concluir os gates exigidos.

## Troca inteira PASS; MIME Windows comprovado RED

SHA 61a4d515 / CI 44506159525: cadeia BAT/PS inteira PASS, RC0, com stage,
backup/journal, guardian/HKCU Run de S, A retirado e launcher original de A
bloqueado. R0 por manifesto corrompido preserva PID/dados/Run. Escopo não-CI e
prova WFP adulterada recusados. Reinício local S mantém linha nova sem apagar
as anteriores. São provas reais do procedimento local, não homologação fabril.

UI continua PENDING. Em e7d8ceafa88a9af98dac25dfec5ae233ff66ecd2,
CI 44507278840 / artifact 14520521641 (SHA256 externo
c54dfa96d222dae5b1bd3287d61145fdcdcfa98c29075be4fa193c533598a136),
HTTP real de offline-bootstrap.mjs é text/plain; Chromium recusa estritamente
módulos antes de Auth carregar. app.js=application/javascript e CSS=text/css.
Não diagnosticar senha/Auth para essa recusa. SheetJS externo também bloqueado.

RED 54447956147f5d0d4b997b333e2adc1c272f56e3 usa a função _send_static REAL,
extraída por AST sem importar agente, em HTTP localhost temporário; associação
text/plain do SO quebra tanto .mjs quanto .js. Correção única na atribuição MIME:
JavaScript recebe application/javascript independentemente do Registro Windows.
Nenhuma outra linha de agent.py muda (contraprova literal da fonte #97 + hashes
fixos nos gates anteriores). MIME dos downloads e demais arquivos permanece
herdado. Sem tocar coletor/SQLite/normalização/auth/rede/guardian. Revalidar UI
real para revelar os próximos bloqueios; não considerar essa correção GREEN
completo nem substituir a Central integrada por mini-app.

## Fechamento das dependências web e fixture genuína de sessão anterior

43f17caf98c9febdcbc9e4969286058fedfc0ecb / Windows 44508716726 confirmou
bootstrap.mjs application/javascript e revelou as dependências CDN Firebase e
SheetJS bloqueadas. RED bdfd3a13 exige a presença delas no resultado real.
3b663353 inclui EXATAMENTE Firebase 10.8.0 e SheetJS 0.20.3, fontes oficiais,
SHA256/tamanho fixos e licenças completas. Build estático confere os inputs e
muda somente locais de importação para mesma origem. Worker conserva revisão
por SHA, inventário de clientes e cache imutável; SDKs usam href absoluto da
origem local e SheetJS entra no precache. app.js/offline-bootstrap/sw originais
não são reescritos no repositório; nenhum projeto/Auth/perfil é trocado.

O guard genérico recusou corretamente um novo teste que tentava emitir estáticos
na suíte protegida. O guard NÃO foi afrouxado: input/hash é verificado sem
builder na suíte; o teste do OUTPUT real é obrigatório no Windows autorizado,
após extrair/verificar B.zip. Um erro de sintaxe do diagnóstico foi corrigido
em 4065b85b; d59cd62d não é validação aceita.

Próxima prova: perfil anterior inteiramente sintético preparado por SDK oficial,
Auth/Firestore emuladores oficiais fixos (CLI 15.37.0 e JAR 1.22.0; Java 21 só
no runner). Binários precisam de hash e bloqueio por executável antes de rodar.
Nunca login/deploy/projeto/conta Firebase REAL. Config/cache em LAB; metadados ADC
desativados e host de fallback loopback. As regras originais são lidas pelo
emulador sem alterá-las. Criar usuário por createUserWithEmailAndPassword e
perfil por setDoc, exigir ACK/cache e rejeição real da elevação user→admin.
Nenhum usuário/JWT é injetado em armazenamento ou no código da candidata.

Backend e servidor de preparação devem ENCERRAR antes de A→S; manter C0 privado
do perfil fechado. A candidata original só restaura a sessão/cache pelo SDK
normal, com Cloud inacessível. Testar também perfil vazio: deve carregar login
legítimo, nunca abrir Console anônimo. No perfil preparado, exigir UID hash
preservado, ausência de conexão a emulador na candidata, nove telas reais,
origem/revisão/dados SQLite via controles históricos genuínos e Excel genuíno.
Sem esse conjunto, manter FAILURE e preservar screenshots/recibos. Sessão de
emulador não é prova de credenciais/permissões Cloud nem do PC operacional.


## Nove telas reais renderizadas; leitura histórica ainda RED

f757462a0b62817e14e95098b4438db0a4d73f54 / Windows 44515615555:
9/9 views renderizadas no HTML original, UID preservado, Auth da candidata sem
emulador, login habilitado e Console fechado no perfil vazio; zero pageerrors e
diálogos. Regras originais recusaram elevação user→admin no backend sintético.
Artefato 14525637556 / SHA256 externo
2bf634f87b8f92c6765766769442f219006171cb172c75ec3cd6d49fd92c0ccc.
Qualificação integral FAILURE: snapshot não selecionado, não mascarado por 9/9.

Causa comprovada da fixture: snapshots P02 têm window_id NULL e summary.period
vazio, intencionalmente; o índice histórico JOIN analysis_windows os exclui
corretamente. O ensaio de INSTALAÇÃO define períodos sintéticos explicitamente
ANTES de C0/A, por Store.ensure_window, sem apagar dados/revisões ou modificar a
fixture P02 compartilhada. Incrementa epoch da fonte sintética quando acrescenta
o vínculo de janela; a projeção nativa reconstrói uma revisão nova normalmente.
Não atribuir isso a perda de dados produtiva nem inventar períodos em leitores.

HTTP 500 /network/status: a proteção herdada network_watch.route_state recusa
host diferente de 172.29.185.215. LAB usa 127.0.0.1; NÃO mudar guardian, alvo ou
rota para contornar a recusa. Capturar mensagem exata do endpoint e classificá-la
como restrição sintética esperada. Qualquer outro HTTP error continua pendência;
rede fabril não exercitada. Cloud externo bloqueado é esperado, nunca sucesso
simulado. Próxima CI exige dados reais do SQLite sintético por controles da UI.


## Consolidação para entrega Windows — 19/11/2026

### Última validação integral antes do ZIP fechado

SHA 782ec43abd10b293a444c629d82528ff6513c510:
Windows 44516837193, integração 44516837428, LAB 44516837424,
P04 44516837156, P08 44516838060: todas SUCCESS.
Artefato fino Windows 14526496426, SHA256 externo
b9f27b0c22b4cf203c68849bfdba5d5c32868e5704b7ee45cc70e004fe8b7beb.
Checkpoint público https://github.com/pedrokam700/Central-de-Controle-/pull/98#issuecomment-7008198363.
A confirmação de 9/9 inclui identidade restaurada, agente conectado, leitura do
SQLite sintético pelo período original e ausência de erro JS/diálogo; não apenas
HTML servido. O perfil vazio conserva login habilitado e Console fechado.

### ZIP fechado e gate de publicação

b7e502d8 acrescenta o fechamento do arquivo instalado com 21 wheels genuínos,
proveniência das fontes oficiais e hashes dos seis resultados construídos sob
WFP. A montagem do arquivo recusa inventário incompleto, hash/corpo/metadados
alterados, versão/arquitetura/origem inesperada e links. Dez contraprovas de
inventário sintético; nenhum desses wheels de teste é instalado.

RED medido na base do builder: zero wheels e ausência do manifesto runtime.
O arquivo fechado inclui todos os wheels dentro dos manifestos principal/local;
B e S NÃO recebem wheels por cópia auxiliar. A é reconstrução sintética da fonte
EEDACC65, cujo ZIP original segue indisponível. Não inventar equivalência binária.
Python 3.12 x64 e Chrome x64 genuínos são pré-requisitos externos explícitos.
Nenhum instalador de sistema ou emulador é colocado na candidata.

O verificador passivo independente compara fontes Git, transformações exatas,
SDKs/licenças/hashes, worker/release/troca/componentes no mesmo SHA, wheel metadata,
recibo externo da construção genuína e inventário/CRC/hash do ZIP real. Exige
extração nova; os 13 testes adversariais originais de arquivo continuam exigidos.
A prova da UI compara também content_hash, revisão, período e contagem de TODOS
os datasets com a API da revisão exata lida do SQLite.

Em b7e502d8, Windows 44517540008 recusou a tag legítima oficial do Playwright
py3-none-win_amd64; a origem e os bytes já estavam fixos no lock. Integração
44517540547 recusou a retirada de frases de segurança do manual. Corrigidos em
61be1f7e sem alterar testes anteriores ou aceitar wheel fora do inventário/hash.
Essas recusas não foram atribuídas a ambiente nem ocultadas.

A publicação é um artefato de candidata, não release/deploy. Só ocorre após
instalar OS MESMOS bytes no Windows, qualificar troca/nove telas/reinício/falhas
e passar as quatro matrizes protegidas no SHA exato. Recebidos publicamente:
ZIP completo, SHA256SUMS, inventário/verificador independente, recibos de
instalação/9 telas/regressões e procedimento. Artefatos intermediários não são
atestado de prontidão; perfis, tokens, SQLite, configurações e emuladores da
fixture ficam privados no runner descartável e não são entregues.

### Falha I/O após dados novos — prova adicional obrigatória

0d634373 acrescenta segunda troca completa S→T: um observador externo ocupa
committed.json com criação exclusiva para provocar uma falha I/O real do
coordenador e insere uma nova linha 3012 depois que T realmente inicia.
Exigir BLOCKED + STOP_NEW_OR_UNKNOWN_EVIDENCE, todos os registros S e T presentes,
S retirada, Run antigo não restaurado e starter original S recusado, com T ainda
detendo a API e seus dados novos. Não substituir função, hash ou aprovação.
Isso testa interrupção do retorno antigo; não promete transação atômica ou
recuperação automática de toda situação. O cenário só é PASS depois de executado
na CI final. R0 por manifesto/WFP/escopo e reinício após kill já são exigidos.

### Limitações e próxima ação

A CI gera recibos com o SHA de execução; a discussão da PR registra os links
finais. Se um gate falhar, preservar o commit/evidência e corrigir a causa sem
publicar o arquivo como qualificado. PR continua DRAFT contra #97. Main continua
b283b1764432f5d90486d38a7553b30542a5c118 e #97 continua
52efc38182401e708dd9f80c6c57a27e7b8726ab (conferidos por refs remotas).
Nenhuma alteração no guardian, rota fabril, clique 3022, coletor, regras de
3074/3022, timeline ou armazenamento operacional. Agente só tem a atribuição MIME
revisada: SHA256 531ae0a15150a8fa7e269f09dbd64d64de50092f407a97b907c4889ddbef1d58.

Instalação original/Windows real, sessão e permissões Cloud reais, eventual
mudança de origem HTTPS/localhost, Chrome/MES, rede e dados físicos ainda precisam
de etapa supervisionada autorizada. P02 real, P04 real/completa, P05/P07/P08 real
e G0–G7 físicos PENDENTES. Nunca oferecer banco desidentificado como recuperação,
limpar Auth/cache para contornar proteção ou restaurar SQLite antigo sobre novos
registros. O manual da candidata contém verificações antes/depois e STOP/retorno.


### Prova do ZIP fechado e R2; transição do worker medida

61be1f7ef9d6e5b402d377a6c1a49a0f6754e7b0 / Windows 44517913273:
ZIP fechado/verificador independente/13 contraprovas de arquivo PASS, 21 wheels;
troca completa PASS e falha I/O tardia da segunda troca PASS. T recebeu nova linha,
conservou todos os dados anteriores, S não voltou e o launcher S foi recusado.
As quatro matrizes deste SHA também SUCCESS. Windows integral ainda FAILURE:
9/9 views renderizaram, mas houve 409 de CSS durante ativação do worker.

O harness esperava serviceWorker.ready, que pode resolver com worker ainda
activating; sua navegação seguinte podia entrar no inventário conservador de
clientes antigos. O worker recusou dependências daquele documento corretamente.
NÃO afrouxar guard/client inventory, excluir CSS, limpar cache ou forçar ativação.
A prova passa a aguardar estado real activated + controlador; só depois realiza
nova navegação. Registra 409 completos com fase e mensagem exata, aceita apenas
recusa legítima ANTES da barreira e exige ausência de 409 na nova navegação,
todas as folhas de estilo carregadas/cssRules e cache SHA/inventário persistente
comprovados por leitura. Erros inesperados continuam reprovando. Sem apagar as
reproduções anteriores e sem mudar runtime produtivo para facilitar o ensaio.


## Fechamento definitivo do produto 3ab8df55 e preparação da estação real

Checkpoint independente lido integralmente:
https://github.com/pedrokam700/Central-de-Controle-/pull/98#issuecomment-7008796942.
Na retomada, HEAD era exatamente 3ab8df55 e a worktree estava limpa; registro
privado de continuidade preservado antes de editar. Nada foi descartado.

### Produto aprovado, sem reconstrução

**SHA de código/ZIP: 3ab8df55e03fa2b961df100649de6541d2232bd6.**
Cinco execuções conferidas por consulta de estado, sem repetir testes/builds:

| Gate | Run | Resultado |
|---|---|---|
| Instalação Windows real sintética + entrega | [44519337968](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44519337968) | SUCCESS |
| Integração Python/876 Node/Chromium | [44519337941](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44519337941) | SUCCESS |
| LAB/D01/D02 | [44519337962](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44519337962) | SUCCESS |
| P04 | [44519337991](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44519337991) | SUCCESS |
| P08 | [44519338069](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44519338069) | SUCCESS |

[Artefato final 14527418568](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44519337968/artifacts/14527418568),
retenção informada até 19/12/2026. ZIP interno
CENTRAL_AMES_CANDIDATA_3ab8df55e03fa2b961df100649de6541d2232bd6.zip,
69.551.529 bytes, 393 membros, CRC geral OK, SHA256
`e503a42702a7931994b2a1f11d7ae01b668a8fc8a743d326871fe209c484a5a9`.
Transporte externo: 9 membros/CRC OK, SHA256
`5f59cb38893032bcaf659f80ec788467833de773c2d73ea2f1ec9379dfc90f40`.
A verificação adicional dos bytes recebidos foi feita e registrada no checkpoint
independente; não foi refeita nesta missão. Manter SHA externo/interno distintos.

QUALIFICACAO_LAB.json exige instalação e nove telas PASS, física PENDING e
factory_installation_authorized=false. Inclui o ZIP fechado com 21 wheels,
verificação independente de fontes/manifestos/hashes/CRC, troca real, SQLite/WAL,
identidade, histórias, motor correto, reinício, nova evidência e recusa do retorno
antigo. A segunda troca com I/O falho após nova evidência exige STOP R2.
O teste final do worker exige ativação concluída, nova navegação, estilos reais
carregados, cache SHA e inventário persistente; não removeu a proteção 409.
Não alterar ou gerar nova candidata para atualizar apenas esta documentação.

### Contexto informado pelo usuário e apoio solicitado

Interface atual: Microsoft Edge em
http://127.0.0.1:8765/Central-de-Controle-/.
Windows/build e raiz ativa NÃO IDENTIFICADOS. Não presumir 0.5.39 ou EEDACC65.
A origem local foi informada, mas UID/perfil/outbox e código servido continuam
sem atestado. Não trocar para localhost, Chrome ou HTTPS para contornar isso.
Chrome/CDP de coleta OPPO e sessão da interface Edge são escopos separados.

O usuário pediu identificação preferencialmente automática e somente leitura,
sem escolher pastas. Suplemento novo, FORA do produto congelado:
`scripts/install98/IDENTIFICAR_CENTRAL_8765_READONLY.ps1`.
Parte do PID proprietário de 8765, exige imagem/argv canônicos absolutos, deriva
root, verifica arquivos por metadados e repete identidade do proprietário. Não
faz HTTP, importa agente, abre SQLite/WAL/config/token/perfis, altera processos,
rede, registro, políticas ou arquivos. Versão do manifesto é declaração, não
prova completa. Saída privada IDENTIFIED/STOP nunca concede lease/autorização.
Porta sem listener, donos diferentes, bind não loopback, metadata inacessível,
comando não reconhecido, link/junction/UNC ou mudança de identidade dão STOP.

Apoio tem suíte própria em Windows descartáveis 2022/2025, metadados sintéticos,
estados privados opacos bloqueados contra leitura e recusa de listener real não
agente, sem requisição HTTP. Não inicia a Central nem usa MES. A primeira prova
44548671756 reprovou sintaxe PowerShell; corrigida antes de qualquer uso real.
Não declarar o suplemento validado até a CI específica concluir.

A workflow já existente ganhou dispatch exclusivo desse apoio; jobs de build,
instalação e entrega anteriores só rodam em push e NÃO são executados pelo
novo dispatch. Commits de apoio/documentação usam [skip ci] para respeitar a
instrução de não repetir gates aprovados. As cinco CIs do produto são as de
3ab8df55, não testes do HEAD documental. A CI focada não é homologação física,
revalidação global nem novo pacote. Runtime e arquivo aprovado ficam inalterados.

### Próxima etapa única e bloqueadores concretos

[Roteiro prático completo](../homologation/PR98_ATUALIZACAO_SUPERVISIONADA_OPPO_20261119.md):
identificação por porta; baseline/versão; pendências de jobs/checkpoints/Edge/
outboxes; C0 íntegro e externo; coordenação dos escritores; compatibilidade;
troca normal; aceite local; piloto OPPO; STOP/R0/R1/R2. Contém entrada de leitura,
critérios GO/NO-GO e registro privado. Não é permissão para executá-los.

Faltam observações e autorização específicas da estação: versão/raiz reais,
contratos de retirada/guardian/todas as sessões; pendências e ACK Edge; método
coerente de C0/exclusividade/restauração com estado externo; Python/Windows/
SQLite/JSON1/tzdata/Edge/Chrome; integridade e dados reais antes/depois; rede,
credenciais/permissões e piloto físico OPPO. O coordenador pode preparar rede/
dependências ANTES do popup. Não clicar para “só diagnosticar”. Seu backup não
atesta browser_sync nem lease e não captura sozinho todo o estado externo.

Não parar A e depois tentar usar o coordenador sem raiz ativa identificável;
a captura e eventual reabertura R0 precisam plano, scheduler sob controle e
baseline atualizada antes de B. R2 nunca volta ao A antigo nem restaura C0 sobre
B. Não limpar journals/cache, inventar vínculos/horários ou confirmar popup sem
prova das pendências. P02 real, P04 real e P05/P07/P08/G0–G7 físicos PENDENTES.
Não houve acesso a instalação, SQLite, credencial, rede, Edge/Chrome ou MES reais.
PR permanece DRAFT; nenhuma instalação/deploy/merge ou alteração de main/PRs
anteriores. A entrega do arquivo não encerra a meta de coletar no OPPO: a próxima
ação é o inventário assistido de leitura, seguido dos gates da estação e piloto,
quando autorizados.


### Apoio de identificação aprovado em teste próprio

Suplemento no SHA `2912b3c064cedb516462f5bfb12eac1330b4832f`,
[CI manual 44549705564](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44549705564):
22/22 contratos em Windows 2022 e 22/22 em Windows 2025, ambos SUCCESS.
Jobs 135649818232/135649818945. Nenhum teste do apoio foi omitido. Os jobs
anteriores de produto/build/entrega ficaram intencionalmente não executados.
O produto continua exclusivamente no SHA/ZIP aprovado 3ab8df55.

Reproduções anteriores preservadas: 44548671756 recusou sintaxe PS; corrigido
operador para -cnotmatch. 44549300794 passou os primeiros 17 contratos, mas a
criação da fixture de junction interpretava colchetes no caminho; corrigida a
fixture, mantendo o teste positivo de raiz com espaços/colchetes e a recusa de
junction. Não alterar produto, repetir seus gates ou mascarar essas falhas.

A observação completa em fixture não concede GO; o teste de PID com criação
alterada exige STOP. O caso positivo de metadados funciona com SQLite/WAL/SHM/
config/token bloqueados contra abertura. Um listener TCP REAL de PowerShell é
recusado sem o cliente estabelecer conexão/HTTP. Arquivos sentinela permanecem
com os mesmos bytes. Essas provas não são boot de agente real, acesso MES,
verificação física do Edge ou identidade da estação do usuário.

Hash do PS1 independente:
`b655315610ac3459f7a3a91e592c6333f00ba75f6b2bd306c2f10217be27eb51`.
O proprietário pode observar a pasta na saída privada; não pedimos que adivinhe
ou selecione uma instalação. Se formato/estado divergir, STOP com código sem
expor dados. Política Windows bloqueada não deve ser contornada com Bypass.
O suplemento fica fora de A/B/backup e não consta dos 393 membros do produto.

Roteiro também exige verificar o navegador padrão antes de Start-Process:
interface informada é Edge, mas isso não identifica o padrão ou perfil aberto
pelo launcher. Nenhuma troca para Chrome/localhost nem migração de Auth será
feita para contornar pendências. A preparação está publicada; a identificação
da estação, o backup completo e a coleta OPPO continuam etapas futuras.


## Diretriz definitiva e auditoria transversal — continuidade sem novo produto

[Auditoria independente obrigatória 7013286618](https://github.com/pedrokam700/Central-de-Controle-/pull/98#issuecomment-7013286618)
lida integralmente e confrontada com metadados GitHub, objetos Git locais,
implementação e testes disponíveis. Retomada em 310cf7e7, worktree limpa;
registro privado de continuidade preservado antes da documentação. Nenhum
runtime, identificador, teste aprovado ou arquivo da candidata foi alterado.

### Fatos confirmados e limites

- Fonte/linhagem: HEADs #69–73, #75–84 e #86–97 são ancestrais de 3ab8df55.
  #85 é Issue. #74 é paralela; não é perda: #76 contém exatamente o mesmo
  local_sn.py e teste agent-local-sn-operator-evidence da #74. Hashes e comandos
  de conferência estão na matriz. O HEAD posterior de apoio #98 é descendente
  do produto, portanto não deve substituir seu SHA nem ter ancestralidade lida
  no sentido inverso. PRs consultadas seguem DRAFT/abertas; nenhum merge.
- Auditoria de bytes posterior passou a dispor dos ZIPs reais: EEDACC65 345
  caminhos, PR98 393; 345 antigos presentes, 48 novos, 47 antigos modificados,
  298 antigos idênticos e nenhum removido. A antiga indisponibilidade descreve
  o ensaio daquela data; não invalida a prova posterior. Nesta sessão só as
  evidências finas estavam no filesystem, por isso os números de bytes são
  atribuídos explicitamente à auditoria independente, sem inventar nova inspeção.
- Sete fontes AT (quatro módulos e três scripts) comparadas diretamente entre
  Git EEDACC65 e 3ab são idênticas; backend continua conectado. Teste AT dedicado
  não foi localizado pelos nomes desses módulos nos arquivos de teste pesquisados;
  isso não demonstra perda de função nem cobertura específica. Preservar perfis/
  contas existentes e verificar uso/provisionamento real quando autorizado.
- Conferidas fontes e contraprovas de 3012, 2114/Hist Seq, nomes, timeline #86,
  3074 #87, horários #88/BRM, SN/rastreabilidade/FPY, recuperação #72–84,
  identidades de escopo, rede persistente, dependências/worker e R0/R1/R2.
  Não foi reproduzido nem demonstrado novo defeito funcional; não criar patches
  para preencher lacunas físicas por suposição. Travamentos reais L1/L3/2114/
  3012 e contadores/horários físicos antigos continuam sem nova comprovação.

[Matriz objetiva de 30 requisitos](../audits/PR98_MATRIZ_CONTINUIDADE_INSTALACAO_20261119.md):
requisito → origem/PR → implementação → teste/CI → prova → lacuna real. Referências
imutáveis aos arquivos existentes e execuções aprovadas; nenhuma suíte/build foi
repetida. Identificador permanece byte a byte no SHA de apoio validado 310cf7e7,
PS1 SHA256 b655315610ac3459f7a3a91e592c6333f00ba75f6b2bd306c2f10217be27eb51,
CI 44550376501 com 22 contratos por Windows 2022/2025. Produto/ZIP permanecem
3ab8df55/5 CIs aprovadas. Esta continuidade só acrescenta documentação e corrige
a cronologia da disponibilidade dos ZIPs; não gera nova versão.

### Ação operacional preparada

O roteiro existente foi mantido e recebeu referência à matriz, evidência nova
sobre ZIPs reais e tabela STOP→motivo→ação segura. Não se exige que o usuário
adivinhe pastas, procure PIDs ou faça dezenas de comandos. Primeiro: obter apenas
observação pelo identificador, fora de A/B, sem HTTP/SQLite/token/stop/rede. Não
usar 01_TROCAR para diagnosticar nem confundir IDENTIFIED com autorização.

Depois: confirmar versão real e todos os escritores/guardian/Run/jobs; preservar
SQLite/WAL/checkpoints/revisões/config/identidade e estado externo Edge/Chrome/AT;
C0 consistente privado e restauração ensaiada; capacidade e compatibilidade real;
rede/rota OPPO persistente autorizada. A abertura Edge local já é conhecida;
Windows, raiz, UID/perfil/pendências e estado do posto ainda não são atestados.

Somente com janela autorizada e gates fechados: pasta B nova + 01_TROCAR normal,
comparação de todos os registros antigos/novos e nove telas, ativação/estilos/SHA,
reinício e piloto de coleta pequeno com prova independente. Validar clocks e
atores por ocorrência e uso físico sem substituir ausência por zero. Só ampliar
após aceite; R2/dado novo ou desconhecido preserva A/B/C0 sem retorno antigo.

P02 real, P04 real, P05/P07/P08 reais e G0–G7 físicos PENDENTES. Main/PRs anteriores,
rede/guardian/SQLite/perfis/credenciais operacionais intocados. Sem nova PR,
instalador, ZIP, merge, deploy ou acesso OPPO. O ponto de continuidade é a
identificação assistida da estação e o plano de troca existente, não outra pesquisa.


## Retomada 19/11/2026 — bloqueio real de identificação / entrada integrada

**Este bloco substitui a recomendação anterior de baixar e executar o PS1
avulso no cenário desta estação.** Checkpoint obrigatório
[7017792994](https://github.com/pedrokam700/Central-de-Controle-/pull/98#issuecomment-7017792994)
lido integralmente. Retomada em `5d20a1b5211d30d6ca92adc2b685df58f3b1132d`,
branch `work/ames-windows-installation-20261118`, worktree limpa. Estado Git
preservado antes de editar. Nenhum reset/limpeza/restauração ou nova PR.

### Causas comprovadas e limites

- PS1 avulso teve hash correto, mas a execução foi negada na estação, segundo
  evidência do usuário. Todos os escopos Undefined não identificam uma política
  efetiva permissiva. GPO/WDAC/AppLocker, assinatura e edição Windows reais ainda
  não foram observados; não inferir qual controle causou a negativa.
- O resultado anterior da porta é `owner_count != 1`, zero OU múltiplos. A URL
  da aba Edge não comprova listener atual, versão ou desaparecimento de dados.
- O identificador avulso exige listener único. O coordenador existente já tinha
  Identify/RootFor/parser/guardian/Run, mas não possuía um ramo terminal de leitura.
  O BAT normal usa Bypass e pode preparar rede/dependências antes do popup;
  não é um diagnóstico permitido nem uma solução para política corporativa.
- Registro válido pode estar obsoleto; guardian sem listener também não atesta
  a origem/frescor do SQLite. Sem prova, a resposta continua STOP, mostrando
  apenas a raiz candidata privada quando derivável. Não relançar A para obter
  listener. C0/outbox/ACK/escritores globais não são certificados nesta leitura.

### Correção estritamente de suporte

`00_CONFERIR_ATUALIZACAO.bat` delega a `01_TROCAR.bat /identificar`. O ramo novo
no BAT consulta só metadados de política; Restricted retorna exit 77 e
STOP_TI_EXECUTION_POLICY sem carregar PS1. Caso permitido, chama `-File` com
IdentifyOnly sem Bypass/alterar política/executar conteúdo inline. Assinatura e
controle de aplicação continuam sendo aplicados; falha exige TI.

O mesmo coordenador recebe IdentifyOnly e usa seus próprios helpers existentes,
acrescentando leitura fail-closed de TCP/CIM/Run, referências coerentes, hashes
públicos das três barreiras, caminhos locais sem reparse e metadados privados.
Zero/múltiplos/desconhecido/conflito/transição/journal/estado ausente resultam em
STOP distinto. Um proprietário reconhecido resulta apenas IDENTIFIED_ACTIVE:
update_authorized, maintenance_lease, browser_sync_attested e
state_originality_proven permanecem false. O ramo termina antes da transação.
A parte mutável aprovada do coordenador é comparada literalmente com 3ab8df55.
Os helpers normais só recebem a proteção extra de caminho quando IdentifyOnly
está ativo; não há mudança no fluxo fabril normal.

FIRST_RUN_FILES passou a exigir a entrada única numa FUTURA geração íntegra;
REQUIRED_FILES e manifesto já derivam desse inventário. Contratos Python/Node
passam a exigir o novo membro sem excluir os antigos. Somente inventário foi
editado: builder não foi executado. O ZIP 3ab8df55 NÃO foi alterado/reconstruído,
nem contém a extensão. Não copiar arquivos novos sobre ele ou repetir downloads
avulsos. Primeiro fechar o método aprovado pela TI; qualificação e distribuição
integrada posterior ainda são gates próprios, não cobertos pela CI histórica.

### RED / GREEN verificáveis

| Etapa | SHA / execução / resultado |
|---|---|
| RED antes de corrigir | `21b75e2f2af4c1b4bce81c49968feefb6bc7c1bb`, [44587248492](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44587248492), ambos Windows: RED_NO_ASSISTED_READ_BRANCH_IN_EXISTING_COORDINATOR |
| Primeiros 18 contratos | `a6f514dcc7a578ace4e368dfe340f412a45495a1`, [44587659242](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44587659242), PASS nos dois Windows |
| Falha de preparação da ampliação | `adc22381ae9748366f50f51d5edbcfd4cfc17fec`, [44587966665](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44587966665), New-Item -Target tratou colchetes como wildcard; corrigida criação da junction sintética com mklink nativo |
| Contraprova de estado ausente | `affbcbbdb921b95b353a11024904309b31af5da3`, [44588154513](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44588154513), banco sintético removido ainda recebeu IDENTIFIED_ACTIVE; não atribuir ao SQLite ou a dados reais |
| 24 contratos ampliados | `804c751b11a41dabbd714b0cddb199420e06548d`, [44588562412](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44588562412), PASS nos dois Windows após exigir atributos literais de cada membro |
| Fechamento de inventário | [7018274828](https://github.com/pedrokam700/Central-de-Controle-/pull/98#issuecomment-7018274828), contraprova AST de FIRST_RUN_FILES ausente, sem builder; entrada acrescentada e teste 25 exige presença |
| SHA final e CI vinculantes | [Checkpoint de fechamento 7018296412](https://github.com/pedrokam700/Central-de-Controle-/pull/98#issuecomment-7018296412), atualizado após a execução do HEAD exato; consultar conclusão, não presumir aprovação por etapas parciais |

A matriz final exige 25 contratos por Windows Server 2022/2025, o parser nativo
anterior (seis classificações + mesma raiz de autostart/entrypoint), sete contratos
Node existentes e três Python BAT/LAB. Sem instalação de dependências, builder,
ZIP ou agente. O job novo só é disparado manualmente com assisted_only=true e
identification_only=false; jobs históricos de construção/instalação não executam
neste dispatch. Não se reporta a seleção focada como nova execução das cinco
CIs completas, dos 876 contratos ou das nove telas já aprovados no produto.

As provas novas incluem tabela sintética de zero/múltiplos/desconhecido,
Run/guardian coerentes/conflitantes, agente temporariamente sem listener, origem
não reconhecida, journal, mudança de observação, UNC/junction, metadados ausentes,
hash público alterado, falha de consulta que não vira zero, privados opacos com
FileShare.None e fingerprint sem mutação. Os processos positivos são metadados
sintéticos, não agentes executados. A cadeia BAT completa também é executada
realmente sobre uma estação Windows descartável vazia, com CIM/TCP/Run genuínos,
e retorna NO_LISTENER_NO_PROVEN_ROOT sem criar estado. Restricted é aplicado
apenas ao ambiente dos processos filhos da fixture; a política da máquina/GPO
não é alterada nem flexibilizada. O sentinela prova que o PS1 não executou.

### Próxima ação exata e bloqueadores

[Roteiro supervisionado atualizado](../homologation/PR98_ATUALIZACAO_SUPERVISIONADA_OPPO_20261119.md),
seção 1: **uma solicitação à TI**, pronta para encaminhar, sem mais comandos,
PIDs, seleção de pasta ou script avulso. TI deve comprovar a política efetiva e
um método permitido, revisar a revisão exata e a distribuição íntegra e aprovar
as leituras TCP/CIM/HKCU Run. Assinar um PS1 isoladamente não torna Restricted
permissivo; não prometer que só assinatura resolve. Se não permitido, STOP.

A aprovação desse inventário não aprova a cadeia antiga de atualização/início
com Bypass. Se a TI exigir alteração/assinatura que muda hashes, preparar uma
revisão íntegra qualificada; não editar A, hashes ou manifesto por tentativa.
A entrada integrada ainda precisa ser distribuída com integridade validada;
gerar outro ZIP antes de resolver a política não fecha o impedimento.

Depois da observação permitida, baseline privada da origem real e versão, todos
os escritores/pendências, C0 consistente e restaurável, compatibilidade Windows/
Edge/Chrome/Python, rede OPPO autorizada e comparação histórica são gates para
uma janela de troca separadamente autorizada. Só então nove telas locais,
reinício, preservação de dados novos e piloto pequeno MES com referência
independente antes de ampliar coletas. Não usar /lab na estação e não abrir A
com histórico velho depois de B possivelmente executada: STOP R2 e preservar
A/B/C0. P02/P04/P05/P07/P08 reais e G0–G7 físicos continuam PENDENTES.

Produto/agente/motor/frontend, coleta, clique 3022, regras fabris e três barreiras
públicas permanecem intocados em relação a 3ab8df55. Main e PRs anteriores não
foram alteradas; PR98 segue DRAFT. Nenhum dado, rede, guardian, perfil, banco ou
credencial real foi acessado. Não há homologação física nem autorização de troca.


## Nova entrega integrada autorizada — 19/11/2026, base ab81dd98

O usuário confirmou controle do computador e liberdade para instalar programas.
Isso substitui a suposição anterior de TI obrigatória: NÃO é um bloqueador
presumido. Foram autorizados ZIP completo integrado, instalação/atualização reais
no Windows descartável com fixtures e publicação do artefato para testar. A
mudança de política e a troca sobre dados reais continuam exigindo confirmação.
Nenhuma operação no computador real foi autorizada por este bloco.

Fonte inicial exata ab81dd988ccae4a5ab766450bc9bdb15af7bb354, worktree limpa e
estado preservado antes de editar. Mesma branch/PR98 DRAFT, sem auditoria geral,
nova PR ou alteração no agente/motor/frontend. Produto 3ab8df55 preservado como
referência anterior; esta entrega será um ZIP NOVO, com SHA/manifestos próprios.

A entrada 00_CONFERIR_ATUALIZACAO já integra FIRST_RUN_FILES. O job assistido
passa a executar também no push e vira dependência obrigatória de entrega, junto
com a instalação Windows e as quatro regressões no SHA exato. full-switch.py
executa a entrada EXTRAÍDA DO ZIP contra A/guardian/Run reais da fixture antes
da troca, sem override de política, exigindo IDENTIFIED_ACTIVE e flags de
autorização false, A intacta e B sem estado. O delivery-gate exige esse recibo.
As provas existentes de instalação, WAL, preservação histórica, nove telas,
reinício e falha de I/O/R2 continuam obrigatórias nos mesmos bytes.

Contraprova local de inventário: listas fechadas LAB/P04/P08 recusavam oito
arquivos já publicados de suporte/documentação da continuação, sem falha fabril.
[Registro antes do ajuste](https://github.com/pedrokam700/Central-de-Controle-/pull/98#issuecomment-7019336415).
Foram acrescentados somente esses oito caminhos revisados; comparação de blobs,
hashes de módulos e comandos anteriores permanece exigida. Nenhum teste excluído.

LEIA_PRIMEIRO/INSTRUCOES no próprio ZIP passam a orientar o teste em seis passos:
extrair em pasta nova; abrir só a conferência; informar status/motivo; STOP se
política bloquear (responsável é o usuário, sem TI presumida); preparar backup
privado consistente/restauração/pendências; obter confirmação antes da troca.
A conferência não abre SQLite/token/config nem instala/inicia serviços. O nome
histórico STOP_TI_EXECUTION_POLICY não significa TI obrigatória.

O recibo final, artefato para download, SHA256, contagens/CRC e CIs exatas serão
registrados na discussão da PR98 depois da qualificação. Não considerar a
candidata entregue por este texto ou por artefato intermediário. P02/P04/P05/
P07/P08 reais e G0–G7 físicos permanecem pendentes. Não usar /lab no computador
do usuário nem presumir sua versão EEDACC65/0.5.39. Sem política alterada, dados
reais, MES, merge, deploy ou atualização operacional nesta preparação.


Ajuste de mensagem antes da entrega: o BAT agora orienta falar com o responsável
pelo computador, sem encaminhamento obrigatório à TI. STOP_TI_EXECUTION_POLICY
permanece apenas como código histórico estável; nenhuma política é modificada.
Como isso muda bytes do ZIP, a entrega final exige as cinco CIs no NOVO SHA;
a execução 44595435931 de 5c4c9e90 é preservada como etapa intermediária.

## Continuidade da 3028 em 26/11/2026

A base deste incremento é a candidata 79de999a8a1178366b260e89a3938c307139b40a da própria PR98. O ZIP baixado do GitHub para essa base contém 395 entradas internas. A identidade do software ativo no posto depende da conferência local.

Na base, três observações sintéticas com a mesma placa, código e hora, duas operações e uma repetição legítima produziram apenas uma linha no SQLite. No lote de três linhas, uma divergência da segunda impediu gravar a primeira e consultar a terceira. A candidata passa a atribuir chaves por ocorrência dentro da origem e janela, aproveitar as chaves históricas compatíveis e gravar cada linha em uma transação que inclui dados, índices, evidência e conclusão. Uma linha recusada aparece como pendente. Uma sessão indisponível interrompe as próximas consultas. A leitura das removidas reconstrói a revisão selecionada. Dados que já tenham se perdido em uma coleta antiga só podem ser recuperados de uma fonte que ainda os contenha.

Cada consulta paginada verifica página, escopo, contagem e conteúdo. A confirmação nativa exige seleção identificada no resumo e leituras independentes dos dois conjuntos. Diferenças por código, inclusive quando se compensam no total, passam pelo caminho de conferência. Duas linhas de resumo disjuntas podem fundamentar um único histórico. A ocorrência conserva o modelo individual. Uma consulta sem resumo verifica as grades de ocorrência antes de registrar ausência. Uma retificação posterior produz outra revisão. A representação JSON de Date é a mesma nas duas leituras nativas. Nos quatro testes da ferramenta V3, datas com fuso, espaços e multiplicidades explicam como isolar diferenças na comparação anterior. A origem física das 35 diferenças de chave segue indeterminada.

Para reproduzir no repositório, executar `python -B scripts/install98/period-3028.test.py`. Para o fluxo com Chromium e Playwright instalados, executar `python -B scripts/install98/browser-3028-replay.py`. O segundo ensaio lê grades ExtJS simuladas em Chromium, publica pelo agente em SQLite temporário, reabre a revisão canônica e verifica os indicadores e filtros na interface. Aceita os diretórios de agente e interface extraídos de Central.zip como argumentos. Os cenários de referência incluem 245/241, 293/275, 294/274 e 35/35. Também exercita resumo vazio, seleção de duas linhas de resumo, agrupamento maior, agrupamento vazio, compensação entre códigos, contaminação e alteração durante a paginação. Apenas dados sintéticos participam desses ensaios.

A Issue #99 contém o recibo específico da entrega após a qualificação e a conferência dos bytes baixados. A medição física no A-MES e a execução noturna no posto são etapas em aberto.

Em 27/11, a qualificação de f8fc44c recusou a alteração no coletor selado CLEAN V3 e a expectativa antiga de duas identidades após importar uma ocorrência mais duas iguais de outro modelo. A versão seguinte mantém o arquivo clássico com o SHA-256 histórico. O adaptador existente comment_provenance_3028.py contém os programas de leitura por período. A qualificação intermediária identificou que o atualizador selado não distribui módulos Python extras. Os leitores viajam junto com esse adaptador já inventariado em todas as rotas de atualização. O teste da projeção canônica exige três identidades nessa amostra e verifica que reler o mesmo lote no mesmo snapshot conserva exatamente essas três. O ensaio com 13 cenários em Chromium foi repetido após essa correção.

## Continuidade no posto em 27/11/2026

O operador informou uso da 7ae90c5c. Cinco tentativas do dia produtivo 26–27/11 salvaram as Linhas 1 e 3 e recusaram a Linha 2 no intervalo 11h–12h com 15 ocorrências no detalhe e 11 no agrupamento. O extrato tem os recibos, mas não contém as grades da Linha 2. A causa física da divergência e da falta de confirmação integral continua em aberto.

Reprodução em Chromium na versão anterior e no novo código: quando a seleção integral devolve um comentário divergente, a fatia de 15/11 é recusada na versão antiga. O leitor atualizado confere seleção, filtros e as duas grades no intervalo exato. Só publica a união se todas as fatias forem comprovadas e o multiset de detalhe for reproduzido pela janela integral. Preserva o agrupamento nativo do período e o obtido das fatias em campos distintos. A coleta parcial continua preservando as linhas confirmadas. O operador pode repetir apenas as linhas pendentes de um job autorizado, com os horários do recibo original.

A leitura diária prioriza a cobertura exata, usa ordenação numérica de snapshots e identifica coberturas parciais de outra origem. Foi reproduzida uma ordenação incorreta com IDs 9 e 11 no mesmo segundo. Os avisos físicos de revisão indisponível não traziam a causa da falha de abertura. A revisão antiga continua disponível em modo de leitura, com indicação separada de recuperação e período.

O indicador de reuso compara cada ocorrência atual às suas evidências anteriores elegíveis. Repetições históricas em duas PCBAs permanecem no detalhe histórico. A tabela de falhas preserva os registros 3012 e as passagens 3022 em Evidências técnicas. A ligação de nome, hora e comentário ao resumo exige prova individual. A auditoria continua exibindo o registro original e o papel de cada pessoa.

A Issue #99 e a PR #98 documentam o SHA e os recibos efetivamente verificados. A homologação física requer nova revisão local da Linha 2 para o dia original.

### 3028 após o retorno físico da 638819e

Hoje e o último dia produtivo continuaram recusando a Linha 2. As duas janelas reportadas foram 26/11 11h–12h (15 ocorrências no detalhe e 11 no agrupamento) e 27/11 13h–14h (11 e 9). A 638819e tem uma contraprova no ZIP: as grades sintéticas retornam as mesmas ocorrências em capturas completas, mas a fatia tem resumo vazio e o leitor rejeita por falta de linha selecionável. O replay anterior criava uma linha selecionável e, por isso, não testava a condição do posto. A mesma faixa de 15/11 sem linha selecionável também foi reproduzida em Chromium contra os bytes da 638819e.

A leitura 3028 mais antiga encontrada no Git (61a3de7, anterior à integração da PR22) já obtinha os modelos do resumo e executava as grades de ocorrência para cada modelo. Também rejeitava somas não nulas de agrupamento diferentes do número de ocorrências. A evolução introduziu confirmação por seleção e subperíodos, mantendo essa dependência. A consulta sem produto já existia na recuperação de resumo vazio. O recibo físico anterior da Linha 3 registrou cinco ocorrências nessa rota com resumo vazio. Isso é evidência dessa linha e janela, sem estabelecer o comportamento da consulta sem produto nas janelas da Linha 2.

A implementação ativa agora consulta todos os produtos diretamente pela linha e pelo período, usando `prodModel:''`, `orderId:''`, `procstep:1` e `workShift:'ALL'` nos proxies ExtJS originais de detalhe e agrupamento. Resumo e classificação mantêm seus parâmetros de produção. Cada grade tem duas leituras completas em ordens inversas de página. O leitor compara respostas, totais próprios, páginas e o multiset de cada página, com o escopo da operação quando exposto pelo Ext. Mantém o agrupamento nativo, o modelo individual e todas as ocorrências. A soma do agrupamento e os indicadores do resumo não limitam a quantidade de ocorrências detalhadas. Detalhe vazio com evidência de falhas no mesmo período fica inconclusivo. O caminho ativo independe de seleção de linha no resumo. Também não usa seleção de resumo para reconstruir períodos. As transações SQLite continuam independentes por linha.

O teste `python -B scripts/install98/browser-3028-replay.py` inclui as duas janelas com resumo vazio e sem elemento de seleção, modelos omitidos no resumo, duplicatas legítimas, alteração de comentário, página incompleta/repetida, total divergente da quantidade detalhada, período/modelo conflitantes e 3.775 ocorrências. A união das consultas individuais da fixture é comparada à consulta integral e ao SQLite pelos registros completos e sua multiplicidade, antes da projeção no painel. A única verificação física pedida é a resposta da grade de detalhe ao clicar em View na 3028 com a Linha 2, 26/11 11h–12h e Prod Model em branco, antes de selecionar qualquer resumo. Nenhuma atualização do posto é necessária para essa conferência.
