# Central de Trabalho V2 — integração A-MES

A V2 deixa de tratar a Central online e o coletor A-MES como produtos separados.

Documento canônico de arquitetura: `V2_ARQUITETURA_CANONICA.md`.
Missão de implementação/revisão: `V2_WORK_CODEX_MISSION.md`.

## Princípios
- A Central oficial derivada do GitHub continua sendo a única interface principal do usuário.
- Na fábrica, a Central detecta `127.0.0.1:8765` e usa dados A-MES locais em tempo real.
- Fora da rede OPPO, a mesma Central usa apenas snapshots sanitizados sincronizados no Firebase.
- A coleta A-MES permanece local-first, serial e independente de cloud.
- Senha, cookie, sessão, CDP, senha Wi-Fi e acesso TAXXX_5G nunca são enviados ao Firebase.
- Dados A-MES alimentam nativamente Dashboard, Produto/CPH, Falhas, Rastreabilidade, Central do Dia e CORA.
- Linhas nunca são somadas silenciosamente para KPI operacional.
- Correlação é evidência; não prova causa automaticamente.
- 3022 já faz parte do contrato arquitetural, mesmo antes do adaptador real ficar pronto.

## Sobre o preview Vercel

O preview `https://central-cora-v2.vercel.app/` foi útil para provar a comunicação Central ↔ agente local ↔ Firebase, mas **não é a fusão final**.

Ele não deve virar uma segunda Central nem substituir o fluxo GitHub que já é usado pela equipe.

A arquitetura final deve eliminar a dependência funcional do iframe/proxy/overlay V2 e incorporar a camada A-MES diretamente às views nativas da Central.

## Estado atual

Já existe prova de conceito para:
1. detectar agente local;
2. sincronizar snapshot sanitizado por linha;
3. ler o snapshot remoto;
4. enriquecer Dashboard/Produto/Central do Dia/CORA;
5. manter coleta local independente da nuvem.

Isso é base técnica, não Definition of Done da fusão.

## Pacote do posto

Release candidata atual: V0.5.23 `AMES_Central_Offline_V0_5_23_CONSOLIDADA_FABRICA.zip`.

SHA-256: `1c0e7a37af4fb4b0b08b377d7c17c6895be5891e27c2ba9d37a9cc8cb6708167`.

A Central não deve hard-codear uma release. O onboarding deve ler `ames/releases/latest/release.json`, permitindo trocar o pacote sem refazer a UI.

## Nova experiência de primeiro acesso

Ao entrar na Central:
- se o agente local existir, reconhecer o posto automaticamente;
- se não existir, perguntar uma vez se este computador será usado para coletar A-MES;
- `Configurar este computador` mostra release, SHA e pacote atual;
- `Somente visualizar` mantém a Central sem instalação e não insiste;
- a configuração continua acessível pelo perfil/área administrativa.

Usuários remotos não precisam instalar o coletor para consultar dados sincronizados.

## Views finais

Não deve existir uma segunda navegação que replique a Central.

- Dashboard: operação + reuso + recorrência + processo.
- Produto/CPH: cadastro + reports + ocorrências MES + reuso + processo.
- Falhas: manual/MES/ambos + evidências 3028/3074/2114/3022.
- Rastreabilidade: timeline reutilizada pelas outras views.
- Central do Dia: contexto MES do escopo/turno.
- CORA: dados estruturados com origem e nível de evidência.

## 3022

A UI e o modelo de dados já devem reservar `ProcessTimeline` e `event_before_failure`.

Regra temporal: `event_before_failure = último evento válido com event_time <= defect_time`.

Não usar o último evento absoluto da unidade.

## Critério de conclusão

Só chamar a fusão de completa quando a Central oficial baseada no GitHub abrir uma única experiência sem depender de `v2/index.html`, iframe, proxy ou overlay “Central V2” para as funções principais.

**V2, V0.5.23 e 3022 continuam NÃO GREEN até validação real.**
