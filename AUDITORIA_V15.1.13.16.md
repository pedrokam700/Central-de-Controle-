# Auditoria V15.1.13.16

## Base preservada

Build derivada diretamente da V15.1.13.15, mantendo o backend/IA dessa versão como base conhecida.

Validações estáticas executadas:
- `node --check app.js` — OK
- `node --check server.mjs` — OK
- `node --check config/env.mjs` — OK
- `node --check scripts/validate-config.mjs` — OK
- `node --check scripts/self-test-ai.mjs` — OK
- comparação de funções do backend V15.1.13.15 → V15.1.13.16 — nenhuma função de servidor removida
- comparação de funções do frontend V15.1.13.15 → V15.1.13.16 — funções existentes preservadas; novas funções de fluxo Falha/CORA adicionadas
- IDs HTML duplicados — 0
- arquivos root/web sincronizados para `index.html`, `app.js`, `styles.css`, `sw.js`, `README.md`, `VERSAO.md`
- Service Worker/cache atualizado para V15.1.13.16
- endpoint novo `/api/failure-intake` validado por sintaxe e presença no servidor/cliente

## Mudança conceitual

### Falhas
Área universal para registrar ocorrências mesmo quando a origem ainda não é conhecida.

Classificação inicial:
- Não definido / Em análise
- Operacional
- Máquina
- Processo
- Produto (suspeita)
- Teste / Inspeção
- Outro

Campos independentes preservados/adicionados:
produto, componente, material, máquina, linha, posto/estação, processo, onde detectado, momento da detecção, data de início, quantidade, descrição, hipótese, testes, causa confirmada, ação corretiva, observações e evidências.

### Reports de produto
Área separada para casos confirmados/tratados como problema de produto.

A conversão de Falha → Report preserva dados/evidências e marca `emailStatus = pendente`.

### CORA rápida
- ação para abrir uma nova Falha a partir da conversa atual;
- organização assistida por `/api/failure-intake`;
- pode usar texto da conversa e imagens/evidências disponíveis;
- revisão humana continua obrigatória antes de salvar;
- hipótese não é promovida a causa confirmada.

### Mobile
- formulário universal em coluna única em telas pequenas;
- ação de salvar sticky;
- suporte a foto/evidência;
- CORA pode preparar o cadastro a partir do celular.

### UI CORA
Regra visual autoritativa para o botão Enviar, evitando o estado branco/apagado observado no print.

## Limitação conhecida da validação

Não foi possível executar `npm install` dentro deste ambiente de construção porque a instalação excedeu o tempo disponível. Por isso, esta auditoria confirma sintaxe e integridade estrutural, mas não declara teste de execução completa com as dependências instaladas.
