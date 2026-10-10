# Console MES R12 — Paridade nativa e gate de aceitação

Este documento é o checklist de regressão da migração do A‑MES/automação local para a Central V2. Ele não substitui a validação física no posto.

## Regra de arquitetura

A solução final é **uma Central**, não “Central + automação embutida”.

Fluxo alvo:

`motor local validado → agente canônico → state.ames → 9 views → páginas gerais da Central → sync/CORA`

Regras obrigatórias:

- um Auth;
- um `state.ames`;
- um agent client;
- um scheduler global;
- um SQLite operacional;
- sem iframe, Shadow DOM executando a UI antiga, `new Function`, segunda aplicação ou segundo agente;
- V0.5.22/V0.5.23/R12 são referência visual e funcional, não runtime paralelo;
- leitura remota significa dados já coletados; nunca comando remoto do A‑MES;
- senha, cookies, sessão A‑MES, CDP e credenciais Wi‑Fi nunca entram no Firebase/SQLite/sync.

## Baseline visual

A interface nativa deve preservar o nível da automação R12/V0.5.22:

- sidebar escura compacta e navegação das 9 views;
- topbar enxuta com estado real do agente;
- alta densidade de informação sem virar tabela genérica;
- cards, filtros, toolbars, tabelas e estados vazios consistentes;
- ações operacionais principais visíveis; configuração avançada sem poluir a rotina diária;
- desktop e mobile sem overflow estrutural;
- “mais bonito” nunca pode significar menos função.

## 9 views obrigatórias

### 1. Monitoramento

- Fechar/atualizar dia anterior;
- Monitorar hoje / atualizar agora;
- iniciar/parar monitor;
- atualizar estados N/Y;
- rastrear 3074 + 2114 + 3022 quando suportado;
- Excel;
- seleção de linhas independente;
- Central das Linhas;
- ferramentas avançadas, importação, backup, Chrome/CDP e configuração do posto.

### 2. Top 3 & FPY

- seletor Linha 1/2/3;
- CPH exato;
- FPY;
- Check FPY;
- Quantity;
- ocorrências;
- Top 3;
- snapshot/origem/cobertura;
- evolução por snapshots;
- Repair N/Open quando houver evidência.

### 3. Falhas

- linha;
- busca por SN/código/descrição;
- Repair N / Repair Y / removida do export;
- PCBA;
- Defect Time;
- código/descrição;
- CPH;
- Manual/Automatic;
- Defect Type;
- comentário/estado disponível.

### 4. Consulta por SN

Resultado investigativo único, não JSON dump:

- falha atual da PCBA;
- falhas antigas da própria PCBA;
- materiais 2º+ uso;
- PCBAs anteriores/desvinculadas;
- 3074;
- 2114;
- 3022 quando houver evidência;
- processo/horário separado de Defect Time;
- PCBA reuse separado de Material SN reuse;
- mesma falha/mesma família somente quando comprovável.

### 5. Rastreabilidade

Modos:

- `full`;
- `process_only`;
- `reuse_only`.

`process_only` é **fail-closed**: fica indisponível se o agente não declarar `process_timeline=true`. `full` deve informar explicitamente quando 3022 não estiver disponível, em vez de fingir coleta completa.

### 6. Dashboards de reuso

Continua separado do Dashboard geral.

Indicadores e drill-downs devem distinguir:

- PCBA 2º uso;
- PCBA 3º+;
- falha anterior;
- mesma falha;
- mesma família;
- Material SN 2º/3º+;
- PCBAs anteriores/desvinculadas;
- vínculos/correlação material↔PCBA.

Ao clicar em KPI com evidência, mostrar/highlight o **item exato** que sustenta a contagem. `Batch Count` nunca é contado como número de usos.

### 7. Processo / 3022 & AT

Regra temporal obrigatória:

`ocorrência atual → Defect Time → posto relevante → última passagem válida <= Defect Time`

Nunca usar o evento absoluto mais recente se ele ocorreu após a falha.

Manter separado:

- Defect Time;
- montagem/processo;
- teste;
- detecção;
- reparo/AT;
- retorno à linha;
- múltiplas passagens/retrabalhos.

Contextos conhecidos A5100/A5150/A5162/A5201/A5202/A5265/A5700/A7600 são evidência de processo e nunca prova automática de causa.

### 8. Base local

- SQLite/datasets;
- `defects`/3028;
- `pcba_history`/2114;
- `material_reuse`/3074;
- `process_events`/3022;
- `process_defect_contexts`;
- jobs;
- tendências;
- busca;
- backup;
- Excel.

### 9. CORA conhecimento

Separar explicitamente:

1. fato/evidência observada;
2. correlação;
3. hipótese;
4. causa confirmada por humano/auditável.

Timing ou estação correlacionada não vira causa automaticamente.

## Isolamento de linha e identidade

- Linha 1 = `TAN10101`;
- Linha 2 = `TAN10102`;
- Linha 3 = `TAN10103`.

FPY, Check FPY, Quantity, Top 3, ocorrências, histórico, reuso e processo permanecem separados por linha.

CPH é exato: `CPH2859` != `CPH2859V`.

Dados ausentes/parciais não viram zero.

## Semântica 2114

- Shift 1 = 07:30–17:30;
- Shift 2 = 17:30–07:30;
- seleção automática de Shift é gate físico;
- Manual/Automatic = modo de registro após reteste/caracterização, não tipo de reparo;
- Repair Status=N + Defect Type vazio = não finalizado/analisado;
- MainBoard + N = aguardando/enviado para reparo de placa;
- MainBoard + Y = reparo de placa concluído;
- Phone_Disassembly + Y = fluxo concluído;
- outros Defect Types devem ser preservados.

## Estado técnico desta branch

Implementado em código:

- [x] shell nativa full-screen;
- [x] 9 views nativas sobre o mesmo `state.ames`;
- [x] Wave 1 — Monitoramento, Top 3 & FPY, Falhas;
- [x] Wave 2 — SN, Rastreabilidade, Processo/3022;
- [x] Wave 3 — Reuso, Base local, CORA conhecimento;
- [x] Wave 4 — contexto MES no Dashboard geral e Central do Dia;
- [x] runtime paralelo V0.5.23 removido fisicamente da branch;
- [x] cache offline contém apenas módulos nativos ativos;
- [x] `process_only` bloqueado quando `process_timeline` não é declarado;
- [x] consulta SN mantém tentativa 3022 individual com aviso explícito quando a fonte não entrega evidência;
- [x] endpoint cliente `/preflight` removido enquanto não existe contrato canônico correspondente;
- [x] coletor 3028 existente não reescrito.

Ainda não pode ser marcado GREEN:

- [ ] motor 3022-R12 incorporado ao agente canônico e versionado;
- [ ] Shift automático 2114 provado no posto;
- [ ] 3022 real validado em casos com múltiplas passagens/retrabalho;
- [ ] `process_only` real validado com agente que declara 3022 em lote;
- [ ] benchmark 3028/3074/2114/3022 por linha;
- [ ] bootstrap/reboot validado no notebook da fábrica;
- [ ] 9/9 desktop no posto;
- [ ] mobile sem regressão;
- [ ] aprovação explícita do usuário antes de merge/publish.

## Gate físico 9/9

1. Monitoramento: dia anterior, hoje, monitor recorrente e N/Y.
2. 3028: L1/L2/L3 independentes; FPY/Check FPY/Quantity/Top3; nenhum vazamento entre linhas.
3. 2114: Shift automático, sem seleção manual de OPC.
4. 3074/2114/3022: coleta real completa.
5. `process_only`: 3022 sem reuso.
6. `reuse_only`: 3074/2114 sem 3022.
7. Consulta SN: atual + antigas + Material 2º+ + PCBA anterior + 3022.
8. Reuso: KPI abre o item exato.
9. Processo/3022: Defect Time separado de processo, múltiplas passagens corretas, A5162/A7600, cover rework/A5201 e corte principal até A5700.

Além do 9/9 funcional: cancelamento/concorrência, Excel/Base local/CORA, desktop/mobile, reboot/bootstrap e performance.

## Regra de promoção

CI verde e preview READY são necessários, mas **não promovem a V2 sozinhos**. Merge para `main`, produção ou publicação de regras só acontecem após evidência física e autorização explícita.
