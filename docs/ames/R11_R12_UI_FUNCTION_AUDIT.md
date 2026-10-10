# Auditoria de função e interface — R11/R12 → Console MES nativo

Objetivo: impedir que a migração considere “paridade” apenas porque a view existe. Cada controle útil da automação isolada precisa ter equivalente nativo ou uma justificativa técnica verificável para não existir.

## Resultado da revisão

### Monitoramento

| Referência local | Equivalente nativo | Estado |
| --- | --- | --- |
| Atualizar dia anterior | `Atualizar dia anterior` | preservado |
| Atualizar agora | `Atualizar agora` | preservado |
| Iniciar monitoramento | iniciar/parar monitor + intervalo | preservado |
| Rastrear 3074 + 2114 + 3022 | rastreabilidade com capability gate | preservado sem prometer 3022 inexistente |
| Atualizar N/Y | reparos 2114 | preservado |
| Baixar Excel | export Excel | preservado |
| Linha 1/2/3 | seleção + Central das Linhas | preservado |
| Importar Excel 3028 | ferramentas avançadas | preservado |
| Importar JSON integrado | ferramentas avançadas | preservado |
| Atualizar tela | `Atualizar leitura` | preservado |
| Janela customizada | início/fim/turno | preservado |
| Perfis de desempenho | fast / balanced / safe | preservado na versão atual |
| Pipeline 3028/3074/2114/3022 | pipeline nativo ligado ao job/capabilities | restaurado |
| Estado do motor | agente, engine, Chrome, rede, 3022, snapshots | restaurado |
| Configurar posto | atalho direto no topbar → configuração avançada do mesmo agente | restaurado sem segunda aplicação |
| Gate físico | preflight de agente/motor/CDP/rede/SHA/preview + pendências reais | acrescentado; nunca marca GREEN sozinho |
| Segundo plano / Chrome visível | **não portado como seletor** | ver nota abaixo |

**Nota sobre “Segundo plano / Chrome visível”:** no pacote R11 auditado, a UI enviava a propriedade `background`, mas o agente R11 não a consumia na execução do job; o único uso de “background” no agente era a flag do próprio Chrome `--disable-background-mode`. O agente canônico atual também não possui esse campo no contrato. Recriar o seletor faria a Central exibir um controle sem efeito real. A ação útil correspondente — abrir o Chrome dedicado/CDP — permanece explícita. Se o código R12 real demonstrar uma semântica posterior para esse campo, ela deve ser incorporada ao contrato antes de reaparecer na UI.

### Top 3 & FPY

- linha independente;
- FPY oficial;
- Check FPY;
- Quantity;
- ocorrências carregadas;
- Top 3;
- snapshot/origem;
- filtro CPH exato;
- filtro Defect Code;
- evolução por snapshots;
- Repair N/Open quando disponível.

### Falhas

- linha;
- pesquisa por SN/código/descrição;
- Repair N/Y;
- removida do export;
- PCBA;
- Defect Time;
- Defect Code/Description;
- CPH;
- Manual/Automatic;
- Defect Type;
- Repair Comment;
- contexto 3022 separado de Defect Time e de causa;
- recarregar leitura.

### Consulta por SN

A versão nativa amplia a ficha da automação isolada e mantém a consulta como uma investigação única:

- 3074;
- 2114;
- tentativa 3022 individual;
- falha atual;
- falhas anteriores;
- Material SN em 2º+ uso;
- PCBAs anteriores/desvinculadas;
- processo/horário quando efetivamente retornado;
- avisos explícitos para dimensão não coletada.

### Rastreabilidade

Preservado:

- linhas 1/2/3;
- todos ou códigos selecionados;
- full;
- process_only;
- reuse_only;
- max ocorrências;
- max PCBAs;
- fast/balanced/safe;
- progresso;
- cancelamento;
- evidência por linha.

Melhoria de segurança: `process_only` não pode ser selecionado quando o agente não declara `process_timeline=true`.

### Dashboards de reuso

Preservado e fortalecido:

- PCBA 2º uso;
- PCBA 3º+;
- falha anterior;
- mesma falha;
- mesma família;
- Material SN 2º/3º+;
- PCBAs anteriores/desvinculadas;
- correlação material↔PCBA;
- clique abre os SNs/itens exatos quando existe drill-down.

### Processo / 3022 & AT

Preservado como view especializada, com reforço explícito da regra temporal:

`última passagem válida <= Defect Time`

Continua separado de causa confirmada. A view mostra dados persistidos mesmo quando o agente conectado não possui nova coleta 3022 em lote.

### Base local

Preservado/expandido:

- defects/3028;
- pcba_history/2114;
- material_reuse/3074;
- process_events/3022;
- process_defect_contexts;
- history_contexts;
- catálogo do agente;
- seletor pode incorporar dinamicamente todos os datasets realmente declarados pelo catálogo, sem hardcode inventado;
- tendências;
- jobs;
- busca;
- backup;
- Excel.

### CORA conhecimento

Preservado como busca na mesma base local. A versão nativa explicita as categorias:

- fato/evidência;
- correlação;
- hipótese;
- causa confirmada.

## Itens que ainda dependem de prova física ou fonte R12 real

- Shift automático 2114 no posto;
- coletor 3022-R12 incorporado ao agente canônico;
- `process_only` real no agente canônico;
- múltiplas passagens 3022 em casos de retrabalho reais;
- bootstrap/reboot no notebook da fábrica;
- benchmark por linha;
- comparação visual final lado a lado em desktop e mobile;
- confirmação de qualquer comportamento R12 posterior ao R11 que não esteja versionado no repositório.

## Regra de decisão

Um controle antigo não é copiado apenas porque existia visualmente. Ele é portado quando produzia efeito real ou quando o requisito operacional atual o exige. Controles inertes não devem ser recriados; funções reais nunca devem ser descartadas silenciosamente.
