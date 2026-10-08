# Central de Trabalho + A-MES Offline — V0.3

## Objetivo

Transformar a automação A-MES em um módulo local da Central de Trabalho com poucos cliques. O agente Python local fica responsável por navegador, MES, checkpoints, SQLite, cruzamentos, atualização de estado e exportação. A interface mostra apenas ações e resultados operacionais.

## Fluxo diário

A experiência foi reduzida a três ações principais:

1. **Atualizar dia anterior** — janela padrão 07:00 do dia anterior → 07:00 do dia atual, para a análise/apresentação da manhã.
2. **Atualizar agora / Monitorar hoje** — snapshots sucessivos do turno corrente, com acompanhamento de FPY, Top 3 e falhas ao longo do dia.
3. **Atualizar N / Y** — reconsulta rápida da 2114 para atualizar o estado da AT sem refazer toda a rastreabilidade 3074.

Uma coleta pode conter várias linhas, porém FPY, Top 3, falhas, indicadores, rastreabilidade e buscas operacionais são sempre separados por `Line Id`.

## 3028 / FPY / Top 3

O FPY oficial vem do bloco `Overall Report Of FPY` da 3028. O detalhe vem do `Detailed Report Of FPY`.

Por linha, o sistema preserva Quantity, Total DefectQty, Function/Appearance/Process DefectQty, Auto Input Defect Qty, Function/Appearance/Process FPY, FPY e Check FPY.

O Top 3 é calculado por linha a partir de `Defect Code + Defect Desc`. As linhas nunca são somadas para formar um Top 3 global operacional.

## Snapshots e falha removida

Cada atualização cria um novo snapshot local. O histórico anterior não é sobrescrito.

Se uma falha que existia no export anterior desaparecer em um export posterior da mesma janela lógica, a base mantém o registro antigo e marca a entidade como `removed_from_latest`. A interface usa o texto **Removida do export / validar AT**; não assume automaticamente que foi falha falsa.

Isso cobre o processo em que uma falha falsa continua afetando o FPY até a AT apagar/remover o registro.

## 3074 / 2114

O motor V0.16 validado continua sendo reutilizado para 3074 e 2114, incluindo checkpoints.

A base diferencia:
- uso da própria PCBA;
- falhas históricas da própria PCBA;
- material reutilizado;
- PCBAs desvinculadas do material;
- falhas 2114 dessas PCBAs;
- estado atual do reparo.

Na 2114, o estado atual usa a ocorrência compatível mais recente. Regras confirmadas:
- `N + Defect Type vazio` → aguardando análise do auxiliar;
- `MainBoard + N` → aguardando/encaminhado ao reparo de placa;
- `MainBoard + Y` → reparo de placa concluído;
- `Phone_Disassembly + Y` → Phone Disassembly concluído;
- outros Defect Type são preservados.

## 3022

A 3022 será usada como timeline real de montagem e AT. `Defect Time` não é tratado como horário de montagem.

Três linhas do tempo permanecem separadas:
1. montagem;
2. detecção/caracterização;
3. AT/reparo.

Postos já identificados conceitualmente: A5100, A5150, A5162, A5202 e A5265. O mapeamento `modelo/família + falha → posto de referência` será configurável e validado com a tela real antes de ser automatizado.

## Base local

SQLite é a fonte de verdade local. A estrutura V0.3 prevê:
- analysis_windows;
- snapshots;
- line_metrics;
- defect_entities;
- defect_observations;
- pcba_history;
- history_contexts;
- material_reuse;
- process_events;
- repair_refreshes;
- jobs;
- monitor_profiles;
- artifacts;
- snapshot_payloads;
- cora_documents.

O payload bruto também é preservado para que nenhum campo extraído do MES seja perdido antes de existir uma coluna especializada.

## CORA

A CORA não ganha uma segunda base independente. Um índice local regenerável é derivado do SQLite e recupera somente o contexto necessário para cada pergunta. Quando a consulta é por linha, o filtro é estrito para não misturar evidência operacional entre linhas.

## Segundo plano e performance

O agente executa jobs fora da interface e mantém estado/checkpoint. O monitor recorrente não inicia uma nova análise se já houver outra em andamento.

A coleta serial validada permanece como padrão. Paralelismo só será habilitado depois de medir estabilidade/timeout no MES real.

## Estado antes do teste de fábrica

Já estruturados/testados localmente: parser 3028, FPY oficial, Top 3 por linha, snapshots, reconciliação de falha removida, importação JSON V0.16, base SQLite, histórico 2114, contextos, reuso 3074, busca local da CORA, upload do export 3028 e regeneração do Excel no padrão V0.16 aprovado.

Dependem da fábrica: mapeamento do download direto da 3028, inspeção/adapter da 3022, validação de Chrome minimizado e benchmark de performance.