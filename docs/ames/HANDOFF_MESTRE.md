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

### Evidência real V0.5.20 — 08/10

- A navegação automática chegou à 3074.
- A consulta está realmente rodando e o grid retornou linhas reais.
- Portanto **abertura/navegação e leitura 3074 têm evidência positiva**.
- O lote usado pelo usuário tinha muitas PCBAs e está demorando bastante; não usar esse tempo isoladamente como prova de regressão antes de medir quantidade de consultas e tempo por consulta.

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

### Evidência real V0.5.20 — 08/10

- A navegação automática abriu a 2114 no OPC.
- A seleção automática de Shift falhou na primeira tentativa e a Central mostrou corretamente a mensagem pedindo seleção manual.
- O usuário selecionou `1st Shift` manualmente.
- Ainda **não existe evidência de coleta de histórico 2114 concluída nesta rodada**.
- Importante: na implementação atual, o deep trace termina TODO o estágio 3074 antes de iniciar o estágio 2114. Portanto ver a 2114 vazia enquanto a 3074 ainda está processando muitas PCBAs é comportamento esperado; não significa por si só falha da 2114.

## 3022

Evidência recebida do usuário:
- view: `AWIP3022-Vw View Lot History`;
- rota observada: `UAWIP.form.VwViewLotHistoryView`;
- entrada: `SN / IMEI / A-S`;
- campos superiores identificam a peça;
- grade inferior mostra histórico de passagem/operação, incluindo Current Oper/Current Oper Code, Working Oper, Station, Tran User e Tran Time (nomes podem variar na release real).

Regra temporal continua: usar o último evento de processo válido **anterior ao Defect Time**, nunca o evento mais recente absoluto.

Referências conhecidas: A5100, A5150, A5162, A5202, A5265.

Status 3022: **próxima etapa; NÃO GREEN até teste real**.

## V0.5.20 — checkpoint funcional preservado

Pacote atual: `AMES_Central_Offline_V0_5_20_CONSOLIDADA_FABRICA.zip`
SHA-256: `8aebf57443c140cd2e44a171628f8ac1974bb0315605ce90338af759957acbb6`
Library: `/Central de trabalho/AMES_Central_Offline_V0_5_20_CONSOLIDADA_FABRICA.zip`

Esta versão deve permanecer disponível como checkpoint funcional do dia. Ela **não é GREEN como pipeline 3074+2114 completo**, mas já tem evidência de que a navegação/consulta 3074 funciona e de que a navegação até 2114 funciona.

## Requisitos aprovados para o próximo candidato

### Controle do escopo da coleta

A tela deve permitir escolher explicitamente o que será aprofundado, sem obrigar sempre um lote enorme:
- uma, duas ou três linhas;
- todas as falhas do snapshot;
- uma falha específica;
- múltiplos códigos/falhas selecionados;
- quantidade limitada/amostra (ex.: 1, 5, 10 PCBAs) para validação rápida;
- modo completo para fechamento/relatório.

### Progresso real

3074 e 2114 devem mostrar progresso separado, com **percentual + atual/total + item atual**, por exemplo:
- `3074 · 18/72 PCBAs · 25%`;
- `2114 · 4/31 histórias · 13%`.

Não usar porcentagem decorativa fixa; o número deve vir do plano real/checkpoint.

### Performance

Antes de “acelerar” removendo segurança, medir:
- tempo médio de consulta 3028 por linha;
- tempo de consulta PCBA na 3074;
- quantidade de componentes que geram novas consultas 3074;
- tempo de consulta 2114 por PCBA;
- quantas consultas foram reaproveitadas por checkpoint/memo.

Priorizar cache/dedup/checkpoint e eliminação de esperas fixas desnecessárias. Continuar serial contra o MES até prova de que concorrência é segura.

### Shift 2114

Tornar a seleção automática de Shift robusta. Enquanto isso, seleção manual é fallback explícito e seguro.

### Pacote de instalação para outros usuários

A Central principal terá um acesso discreto/administrativo, idealmente em **Configurar posto → Instalação A-MES**, para baixar o pacote completo uma única vez. Não deve ocupar a navegação operacional diária.

### Compartilhamento entre computadores/usuários

Objetivo aprovado: um notebook dentro da fábrica continua sendo o coletor local do A-MES, enquanto usuários fora da rede OPPO podem ver **dados já coletados** pela Central.

Regra técnica:
- SQLite/local continua fonte operacional para coleta MES;
- sincronização para a Central deve ser assíncrona e não bloquear a operação local;
- usar fila/outbox persistente: sem internet/cloud, dados ficam aguardando e a coleta continua;
- compartilhar snapshots, indicadores, falhas, rastreabilidade e dados derivados permitidos;
- **nunca sincronizar senha, cookie/sessão A-MES ou acesso direto à rede OPPO**;
- cloud não deve ser requisito para a automação funcionar;
- comandos remotos que disparem nova consulta MES, se existirem no futuro, devem ser uma camada separada e explicitamente controlada.

## Próxima ordem

1. Deixar o deep trace V0.5.20 atual terminar sem interromper.
2. Confirmar se, depois de 3074, ele realmente entra em 2114 e coleta histórico.
3. Próximo candidato: filtros de escopo + progresso real + hardening de Shift + medições de performance.
4. Depois integrar/validar 3022 real.
5. Depois correlação final e sincronização controlada com a Central.

**Status geral: V0.5.20 é checkpoint funcional preservado, mas 3074+2114 ainda NÃO estão GREEN como gate completo.**
