# A-MES Offline V0.5 — base estável pré-validação de fábrica

## Melhorias novas
- Configuração do posto dentro da interface: linhas padrão, início do dia, intervalo, host A-MES e retenção de backup.
- Checklist visual de prontidão: agente, motor, Chrome dedicado, rede A-MES, adapter 3028 e adapter 3022.
- Backup SQLite automático diário ao iniciar + backup manual.
- Auditoria local para start/config/monitor/backup/refresh.
- Evolução do dia no Top 3 & FPY baseada nos snapshots da mesma janela.
- Abertura da Central não inicia um segundo agente se ele já estiver rodando.
- Instalação padronizada em Python 3.12 para evitar wheels incompatíveis entre notebooks.
- Preparador offline inclui Python 3.12 + wheels + Chrome Enterprise 64-bit.
- Atalho de desktop e pacote de suporte sem dados de produção.
- Diretriz de multi-notebook: SQLite local por padrão; não usar arquivo SQLite multiwriter em compartilhamento de rede.

## Validado fora da fábrica
- 48 testes do motor V0.16 GREEN.
- `agent.py`, `store.py`, `engine_bridge.py` e `ames_3028.py` compilam.
- JavaScript da interface passa no parser do Node.
- Health API do agente V0.5 responde.
- Endpoint de evolução (`/trends`) responde.
- Backup SQLite consistente em smoke test.

## Ainda depende do ambiente real
- download automático do Detailed Report Of FPY da 3028;
- mapeamento real da 3022/AT;
- Chrome dedicado minimizado durante coleta longa;
- coexistência/rota rede normal + OPPO;
- paralelismo maior que 1 worker.
