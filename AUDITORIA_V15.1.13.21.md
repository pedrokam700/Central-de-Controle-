# Auditoria V15.1.13.21

## Escopo entregue

- A sidebar da CORA passou a ter uma trilha própria para o histórico de conversas. A estrutura é uma grade de cinco linhas: marca, nova conversa, navegação, histórico rolável e “Como me usar”. A lista não pode mais crescer sobre o item inferior.
- O comportamento se mantém no mobile: a sidebar em formato de gaveta conserva a mesma trilha interna, com rolagem apenas no histórico.
- “Renomear família” agora usa `POST /api/families/rename`, protegido por autenticação Firebase e perfil de administrador. O servidor valida colisões, localiza a família e seus produtos e atualiza, em batches de no máximo 450 gravações, `products`, `reports`, `operationalFailures`, `activities`, `flows` e `failureAnalyses`.
- O cliente somente atualiza sua árvore e contexto ativo após a confirmação do servidor. Instalações que ainda não tenham Firebase Admin configurado preservam a gravação direta preexistente no Firestore; não existe fallback apenas visual/local.

## Causa-raiz

1. O histórico era inserido dinamicamente antes de um espaçador, sem um contêiner com dimensão flexível e `overflow-y`. Por isso a lista ocupava o fluxo inteiro da sidebar e alcançava “Como me usar”.
2. A renomeação era uma sequência de batches feita diretamente no navegador. Além de depender das regras do cliente para todas as coleções, não havia uma operação centralizada que confirmasse a consistência entre referências.

## Arquitetura revisada

- Frontend/Firestore: Dashboard, produtos/famílias, reports, falhas operacionais, atividades, fluxos e análises usam coleções separadas e listeners de sincronização.
- CORA: há intake de falha, RAG híbrido, fatos/hipóteses/causa, ferramentas, streaming com progresso/cancelamento, memória governada e análise condicional por segundo modelo.
- Backend: roteamento econômico por complexidade, métricas, orçamento diário/mensal/por usuário, mascaramento de PII, auditoria, PDF real via PDFKit e artefatos DOCX/PPTX.
- PWA: service worker, fila offline e sincronização estão presentes. O cache foi elevado para `15.1.13.21`.

## Validações executadas

| Verificação | Resultado |
|---|---|
| `node --check server.mjs` | passou |
| `node --check web/app.js` | passou |
| `node --check app.js` | passou |
| `node --check scripts/validate-config.mjs` | passou |
| `node --check scripts/self-test-ai.mjs` | passou |
| Versões em `package.json` e `package-lock.json` | 15.1.13.21 |
| Cache PWA raiz/web | 15.1.13.21 |
| `npm run validate-config` | bloqueado: chaves Firebase/IA ausentes e dependências não incluídas nesta cópia |
| `npm run test-ai` | bloqueado para chamadas reais: chaves de Gemini/OpenAI ausentes; os provedores foram corretamente marcados como SKIP |
| Teste de rota com servidor local | bloqueado: `express` e demais dependências de produção não estão presentes no pacote copiado |

## Pendências de ambiente

- Para testar a persistência ponta a ponta, configurar `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` e `FIREBASE_PRIVATE_KEY` no backend e executar com dependências instaladas.
- Para o teste real de IA, configurar ao menos `GEMINI_API_KEY` ou `OPENAI_API_KEY`.
- Após a publicação, validar com uma família de teste: renomear, recarregar, conferir árvore, CPH/produtos, Reports, Falhas, Atividades, Fluxos e análises relacionadas.
