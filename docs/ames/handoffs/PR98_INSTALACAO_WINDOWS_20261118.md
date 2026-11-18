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
