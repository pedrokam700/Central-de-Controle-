# CENTRAL A-MES — CANDIDATA DE TESTE __CANDIDATE_VERSION__

SHA completo: __CANDIDATE_SHA__

**NÃO AUTORIZADO PARA INSTALAÇÃO OPERACIONAL.**
Somente geração, extração e verificação passiva foram autorizadas nesta missão.
Não execute os BAT/CMD/PS1/PY do pacote para iniciar, instalar, reparar rede,
guardian, Chrome, agente, atualização ou rollback. Não abra uma instalação real.

Este é o pacote CLEAN integrado completo da linhagem EEDACC65 → PR96 e correções
de empacotamento posteriores. O último teste entregue foi EEDACC65
eedacc65445dea9967a92085777b878c1ee9c123; a release oficial antiga 0.5.39 não
identifica automaticamente o pacote ou a instalação anterior do usuário.

PACKAGE_IDENTITY.json identifica versão candidata, SHA, frontend/agente/motor,
hashes de componentes e limites. CANDIDATE_MANIFEST cobre todos os membros exceto
ele próprio; LOCAL_BUNDLE_MANIFEST conserva o contrato de assets locais. SHA256
comprova integridade, não assinatura ou homologação física. Os rótulos internos
legados de versão do frontend/agente não substituem o SHA desta candidata.

## Caminho de entrega e instalação FUTURA, não executar agora

O formato é CLEAN completo, não overlay do updater legado. Não executar
update_candidate.py update/rollback com este ZIP: não contém candidate-files.json
nem o conjunto ROOT_FILES daquele formato. Os arquivos originais de suporte,
troca, rede, AT e atualização foram preservados como fontes do produto, sem
atestado de execução operacional ou de rollback após novas escritas.

1. Sob autorização futura específica, identificar somente por leitura a pasta A
   realmente ativa, SHA servido/carregado, guardian/PIDs/porta 8765, origem,
   snapshots/revisões/linhas/períodos e estado de jobs/outbox. Não inferir a raiz
   ativa pelo nome do ZIP, nem escolher 0.5.39 como retorno padrão.
2. Exigir G0–G7, exclusividade externa e backup privado consistente SQLite/WAL,
   evidências externas/configuração/identidade, verificado e ensaiado. Nunca usar
   cópia desidentificada LAB como backup de recuperação.
3. Extrair candidata em pasta NOVA; nunca sobrepor A/C0, copiar banco antigo sobre
   B ou iniciar dois agentes. O caminho histórico de troca é 01_TROCAR.bat →
   01_TROCAR_PARA_PR69_NOVA.bat → TROCAR_PARA_PR69_NOVA.ps1; deve ser qualificado
   no ensaio autorizado antes de qualquer uso. Não executar nesta missão.
4. Launchers normais podem instalar dependências, configurar rede, carregar
   identidade e iniciar serviços; não são entrada LAB. Nesta missão a verificação
   Windows só lê/analisa os arquivos extraídos e faz parsing de PowerShell.
5. Antes de permitir execução, comprovar versão conjunta dos manifestos,
   release-build, CACHE_REVISION, ExpectedSha e módulos servidos/carregados.
   Preservar SQLite/WAL/revisões/históricos/config/token/source_id/outbox; não
   limpar cache/IndexedDB para contornar versão divergente.
6. Se houver problema: R0 sem execução não restaura; R1 exige compatibilidade
   provada com dados ATUAIS em destino novo; R2 com dados novos/estado desconhecido
   é STOP. Preservar C0/A/B e solicitar recuperação supervisionada. Não iniciar A
   com histórico antigo apresentado como atual. P08 sintético não integra esse
   protocolo ao launcher operacional nem prova retorno real seguro.

## Melhorias incluídas e limites

Nove telas, coletas 3028/3074/2114/3012/3022 L1/L2/L3, recuperação/checkpoints,
nomes/papéis, timeline integral, reuso físico 1º/2º/3º, componentes, reincidência,
horários produtivos separados de AT/reparo, FPY/tendências/SN/alertas e performance
foram preservados. Histórico sem prova continua desconhecido; ausência não é zero.
Os handoffs atuais estão em evidence/current/. O motor não é um segundo agente.

P04 núcleo em runners Windows não prova workstation completa: seis dependências
GUI ainda não têm wheels oficiais nas versões auditadas. Não há wheelhouse,
instalador AT offline pronto ou garantia de bootstrap frio offline. As ferramentas
LAB de P02/P04/P08 são fontes separadas no Git do SHA informado; não fazem parte
do boot operacional nem autorizam usar dados reais.

ZIP EEDACC65 original não estava disponível na geração desta candidata; seleção
e fontes Git foram comparadas, sem inventar paridade de seus bytes/CRC.
P02 real, P04 completa/real, P05, P07, P08 real e homologação G0–G7 PENDENTES.
Sem instalação, MES, Firebase, dados fabris, alteração de rede/guardian, deploy,
merge ou release oficial nesta missão.
