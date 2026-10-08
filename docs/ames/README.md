# Central A-MES — registro persistente do projeto

Este diretório é a fonte de continuidade entre conversas para o módulo A-MES da Central de Trabalho.

Ordem de leitura antes de qualquer alteração:

1. `HANDOFF_MESTRE.md` — arquitetura, regras de negócio, estado funcional e próximos gates.
2. `ESTADO_ATUAL.json` — estado curto/machine-readable da versão em validação.
3. `DECISOES_ARQUITETURAIS.md` — decisões que não devem ser reabertas sem evidência nova.

## Regra de trabalho

Fluxo obrigatório: **teste real → causa exata → correção → pacote completo → teste do usuário → GREEN somente com evidência**.

Nunca reconstruir o projeto por memória quando houver um pacote/estado registrado aqui. Nunca marcar uma versão como GREEN apenas porque passou em testes locais se o gate depende do A-MES real na fábrica.

## Artefato atual

- Versão: `V0.5.18`
- Pacote: `AMES_Central_Offline_V0_5_18_CONSOLIDADA_FABRICA.zip`
- SHA-256: `aad6cdca35fe0c493e2febfca78b02c0abd5adcd335647d7b97eedc79da85e75`
- Base exata: V0.5.17 SHA-256 `7105b70eb081ff9d468d3b8e5d866932d1891a6b664211171a292d8b4ff83ab8`
- Cópia persistente também registrada na Library do projeto em `/Central de trabalho/AMES_Central_Offline_V0_5_18_CONSOLIDADA_FABRICA.zip`.

**V0.5.18 ainda não é GREEN.** O gate atual é a validação real da nova UI de linha em foco sem regressão da coleta multi-linha serial.