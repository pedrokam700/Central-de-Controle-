# Central A-MES — ponto de retomada

Para continuar o módulo A-MES sem perder contexto, leia primeiro:

- `docs/ames/HANDOFF_MESTRE.md`
- `docs/ames/ESTADO_ATUAL.json`
- `docs/ames/DECISOES_ARQUITETURAIS.md`

Baseline validada em fábrica: **V0.5.20** (`8aebf57443c140cd2e44a171628f8ac1974bb0315605ce90338af759957acbb6`).

A validação real de 08/10/2026 confirmou o núcleo atual: 3028 preservada, 3074 retornando vínculos/reuso e alimentando a Rastreabilidade, e 2114 retornando histórico real de PCBA e alimentando contadores/histórico na Central. Houve uma falha de seleção automática do Shift 2114 em uma tentativa, com fallback manual `1st Shift` funcionando; isso permanece como hardening do candidato seguinte, não invalida a evidência funcional do núcleo V0.5.20.

Pacote candidato atual: `AMES_Central_Offline_V0_5_21_CONSOLIDADA_FABRICA.zip`

SHA-256: `c0e078a49e5e7ab1674dc30a7e30a2127bd29b2e07b5825113d41d7cfc2667fa`

Library: `/Central de trabalho/AMES_Central_Offline_V0_5_21_CONSOLIDADA_FABRICA.zip`

Status: **V0.5.21 pronta para validação de fábrica — NÃO GREEN.**

A V0.5.21 acrescenta sem reescrever a 3028 validada: escopo por uma/duas/três linhas, todas as falhas ou Defect Codes selecionados, limite de ocorrências/PCBAs, perfis Equilibrado/Rápido/Seguro, progresso real 3074/2114, persistência incremental durante a coleta, feed ao vivo, cache/memo 3074 e redução de esperas fixas preservando a confirmação do SN.

Compartilhamento candidato: `/api/v1/share/export` expõe somente dados sanitizados já persistidos. A ponte `https://central-ames-bridge.vercel.app` usa autenticação Firebase, pode sincronizar esses dados e tem uma área recolhida `Instalação do posto · uso único` para baixar o pacote. Nunca compartilhar senha, cookie/sessão A-MES, CDP ou acesso à rede OPPO. A coleta local não depende da nuvem.

3022 continua a próxima grande etapa e permanece NÃO GREEN até o teste real.
