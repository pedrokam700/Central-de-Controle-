# HANDOFF MESTRE — CENTRAL A-MES

Atualizado em: 08/10/2026
Versão de trabalho: **V0.5.22**
Baseline validada em fábrica: **V0.5.20** (`SHA-256 8aebf57443c140cd2e44a171628f8ac1974bb0315605ce90338af759957acbb6`)

## Regra de continuidade

Antes de alterar o projeto, ler este arquivo, `ESTADO_ATUAL.json`, `DECISOES_ARQUITETURAIS.md` e `ames/releases/latest/README.md`.

Modo obrigatório: **teste real → causa exata → correção → pacote completo → teste do usuário → GREEN somente com evidência**.

Nunca reescrever um motor já validado para resolver problema adjacente. Acesso MES permanece serial. Toda análise operacional exige filtro de linha.

## Ambiente preservado

- Ethernet = rede/internet normal.
- Wi-Fi OPPO = `TAXXX_5G`.
- Rota específica para `172.29.185.215`.
- Chrome dedicado + CDP `127.0.0.1:9222`.
- Agente local `127.0.0.1:8765`.
- SQLite local e offline-first.
- Login A-MES manual; senha/cookie/sessão não são persistidos.
- Linhas: Linha 1=`TAN10101`, Linha 2=`TAN10102`, Linha 3=`TAN10103`.
- FPY, Check FPY, Top 3, falhas, reuso, históricos e correlações permanecem separados por linha.

## Estado validado — V0.5.20

### 3028 — GREEN

Coleta direta ExtJS/backend, multi-linha serial, snapshots independentes e UI de uma linha em foco estão validados. O coletor `ames_3028.py` e `ames_3028_live.py` da V0.5.22 foi verificado bit-a-bit contra a V0.5.20 e permanece igual.

### 3074 — VALIDADA FUNCIONALMENTE

View real: `AWIP3074-Vw Auto Scan Sn` / `UAWIP.form.VwAutoScanSnView`.

Regras duras:
- `Batch Count` não é quantidade de usos.
- Uso é reconstruído por vínculos/associações distintos e Bind/Unbind Time.
- Distinguir uso na falha, reusos antes da falha, usos conhecidos hoje e PCBAs desvinculadas.
- Um Material SN deve permitir rastrear as PCBAs por onde passou.

A V0.5.20 retornou dados reais da 3074 e a Central exibiu materiais, usos conhecidos e PCBAs desvinculadas.

### 2114 — VALIDADA FUNCIONALMENTE

View real no OPC: `AWIP2114-Tr Defect Lot By Hand` / `UAWIP.form.TrDefectLotByHandView`.

- Shift 1 = `07:30-17:30`.
- Shift 2 = `17:30-07:30`.
- Preservar todas as linhas históricas.
- Estado atual vem da ocorrência relevante mais recente; Y antigo não apaga N atual.
- Consultar PCBA atual e também PCBAs desvinculadas descobertas na 3074 quando o cruzamento exigir.

A V0.5.20 retornou histórico real 2114 e a Central exibiu contagens/histórico. A seleção automática de Shift falhou uma vez e o fallback manual `1st Shift` funcionou; isso continua como hardening, não invalida a baseline.

## V0.5.22 — candidata atual

Pacote: `AMES_Central_Offline_V0_5_22_CONSOLIDADA_FABRICA.zip`
SHA-256: `e5cf91879d057a28eca6de4ba2364c0bc056f32c6a46dd086e7ddb600c4abf9e`
Tamanho: `456905` bytes
GitHub canônico: `ames/releases/latest/README.md`
Library: `/Central de trabalho/AMES_Central_Offline_V0_5_22_CONSOLIDADA_FABRICA.zip`
Drive file ID: `15dJrhHPYDDDe7_C9wyj7vG4z1gaav6BU`

### Integridade / refresh

A frase “evitar recarregar toda a interface a cada componente” significa somente reduzir refresh pesado do navegador. **Não significa descartar informação.** A regra V0.5.22 é:

`MES retorna bloco concluído → persistir no SQLite → atualizar checkpoint/progresso → liberar refresh visual agrupado`.

`raw_json` e `snapshot_payloads` continuam preservando evidência bruta. A tela pode atualizar em blocos; a base não depende desse refresh.

### Dashboards e drill-down

Nova página `Dashboards de reuso`, sempre com uma linha em foco. Todo contador relevante deve abrir os registros exatos que o formam.

PCBA:
- 2º uso;
- 3º+ uso;
- reutilizada com falha anterior;
- mesma falha histórica da atual;
- mesma família histórica;
- 2º uso + mesma falha;
- 2º uso + mesma família.

Material/componente:
- 2º uso;
- 3º+ uso;
- reutilizado com falha antiga;
- mesma falha;
- mesma família;
- lista exata de PCBAs desvinculadas;
- lista exata de PCBAs desvinculadas com mesma falha e com mesma família.

Também existem taxas por linha e matriz por tipo de componente para mostrar concentração de reuso/recorrência.

### Excel V0.5.22

O Excel de equipe passa a ter 11 abas:

1. `TOP3_FPY`
2. `BASE_DADOS`
3. `RAW_3028`
4. `HIST_PCBA`
5. `HIST_MATERIAL`
6. `PROCESSO_3022`
7. `DASH_REUSO`
8. `PCBAS_REUSO`
9. `MATERIAIS_REUSO`
10. `CORRELACOES`
11. `TIPOS_COMPONENTE`

`BASE_DADOS` expõe mais campos já preservados da 3028. `RAW_3028` oferece trilha de auditoria. O XLSX é validado como ZIP/estrutura antes de ser devolvido ao usuário; falha de integridade bloqueia a entrega em vez de gerar planilha silenciosamente corrompida.

### Performance e escopo

V0.5.22 preserva os controles introduzidos na V0.5.21:
- selecionar uma, duas ou três linhas;
- todas as falhas ou Defect Codes escolhidos;
- limite de ocorrências;
- limite de PCBAs por linha;
- modos Equilibrado/Rápido/Seguro;
- progresso 3074/2114 com atual/total/%/item;
- persistência incremental;
- memo/cache 3074 e deduplicação;
- waits reduzidos sem remover a confirmação da SN esperada.

### Novo PC / instalação

`00_INICIAR_AQUI.bat` é a entrada principal. No primeiro uso ele chama `01_INSTALAR_UMA_VEZ.bat`.

- Python 3.12/dependências/Chrome: usa `vendor/` se existir; caso contrário usa fontes oficiais pela Ethernet/internet no primeiro setup.
- Se `TAXXX_5G` já for um perfil salvo do Windows, tenta reconectar automaticamente; nunca guarda senha Wi-Fi.
- A rota A-MES /32 é aplicada quando necessária com elevação UAC.
- Chrome dedicado/CDP 9222 e agente 8765 sobem no fluxo normal.
- `suporte/MIGRAR_DADOS_DE_VERSAO_ANTERIOR.bat` pode migrar `config.json`, SQLite e backups de instalação anterior.
- Se o PC nunca conectou ao `TAXXX_5G`, o usuário precisa conectar uma vez manualmente para criar o perfil Windows.

## GitHub como fonte de verdade

O GitHub é a fonte canônica de versão, manifesto, hashes, decisões e instruções. O ZIP binário exato fica no Drive/Library e é identificado pelo SHA-256 publicado no GitHub. Vercel/bridge é integração opcional de compartilhamento; não substitui a versão canônica do pacote.

## Compartilhamento remoto

Arquitetura aprovada: notebook da fábrica → coleta local → SQLite → dados sanitizados já coletados → sincronização assíncrona → Central/Firebase → usuários autorizados fora da rede OPPO.

Nunca sincronizar senha, cookie/sessão A-MES, CDP ou acesso direto à rede OPPO. Cloud nunca é pré-requisito para coleta local.

## 3022 — próxima etapa

View identificada: `AWIP3022-Vw View Lot History` / `UAWIP.form.VwViewLotHistoryView`, entrada `SN / IMEI / A-S`.

Regra temporal: usar o último evento/processo válido anterior ou igual ao `Defect Time`, nunca simplesmente o evento mais recente absoluto.

**3022 NÃO GREEN.**

## Validação local V0.5.22

- Python: OK.
- JavaScript: OK.
- V0.16: **51/51**.
- `AMES_3028_LIVE_TRANSFORM_OK`.
- `TEAM_LINES_OK`.
- `AGENT_RUNTIME_OK`.
- Insights/drill-down sintético: OK.
- Excel: 11 abas + integridade ZIP/XLSX: OK.
- ZIP final: íntegro.
- Banco do pacote final: sem dados sintéticos de teste.

## Próximo gate

Testar a V0.5.22 na fábrica com uma linha, máximo 3 PCBAs e modo Equilibrado. Conferir progresso, dados incrementais, clique em PCBA/material de segundo uso, mesma falha/mesma família e Excel. **Não marcar V0.5.22 GREEN antes dessa evidência real.**
