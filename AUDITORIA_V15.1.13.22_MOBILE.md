# Auditoria V15.1.13.22 — Revisão mobile estrutural

Status: **candidata em branch isolada** `fix/mobile-first-v15.1.13.21`.
Base: `release/v15.1.13.21`.

## Objetivo

Transformar a experiência mobile em uma interface própria para iPhone/iOS e Android, sem tratar o celular como desktop comprimido.

## Mudanças estruturais

- Navegação principal virou drawer em telas de até 930 px.
- Navegação mobile possui botão dedicado, backdrop e estado acessível.
- O estado desktop de sidebar recolhida não é reaproveitado no mobile.
- Navegação interna do drawer voltou a ser vertical; regras antigas de tablet que a deixavam horizontal não governam mais o fluxo mobile.
- CORA ganhou botão e backdrop próprios para abrir/fechar a navegação lateral no celular.
- A altura útil é baseada em `VisualViewport`, com fallback para `innerHeight`.
- Meta viewport usa `viewport-fit=cover` e `interactive-widget=resizes-content`.
- Safe areas de notch/home indicator são respeitadas.
- Inputs usam tamanho mobile seguro contra zoom automático do Safari.
- Formulários/modais passam a ocupar o viewport inteiro no mobile.
- Cabeçalho de modal permanece acessível e o conteúdo rola dentro da superfície.
- Ações de formulário ficam acessíveis no fim da superfície.
- Um gerenciador de superfícies define apenas um modal como visualmente ativo no mobile, preservando um detalhe anterior por baixo quando necessário.
- Modais e CORA são limpos ao voltar para autenticação, impedindo tela de login com superfícies antigas por cima.
- Login ocupa o viewport e fica acima das superfícies autenticadas.
- Grids de Dashboard, Central, formulários, filtros, análise, detalhes e painéis passam para uma coluna quando necessário.
- Tabelas permanecem navegáveis por rolagem horizontal própria, sem estourar a página.
- Toasts e menus respeitam largura e safe areas do aparelho.
- Service Worker passou a cachear `mobile.css` e usa versão 15.1.13.22.

## Arquivos alterados

- `web/index.html`
- `web/app.js`
- `web/mobile.css` (novo)
- `web/sw.js`
- `package.json`
- `package-lock.json`

## Validações estáticas executadas

- Sintaxe do corpo de `web/app.js`: OK.
- Sintaxe de `web/sw.js`: OK.
- `package.json` e `package-lock.json`: versão 15.1.13.22 e JSON válido.
- IDs HTML duplicados: 0.
- Funções nomeadas perdidas em relação à V15.1.13.21: 0.
- Funções nomeadas duplicadas novas: 0.
- Balanceamento de chaves do `web/mobile.css`: OK.
- Build guard, query de `app.js`, cache do Service Worker e stylesheet mobile: 15.1.13.22.
- `mobile.css` incluído no cache offline.
- Nenhuma alteração de backend/IA foi necessária para esta revisão.

## Validação ainda necessária antes de merge

Como não há CI/browser automation configurado no repositório, a branch **não deve ser considerada release final apenas pelos testes estáticos**.

Executar no mínimo:
- iPhone Safari: 375/390/430 px, teclado aberto e fechado.
- Android Chrome: 360/412/480 px, teclado aberto e fechado.
- Portrait e landscape.
- Login/logout.
- Navegação por todas as áreas.
- Abrir, preencher, cancelar e salvar cada formulário.
- Detail -> confirmação -> retorno ao detail.
- Upload de foto/arquivo.
- CORA: abrir drawer, histórico, "Como me usar", digitar com teclado, enviar/cancelar.
- Tabelas e Dashboard.
- Desktop após a mudança para confirmar ausência de regressão.

Somente após essa rodada a branch deve ser promovida para release.
