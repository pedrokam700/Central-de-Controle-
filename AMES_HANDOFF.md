# Central A-MES — ponto de retomada

Para continuar o módulo A-MES sem perder contexto, leia primeiro:

- `docs/ames/HANDOFF_MESTRE.md`
- `docs/ames/ESTADO_ATUAL.json`
- `docs/ames/DECISOES_ARQUITETURAIS.md`

Baseline validada em fábrica: **V0.5.18** (`aad6cdca35fe0c493e2febfca78b02c0abd5adcd335647d7b97eedc79da85e75`).

Pacote candidato atual: `AMES_Central_Offline_V0_5_20_CONSOLIDADA_FABRICA.zip`

SHA-256: `8aebf57443c140cd2e44a171628f8ac1974bb0315605ce90338af759957acbb6`

Library: `/Central de trabalho/AMES_Central_Offline_V0_5_20_CONSOLIDADA_FABRICA.zip`

Status: **V0.5.20 em validação de fábrica — NÃO GREEN.** A V0.5.19 não chegou a ser testada e foi incorporada/supersedida por este candidato.

Gate atual: validar navegação/coleta 3074 + OPC/2114 sobre os snapshots 3028 preservados e a nova `Consulta por SN`. A view real `AWIP3022-Vw View Lot History` foi identificada e entrou como enriquecimento candidato, mas 3022 também só vira GREEN após evidência real.
