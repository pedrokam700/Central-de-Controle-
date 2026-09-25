# Configuração de IA — Central + CORA V15.1.13.7

A versão atual já separa frontend e backend e usa o mesmo projeto Firebase da versão antiga. A configuração do Firebase Web e as coleções da Central foram preservadas; o que mudou é que as chaves secretas dos provedores ficam exclusivamente no backend.

## 1. Criar o `.env`

Na raiz do projeto:

```powershell
Copy-Item .env.example .env
```

## 2. Firebase Admin

O frontend continua usando o projeto Firebase existente para login/Firestore. Para o backend validar o Bearer token, preencha:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

Use uma credencial de conta de serviço do Firebase/Google Cloud. Não publique o JSON nem a chave privada no GitHub.

## 3. Gemini

Preencha `GEMINI_API_KEY`. Este é o provedor principal configurado por padrão.

## 4. OpenAI / Anthropic / Tavily

São opcionais. Se preenchidos, entram no fallback conforme `AI_PROVIDER_ORDER`.

## 5. Validar

```powershell
npm install
npm run validate-config
npm start
```

O servidor imprime quais componentes estão configurados sem revelar os valores das chaves.

## 6. Importante sobre o código antigo

A versão antiga enviada para comparação é um HTML monolítico. Ela contém o mesmo projeto Firebase e as mesmas coleções principais (`products`, `reports`, `operationalFailures`, `activities`, `flows`, `failureAnalyses`, `aiKnowledge`, `aiConversations`, `users`). Não é necessário copiar o HTML antigo para ativar a IA.

A arquitetura atual é mais segura: `web/app.js` chama `/api/failure-analysis`, `/api/generate-image`, `/api/investigation-artifact` etc.; as chaves ficam no `.env` do Node.
