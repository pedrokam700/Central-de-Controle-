# Central + A-MES — PR #69 — Restauração dos alertas da Consulta por SN

**Build:** `0f47256633b745ca34906620da726cbfec82ed09`
**GitHub CI:** [40720799501](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/40720799501) — 3/3 SUCCESS.
**Estado:** PR #69 DRAFT. Gate físico de fábrica PENDENTE. Sem merge, release ou publicação em GitHub Pages.

## O que mudou

- Alertas retornam ao desenho aprovado: faixa colorida de 6 px à esquerda, fundo muito suave, cartões brancos distintos para falha da PCBA atual e anterior, componentes, e histórico AT/3012.
- Uma seção de AT/3012 por Consulta SN: comentários individuais preservados, sem repetir o mesmo registro em cada risco. A sequência 2114 não é atribuída a um técnico se não existir comprovação temporal.
- Priorização com quatro níveis: **MUITO ALTA** (3+ registros distintos da mesma falha na PCBA ou 3+ Material SNs distintos comprovadamente reutilizados com a mesma falha anterior), **ALTA** (mesma falha na PCBA ou em componente comprovado, retornos/reparos MainBoard), **MÉDIA** (mesma família, histórico diferente frequente, MainBoard anterior), **BAIXA** (compatibilidade física sem vínculo de mesma falha). Prioridade é investigação, jamais causa confirmada.
- Somente o primeiro risco da PCBA mostra o resumo de falha atual × anterior; todo o histórico 2114 pode ser visto na expansão. O estado expandido é preservado.
- Sem alerta comprovado, a caixa não aparece. O modelo forense e suas evidências são preservados, sem modificação pelo renderizador.
- No caso de uma nova montagem Y posterior à última falha, recorrências anteriores da própria PCBA **não** são atribuídas aos materiais do ciclo novo.
- A **Consulta por SN** segue ancorada na história da 2114 e nos vínculos atuais; a **Rastreabilidade** segue independente, ancorada na falha do dia/revisão da 3028 e nos componentes temporais daquele instante.

## Não confundir testes de código com aceitação física

O GitHub aprovou contratos estáticos, agente/integração e nove views. Ainda é necessário validar no navegador real os screenshots antigos, a lista de ATs e as prioridades com dados da fábrica. Não afirmar que o Cboard Motor/Vibra recuperou todas as PCBAs anteriores nem que as cinco passagens ausentes da 3022 foram encontradas: esses incidentes continuam abertos.

## Instalação segura

A pasta de distribuição inclui `01_TROCAR_PARA_PR69_NOVA.bat` e `TROCAR_PARA_PR69_NOVA.ps1`, com SHA esperado da candidata. Finalizar coletas e fechar a Central; extrair o ZIP numa **pasta nova**, sem misturar com instalação anterior. Executar somente o BAT de troca supervisionada e aguardar `TROCA_PR69=SUCCESS`. Se houver bloqueio por identidade de origem, agente desconhecido, guardian ou porta 8765, **não forçar**. Não iniciar dois agentes em paralelo.

A instalação nova **não migra automaticamente** o banco SQLite, token, config, outbox ou histórico operacional da anterior. **Preserve a pasta antiga** até completar a validação e a estratégia de atualização sem perda.

## Testes físicos úteis

- Uma PCBA com 2 sequências distintas na 2114 e mesma falha deve gerar prioridade **ALTA**, com falha atual e anterior separadas, comentários únicos.
- Uma PCBA com 3 sequências distintas e mesma falha pode gerar prioridade **MUITO ALTA**, com 2114 detalhada sem repetição de Hist Seq.
- Um Material SN vindo de outra PCBA com a mesma falha e vínculo 3074 temporalmente comprovado deve gerar prioridade **ALTA**; só mesma família é **MÉDIA**. Compatibilidade sem falha igual comprovada é **BAIXA**.
- Nenhum alerta: nenhum painel; dados incompletos/ausentes não devem produzir alarmes artificiais.
- Horário de geração é da 3022, não o registro da 3028. Comentários e técnicos da 3012 seguem histórico amplo por SN, separados da ocorrência do dia 3028.

**Contrato canônico no GitHub:** `docs/ames/history/2026-10-28-sn-alert-visual-and-priority-contract.md`. **Árvore evolutiva:** `docs/ames/history/LOGIC_CHANGELOG.jsonl` (MES-HIST-013).
