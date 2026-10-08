# HANDOFF MESTRE — CENTRAL A-MES

Atualizado em: 08/10/2026
Versão de trabalho: **V0.5.21**
Baseline validada em fábrica: **V0.5.18** (`SHA-256 aad6cdca35fe0c493e2febfca78b02c0abd5adcd335647d7b97eedc79da85e75`)
Checkpoint de evidência real: **V0.5.20**

## Regra de continuidade

Antes de alterar o projeto, ler este arquivo e `ESTADO_ATUAL.json`. Teste real de fábrica é a evidência final. Modo de trabalho: **teste real → causa exata → correção → pacote completo → teste do usuário → GREEN somente com evidência**.

Não reescrever módulos já validados para resolver um problema adjacente. Acesso ao MES continua serial até existir evidência de que concorrência é segura.

## Ambiente preservado

- Ethernet = rede/internet normal.
- Wi-Fi OPPO = `TAXXX_5G`.
- Rota temporária específica para `172.29.185.215`.
- Chrome dedicado + CDP `127.0.0.1:9222`.
- Agente local `127.0.0.1:8765`.
- SQLite local; nuvem nunca é pré-requisito para coleta.
- Login A-MES manual; senha/cookie/sessão não entram no código, SQLite ou sincronização.

## Linhas

- Linha 1 = `TAN10101`
- Linha 2 = `TAN10102`
- Linha 3 = `TAN10103`

FPY, Check FPY, Top 3, falhas, snapshots e históricos permanecem sempre separados por linha.

## 3028 — GREEN

A coleta direta ExtJS/backend e o motor multi-linha estão validados. A V0.5.18 foi validada pelo usuário com seletor Linha 1/2/3 e uma linha em foco.

Verificação importante feita antes da V0.5.21: `ames-agent/ames_3028_live.py` e `ames-agent/ames_3028.py` da V0.5.20 eram bit-a-bit iguais aos mesmos arquivos da V0.5.18 validada. Portanto a sensação de lentidão relatada no 3028 não veio de uma reescrita do coletor nas versões 0.5.20/0.5.21.

## 3074

View real: `AWIP3074-Vw Auto Scan Sn` / `UAWIP.form.VwAutoScanSnView`.

Regras:
- Batch Count não é número de usos.
- Reuso é calculado por associações/ciclos e Bind/Unbind Time.
- Distinguir uso na falha, reusos antes da falha e usos conhecidos hoje.
- Usar o termo PCBAs desvinculadas.

### Evidência V0.5.20

- navegação automática chegou à 3074;
- consultas reais ocorreram;
- grids reais retornaram dados;
- um escopo muito grande gerou um processamento longo.

Logo, navegação/consulta 3074 têm evidência positiva. O próximo gate é eficiência/controlabilidade, não provar que a view existe.

## 2114

View real no OPC: `AWIP2114-Tr Defect Lot By Hand` / `UAWIP.form.TrDefectLotByHandView`.
Shift 1 = `07:30-17:30`; Shift 2 = `17:30-07:30`.

Preservar histórico completo. Estado atual vem da ocorrência relevante mais recente. `Repair Status=N` e Defect Type devem ser interpretados sem apagar estados anteriores.

### Evidência V0.5.20

- navegação automática abriu a 2114 no OPC;
- seleção automática de Shift falhou uma vez; fallback manual para 1st Shift funcionou;
- prints posteriores mostraram a etapa 2114 efetivamente ativa/processando;
- o lote era grande e não terminou antes do fim do turno.

Portanto 2114 não é mais “não executada”; existe evidência de entrada no processamento, mas ainda falta validar um lote pequeno até a conclusão e conferir os dados retornados.

## V0.5.21 — candidato atual

Pacote: `AMES_Central_Offline_V0_5_21_CONSOLIDADA_FABRICA.zip`
SHA-256: `c0e078a49e5e7ab1674dc30a7e30a2127bd29b2e07b5825113d41d7cfc2667fa`
Library: `/Central de trabalho/AMES_Central_Offline_V0_5_21_CONSOLIDADA_FABRICA.zip`

Mudanças:
- seleção de uma, duas ou três linhas;
- todas as falhas ou Defect Codes selecionados;
- limite de ocorrências;
- limite de PCBAs por linha para teste rápido;
- perfis `Equilibrado`, `Rápido` e `Seguro`;
- progresso real 3074/2114 com current/total, percentual, linha e item atual;
- feed ao vivo;
- dados 3074 persistidos por PCBA concluída e 2114 por histórico/PCBA concluída, permitindo aparecer na Central antes do fim de todo o lote;
- memo/cache 3074 compartilhado entre linhas no mesmo job para evitar consultas repetidas;
- redução de waits fixos na 3074/2114 sem remover a confirmação de SN que evita aceitar grid antigo;
- dashboard deixa de recarregar a cada componente e só faz refresh parcial quando dado novo entra no SQLite;
- endpoint local `GET /api/v1/share/export` para resumo sanitizado de dados já coletados.

Validação local do build:
- Python compila;
- JavaScript compila;
- V0.16: 48/48 testes;
- `TEAM_LINES_OK`;
- `AGENT_RUNTIME_OK`;
- testes de escopo/progresso e share payload passaram;
- ZIP íntegro.

**STATUS: V0.5.21 NÃO GREEN.**

## Compartilhamento entre computadores

Arquitetura aprovada:

notebook da fábrica → coleta A-MES local → SQLite → sincronização assíncrona de dados sanitizados já coletados → Central/Firebase → usuários autenticados fora da rede OPPO.

Pode compartilhar: snapshots/resumos, FPY, Top 3, falhas, contagens/resultado permitido de 3074/2114 e depois 3022/correlações.

Nunca compartilhar: senha, cookies, sessão A-MES, CDP, credenciais ou capacidade direta de entrar na rede OPPO.

A V0.5.21 já expõe o endpoint local sanitizado, mas a integração visual definitiva desse bridge dentro da Central online ainda é pendente. Não declarar essa parte como publicada/live antes do deploy real.

## Instalador

O pacote de novo posto deve ficar discreto, fora do fluxo diário: **Configurar posto → Instalação A-MES** (ou área administrativa equivalente). Normalmente será usado uma vez.

## 3022 — próxima etapa

View identificada: `AWIP3022-Vw View Lot History` / `UAWIP.form.VwViewLotHistoryView`, entrada `SN / IMEI / A-S`.

Regra temporal: usar o último evento/processo válido anterior ao Defect Time, não o evento mais recente absoluto.

3022 permanece candidato e NÃO GREEN.

## Próximo teste

1. Instalar/abrir V0.5.21.
2. Rastreabilidade: somente Linha 1.
3. Máximo 3 PCBAs.
4. Desempenho `Equilibrado`.
5. Validar progresso real 3074 e 2114.
6. Confirmar que dados começam a aparecer antes do lote inteiro terminar.
7. Comparar velocidade percebida com V0.5.20 para o mesmo escopo pequeno.
8. Somente depois ampliar escopo ou testar `Rápido`.

Depois: fechar 3022 real e integração final com a Central online.
