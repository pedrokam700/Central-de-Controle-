# HANDOFF MESTRE — CENTRAL DE TRABALHO V2 + A-MES

Atualizado em: 08/10/2026

## Estado seguro

Baseline funcional validada em fábrica: **V0.5.20** (`8aebf57443c140cd2e44a171628f8ac1974bb0315605ce90338af759957acbb6`).

Ela confirmou o núcleo real:
- 3028 direto, multi-linha serial e snapshots independentes;
- 3074 com vínculos, materiais, reuso e PCBAs desvinculadas;
- 2114 com histórico real de PCBA;
- Linha 1=`TAN10101`, Linha 2=`TAN10102`, Linha 3=`TAN10103` sempre isoladas operacionalmente.

Regra de trabalho continua: **teste real → causa exata → correção → pacote completo → teste do usuário → GREEN somente com evidência**.

## Candidata local atual — V0.5.23

Pacote: `AMES_Central_Offline_V0_5_23_CONSOLIDADA_FABRICA.zip`
SHA-256: `1c0e7a37af4fb4b0b08b377d7c17c6895be5891e27c2ba9d37a9cc8cb6708167`
Drive: `1C_yuDdIUs3rDHAcmJD23_9Ey-UnVDrry`
Library: `/Central de trabalho/AMES_Central_Offline_V0_5_23_CONSOLIDADA_FABRICA.zip`

V0.5.23 herda V0.5.22 e adiciona a ponte necessária para a Central V2:
- CORS do agente permite `https://central-cora-v2.vercel.app` e aliases controlados;
- `00_INICIAR_AQUI.bat` continua preparando rede, rota, Chrome, Python e agente;
- após o agente ficar pronto, prefere abrir a Central V2;
- se a Central V2 online estiver indisponível, abre `127.0.0.1:8765` como contingência;
- credenciais/sessão MES nunca são sincronizadas.

Os coletores 3028 validados permanecem congelados.

## Central de Trabalho V2 — candidata integrada

URL: `https://central-cora-v2.vercel.app/`
Vercel project: `central-cora-v2` (`prj_SQUu2HXxyrtxAC8jv8wgnxZsbDJI`)
Deployment: `dpl_5vGxUBs99S51aUUf8p8eSwTzL1bg` — READY.

A V2 é uma etapa de migração segura: mantém a experiência da Central original e injeta a camada A-MES sem substituir a produção anterior durante o gate.

### Funcionamento

Na fábrica:
`Central V2 → agente local 127.0.0.1:8765 → SQLite/A-MES`.

Fora da rede OPPO:
`Central V2 → Firebase → último snapshot sanitizado sincronizado`.

A coleta A-MES continua local-first, serial e independente de cloud.

Nunca sincronizar:
- senha A-MES;
- cookies/token/sessão;
- CDP;
- senha Wi-Fi/TAXXX_5G;
- capacidade de comandar o MES remotamente.

### Barramento de dados

A primeira fase reaproveita a coleção Firestore `aiKnowledge`, já suportada pela Central/CORA.

Um documento por linha usa:
- `kind=ames_shared_snapshot`;
- `type=ames_snapshot`;
- `status=validado_sistema`;
- `line=TAN10101/TAN10102/TAN10103`;
- `payload` sanitizado;
- `text` compacto para busca contextual.

Assim o A-MES entra na CORA como evidência estruturada sem criar uma segunda memória paralela.

### Páginas alimentadas no primeiro corte

- **Dashboard:** FPY/Check FPY/falhas por linha e contexto operacional.
- **Produto/CPH:** ocorrências A-MES reais associadas ao modelo em foco.
- **Central do Dia:** saúde da linha e histórico 2114 no contexto do turno.
- **CORA:** snapshots A-MES entram na busca contextual existente.
- **A-MES integrado:** visão global de operação, reuso e recorrência.

A V2 não transforma correlação em causa confirmada e não cria Report automaticamente só porque o MES encontrou recorrência.

## Recursos herdados da V0.5.22

- dashboards de reuso com drill-down;
- PCBA/material em 2º e 3º+ uso;
- mesma falha e mesma família histórica;
- lista de PCBAs desvinculadas por Material SN;
- taxas por linha e matriz de tipo de componente;
- escopo por linha/falha/quantidade;
- perfis Equilibrado/Rápido/Seguro;
- progresso real 3074/2114;
- persistência incremental no SQLite antes do refresh visual;
- Excel de 11 abas com `RAW_3028`.

Evitar refresh pesado da UI **não descarta dados**: resultado concluído é persistido no SQLite antes de liberar atualização visual.

## 3022 — próxima grande camada

View: `AWIP3022-Vw View Lot History` / `UAWIP.form.VwViewLotHistoryView`.

Regra: para cada falha, usar o último evento relevante anterior ou igual ao `Defect Time`, nunca simplesmente o registro mais recente absoluto.

Quando a 3022 entrar, a V2 poderá cruzar:
`linha → CPH → falha → PCBA → material/reuso → falha histórica → processo/posto/hora`.

**3022 NÃO GREEN.**

## Gate atual

V0.5.20 continua baseline GREEN do núcleo já provado.

**V0.5.23 + Central V2 NÃO são GREEN ainda.**

Teste seguinte:
1. iniciar V0.5.23 no notebook da fábrica;
2. abrir `https://central-cora-v2.vercel.app/`;
3. confirmar login e `A-MES integrado`;
4. confirmar detecção do agente local;
5. validar dados separados das três linhas;
6. conferir enriquecimento em Dashboard, produto/CPH, Central do Dia e CORA;
7. sincronizar;
8. abrir a mesma Central V2 fora da rede OPPO e confirmar leitura dos dados já sincronizados.
