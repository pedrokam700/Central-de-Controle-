# PR #38 — BLOCO 3 / GATE FÍSICO A-MES — LINHA 3 + HISTÓRICO

**Status:** roteiro PREPARADO; execução física A/B PENDENTE. O SHA é sempre o HEAD validado no momento do teste, nunca um nome de ZIP ou uma tela com versão antiga.

## Contrato imutável

- Preservar a instalação candidata funcional, V0.5.25, SQLite, IndexedDB outbox, histórico Firestore, `source_id`, 8765, contas e demais linhas.
- PR #38 é draft baseada na PR #37. Não fazer merge/deploy Firebase Rules/Hosting, alterar documentos manualmente, limpar cache/SQLite/outbox ou trocar `source_id` para contornar a proteção.
- A correção da Linha 3 **não depende** de sobrescrever seu cabeçalho legado: a revisão `amesTeamLines/TAN10103/history` é imutável e pode ser usada por B após validar o hash das partes. Cabeçalho legado ainda bloqueado pode ser o comportamento correto.
- **Não distribuir ZIP ou instalar a candidata antes de validação e autorização.** A física só deve começar com um pacote canônico de SHA idêntico nos dois postos e rollback comprovado.

## Preparação (ambos os computadores)

1. Abrir a Central já autenticada, view **Monitoramento → Saúde e cobertura dos dados**. Identificar A como computador que coleta MES e B como leitor. Não colocar credenciais, IDs de instalação, SNs, nomes de operadores ou URLs privados em evidências compartilhadas.
2. Confirmar SHA do build publicado e versão do agente local. Se SHA/versão não corresponder ao candidato aprovado, **parar** sem atualizar instalações automaticamente.
3. Conferir o período 3028 vigente no relógio da fábrica: **07:00→07:00**, fuso `America/Sao_Paulo`; calendário segunda–sexta e paradas/exceções. Turnos 07:30/17:30 são outra dimensão.
4. Apertar **Copiar diagnóstico A/B (sem dados sensíveis)** em cada posto e identificar manualmente como "PC A" ou "PC B". JSON inclui linha, revisão, autoridade, tempos de upload/leitura, eventos e conflitos — nunca UID/`source_id`/SN/cookies.

## Etapa A — somente publicação autorizada, sem alterar a produção

- Confirmar que o agente local está conectado e que a Linha 3 possui coleta **Hoje** efetivamente concluída; não usar uma consulta avançada como substituto.
- Após sincronização, registrar o diagnóstico A. Aceitável: `last_sent.authority=operational_day_history`, `pending=0`, Linha 3 em `identity_blocked` se o cabeçalho antigo pertencer a outra instalação. **Não confundir bloqueio do head antigo com falha da revisão imutável**.
- Identificar `line_id=TAN10103`, `snapshot_id`, `revision` e `sent_at`. O registro de 16/10 não pode ser apagado.
- Registrar também a Linha 2 (`TAN10102`), já aprovada anteriormente, como regressão.

## Etapa B — prova real, somente leitura

- Com a Central autenticada em B, selecionar Linha 3: **Hoje** precisa exibir a mesma `line_id + snapshot_id + revision` que A, autoridade `operational_day_history`, `read_status=ready` sem `origin_conflict`.
- Conferir que 16/10 permanece selecionável no **Histórico por data** e que a versão antiga pode ser aberta somente leitura, mesmo após chegada de Hoje.
- Confirmar Linha 2 permanece atual; Linha 1 sem publicação comprovada continua como **não coletada**, nunca zero ou dados presumidos.
- Executar uma **consulta avançada isolada** em B para um período diferente, quando autorizado. Voltar à aba Hoje e conferir a mesma revisão válida de A, sem mudança de origem ou troca de datas.
- Salvar diagnóstico B e um screenshot da tela de histórico (ocultando SNs/dados pessoais).

## Revisão tardia AT — sem simulação em dados produtivos

- Somente quando a AT fizer um reparo/atualização real, coletar e conferir a nova revisão do período original. A revisão anterior precisa continuar no histórico.
- Campos Y/N são vínculos; registros 3012 de mesma PCBA são **candidatos**, não necessariamente reparo comprovado da falha. Não inferir causa ou alteração de FPY.
- Verificar que a AT de sexta não transforma a ocorrência em produção de segunda, nem substitui o snapshot Hoje no PC B.

## Latência e desempenho — metodologia, não números inventados

- Recolher os tempos de A (`last_timings_ms.parts_ms/history_ms/head_ms/total_ms`) e de B (`last_timings_ms.read_ms/download_ms`, `candidates/downloaded/skipped_versions`).
- Medir A→B apenas após conferir **o mesmo snapshot e revisão** e relógios sincronizados: diferença entre o `sent_at` de A e o primeiro recebimento validado em B. Se o relógio não for confiável, escrever "latência ponta-a-ponta inconclusiva".
- Repetir em pelo menos 10 publicações/revisões reais autorizadas antes de calcular p50/p95. Comparar com o tempo anterior observado; não inferir aceleração pelos tempos internos de uma máquina.
- Em caso de `cached`, `read_status=error`, ausência de snapshot, hash divergente, conflito entre origens, 401/403, dados privados no diagnóstico ou lentidão crítica: marcar **RED/PENDING**, preservar arquivos e capturar evidência sanitizada.

## Matriz de aceite

| Gate | Critério | Estado atual |
| --- | --- | --- |
| Qualidade estática | CI do SHA exato | Revalidar no SHA final |
| Firebase emulator | Rules + A/B por índice imutável + proteção do owner | Revalidar no SHA final |
| Browser | Nove views, idiomas, temas, histórico e botão diagnóstico | Revalidar no SHA final |
| A publicar Linha 3 | Snapshot Hoje, partes e history confirmadas, fila vazia | PENDING físico |
| B ler Linha 3 | Mesmo snapshot/revisão de A; sem origem concorrente | PENDING físico |
| Preservação | Snapshot 16/10 e Linha 2 intactos | PENDING físico |
| Isolamento | Consulta avançada B não altera Hoje | PENDING físico |
| Revisão AT | Nova versão histórica sem mover data/FPY | PENDING físico |
| Latência A→B | Medições confiáveis e p50/p95 | PENDING físico |

**Resultado permitido:** "CI GREEN, fábrica PENDING" até todas as provas materiais estarem reunidas. Nunca declarar "versão definitiva" apenas pela PR, emulador ou fila zerada.
