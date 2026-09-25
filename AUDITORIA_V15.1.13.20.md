# Auditoria V15.1.13.20

## Resultado

Esta versão consolida a V15.1.13.19 preservando a árvore de Reports, Famílias, Falhas e CORA. Ela não deve ser descrita como "100% sem falhas": Firebase, provedores de IA, regras de Firestore e os fluxos móveis exigem validação com o ambiente real.

## Corrigido nesta versão

- Roteamento econômico configurável por complexidade: `simple`, `standard` e `complex`.
- Proteção de orçamento opcional diária, mensal e mensal por usuário, com degradação de tier antes de bloqueio.
- Métricas em memória por usuário, provedor, modelo e tier; custo, tokens e latência continuam expostos em `/api/ai-metrics` para usuário autenticado.
- Dual verification condicionada a investigação complexa encadeada.
- PDF próprio para artefatos 8D, A3 e Ishikawa via PDFKit; retorno inclui PDF, DOCX, PPTX e HTML.
- Planejador de artefatos corrigido para interpretar a resposta textual real do Gemini.
- CORS fechado por padrão e permitido apenas para `CORS_ORIGIN` configurado.
- Cache PWA atualizado para V15.1.13.20 em raiz e `web/`.

## Verificado

- `node --check`: `server.mjs`, `app.js`, `web/app.js`, `sw.js` e `web/sw.js`.
- Instalação determinística com `npm ci` e dependência `pdfkit` presente.
- Backend iniciado localmente em `AI_DEV_MODE=true`; `/api/health` respondeu.
- Geração local de artefato A3 retornou PDF válido (`%PDF`, 2015 bytes).
- Inventário encontrou 14 endpoints únicos e nenhum ID duplicado em `index.html`.
- Cópias raiz/web conferidas para interface, estilos e service worker após a atualização.

## Pendências e riscos reais

- Não havia `.env` nem credenciais reais neste ambiente: autenticação Firebase, Firestore, IA, RAG vetorial, custos reais, fallback e transcrição não foram executados contra serviços externos.
- Regras de segurança do Firestore/Storage não acompanham este ZIP; precisam ser revisadas no projeto Firebase antes de produção.
- Métricas e orçamento da implementação atual são mantidos em memória do processo; reinícios zeram os acumulados. Para orçamento financeiro rígido entre reinícios/instâncias, a próxima etapa é persistir agregados com transações Firestore ou Redis.
- O renderizador Poppler não está disponível nesta máquina; o PDF foi validado por integração e assinatura, não por inspeção visual de página.
- O fluxo offline/PWA existe e o cache foi versionado, mas o cenário celular sem rede -> fila -> foto -> reconexão -> sincronização ainda requer teste manual em dispositivo.
- A árvore de Reports, renomear família, conversão Falha -> Report e cruzamentos de dados foram preservados pela comparação de código e por verificações estáticas; ainda precisam de teste com dados Firestore reais e permissões reais.
- `npm audit` reportou 10 vulnerabilidades transitivas (8 moderadas e 2 altas). Não foi executado `npm audit fix` para evitar atualização cega e regressões.
