# Central + A-MES Offline V0.5 — arquitetura operacional

## Princípio
A interface deve ser simples, mas a execução não deve ser acoplada ao navegador da Central.

```text
Central/UI local
  -> API localhost 127.0.0.1:8765
Agente Python
  -> jobs, monitor, checkpoints, SQLite, backup, export
Chrome dedicado
  -> sessão A-MES separada
A-MES
  -> 3028, 3074, 2114, 3022
```

## Fonte de verdade
SQLite local é a fonte operacional. Excel é uma exportação e a CORA usa um índice regenerável derivado do SQLite.
O payload bruto extraído também é preservado para permitir evolução do schema sem perder evidência.

## Linhas
`Line Id` acompanha snapshots, falhas e contexto de correlação. Coleta conjunta é permitida; análise operacional conjunta não é padrão.
Top 3, FPY, tendências e alertas são calculados por linha.

## Tempo
Existem pelo menos três relógios diferentes:
- montagem/processo: 3022;
- detecção/caracterização: 3028/2114;
- AT/reparo: 3022/2114.

O Defect Time não deve ser reinterpretado como horário de montagem.

## Snapshot e reconciliação
A mesma janela lógica (ex.: hoje 07:00 -> agora) recebe vários snapshots. Isso permite acompanhar:
- novas falhas;
- falhas que continuam;
- N -> Y;
- mudança de Defect Type;
- falhas que desaparecem após atuação do AT;
- mudança do FPY e do Top 3.

Uma falha removida do export não é automaticamente classificada como falsa; o fato registrado é que ela deixou de aparecer na fonte.

## Distribuição
O pacote V0.5 possui instalador único, venv isolado, preparação offline, Chrome dedicado, atalho de desktop, diagnóstico, backup e pacote de suporte sem dados de produção.

## Rede
Separar perfil do Chrome é possível e recomendado. Separar fisicamente a rede por processo de navegador não é função do Chrome.
A rota de `172.29.185.215` pertence ao Windows. A arquitetura aceita coexistência de rede normal + OPPO se a política e a configuração de rede permitirem, mas não cria rota persistente antes da validação no ambiente real.

## Continuidade e segurança
- backup SQLite diário no start + manual;
- retenção configurável;
- perfil Chrome separado;
- sem senha no código;
- agente apenas em loopback por padrão;
- CORS não fica aberto para qualquer site; futuras origens da Central precisam ser explicitamente autorizadas;
- pacote de suporte não inclui SQLite, SNs ou exports;
- histórico de auditoria local registra ações estruturais (start, config, monitor, backup, refresh).

## Próxima validação de fábrica
1. 3028: localizar campos, executar consulta e automatizar o download do Detailed Report Of FPY.
2. 3022: mapear grid/store, estações de montagem e estações de AT.
3. Teste em segundo plano/minimizado.
4. Diagnóstico da rota Windows para o host A-MES.
5. Teste de performance: serial -> 2 workers somente com evidência de estabilidade.

## Mais de um notebook / futuro compartilhamento
Cada notebook usa seu SQLite local por padrão. Não colocar o arquivo `.sqlite3` diretamente em pasta de rede compartilhada para vários escritores: isso aumenta risco de bloqueio/corrupção e mistura responsabilidade de coleta.

Se depois for necessário que várias pessoas consultem uma base única, a evolução correta é um **nó coletor interno** (um agente/serviço único na LAN OPPO) expondo API para as Centrais, ou um banco servidor interno como PostgreSQL. Os notebooks viram clientes. O schema atual já usa chaves de linha/snapshot e pode migrar para esse modelo sem alterar a lógica das telas.
