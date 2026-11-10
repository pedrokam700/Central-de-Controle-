# PR70 — ajustes finos do dashboard de reuso — 10/11/2026

## Origem do pedido

No comparativo de um componente físico com vínculos 3074 em PCBAs distintas, `Horário 2114 / 3028` repetia em alguns casos a data/hora de `Falha 3012*`. O usuário pediu aproveitar a coluna para uma informação nova e mostrar o nome do técnico AT em vez de só `BRMxxxxx`.

## Contrato implementado

- **Comparação de componentes:** `Análise 2114` usa somente `defect_type` de observações 2114 (por exemplo `MainBoard` e `Phone Disassembly`). Se ausente, permanece `—`; uma observação 3028 não fabrica uma análise 2114.
- **Horários:** continuam intactos nos registros de origem expandidos, na auditoria e na coluna `Falha 3012*`. A coluna `Reparo 3012*` continua distinta. A comparação de falhas próprias da PCBA não foi alterada.
- **Técnico AT:** a identificação tem duas provas permitidas: nome explícito na mesma linha 3012 ou correspondência **PCBA exata + Repair User exato** em campo explícito de operador 3022. O campo `Tran User` do grid real passou a ser reconhecido como nome, junto de `Tran User Id` como código. Nomes conflitantes, eventos sem PCBA, códigos divergentes ou nomes ausentes nunca geram dedução.
- **Interface:** o nome confirmado aparece completo, acompanhado pelo código entre parênteses para conferência; sem prova suficiente, permanece somente o código. A associação entre falha 3012 e Hist Seq 2114 continua declarada candidata.
- **Persistência:** não há alteração de esquema, mutação de banco, mudança de consultas 3012 ou de coletores congelados 3028. A extração 3022 enriquecida passa a preencher o nome nas coletas futuras; dados antigos sem esse campo comprovado continuam com BRM, sem promessa de retroatividade.

## Verificação de regressões

- Testes unitários do comparativo, XSS, identidade exata de operador, conflito, falta de PCBA e ausência de nome.
- Testes de `console-sn-repair-evidence` preservam a regra compartilhada.
- Teste Python valida nomes explícitos `Tran User Id` + `Tran User`.
- Quality Gate geral da Central: **170 checks PASS**, incluindo o build `15.1.13.52` e Service Worker sincronizados.

## Status

Checkpoint de código revisado, **não homologado em fábrica**. Preservar PR em DRAFT até prova de exibição no posto com 3012 + 3022 reais. Não instalar sobre Guardian 0.5.39 ativo sem procedimento de transição supervisionado.
