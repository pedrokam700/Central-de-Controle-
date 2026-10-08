# Central V2 + A-MES — ponto de retomada

Leia primeiro:
- `docs/ames/ESTADO_ATUAL.json`
- `docs/ames/HANDOFF_MESTRE.md`
- `docs/ames/DECISOES_ARQUITETURAIS.md`
- `docs/ames/V2_INTEGRACAO_PLANO.md`
- `ames/releases/latest/README.md`

Baseline funcional validada em fábrica: **V0.5.20** (`8aebf57443c140cd2e44a171628f8ac1974bb0315605ce90338af759957acbb6`). Ela confirmou o núcleo 3028 + 3074 + 2114.

Candidata local atual: **V0.5.23**
- ZIP: `AMES_Central_Offline_V0_5_23_CONSOLIDADA_FABRICA.zip`
- SHA-256: `1c0e7a37af4fb4b0b08b377d7c17c6895be5891e27c2ba9d37a9cc8cb6708167`
- Drive: `1C_yuDdIUs3rDHAcmJD23_9Ey-UnVDrry`
- Library: `/Central de trabalho/AMES_Central_Offline_V0_5_23_CONSOLIDADA_FABRICA.zip`

Central V2 candidata:
- URL: `https://central-cora-v2.vercel.app/`
- Vercel project: `central-cora-v2`
- deployment: `dpl_5vGxUBs99S51aUUf8p8eSwTzL1bg` — READY

A V2 mantém a experiência da Central original e injeta a camada A-MES. Na fábrica usa o agente local 8765; fora da rede OPPO usa somente snapshots sanitizados sincronizados no Firebase. Esses snapshots entram em `aiKnowledge` com `kind=ames_shared_snapshot` e `status=validado_sistema`, portanto ficam disponíveis à busca contextual já existente da CORA.

Primeiro corte da integração alimenta: Dashboard, páginas de produto/CPH, Central do Dia, CORA e uma área global A-MES com operação/reuso/recorrência. Linhas permanecem isoladas.

Nunca sincronizar senha, cookies, sessão A-MES, CDP ou credenciais Wi-Fi. Cloud nunca é pré-requisito da coleta local. Não existe comando remoto do MES nesta etapa.

**V0.5.23 e Central V2 NÃO estão GREEN até teste real.** Próximo grande módulo depois da integração: 3022/timeline de processo.
