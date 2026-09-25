# Auditoria V15.1.13.17

Base comparativa: V15.1.13.16.

## Escopo
- Correção do CSS vazado no final do `index.html`.
- Correção de truncamento visual dos códigos na árvore de Reports.
- Clique em família abre visão filtrada de todos os reports da família.
- Clique em produto/variante abre produto específico.
- Mantida a navegação hierárquica existente.

## Preservação
- Nenhuma função do `server.mjs` foi alterada nesta versão.
- Nenhum endpoint de IA foi alterado.
- Nenhuma função de streaming/cancelamento foi removida.
- Nenhuma coleção Firestore foi renomeada.
- Falhas universais e Reports de produto foram preservados.

## Testes estáticos
- `node --check app.js`: executar e confirmar OK.
- `node --check server.mjs`: executar e confirmar OK.
- CSS vazado após `</html>`: removido.
- Mirrors `root/web`: sincronizados.
