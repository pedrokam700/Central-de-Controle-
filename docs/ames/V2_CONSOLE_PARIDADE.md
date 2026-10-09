# Console MES — paridade nativa 9/9 · integração R12

Fonte de verdade funcional: [REQUISITO_CANONICO_CONSOLE_MES_9_VIEWS.md](./REQUISITO_CANONICO_CONSOLE_MES_9_VIEWS.md).

- Baseline mínima de experiência: V0.5.22 local funcional.
- Baseline fabril anterior: V0.5.20 para 3028 + 3074 + 2114.
- Referência local atual: `3022-R12`, que preserva as nove views e já contém o coletor 3022 real, coleta seletiva e correções de bootstrap/Playwright.
- Central V2 base: build 15.1.13.48 / merge `9bee591827959618bbc87b3777862884c7c36ff9`.
- Branch desta migração: `v2/console-parity-r12`.
- Mesma `state.ames`, mesmo Firebase Auth, mesmo agent client e um único agente. Nenhuma interface antiga deve ser removida antes da validação física de paridade.

## Views obrigatórias

| View da automação | Situação nesta branch | Regra |
| --- | --- | --- |
| Monitoramento | nativa | hoje, dia anterior, monitor, N/Y, Excel, período customizado e status real |
| Top 3 & FPY | nativa | linha isolada; FPY/Check FPY/Quantity/Top 3 e ocorrências |
| Falhas | nativa | leitura das ocorrências carregadas, sem transformar ausência em zero |
| Consulta por SN | nativa | 3074 + 2114 + 3022; falha atual/antigas, materiais 2º+, PCBAs anteriores e relação mesma falha/família |
| Rastreabilidade | nativa | `full`, `process_only` e `reuse_only`; progresso real e evidência por linha |
| Dashboards de reuso | nativa e separada do Dashboard geral | PCBA e Material SN separados; indicadores clicáveis mostram os itens exatos |
| Processo / 3022 & AT | nativa | Defect Time separado do horário relevante; posto/regra/retrabalho/AT sem inferir causa |
| Base local | nativa | datasets, catálogo, tendências, jobs, backup, busca e Excel |
| CORA conhecimento | nativa | busca estruturada local; fato/correlação/contexto sem causa automática |

## Compatibilidade do agente

A Central tenta primeiro o contrato canônico `central-ames-v2`. Se `/v2/capabilities` não estiver disponível, só aceita fallback local quando o `/health` comprovar:

- `agent_version = 0.5.23`;
- scheduler `fifo-monitor-skip-v1`;
- build `3022-R12` ou posterior;
- `auto_3022_ready = true`.

Isso evita reabrir comandos para agentes antigos não serializados.

No fallback R12, a Central lê por linha/snapshot:

- `defects`;
- `pcba_history`;
- `material_reuse`;
- `history_contexts`;
- `process_events`;
- `process_defect_contexts`.

A cobertura de fonte continua parcial. O fallback local não ganha revisão/cursor por ficção; essas propriedades continuam exclusivas do contrato canônico.

## Regras preservadas

- Linha 1/2/3 nunca são agregadas silenciosamente.
- CPH é exato.
- PCBA SN e Material SN permanecem entidades distintas.
- Batch Count não é contagem de reuso.
- Defect Time é detecção/registro; horário 3022 é evidência temporal.
- Correlação não confirma causa.
- Sem relação persistente Manual ↔ MES inventada.
- A interface antiga permanece disponível até a confirmação de paridade no posto.

## 3022

A documentação anterior desta branch-base dizia `READY FOR ADAPTER`. Isso descreve o agente 0.5.24-rc1 versionado na `main`, mas ficou desatualizado em relação ao motor local validado depois do merge.

O agente local `3022-R12` já executa consulta real AWIP3022 e produz `process_events` e `process_defect_contexts`, incluindo regras temporais, Manual/Automatic, posto relevante, reparo/retrabalho e separação montagem/teste vs pós-A5700. Essa evidência ainda precisa ser incorporada ao candidato canônico do repositório antes de substituir o pacote local R12.

## Gate

Esta branch não deve ser promovida para `main`/produção apenas porque os testes sintéticos passam. Antes da promoção:

1. conectar a Central V2 ao R12 no posto;
2. validar as nove views em desktop e mobile;
3. executar 3028 hoje/dia anterior;
4. validar `full`, `process_only`, `reuse_only`;
5. validar Consulta SN com 3074/2114/3022;
6. validar Shift automático 2114;
7. validar drill-down de reuso apontando o item exato;
8. validar Processo/3022 com casos reais e múltiplas passagens;
9. somente depois preparar o pacote canônico que incorpora o motor R12.
