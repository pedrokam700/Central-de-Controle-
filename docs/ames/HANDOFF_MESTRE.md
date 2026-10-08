# HANDOFF MESTRE — CENTRAL A-MES

Atualizado em: 08/10/2026
Versão de trabalho: **V0.5.18**
Base preservada: **V0.5.17** (`SHA-256 7105b70eb081ff9d468d3b8e5d866932d1891a6b664211171a292d8b4ff83ab8`)

## Regra de continuidade

Antes de alterar o projeto, ler este arquivo e `ESTADO_ATUAL.json`.

Modo de trabalho: **teste real → causa exata → correção → pacote completo → teste do usuário → GREEN somente com evidência**.

Não reiniciar a arquitetura nem reconstruir coisas já decididas sem regressão ou evidência nova. Testes locais/CI não substituem o gate real quando ele depende do A-MES da fábrica.

## Objetivo

Central de Trabalho com agente A-MES offline/local no notebook. A interface deve ter poucos cliques; a complexidade fica no agente. Fluxo alvo: **3028 → 3074 → 2114 → 3022 → correlação → SQLite → Central/CORA → Excel opcional**.

## Ambiente validado

- Ethernet = rede/internet normal.
- Wi-Fi OPPO = `TAXXX_5G`.
- Rota específica temporária para `172.29.185.215` permite Ethernet + A-MES simultaneamente.
- Chrome dedicado com perfil separado e CDP `127.0.0.1:9222`.
- Agente local `127.0.0.1:8765`.
- Login A-MES manual; senha não deve ser salva em Python/SQLite.
- Execução em segundo plano.
- Acesso ao MES serial para evitar conflito no ExtJS/sessão.

## Linhas físicas

- Linha 1 = `TAN10101`
- Linha 2 = `TAN10102`
- Linha 3 = `TAN10103`

Regra dura: **FPY, Check FPY, Top 3, falhas, snapshots e histórico operacional permanecem separados por linha.** Nunca somar as linhas para análise operacional.

## 3028

- Coleta direta ExtJS/backend validada em fábrica.
- Endpoint detalhado conhecido: `service/AwipViewFpyInquireDetailList.json`.
- Resumo oficial vem do próprio MES; FPY não deve ser reconstruído só pelo número de linhas detalhadas.
- `resumo != detalhe` pode ser válido: uma unidade pode ter múltiplas ocorrências de defeito.
- Fluxo visual robusto: preencher Line/data/hora → View → selecionar linha-resumo → grid detalhado inferior carregado.
- Janela diária: `07:00 → 07:00`.
- V0.5.17 provou em teste real que é possível puxar mais de uma linha. Coleta permanece serial e snapshots independentes.

## V0.5.18 — alteração aprovada e implementada

Não redesenhar o motor multi-linha da V0.5.17. A V0.5.18 muda principalmente a UI:

- seletor/tabs `Linha 1 | Linha 2 | Linha 3`;
- apenas uma linha em foco;
- outras linhas ficam compactas no seletor;
- painel focado mostra FPY, Check FPY, Quantity, ocorrências, Repair N, removidas, Top 3, última coleta, status e atualização individual;
- ação geral `Atualizar todas as linhas`;
- coleta continua serial `TAN10101 → TAN10102 → TAN10103`.

**STATUS: PENDENTE DE VALIDAÇÃO DE FÁBRICA. NÃO GREEN.**

## 3074

Consulta PCBA/componentes e histórico de bindings.

Regras:
- `Batch Count` não é número de usos.
- Uso real = associações/ciclos distintos.
- Para material montado na hora da falha, usar Bind Time/Unbind Time em relação ao Defect Time.
- Distinguir `Uso na falha`, `Reusos antes da falha` e `Usos conhecidos hoje`.
- “2 usos + 1 falha” é válido: reuso não significa recorrência.
- Preferir o termo **PCBAs desvinculadas**.

## 2114

Fonte principal de histórico de falhas da PCBA.

- Para cada PCBA atual da 3028, coletar todos os históricos da própria PCBA.
- Para materiais reutilizados, consultar também PCBAs desvinculadas.
- `Repair Status=N` + Defect Type vazio = ainda não analisado/finalizado.
- `MainBoard + N` = enviado/aguardando reparo de placa.
- `MainBoard + Y` = reparo de placa concluído.
- `Phone_Disassembly + Y` = fluxo concluído.
- Outros Defect Types devem ser preservados exatamente.
- Estado atual vem da ocorrência relevante mais recente; históricos anteriores continuam visíveis.

## 3022

Próxima grande etapa depois de 3074/2114 automático.

- Timeline dos postos/processos.
- Regra temporal: usar o último evento/processo válido **anterior ao Defect Time**, não o evento mais recente absoluto.
- Referências já conhecidas: A5100, A5150, A5162, A5202 e A5265.
- Exemplos: impureza de câmera → A5162; P-sensor/receiver de pré-montagem → A5100; A5202 = teste de corrente; A5265 em diante = área de teste.

## Correlação

Nunca afirmar que um componente causou a falha sem evidência.

Classificações:
- `MESMA_FALHA`
- `MESMA_FAMILIA`
- `FALHA_DIFERENTE`
- `SEM_HISTORICO`

Reuso e recorrência são conceitos separados.

## Excel V0.16 congelado

Padrão aprovado:
1. `INDICADORES`
2. `ANALISE`
3. `HIST_PCBA`
4. `HIST_MATERIAL`
5. `BASE_DADOS`
6. `DETALHES_INDICADORES`

Tabelas planas, sem agrupamentos/linhas ocultas. Cada material reutilizado continua em coluna própria na visão de análise. Excel é export opcional, não o mecanismo primário de monitoramento.

## Gates atuais

1. Validar V0.5.18 no notebook: tabs Linha 1/2/3 + uma linha em foco.
2. Confirmar que trocar a aba não dispara coleta e não mistura dados.
3. Confirmar atualização individual por linha.
4. Confirmar `Atualizar todas as linhas` serialmente e sem conflito.
5. Confirmar Excel equipe.
6. Depois ligar 3074 + 2114 automaticamente aos PCBAs da 3028.
7. Depois 3022 real e motor de correlação.

## Artefato atual

- `AMES_Central_Offline_V0_5_18_CONSOLIDADA_FABRICA.zip`
- SHA-256 `aad6cdca35fe0c493e2febfca78b02c0abd5adcd335647d7b97eedc79da85e75`
- Library: `/Central de trabalho/AMES_Central_Offline_V0_5_18_CONSOLIDADA_FABRICA.zip`
