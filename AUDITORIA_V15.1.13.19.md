# Auditoria V15.1.13.19

Base: V15.1.13.18

## Árvore de Reports

- Códigos são exibidos como uma unidade não quebrável; o status permanece abaixo do produto.
- Códigos legados de quatro dígitos são apresentados com o prefixo `CPH`, sem alterar IDs nem chaves persistidas.
- `Todos os reports` foi mantido como um único elemento visual em todas as larguras.
- A navegação Família → código-base (quando necessário) → produto específico continua preservada.

## Renomear família

- A ação continua restrita a administradores, com mensagem explícita quando a conta não possui essa permissão.
- Produtos, reports, falhas, atividades, fluxos e análises vinculadas são atualizados por batches do Firestore.
- A atualização evita o estado parcialmente renomeado causado por várias escritas paralelas.

## Sincronização

- Arquivos root/web sincronizados.
- Build, cache e `package.json` identificados como `15.1.13.19`.
