# A-MES V0.5.23 — ponte para Central V2

Pacote: `AMES_Central_Offline_V0_5_23_CONSOLIDADA_FABRICA.zip`

SHA-256: `1c0e7a37af4fb4b0b08b377d7c17c6895be5891e27c2ba9d37a9cc8cb6708167`

Tamanho: 707613 bytes.

Google Drive ID: `1C_yuDdIUs3rDHAcmJD23_9Ey-UnVDrry`

Library: `/Central de trabalho/AMES_Central_Offline_V0_5_23_CONSOLIDADA_FABRICA.zip`

## Objetivo

V0.5.23 preserva o núcleo A-MES e torna o agente local compatível com a Central de Trabalho V2 integrada.

Mudanças:
- `allowed_origins` inclui `https://central-cora-v2.vercel.app` e o alias pessoal da V2;
- `00_INICIAR_AQUI.bat` continua preparando rede, rota, Chrome dedicado, Python e agente local;
- após iniciar o agente, o fluxo prefere abrir `https://central-cora-v2.vercel.app/`;
- se a Central V2 online estiver indisponível, abre a interface local `127.0.0.1:8765` como contingência;
- `03_ABRIR_CENTRAL_LOCAL_FALLBACK.bat` abre manualmente a interface local;
- senha A-MES, cookies, sessão, CDP e senha Wi-Fi continuam fora da sincronização.

Os coletores `ames_3028.py` e `ames_3028_live.py` permanecem inalterados em relação à V0.5.22/base validada.

**Status: candidata, NÃO GREEN até teste real de fábrica.** Baseline funcional validada continua V0.5.20.
