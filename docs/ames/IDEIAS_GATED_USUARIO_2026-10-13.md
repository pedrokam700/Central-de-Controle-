# Ideias preservadas — aguardam estruturação do usuário

Data: 2026-10-13

Estas ideias foram consideradas úteis, mas **não devem ser implementadas agora**. O usuário quer primeiro estruturar melhor o comportamento, o escopo e a apresentação de cada uma. Elas permanecem registradas para não se perderem.

## 1. Hotspot de processo

Ideia-base: cruzar posto/processo com falhas para localizar concentrações operacionais sem transformar correlação em causa. A futura estrutura precisa definir escopo, normalização de estação/processo, tratamento de múltiplas passagens/rework, denominador e drill-down antes de qualquer implementação.

Status: `GATED_BY_USER_DESIGN`.

## 2. Investigações

Ideia-base: acompanhar um problema do surgimento até ação, validação e fechamento, ligando evidências A-MES e registros da Central. Antes de implementar, definir estados, responsáveis, vínculo com reports/tarefas, permissões, evidência, confirmação de causa e critérios de encerramento.

Status: `GATED_BY_USER_DESIGN`.

## 3. Genealogia visual de uma placa

Ideia-base: visualizar PCBA atual, materiais vinculados, PCBAs anteriores e evidências históricas em uma navegação visual. Antes de implementar, definir hierarquia, profundidade, tratamento de reutilização, vínculos temporais e comportamento em mobile.

Status: `GATED_BY_USER_DESIGN`.

## Regra

Nenhuma destas três ideias entra em código funcional sem uma nova decisão explícita do usuário. Podem ser usadas como contexto de arquitetura, desde que não criem view, fluxo, schema ou comportamento prematuramente.
