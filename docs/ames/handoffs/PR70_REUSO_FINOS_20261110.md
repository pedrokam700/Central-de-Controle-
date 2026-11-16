# PR70 — ajustes finos do dashboard de reuso — 10/11/2026

## Origem do pedido

No comparativo de um componente físico com vínculos 3074 em PCBAs distintas, `Horário 2114 / 3028` repetia em alguns casos a data/hora de `Falha 3012*`. O usuário pediu aproveitar a coluna para uma informação nova e mostrar o nome do técnico AT em vez de só `BRMxxxxx`.

## Contrato implementado

- **Comparação de componentes:** `Análise 2114` usa somente `defect_type` de observações 2114 (por exemplo `MainBoard` e `Phone Disassembly`). Se ausente, permanece `—`; uma observação 3028 não fabrica uma análise 2114.
- **Horários:** continuam intactos nos registros de origem expandidos, na auditoria 2114 e na coluna `Falha 3012*`. A coluna `Reparo 3012*` continua distinta. Também na comparação das falhas próprias da PCBA foi removida a coluna duplicada de horário, substituída por `Análise 2114`.
- **Técnico AT:** a identificação aceita nome explícito da linha 3012 ou correspondência exata `3012 Repair User` = `3022 Tran User Id`, com nome proveniente do campo real `3022 Tran User`. O nome é identidade do funcionário e pode ser reutilizado entre PCBAs se houver exatamente um nome explícito para aquele ID entre todas as evidências 3022 locais e canônicas. Identidades divergentes para um mesmo código bloqueiam o nome (falha segura). Eventos sem PCBA, nomes ausentes e códigos divergentes não geram nomes fabricados.
- **Interface:** aparece **somente o nome real** na coluna `Técnico AT*`. O código BRM fica exclusivamente no `title`/tooltip para auditoria. Sem nome comprovado, aparece `—` com diagnóstico e código no tooltip — nunca o BRM puro apresentado como nome. A associação da linha 3012 ao Hist Seq 2114 continua candidata por PCBA + falha exata.
- **Persistência:** não há alteração de esquema, mutação de banco, mudança de consultas 3012 ou de coletores congelados 3028. Ao expandir o detalhe, a Central consulta somente leitura o `GET /api/v1/local/sn` já existente e reconstrói nomes a partir de `process_events.raw_json` anteriores, quando o MES forneceu `Tran User`. Os dados reais de operador não entram em commit nem em teste de fixture.
- **Tendências históricas:** a opção inicial `Origem` agora é `Todas as origens · detectar conflitos`, não mais o `source_id` da captura atual. Uma única revisão por dia/linha: FULL comprovada tem prioridade, senão última parcial observada. Dias sem dados continuam lacunas; capturas múltiplas no mesmo dia não se somam; dias com fontes distintas no mesmo dia permanecem identificados como conflito, sem totais fabricados. Comparações entre origens incompatíveis continuam bloqueadas.
- **Versão do shell/cache:** `15.1.13.53` para renovação dos assets do frontend após a instalação segura; o checkpoint anterior `15.1.13.52` não pode ficar preso no Service Worker.

## Verificação de regressões

- Testes unitários do comparativo, XSS, identidade explícita de operador, nome reutilizado entre PCBAs, conflito entre PCBAs, falta de PCBA, ausência de nome e recuperação de campos `Tran User` da 3022 bruta salva.
- Testes de `console-sn-repair-evidence` preservam a regra compartilhada.
- Teste Python valida nomes explícitos `Tran User Id` + `Tran User`.
- Teste de transporte garante leitura `GET /local/sn` somente local e sem escrita. Teste histórico garante múltiplos dias sob origens diferentes sem duplicação de capturas.
- Quality Gate geral da Central: **170 checks PASS** no código candidato revisado, incluindo build e Service Worker `15.1.13.53` sincronizados. Isso é validação de CI, não homologação de fábrica.

## Status

Checkpoint de código revisado, **não homologado em fábrica**. Preservar PR em DRAFT até prova de exibição no posto com 3012 + 3022 reais. Não instalar sobre Guardian 0.5.39 ativo sem procedimento de transição supervisionado.

## Aprendizado operacional após o incidente 3012

- Mudança de exibição do dashboard não autoriza mudar coleta 3012, período, cache físico, bootstrap MES ou lógica de recuperação. Todos esses arquivos permanecem congelados neste ajuste.
- Regressão de produção requer teste de integração com exemplo real em posto, *além* dos gates de CI. Checkpoint GREEN técnico não é prova do MES.
- Nomes recuperados são exclusivamente identidades explícitas do MES, nunca extrapolação da descrição de reparo. O atributo `Técnico AT*` conserva indicação de associação candidata entre falha e reparo.
- Screenshots que mostram `Horário 2114/3028` demonstram frontend **anterior ao HEAD**: comparar a versão/cache e aguardar instalação controlada, jamais diagnosticar como falha do código atual sem verificar a versão instalada.
- Gráficos com uma única data podem estar corretos se só existe uma data salva; primeiro separar filtro de origem, dias com fontes conflitantes e lacunas verdadeiras.
