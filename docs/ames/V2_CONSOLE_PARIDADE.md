# Console MES — paridade nativa 9/9 · integração R12

Fonte de verdade funcional: [REQUISITO_CANONICO_CONSOLE_MES_9_VIEWS.md](./REQUISITO_CANONICO_CONSOLE_MES_9_VIEWS.md).
Checklist de promoção: [CONSOLE_R12_PARITY_AND_ACCEPTANCE.md](./CONSOLE_R12_PARITY_AND_ACCEPTANCE.md).

- Baseline mínima de experiência: V0.5.22 local funcional.
- Baseline fabril anterior: V0.5.20 para 3028 + 3074 + 2114.
- Referência local atual: `3022-R12`, que preserva as nove views e já contém o coletor 3022 real, coleta seletiva e correções de bootstrap/Playwright.
- Central V2 base: build 15.1.13.48 / merge `9bee591827959618bbc87b3777862884c7c36ff9`.
- Branch desta migração: `v2/console-parity-r12`.
- Mesmo `state.ames`, mesmo Firebase Auth, mesmo agent client e um único agente.
- A automação isolada R12 do posto permanece como fallback operacional até a validação física; **a UI antiga não roda embutida dentro da Central**.

## Views obrigatórias

| View da automação | Situação nesta branch | Regra |
| --- | --- | --- |
| Monitoramento | nativa | hoje, dia anterior, monitor, N/Y, Excel, período customizado e status real |
| Top 3 & FPY | nativa | linha isolada; FPY/Check FPY/Quantity/Top 3 e ocorrências |
| Falhas | nativa | leitura das ocorrências carregadas, sem transformar ausência em zero |
| Consulta por SN | nativa | 3074 + 2114 e tentativa 3022 individual quando a fonte estiver disponível; falha atual/antigas, materiais 2º+, PCBAs anteriores e relação mesma falha/família somente com evidência |
| Rastreabilidade | nativa | `full`, `process_only` e `reuse_only`; `process_only` fica bloqueado quando o agente não declara `process_timeline=true` |
| Dashboards de reuso | nativa e separada do Dashboard geral | PCBA e Material SN separados; indicadores clicáveis mostram os itens exatos |
| Processo / 3022 & AT | nativa | Defect Time separado do horário relevante; posto/regra/retrabalho/AT sem inferir causa; nova coleta exige capacidade 3022 declarada |
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

No agente canônico atual, `process_timeline` só pode ser anunciado quando o adaptador 3022 real estiver registrado. Até lá:

- `reuse_only` continua válido para 3074 + 2114;
- `process_only` é fail-closed no cliente/UI;
- `full` informa explicitamente quando 3022 em lote não está disponível;
- Consulta por SN pode tentar 3022 individual e deve manter qualquer ausência/erro como aviso, nunca como dado inventado.

## Regras preservadas

- Linha 1/2/3 nunca são agregadas silenciosamente.
- CPH é exato.
- PCBA SN e Material SN permanecem entidades distintas.
- Batch Count não é contagem de reuso.
- Defect Time é detecção/registro; horário 3022 é evidência temporal.
- Correlação não confirma causa.
- Sem relação persistente Manual ↔ MES inventada.
- A automação isolada R12 do posto não é removida antes da confirmação 9/9; dentro da Central existe apenas a implementação nativa.

## 3022

A documentação anterior desta branch-base dizia `READY FOR ADAPTER`. Isso descreve o agente 0.5.24-rc1 versionado na `main`, mas ficou desatualizado em relação ao motor local validado depois do merge.

O agente local `3022-R12` já executa consulta real AWIP3022 e produz `process_events` e `process_defect_contexts`, incluindo regras temporais, Manual/Automatic, posto relevante, reparo/retrabalho e separação montagem/teste vs pós-A5700. Essa evidência ainda precisa ser incorporada ao candidato canônico do repositório antes de substituir o pacote local R12.

A branch não deve recriar esse coletor por aproximação sem a fonte R12 real. Enquanto a fonte/pacote R12 não estiver incorporada ao repositório, a Central usa capacidade declarada e falha de forma explícita em vez de prometer 3022 inexistente.

## Gate

Esta branch não deve ser promovida para `main`/produção apenas porque os testes sintéticos passam. Antes da promoção:

1. conectar a Central V2 ao R12 no posto;
2. validar as nove views em desktop e mobile;
3. executar 3028 hoje/dia anterior;
4. validar `full`, `process_only`, `reuse_only` com as capacidades reais do agente;
5. validar Consulta SN com 3074/2114/3022 quando 3022 realmente responder;
6. validar Shift automático 2114;
7. validar drill-down de reuso apontando o item exato;
8. validar Processo/3022 com casos reais e múltiplas passagens;
9. validar reboot/bootstrap e medir performance por linha;
10. somente depois preparar o pacote canônico que incorpora o motor R12 e considerar merge/publish com autorização explícita.
