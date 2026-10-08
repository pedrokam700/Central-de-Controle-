# Central A-MES — registro persistente do projeto

Este diretório é a fonte de continuidade entre conversas para o módulo A-MES da Central de Trabalho.

Ordem de leitura antes de qualquer alteração:

1. `HANDOFF_MESTRE.md` — arquitetura, regras de negócio, estado funcional e próximos gates.
2. `ESTADO_ATUAL.json` — estado curto/machine-readable da versão em validação.
3. `DECISOES_ARQUITETURAIS.md` — decisões que não devem ser reabertas sem evidência nova.
4. `../../ames/releases/latest/README.md` — release candidata canônica, pacote e SHA-256.

## Regra de trabalho

Fluxo obrigatório: **teste real → causa exata → correção → pacote completo → teste do usuário → GREEN somente com evidência**.

Nunca reconstruir o projeto por memória quando houver pacote/estado registrado. Nunca marcar versão como GREEN apenas por testes locais quando o gate depende do A-MES real.

## Estado atual

Baseline funcional validada em fábrica: **V0.5.20**

- SHA-256: `8aebf57443c140cd2e44a171628f8ac1974bb0315605ce90338af759957acbb6`
- Núcleo confirmado: 3028 + 3074 + 2114.

Candidata atual: **V0.5.22 — NÃO GREEN**

- Pacote: `AMES_Central_Offline_V0_5_22_CONSOLIDADA_FABRICA.zip`
- SHA-256: `e5cf91879d057a28eca6de4ba2364c0bc056f32c6a46dd086e7ddb600c4abf9e`
- GitHub: `ames/releases/latest/README.md`
- Library: `/Central de trabalho/AMES_Central_Offline_V0_5_22_CONSOLIDADA_FABRICA.zip`
- Drive file ID: `15dJrhHPYDDDe7_C9wyj7vG4z1gaav6BU`

A V0.5.22 adiciona dashboards/drill-down auditáveis de reuso e recorrência, Excel ampliado e validado, persistência antes do refresh visual, controles de escopo/performance e bootstrap/migração para novos postos. 3022 continua próxima etapa.
