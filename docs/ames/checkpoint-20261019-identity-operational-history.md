# PR #38 — Contrato operacional: Linha 3, histórico e sincronização (19/10/2026)

> **Candidato em PR draft.** Implementação e testes de emulador não equivalem a prova física. Não instalar por cima do posto em coleta, não apagar SQLite/IndexedDB, não alterar `source_id`, não fazer merge/deploy Firebase sem gate explícito.

## 1. Origem e evidências

- PR #37: `e1d2b74a016e134386a7b10644d32db604d2d51a` — integração física A→B já comprovada para **TAN10102**; **TAN10103** ainda mostrava snapshot 16/10 e publicador rejeitava `source_id`; **TAN10101** sem prova atual. Essa evidência não foi reescrita.
- `main`: `e285d2adba07c023ca53d1c76159ad92c0e0db3c`; **V0.5.25** é último baseline oficialmente aprovado em fábrica.
- PR #38 baseia-se só em #37; #32/#33/#35/#36 seguem draft/congeladas. Nenhuma integração especulativa das PRs empilhadas.
- **O documento antigo do Firestore por UID+linha pode pertencer a uma instalação com identidade diferente. Não há autorização para sobrescrevê-lo, trocar a origem ou apagar históricos.**

## 2. Identidade sem perda: publicação imutável como caminho primário

### O contrato

1. O SQLite local continua sendo fonte de verdade e portador do `source_id`. Nenhuma migração local forçada.
2. Snapshot/revisão sanitizado: `amesUsers/{uid}/lines/{line}/snapshots/{key}/parts/{n}`. A chave é hash de `(source_id,snapshot_id,revision,hash)`, e cada parte tem hash global comprovado na leitura.
3. **Sempre publicar o índice histórico imutável antes de tentar avançar o cabeçalho legado**: `amesTeamLines/{line}/history/{uid}_{key}`, com período de 3028 e metadados. Firestore Rules existentes validam a primeira parte, o publicador e a criação imutável.
4. Somente coleta **live do dia operacional exato** pode tentar `amesUsers/{uid}/lines/{line}` + `amesTeamLines/{line}`. Se esse documento estiver vinculado a outro `source_id`, a falha do cabeçalho fica identificada, mas **a revisão imutável já enviada continua válida**. Erro permanente não entra em retry interminável.
5. O computador B escuta as revisões de `history` do dia vigente (por linha; limite da consulta via intervalo indexável do campo `period_start`) e baixa as partes do dono original. Uma leitura do cabeçalho legado não promove um dia diferente para o painel Hoje.
6. Se dois pares distintos `owner_uid + source_id` apresentarem a mesma linha e dia, a leitura atual dessa linha falha de forma explícita (`origin_conflict`) sem escolher silenciosamente uma instalação. A investigação das origens é somente leitura e não expõe tokens nem identificadores completos.
7. Dados antigos permanecem no `history`. Nenhum `delete`, `source_id` rewrite, novo Firestore Rules deploy nem reconfiguração de UID.

### Limites

- **O cabeçalho legado da Linha 3 pode continuar marcado como bloqueado, de propósito**, enquanto o caminho novo de histórico permite o compartilhamento. Não falsificar um sucesso desse cabeçalho.
- A prova no **Firestore emulator com regras reais** valida esse contrato (mesmo UID com origem legada conflitante, revisão nova imutável e leitura B). A instalação produtiva e a execução no computador B ainda exigem gate físico do mesmo SHA.
- A origem física exata da antiga TAN10103 não foi confirmada; o mecanismo protege ambas as histórias sem precisar fazer suposição perigosa sobre ela.

## 3. Particionamento temporal de ponta a ponta

| Função | Escopo e regra | Pode afetar painel Hoje? |
| --- | --- | --- |
| Hoje | Linha + dia 3028 vigente 07:00→07:00 + modo `today/live/monitor_today` | Somente quando o período corresponde exatamente ao dia vigente |
| Último dia de produção | Última data de produção encerrada, não ontem do calendário | Não |
| Histórico por data | Linha + dia/período do 3028 + origem + snapshot/revisão | Não |
| Consulta avançada | Investigação de outro período, PCBA/SN ou intervalo escolhido | Não |
| Atualização posterior AT | Nova revisão da ocorrência do dia original, vinculada à mesma placa/falha | Não; altera apenas a projeção consultável do histórico original |

- Na segunda 19/10/2026, o Hoje começa **19/10 07:00** e o anterior começa **sexta 16/10 07:00** e termina sábado **17/10 07:00**. Domingo extra pode ser produtivo quando registrado na configuração; feriado/parada exclui a data.
- Fuso `America/Sao_Paulo`, fronteira 3028 07:00 e **turnos independentes 07:30–17:30 e 17:30–07:30**; 07:00–07:30 não é automaticamente o 1º turno.
- O agente /v2/snapshots busca no SQLite explicitamente `window.mode`, `start_at`, `line_id` e snapshots **complete**. Maior ID não basta; `custom` e outros dias são excluídos.
- O Firebase usa período do snapshot sanitizado, **não** o horário da consulta nem a data de transmissão, para decidir se o conteúdo pode representar Hoje. Uma coleta de setembro executada segunda em outro posto jamais sobrepõe segunda.
- Para os metadados, `period.mode` é uma nova projeção versionada (`projection_version 7`), sem destruir revisões anteriores. O schema `central-ames-v2` e os componentes das revisões antigas seguem legíveis.
- A revisão original da ocorrência preserva contagem/falhas/FPY da data. Posteriores AT podem atualizar estado e evidência de reparo com nova revisão imutável. Retificações oficiais comprovadas de métricas de produção precisam de tratamento explícito e auditável; não devem ocorrer por simples mudança de status AT.
- Cobertura ausente/3012 não consultada/3022 parcial é `não comprovado`, **não zero**.

## 4. Sincronização incremental de histórico sem extrair novamente A-MES

- O indexador SQLite `/v2/history-candidates` é autorizado localmente e examina até 8 snapshots em cada passagem, por ID descendente; não inicia job de MES. Percorre somente modos aprovados do período, descartando `custom`.
- O frontend consulta os candidatos com intervalo de no mínimo 90s entre varreduras, carrega uma revisão do próprio agente local pelo endpoint existente `/local-history` e coloca a publicação sanitizada na fila de envio normal.
- Marcadores de histórico compartilhado confirmado ficam em IndexedDB **separado** `central-ames-history-markers-v1`; o outbox `central-ames-outbox-v2` mantém **versão 1 original** e não recebe upgrade destrutivo.
- Cada `epoch` (alteração do conteúdo SQLite) dá origem a um novo marcador. Se AT editar um snapshot de sexta na quarta, sua nova revisão da sexta poderá ser compartilhada sem reeditar dados originais de produção nem chamar 3028 completo novamente.
- A fila prioriza publicação imutável e permite continuar outras linhas. Partes são transferidas em lotes limitados a quatro requisições concorrentes por entrada, sem exposição de dados sensíveis nos tempos/diagnósticos.
- O ciclo de observação do agente permanece a cada ~15s enquanto a Central autenticada está aberta; coleta 3028 automática permanece sob a rotina configurada do A-MES (30min padrão, não alterado aqui). Não prometer sincronização quando a aba está fechada.

## 5. Design / UX: uma única Central, nove views

Na view existente **Base local**, o painel principal `Histórico de produção` vem aberto. Quatro caminhos em navegação responsiva:

1. **Hoje** — dia operacional vigente, linha em foco, dados atuais, horários de coleta e origem/proveniência.
2. **Último dia de produção** — janela produtiva anterior com seus snapshots e versões, botão de recolher/atualizar aquele período, sem assumir dados de domingo.
3. **Histórico por data** — escolha linha/data/CPH, lista auditável de versões por coleta, origem, snapshot e revisão, abertura somente leitura.
4. **Consulta avançada** — períodos/SN/PCBA de investigação explicitamente isolados do painel Hoje e de outros computadores.

Cores e tema da Central, 9 views, tradução PT/EN, layout responsivo, títulos e hierarquia originais preservados. Não criar dashboard paralelo, décima view ou interface que pareça sucesso antes de existir cobertura. Atualização AT, origem conflitante, cache e erros ficam evidentes na saúde dos dados.

## 6. Evidência, gates e rollback

- Roteiros direcionados: SQLite exclui consulta avançada com ID maior; dia segunda/sexta/exceções; AT revisa sexta sem reatribuir a quarta; Firestore Rules reais no emulator preservam o owner antigo e permitem leitura B de Linha 3 nova; listener distingue duas instalações concorrentes; IndexedDB mantém outbox/reload; navegação 9 views PT/EN e mobile.
- **Status automático somente para SHA com CI comprovado.** Ver a aba Actions desta PR. Qualquer alteração depois do SHA aprovado exige revalidação exata. Emulador GREEN ≠ fábrica GREEN.
- Fábrica: uma única candidata consolidada após gates estáticos/emulador/browser; A autentica e publica revisão atual 19/10; B recebe TAN10103 atual, mantém 16/10 consultável, TAN10102 permanece atual, TAN10101 sem prova permanece sem coleta; verificar atualização tardia AT, consulta avançada em B, latência timestamps e reconexão sem perda.
- **Não tocar no posto ativo nem publicar Rules, Hosting, Firebase produção ou mergear PR** sem autorização explícita. Se qualquer gate falhar, descontinuar somente a PR candidata; SQLite/identidade/outbox da V0.5.25 permanecem intocados.
- Pendências que dependem do ambiente real: medição confiável p50/p95 fim a fim, resolução de qualquer disputa de origens reais, teste físico A/B e confirmação de cobertura de 3012/3022 por evidência. Não chamar versão definitiva antes disso.
