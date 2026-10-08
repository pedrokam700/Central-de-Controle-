# HANDOFF MESTRE — CENTRAL A-MES

Atualizado em: 08/10/2026
Versão de trabalho: **V0.5.20**
Baseline validada em fábrica: **V0.5.18** (`SHA-256 aad6cdca35fe0c493e2febfca78b02c0abd5adcd335647d7b97eedc79da85e75`)

## Regra de continuidade

Antes de alterar o projeto, ler este arquivo e `ESTADO_ATUAL.json`. GitHub/documentação é o registro persistente; testes reais de fábrica são a evidência final. Nunca marcar versão/GATE como GREEN sem o teste exigido do usuário.

Modo de trabalho: **teste real → causa exata → correção → pacote completo → teste do usuário → GREEN somente com evidência**. Não reabrir arquitetura já decidida sem regressão ou evidência nova.

## Objetivo

Central de Trabalho com agente A-MES offline/local no notebook. Poucos cliques na interface; complexidade fica no agente. Coletar e cruzar 3028 → 3074 → 2114 → 3022, persistir em SQLite, alimentar Central/CORA e manter Excel como export opcional.

## Ambiente validado

- Ethernet: rede/internet normal.
- Wi-Fi OPPO: `TAXXX_5G`.
- Rota específica temporária para A-MES `172.29.185.215`.
- Chrome dedicado com perfil separado e CDP `127.0.0.1:9222`.
- Agente local `127.0.0.1:8765`.
- Login A-MES manual; senha não vai para código/SQLite.
- Execução em segundo plano, com coleta MES serial para evitar conflito no ExtJS/sessão.

## Linhas físicas

- Linha 1 = `TAN10101`
- Linha 2 = `TAN10102`
- Linha 3 = `TAN10103`

Regra dura: FPY, Check FPY, Top 3, falhas, snapshots e histórico operacional são **sempre separados por linha**. Uma coleta conjunta pode existir, mas a análise nunca soma as linhas.

## 3028

- Coleta direta ExtJS/backend validada em fábrica.
- Endpoint detalhado conhecido: `service/AwipViewFpyInquireDetailList.json`.
- Resumo oficial vem do próprio MES; FPY não deve ser reconstruído apenas pelo número de linhas detalhadas.
- `resumo != detalhe` pode ser válido: uma unidade pode ter múltiplas ocorrências de falha.
- Fluxo visual robusto: preencher Line/data/hora → View → selecionar linha-resumo → detalhe inferior carregado.
- Janela de rotina diária: 07:00 → 07:00.
- V0.5.17 provou coleta multi-linha serial e snapshots independentes.
- V0.5.18 foi validada pelo usuário com seletor `Linha 1 | Linha 2 | Linha 3` e uma linha em foco.

Status 3028/UI: **GREEN**.

## 3074

Consulta PCBA/componentes e histórico de bindings.

Regras preservadas:
- `Batch Count` não é número de usos.
- Uso real vem de associações/ciclos distintos.
- Para material montado na hora da falha, usar Bind/Unbind Time em relação ao Defect Time.
- Distinguir uso na falha, reusos antes da falha e usos conhecidos hoje.
- “2 usos + 1 falha” é válido.
- Usar o termo **PCBAs desvinculadas**.

Evidência visual recebida confirma `AWIP3074-Vw Auto Scan Sn`, rota `UAWIP.form.VwAutoScanSnView`, consulta por Barcode/SN e grid com Barcode, Sn Type, Batch Id, Sn Seq, Batch Count, Mat Gear, Order Id, Line Id, Operation, Product Model, Product Id, Whether to use, Prod Time, SN Name, Material Code etc.

## 2114

Fonte principal de histórico de falhas da PCBA.

- Para cada PCBA atual da 3028, coletar todos os históricos da própria PCBA.
- Para materiais reutilizados, consultar também PCBAs desvinculadas.
- `Repair Status=N` + Defect Type vazio = ainda não analisado/finalizado.
- `MainBoard + N` = aguardando reparo de placa.
- `MainBoard + Y` = reparo de placa concluído.
- `Phone_Disassembly + Y` = fluxo concluído.
- Outros Defect Types devem ser preservados.
- Estado atual vem da ocorrência relevante mais recente.

Evidência visual confirma OPC separado, `AWIP2114-Tr Defect Lot By Hand`, rota `UAWIP.form.TrDefectLotByHandView`, Shift 1 `07:30-17:30`, Shift 2 `17:30-07:30`, campo `SN/IMEI` e grid de `Lot Id`, `Defect Hist Seq`, `Defect Location`, `Defect Material ID`, `Defect Code`, `Defect Description`, `Defect Oper`, `Repair Status`, `TestTools Auto Defect Or Defect By Hand`, `Defect Type`.

## 3022

Evidência nova recebida do usuário:
- view: `AWIP3022-Vw View Lot History`;
- rota observada: `UAWIP.form.VwViewLotHistoryView`;
- entrada: `SN / IMEI / A-S`;
- campos superiores identificam a peça;
- grade inferior mostra histórico de passagem/operação, incluindo Current Oper/Current Oper Code, Working Oper, Station, Tran User e Tran Time (nomes podem variar na release real).

Regra temporal continua: usar o último evento de processo válido **anterior ao Defect Time**, nunca o evento mais recente absoluto.

Referências conhecidas: A5100, A5150, A5162, A5202, A5265.

Status 3022: **adapter candidato; NÃO GREEN até teste real**.

## V0.5.19

Foi criada como primeiro candidato 3074 + 2114 sobre snapshots 3028, mas o usuário informou que **não chegou a testá-la**. Portanto não é GREEN e foi incorporada/supersedida pelo candidato V0.5.20.

## V0.5.20 — candidato atual

Mantém integralmente a baseline V0.5.18 e incorpora a integração 3074/2114 da V0.5.19 com estas melhorias:

- ação `Coletar 3074 + 2114 agora` visível dentro da própria página Rastreabilidade;
- preparação automática da `AWIP3074-Vw Auto Scan Sn` dentro da aba principal A-MES;
- reutilização/abertura do OPC e preparação da `AWIP2114-Tr Defect Lot By Hand`;
- login continua manual; senha nunca é armazenada;
- tentativa segura de selecionar o Shift 2114 pelo turno atual; se o MES não aceitar, o erro pede seleção manual explícita;
- Rastreabilidade ganhou resumo por Linha 1/2/3 e uma linha em foco, seguindo o padrão visual aprovado da 3028;
- histórico 2114 mostra também Defect Location e Defect Material ID;
- nova página `Consulta por SN`: bipar/digitar uma única PCBA ou Material SN e cruzar 3074 + 2114;
- consulta individual tenta ainda enriquecer com 3022, sem bloquear 3074/2114 se o adapter 3022 falhar;
- 3028, snapshots, SQLite, Top 3, FPY, fila serial e Excel V0.16 não foram redesenhados.

Pacote atual: `AMES_Central_Offline_V0_5_20_CONSOLIDADA_FABRICA.zip`
SHA-256: `8aebf57443c140cd2e44a171628f8ac1974bb0315605ce90338af759957acbb6`
Library: `/Central de trabalho/AMES_Central_Offline_V0_5_20_CONSOLIDADA_FABRICA.zip`

Validação local do build:
- Python: OK;
- JavaScript: OK;
- V0.16: 48/48 testes;
- TEAM_LINES_OK;
- AGENT_RUNTIME_OK;
- UI HTTP: OK.

## Gate atual

1. Abrir V0.5.20 na fábrica.
2. Em Rastreabilidade, clicar `Coletar 3074 + 2114 agora`.
3. Confirmar abertura/preparação automática 3074 e OPC/2114.
4. Validar uma PCBA atual e, se disponível, um material reutilizado com PCBA desvinculada conhecida.
5. Abrir `Consulta por SN`, bipar uma PCBA e validar Resumo / 3074 / 2114.
6. Repetir com Material SN reutilizado.
7. Observar se 3022 retorna View Lot History; se não, registrar print/erro para o próximo hotfix.

Status: **V0.5.20 EM VALIDAÇÃO DE FÁBRICA — NÃO GREEN.**
