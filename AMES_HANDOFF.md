# Central A-MES — ponto de retomada

Para continuar o módulo A-MES sem perder contexto, leia primeiro:

- `docs/ames/HANDOFF_MESTRE.md`
- `docs/ames/ESTADO_ATUAL.json`
- `docs/ames/DECISOES_ARQUITETURAIS.md`
- `ames/releases/latest/README.md`

Baseline funcional validada em fábrica: **V0.5.20** (`8aebf57443c140cd2e44a171628f8ac1974bb0315605ce90338af759957acbb6`).

A validação real de 08/10/2026 confirmou 3028, 3074 e 2114: vínculos/reuso 3074 retornando e persistindo, histórico real 2114 retornando e alimentando a Central, e KPIs 3028 preservados por linha. O fallback manual de Shift 2114 funcionou quando a seleção automática falhou uma vez.

Pacote candidato atual: **V0.5.22**

- Arquivo: `AMES_Central_Offline_V0_5_22_CONSOLIDADA_FABRICA.zip`
- SHA-256: `e5cf91879d057a28eca6de4ba2364c0bc056f32c6a46dd086e7ddb600c4abf9e`
- GitHub canônico: `ames/releases/latest/README.md`
- Library: `/Central de trabalho/AMES_Central_Offline_V0_5_22_CONSOLIDADA_FABRICA.zip`
- Drive file ID: `15dJrhHPYDDDe7_C9wyj7vG4z1gaav6BU`

A V0.5.22 adiciona dashboards de reuso auditáveis, drill-down exato dos contadores, mesma falha/mesma família, PCBAs antigas por material reutilizado, taxas por linha, Excel de 11 abas com RAW_3028 e teste estrutural, refresh visual agrupado somente depois da persistência em SQLite, controles de escopo/performance/progresso e bootstrap/migração para novo posto.

O coletor 3028 permanece bit-a-bit igual ao da V0.5.20 validada.

**V0.5.22 NÃO GREEN até teste de fábrica.** 3022 continua a próxima etapa e também não está GREEN.
