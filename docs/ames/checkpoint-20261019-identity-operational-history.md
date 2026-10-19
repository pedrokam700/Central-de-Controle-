# Checkpoint técnico 19/10/2026 — Linha 3 e calendário operacional

**Status:** candidato de diagnóstico e correção incremental, SEM gate físico / SEM merge / SEM nova instalação.

**Origem imutável:** PR #37, SHA `e1d2b74a016e134386a7b10644d32db604d2d51a`. V0.5.25 é baseline de fábrica. PRs #33/#35/#36 e main não são alteradas.

## Evidência física herdada
- TAN10102: A → Firebase → B comprovado com snapshot de 19/10.
- TAN10103: owner UID/linha rejeita outra identidade (`source_id`); B mantém snapshot de 16/10. Fonte física original do registro remoto é **desconhecida**.
- TAN10101: publicação vigente não comprovada.
- Tempo A → B percebido alto; ainda falta latência cronometrada e p50/p95.

## Implementado NESTA branch (sem implantação)
1. Publicador: isola `installation_identity_conflict` da TAN10103; não faz repetição automática permanente e mantém entradas IndexedDB pendentes. Demais linhas continuam publicando. Partes já enviadas no ciclo não são reenviadas em retry transitório. Registra duração por etapa sem SN/UID/token.
2. Firebase: diagnóstico **somente leitura** de `amesUsers/{uid}/lines/TAN10103` e do cabeçalho compartilhado; reporta *coincidência* e revisão, não divulga identificadores.
3. Calendário: último dia produtivo procura a data anterior com segunda–sexta por padrão e exceções `non_production_dates` e `extra_production_dates` validadas. Mantém janelas 3028 07:00 → 07:00; turnos 07:30/17:30 não mudam.
4. Console histórico: seção visível por padrão; atalho do último dia de produção usa timezone `America/Sao_Paulo` e exceções recebidas do agente. Não supõe que histórico já seja a view atual.

## Pendências obrigatórias — NÃO declarar versão definitiva
- Diagnosticar a correspondência real `source_id` antigo/atual e origem física da TAN10103, **sem alterar identidade**, e escolher entre restaurar identidade autêntica ou migração explícita auditável. Testar histórico antigo intacto em B.
- Isolar seleção de snapshot em SQLite / endpoint `/v2/snapshots` por intenção e período operacional: `today` não pode ser maior ID de qualquer consulta. Essa proteção precisa existir na origem e no compartilhamento Firestore, não apenas na UI.
- Enviar `advanced` e `historical_refresh` somente ao índice histórico por linha/data/origem/revisão; **jamais** ao cabeçalho `team latest`; preservar dados anteriores e enriquecimentos AT tardios com revisão imutável.
- Projetar regras/indexes Firestore em versão compatível e testar em emulador; **nenhum deploy** de Rules/Firestore produção sem autorização.
- Medir pipeline A→B (captura, partes, head, listener) e otimizar com prova p50/p95.
- Executar testes Node/Python/Emulator/Browser no SHA candidato exato; só então planejar teste físico único A/B e eventual pacote canônico com rollback.

## Rollback seguro
A instalação física atual, porta 8765, SQLite, outbox, Auth, Firestore e frontend oficial permanecem intocados. Reverter o commit/branch candidata ou abandonar a PR restaura o código sem qualquer migração de dados. Não limpar a fila nem trocar `source_id`.
