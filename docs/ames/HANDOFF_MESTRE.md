# HANDOFF MESTRE — CENTRAL A-MES

Atualizado em: 08/10/2026
Versão de trabalho: **V0.5.21**
Baseline validada em fábrica: **V0.5.20** (`SHA-256 8aebf57443c140cd2e44a171628f8ac1974bb0315605ce90338af759957acbb6`)

## Regra de continuidade

Antes de alterar o projeto, ler este arquivo e `ESTADO_ATUAL.json`. Teste real de fábrica é a evidência final. Modo de trabalho: **teste real → causa exata → correção → pacote completo → teste do usuário → GREEN somente com evidência**.

Não reescrever módulos já validados para resolver um problema adjacente. Acesso ao MES continua serial até existir evidência de que concorrência é segura.

## Ambiente preservado

- Ethernet = rede/internet normal.
- Wi-Fi OPPO = `TAXXX_5G`.
- Rota temporária específica para `172.29.185.215`.
- Chrome dedicado + CDP `127.0.0.1:9222`.
- Agente local `127.0.0.1:8765`.
- SQLite local; nuvem nunca é pré-requisito para coleta.
- Login A-MES manual; senha/cookie/sessão não entram no código, SQLite ou sincronização.

## Linhas

- Linha 1 = `TAN10101`
- Linha 2 = `TAN10102`
- Linha 3 = `TAN10103`

FPY, Check FPY, Top 3, falhas, snapshots e históricos permanecem sempre separados por linha.

## 3028 — GREEN

A coleta direta ExtJS/backend e o motor multi-linha estão validados. A V0.5.18 validou o seletor Linha 1/2/3 e uma linha em foco; a V0.5.20 preservou esse núcleo sem regressão.

Verificação feita antes da V0.5.21: `ames-agent/ames_3028_live.py` e `ames-agent/ames_3028.py` da V0.5.20 eram bit-a-bit iguais aos mesmos arquivos da V0.5.18 validada. Portanto a sensação de lentidão relatada no 3028 não veio de reescrita do coletor.

## 3074 — VALIDADA FUNCIONALMENTE NA V0.5.20

View real: `AWIP3074-Vw Auto Scan Sn` / `UAWIP.form.VwAutoScanSnView`.

Regras:
- Batch Count não é número de usos.
- Reuso é calculado por associações/ciclos e Bind/Unbind Time.
- Distinguir uso na falha, reusos antes da falha e usos conhecidos hoje.
- Usar o termo PCBAs desvinculadas.

Evidência V0.5.20:
- navegação automática chegou à 3074;
- consultas reais ocorreram;
- grids reais retornaram dados;
- a Central persistiu e exibiu materiais/reuso, usos conhecidos e PCBAs desvinculadas;
- o usuário confirmou que a versão anterior à V0.5.21 está funcionando.

O próximo gate da 3074 não é provar funcionamento básico; é validar as otimizações/controles da V0.5.21.

## 2114 — VALIDADA FUNCIONALMENTE NA V0.5.20

View real no OPC: `AWIP2114-Tr Defect Lot By Hand` / `UAWIP.form.TrDefectLotByHandView`.
Shift 1 = `07:30-17:30`; Shift 2 = `17:30-07:30`.

Preservar histórico completo. Estado atual vem da ocorrência relevante mais recente. `Repair Status=N` e Defect Type devem ser interpretados sem apagar estados anteriores.

Evidência V0.5.20:
- navegação automática abriu a 2114 no OPC;
- seleção automática de Shift falhou uma vez; fallback manual para `1st Shift` funcionou;
- a 2114 retornou histórico real de PCBA;
- a Central exibiu contagens/histórico persistido 2114;
- prints finais confirmaram dados como Repair Y/N e histórico associado à PCBA;
- o usuário confirmou a V0.5.20 como funcional.

Pendência conhecida: tornar/validar a seleção automática de Shift mais robusta. Isso é hardening da V0.5.21; não invalida a baseline funcional V0.5.20.

## V0.5.21 — candidato atual

Pacote: `AMES_Central_Offline_V0_5_21_CONSOLIDADA_FABRICA.zip`
SHA-256: `c0e078a49e5e7ab1674dc30a7e30a2127bd29b2e07b5825113d41d7cfc2667fa`
Library: `/Central de trabalho/AMES_Central_Offline_V0_5_21_CONSOLIDADA_FABRICA.zip`
Drive ID do pacote: `1YP5YkwLbmHLyE4H4x5BvLNata3yRao5M`

Mudanças já incluídas:
- seleção de uma, duas ou três linhas;
- todas as falhas ou Defect Codes selecionados;
- limite de ocorrências;
- limite de PCBAs por linha para teste rápido;
- perfis `Equilibrado`, `Rápido` e `Seguro`;
- progresso real 3074/2114 com current/total, percentual, linha e item atual;
- feed ao vivo;
- dados 3074 persistidos por PCBA concluída e 2114 por PCBA/histórico concluído, permitindo aparecer na Central antes do fim do lote;
- memo/cache 3074 compartilhado entre linhas no mesmo job;
- redução de waits fixos na 3074/2114 sem remover a confirmação de SN que evita aceitar grid antigo;
- refresh parcial em vez de recarregar o dashboard a cada componente;
- endpoint local `GET /api/v1/share/export` para resumo sanitizado de dados já coletados.

Validação local do build:
- Python compila;
- JavaScript compila;
- V0.16: 48/48 testes;
- `TEAM_LINES_OK`;
- `AGENT_RUNTIME_OK`;
- testes de escopo/progresso/share payload passaram;
- ZIP íntegro.

**STATUS: V0.5.21 NÃO GREEN até teste de fábrica.**

## Compartilhamento entre computadores

Arquitetura aprovada:

notebook da fábrica → coleta A-MES local → SQLite → sincronização de dados sanitizados já coletados → Firebase → usuários autenticados fora da rede OPPO.

Pode compartilhar: snapshots/resumos, FPY, Top 3, falhas, contagens/resultado permitido de 3074/2114 e depois 3022/correlações.

Nunca compartilhar: senha, cookies, sessão A-MES, CDP, credenciais ou capacidade direta de entrar na rede OPPO.

### Bridge publicado como candidato

- Vercel project: `central-ames-bridge`
- production alias: `https://central-ames-bridge.vercel.app`
- deployment: `dpl_DPCm1m9Dqx7uPu33Rk9AADHJJJ35`
- estado Vercel: `READY`
- autenticação: Firebase Auth do projeto `central-de-controle-88962`
- persistência candidata: coleção existente `aiKnowledge`, documentos `kind=ames_shared_snapshot`
- upload do notebook lê apenas `/api/v1/share/export`; não executa consulta MES remota.
- seção discreta `Instalação do posto · uso único` contém o download do pacote V0.5.21.

A existência/deploy do bridge está confirmada, mas **login + gravação/leitura real + sincronização a partir do notebook da fábrica ainda NÃO foram validados end-to-end pelo usuário**. Não declarar essa parte GREEN.

## Instalador

O pacote de novo posto já está disponível no bridge em um bloco recolhido `Instalação do posto · uso único`, fora do fluxo diário. Depois da validação da bridge, a entrada pode opcionalmente ser incorporada também à Central principal.

## 3022 — próxima etapa

View identificada: `AWIP3022-Vw View Lot History` / `UAWIP.form.VwViewLotHistoryView`, entrada `SN / IMEI / A-S`.

Regra temporal: usar o último evento/processo válido anterior ao Defect Time, não o evento mais recente absoluto.

3022 permanece candidato e NÃO GREEN.

## Próximo estado

- **V0.5.20 = baseline funcional validada em fábrica para o núcleo 3028 + 3074 + 2114.**
- **V0.5.21 = candidata atual com controles de escopo, progresso, performance, persistência incremental e bridge; ainda precisa validação real.**
- O usuário pretende pedir novas mudanças agora; preservar a baseline V0.5.20 e incorporar as próximas alterações sem regredir o que já está provado.
