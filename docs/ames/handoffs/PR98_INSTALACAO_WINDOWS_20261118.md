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
