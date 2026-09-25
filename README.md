# Central de Trabalho + CORA — V15.1.13.20

Revisão consolidada da V19: roteamento econômico de IA por complexidade, proteção financeira opcional, PDF real para artefatos, PWA/cache atualizado e CORS restrito.

## Consumo de IA

Configure apenas no `.env` do backend. `AI_BUDGET_*_USD=0` mantém o orçamento desativado para não limitar os cinco usuários ocasionais; quando configurado, o sistema reduz o tier antes de bloquear. Consulte `.env.example` e `AUDITORIA_V15.1.13.20.md`.

# Histórico V15.1.13.19

Correção consolidada da árvore de Reports e do renomear família.

## Mudanças desta versão

- CSS cru removido do final do documento.
- Árvore com família, código completo sem quebra e pendência na linha seguinte.
- Códigos legados de quatro dígitos são apresentados com o prefixo `CPH` (por exemplo, `CPH2817`), sem alterar a chave salva.
- Clique em família abre todos os reports daquela família.
- Clique em produto abre o produto específico.
- Visão geral de todos os reports continua disponível.
- Renomear família atualiza produtos e registros vinculados em lotes atômicos, com mensagem de erro caso a permissão do Firestore recuse a alteração.

Consulte `VERSAO.md`, `MAPA_OFICIAL_V15V.txt` e `AUDITORIA_V15.1.13.19.md`.
