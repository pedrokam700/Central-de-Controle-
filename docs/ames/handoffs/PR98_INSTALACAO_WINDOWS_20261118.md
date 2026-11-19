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
