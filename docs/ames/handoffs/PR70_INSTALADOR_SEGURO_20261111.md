# PR70 — Teste da Consulta por SN com troca supervisionada e dados preservados

## Motivação

O usuário precisava validar a correção de técnicos A6900 e comentários 3012
com o histórico local real da PCBA; uma CLEAN nova sem SQLite tornava o pacote
anterior impróprio para esse ensaio. O procedimento anterior `01_TROCAR` apenas
alternava o agente, sem transferir dados, e poderia aparentar perda de histórico.

## Mudanças

- `01_TROCAR.bat` é o acesso direto à troca supervisionada já existente,
  sem pedir que o operador digite uma palavra secreta.
- O preparador `/prepare` monta `.venv` e dependências antes de parar o agente
  antigo, **sem** criar `config.json`, token ou banco SQLite novo.
- O coordenador mantém a inspeção de agente/guardian/porta, tarefas e serviços,
  SHA do pacote, rede e coletas observadas. Exige confirmação do operador.
- Após parar apenas PIDs verificados, integra `SAFE_STATE_TRANSFER.py` para
  criar um backup privado, validá-lo, ensaiar restauração, transferir SQLite,
  configuração, token e dados operacionais para a pasta nova e verificar
  identidade de origem. O diretório antigo nunca é sobrescrito.
- Em falha pós-parada, restaura o registro de inicialização e tenta religar
  somente a instalação antiga comprovada. Não mata PID desconhecido nem
  remove a pasta candidata, backup ou estado anterior. `ROLLBACK_ANTIGO=MANUAL`
  significa bloqueio, não permissão para forçar a instalação.
- Scripts de teste sintético de preservação e contrato de sequência; workflow
  Windows isolado para sintaxe PowerShell, identidade de launcher e ACL privada.

## Limites e validação pendente

- O teste sintético verifica SQLite e arquivos locais; não comprova rede
  TAXXX_5G, PowerShell na máquina OPPO, Guardian concreto ou credenciais MES.
- O navegador/Firestore mantém outbox separado; o agente não consegue atestar
  sua sincronização. O operador deve concluir/confirmar sincronizações antes
  da troca. Não coletar durante a manutenção.
- O backup cobre o estado do agente; não cobre dados remotos ou pastas MES
  externas. Antiga instalação e backup devem ficar preservados até o aceite.
- Gates de CI e validação física são distintos. Não marcar produção GREEN
  antes de confirmar versão, quantidade de snapshots, reuso e alertas com
  histórico real no posto, além de rollback em ensaio supervisionado.
