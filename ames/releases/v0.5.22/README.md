# Central A-MES — V0.5.22

Status: **CANDIDATA PARA TESTE DE FÁBRICA — NÃO GREEN**.

Baseline funcional validada em fábrica: **V0.5.20** (`8aebf57443c140cd2e44a171628f8ac1974bb0315605ce90338af759957acbb6`).

## Pacote exato

- Arquivo: `AMES_Central_Offline_V0_5_22_CONSOLIDADA_FABRICA.zip`
- SHA-256: `e5cf91879d057a28eca6de4ba2364c0bc056f32c6a46dd086e7ddb600c4abf9e`
- Tamanho: 456905 bytes
- Google Drive file ID: `15dJrhHPYDDDe7_C9wyj7vG4z1gaav6BU`
- Google Drive: `https://drive.google.com/file/d/15dJrhHPYDDDe7_C9wyj7vG4z1gaav6BU/view?usp=drivesdk`
- Library persistente: `/Central de trabalho/AMES_Central_Offline_V0_5_22_CONSOLIDADA_FABRICA.zip`

O GitHub é a **fonte canônica de versão, manifestos, hashes, decisões e instruções**. O ZIP binário exato fica no Drive/Library porque o conector do repositório publica texto, não binário ZIP. Sempre validar o SHA-256 acima antes de tratar um pacote como V0.5.22.

## O que entra nesta versão

- Dashboards de reuso por linha, sem misturar TAN10101/TAN10102/TAN10103.
- Drill-down clicável para mostrar as PCBAs e materiais exatos que formam cada contador.
- Visibilidade de PCBA em 2º uso/3º+ uso, falha anterior, mesma falha e mesma família.
- Visibilidade de material em 2º uso/3º+ uso, falha antiga, mesma falha, mesma família e PCBAs desvinculadas correspondentes.
- Taxas de recorrência/reuso por linha e matriz por tipo de componente.
- Persistência incremental: o dado concluído entra no SQLite antes do refresh visual agrupado.
- Excel de equipe ampliado para 11 abas e com verificação estrutural do XLSX antes da entrega.
- `RAW_3028` para auditoria do bruto preservado; os dados completos continuam no SQLite mesmo quando uma célula do Excel precisa ser truncada pelo limite do formato.
- Controles herdados da V0.5.21: linhas/falhas/quantidade, perfis Equilibrado/Rápido/Seguro, progresso real 3074/2114 e cache/deduplicação.
- Bootstrap de novo posto: instalação única, Python/dependências/Chrome, Chrome dedicado CDP 9222, agente 8765, rota A-MES e migração de base/config anterior.
- O coletor 3028 foi preservado bit-a-bit em relação à baseline validada.

## Instalação rápida em outro PC

1. Baixe o ZIP exato e extraia para uma pasta local.
2. Mantenha Ethernet/internet normal disponível no primeiro setup. Se o pacote `vendor/` não contiver os instaladores grandes, o instalador usa fontes oficiais para Python/Chrome/dependências.
3. Conecte o Windows ao `TAXXX_5G` uma vez caso esse perfil Wi-Fi ainda não exista no PC. A senha do Wi-Fi não é armazenada pelo pacote.
4. Execute `00_INICIAR_AQUI.bat`. Se for o primeiro uso, ele chama `01_INSTALAR_UMA_VEZ.bat` automaticamente.
5. Faça o login A-MES manualmente quando solicitado. Senha/cookie/sessão A-MES não são persistidos pelo projeto.

## Validação local realizada

- Python: OK.
- JavaScript: OK.
- V0.16: **51/51** testes.
- `AMES_3028_LIVE_TRANSFORM_OK`.
- `TEAM_LINES_OK`.
- `AGENT_RUNTIME_OK`.
- Insights/drill-down sintético: OK, incluindo PCBA antiga exata para material com mesma falha.
- Excel V0.5.22: 11 abas + integridade ZIP/XLSX: OK.
- ZIP final: íntegro.

## Gate real

A V0.5.22 só vira GREEN depois do teste do usuário na fábrica. Teste inicial recomendado: uma linha, no máximo 3 PCBAs, modo Equilibrado; conferir progresso 3074/2114, dados incrementais, drill-down dos contadores e Excel.

A 3022 continua a próxima etapa e **não está GREEN**.