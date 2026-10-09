# Missão Work/Codex — Central de Trabalho V2 nativa

Branch obrigatória: `v2/native-fusion`
Base: `main` no SHA `fb5dda364557b0ae11639d68261b61ad44cff7ac`.

Leia antes de alterar:
- `docs/ames/V2_ARQUITETURA_CANONICA.md`
- `docs/ames/HANDOFF_MESTRE.md`
- `docs/ames/ESTADO_ATUAL.json`
- `docs/ames/DECISOES_ARQUITETURAIS.md`
- `ames/releases/latest/README.md`
- `ames/releases/latest/release.json`

## Objetivo

Refatorar a Central como se ela tivesse sido desenhada desde o início sabendo que teria a base A-MES 3028 + 3074 + 2114 + 3022.

Não “colar” uma página A-MES ao sistema. Tornar A-MES uma fonte de dados nativa das views existentes.

## Limites

- Não quebrar a `main` validada durante o trabalho.
- Não reescrever os coletores MES validados apenas para acomodar UI.
- Não mudar a semântica das views MES sem evidência.
- Não marcar V0.5.23, 3022 ou V2 como GREEN sem teste real.
- Não sincronizar credenciais/sessão/CDP/Wi-Fi.
- Não misturar linhas em KPIs.
- Não transformar correlação em causa confirmada.

## Auditoria inicial obrigatória

Antes de implementar, faça uma revisão de arquitetura do repositório atual:

1. mapear estado, navegação e renderização em `index.html`/`app.js`/`styles.css`/`mobile.css`;
2. mapear duplicações entre código inline e arquivos externos;
3. identificar acoplamentos que dificultam integrar A-MES;
4. revisar `v2/index.html`, `v2/v2.js` e `v2/native.js` apenas como protótipos; não tratá-los como arquitetura final;
5. revisar o Quality Gate e ampliá-lo para proteger a fusão;
6. propor estrutura modular que possa ser migrada sem rewrite desnecessário da Central inteira.

Registrar a auditoria em `docs/ames/V2_AUDITORIA_ARQUITETURA.md` antes da mudança estrutural grande.

## Resultado técnico desejado

### Store único

A Central deve ter um estado A-MES nativo, disponível para as views, com origem local ou sincronizada abstraída.

A view não deve precisar saber se o dado veio de `127.0.0.1:8765` ou do Firebase.

### Data access

Criar módulos/funções claras para:
- detectar agente local;
- ler snapshot por linha;
- buscar defeitos por linha/CPH/Defect Code;
- buscar drill-down de reuso;
- buscar rastreabilidade por PCBA/Material SN;
- sincronizar snapshot sanitizado;
- ler `release.json` para onboarding;
- preparar contrato 3022 sem mock de dado real.

### Views

Refatorar nativamente:

**Dashboard**
- filtros por linha, CPH, turno, período, Defect Code;
- FPY/Check FPY/Quantity/Failure/Repair;
- Top 3/Pareto;
- reuso PCBA/material;
- mesma falha/mesma família;
- espaço nativo para processo 3022;
- KPI clicável -> registros exatos.

**Produto/CPH**
- ocorrências MES dentro da visão geral/falhas/histórico;
- indicador por linha;
- reuso/recorrência;
- link de rastreabilidade;
- processo anterior quando 3022 existir.

**Falhas**
- origem manual/MES/ambos;
- sugestão de vínculo;
- evidência 3028/3074/2114/3022;
- hipótese x confirmado.

**Rastreabilidade**
- timeline única e reutilizável por outras views;
- PCBA, Material SN, ocorrência, linha e CPH como entradas;
- 3022 -> 3028 -> 2114 -> 3074 -> ações Central, preservando temporalidade correta.

**Central do Dia**
- contexto MES do escopo/linha/CPH;
- passagem de turno enriquecida;
- radar usa reuso/recorrência sem duplicar dashboard.

**CORA**
- consumir modelo estruturado;
- distinguir fato/correlação/hipótese/validação;
- evitar depender somente do campo `text` do snapshot.

### Onboarding do posto

No primeiro login ou quando não houver decisão local:

- detectar agente 8765;
- se conectado: não incomodar;
- se ausente: perguntar se este computador será coletor A-MES;
- `Configurar este computador` lê `ames/releases/latest/release.json` e oferece pacote, versão e SHA;
- `Somente visualizar` desativa o convite recorrente;
- opção sempre disponível em `Meu perfil > Integração A-MES` ou equivalente;
- nunca mostrar “instalação obrigatória” para usuário remoto.

### Vercel

Remover Vercel da arquitetura funcional. Preview Vercel pode continuar existindo apenas como ambiente temporário. O produto final deve rodar pela Central oficial derivada do GitHub.

### 3022

Não inventar dados. Preparar contrato e UI agora.

Quando o adaptador real chegar, deve ser plugável sem redesenhar as páginas.

Regra: `event_before_failure = max(event_time <= defect_time)` entre eventos válidos.

## Qualidade / gates

Adicionar testes/checagens para:
- estado por linha isolado;
- normalização CPH;
- seleção origem local vs remota;
- pacote latest vindo do manifest;
- onboarding não reaparece após escolha;
- correlação não vira causa confirmada;
- 3022 temporal contract;
- ausência do agente não quebra Central;
- Firebase indisponível não quebra coleta local;
- mobile sem overflow crítico;
- funções existentes de reports/falhas/atividades continuam funcionando.

## Estratégia de implementação

1. auditoria;
2. módulo de dados/store;
3. onboarding/release manifest;
4. Dashboard;
5. Produto;
6. Falhas/Rastreabilidade;
7. Central do Dia/CORA;
8. contrato 3022;
9. remover protótipo iframe/overlay;
10. Quality Gate completo;
11. PR para `main` somente após revisão.

## Definition of Done

Não concluir a missão enquanto a Central ainda depender de `v2/index.html` com iframe ou de um overlay chamado “Central V2” para entregar as funções principais.

A experiência final deve parecer que a Central sempre nasceu com A-MES.
