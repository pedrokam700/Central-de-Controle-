# Central A-MES — ponto de retomada

Para continuar o módulo A-MES sem perder contexto, leia primeiro:

- `docs/ames/HANDOFF_MESTRE.md`
- `docs/ames/ESTADO_ATUAL.json`
- `docs/ames/DECISOES_ARQUITETURAIS.md`

Baseline validada em fábrica: **V0.5.18** (`aad6cdca35fe0c493e2febfca78b02c0abd5adcd335647d7b97eedc79da85e75`).

Evidência funcional intermediária: **V0.5.20** provou navegação/consulta 3074 e entrada posterior no estágio 2114, mas o lote usado era grande e não fechou o gate completo antes do fim do turno.

Pacote candidato atual: `AMES_Central_Offline_V0_5_21_CONSOLIDADA_FABRICA.zip`

SHA-256: `c0e078a49e5e7ab1674dc30a7e30a2127bd29b2e07b5825113d41d7cfc2667fa`

Library: `/Central de trabalho/AMES_Central_Offline_V0_5_21_CONSOLIDADA_FABRICA.zip`

Status: **V0.5.21 pronta para validação de fábrica — NÃO GREEN.**

O que a V0.5.21 acrescenta sem reescrever a 3028 validada: escopo por linha/falha/quantidade, limite de PCBAs, perfis Equilibrado/Rápido/Seguro, progresso real 3074/2114, persistência incremental conforme as PCBAs terminam e cache/memo de consultas 3074 no mesmo job. `ames_3028_live.py` e `ames_3028.py` permanecem bit-a-bit iguais à V0.5.18 validada.

Existe também uma ponte de compartilhamento candidata: o agente expõe somente `/api/v1/share/export`, com resumo sanitizado de dados já coletados. Nunca expor senha, cookies, sessão A-MES, CDP ou rede OPPO. A coleta MES continua local e independente de cloud.

Próximo teste recomendado: uma linha + no máximo 3 PCBAs em modo Equilibrado. Depois ampliar o escopo. 3022 continua a próxima grande etapa após fechar este gate.
