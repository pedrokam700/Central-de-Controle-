# Linha histórica de lógica A-MES — seis arquivos recebidos em 28/10/2026

**Estado:** auditoria estática; gate físico PENDING. **Não instalar/mesclar/release.** A `main` oficial continua independente. Não enviar os ZIPs ou seus bancos/tokens/config à PR. O pacote 0.5.22 contém SQLite, não inspecionado. Para preservar a árvore, usar `git SHA + hash de arquivo + contrato + contraexemplo`, não apenas número de versão ou arquivo mais novo.

## 1. Manifesto de origem — identificadores SHA-256 dos arquivos ZIP
- **S1** `AMES_Automacao_V0_8(1).zip` — `31229ed5bef4078e10…`
- **S2** `AMES_Central_Offline_V0_5_22_CONSOLIDADA_FABRICA(2).zip` — `e5cf91879d057a28ec…`
- **S3** `CENTRAL_AMES_CLEAN_931f0627_3022_LIFECYCLE_READY(1).zip` — `20a02af9b2db21dc15…`
- **S4** `AMES_Central_CLEAN_dbe424da(1).zip` — `046ae20de387fe6d15…`
- **S5** `CENTRAL_AMES_INTEGRATED_1e65eb71_GREEN(1).zip` — `e4d78c8eec847da8d8…`
- **S6** `CENTRAL_PR37_COMPLETA_CORRIGIDA_V2(1).zip` — `2b053f344ddd23dd51…`

Os prefixos acima são identificadores abreviados; preservar o SHA-256 completo em manifesto de auditoria, não confundir com commit Git. As versões S3–S6 são variantes para comparação, **não** uma sequência linear comprovada por seus nomes.

## 2. Funções e diferenças encontradas

**Base comum conservada:** S2–S6 têm bytes idênticos em `core/fluxo_3028_3074.py` (SHA-256 prefixo `780e448aaea5`), `ames/tela_3074.py` (`e9a088555787`) e `ames/tela_3028.py` (`e9fa8242952b`). Preservar orquestração, consulta e dados originais; os erros podem ocorrer nas camadas posteriores.

**S1/V0.8:** já usava `Defect Time` 3028 para filtrar intervalos Bind/Unbind 3074 e checkpoint de progresso. A 3022 era incipiente. Valor a preservar: rastreio por ocorrência e retomada; **não** usar V0.8 inteira como substituta de V0.5.x.

**S2/V0.5.22:** consolidou fluxo e fontes; o motor temporal 3074 é anterior aos limites rigorosos de conflito. `Iss Status` é fotografia atual, não relação no passado.

**S3/931f e S6/PR37:** aumentaram a rigorosidade da 3022 ao conferir ciclo de vida da grade ExtJS e identidade/resposta da consulta após trocar de SN. Evitam promover dados da peça anterior como resultado da próxima sem prova de refresh. `Working Oper/END LOT` distingue passagem concluída de `Current Oper` que apenas anuncia próximo posto.

**S4/dbe424da:** adicionou `boundary_ambiguous`, N atual sem Unbind como indeterminado, intervalo inválido e duplicatas conflitantes; expôs `assembly_scope` e `VINCULO_PCBA_ITEM_NAO_CONFIRMADO`. Incluiu `corroborar_posto_3022` (mesma PCBA, operação da 3074 e END LOT real entre Bind Time e Defect Time), diferencia falha registrada na montagem de passagem concluída, tratamento do campo ExtJS em transição. Separou virada do dia operacional 07:00 do turno 07:30 e faz associação 2114→3022 somente com horário de falha único comprovado. Classificador A5150 é estimativa temporal operacional, não causa raiz.

**S5/1e65eb71:** apresenta outra estratégia de confirmação no `process_r11.py`; a tela 3022 perde componentes do protocolo rigoroso de detecção de refresh da S3/S6, substituindo por inspeção mais simples. **Risco técnico**, não evidência de incidente físico; não copiar essa variante isoladamente nem considerar o rótulo GREEN prova de fidelidade da resposta ao SN.

**PR69 (candidata DRAFT):** verificamos via GitHub presença de `corroborar_posto_3022`, `boundary_ambiguous`, `_assembly_station_at_defect`, instrumentação `query_diagnostics`, observação de atualização de store e `production_shift._occurrence_time`. O fato de existirem no código **não comprova** seu uso correto em todas as views nem a coleta real.

## 3. Modelo de investigação por ciclo, e não por placa inteira

```text
3028: ocorrência específica D_n {linha, PCBA, Defect Code, Defect Time, revisão}
    │
    ├─ 3074: consultar a PCBA → selecionar a montagem C_n em Defect Time
    │      ├─ Materiais efetivamente vinculados em C_n (Y ou N hoje não decide)
    │      │    └─ Material SN → 3074 histórico do item → PCBAs anteriores
    │      │         └─ 2114/3012/3028 → mesma falha, mesma família, outra,
    │      │            cada uma com horário, nível de evidência e fonte
    │      ├─ Outros ciclos C_1,C_2,C_3 ficam auditáveis, não viram kit de D_n
    │      └─ Bind/Unbind + operação/posto, indeterminações preservadas
    ├─ 3022: mesma PCBA, posto do vínculo e referências por CPH/família
    │      ├─ Working Oper + END LOT → passagem concluída anterior à D_n
    │      ├─ Current Oper/CHANGE CMF → detecção/chegada, nunca conclusão
    │      └─ ciclos de reparo/desmontagem/retorno separados e sequenciados
    └─ alerta/reuso: apenas relações justificadas e verificáveis
```

O `Defect Time` da 3028 é hora de **detecção/registro**, não hora em que a falha se originou. A 3022 mostra passagens de posto; a 3074 mostra horários de vínculo. Correlacionar ambos não exige igualdade absoluta dos horários. Desmontagem deve ser comprovada por Unbind ou evento explícito da 3022/2114/3012, não inferida da simples detecção. Dois defeitos da mesma PCBA em ciclos diferentes **não** compartilham automaticamente a mesma lista de materiais. A mesma falha num componente reutilizado é associação investigativa, nunca prova automática de causa.

## 4. Contratos negativos (bloquear downgrade)

| ID | Obrigação inegociável | Contraexemplo que teste deve cobrir |
|---|---|---|
| R01 | Rastreabilidade começa na ocorrência **3028** | Remontou depois: não usar últimos Y ou última falha 2114 |
| R02 | Manter todos os ciclos históricos sem os somar à montagem investigada | C1 tinha LCD A; C2 tinha LCD B; só B aparece como material de D2 |
| R03 | Material N hoje pode ter pertencido à falha antiga | Unbind > Defect Time preserva vínculo antigo |
| R04 | Desconhecido não é zero e não é pertencimento comprovado | N sem Unbind; sobreposição; grade parcial |
| R05 | Reuso físico tem Material SN e PCBAs anteriores comprovados | 2 linhas 3074 do mesmo SN/mesma montagem não viram 2 usos |
| R06 | Identidade de falha exige PCBA+Code+Time+escopo/revisão | Falha D1 não empresta 3022 para D2 do mesmo SN |
| R07 | Só 3022 fornece horário do processo de geração/controle | 7 falhas/2 passagens comprovadas → 5 para diagnóstico, não horário 3028 |
| R08 | 3022 exige confirmação do novo SN e grade atualizada | Troca SN, grade anterior ainda visível no ExtJS |
| R09 | A5700 alcançado não significa A5700 concluído | Current Oper=A5700 com Working Oper de posto anterior |
| R10 | Posto A5150 é referência estimada onde aplicável, nunca causa | Família sem posto mapeado: indeterminado, não inventar hora |
| R11 | Consulta por SN continua independente da Rastreabilidade por 3028 | Hoje Y e última falha podem ser mostrados, sem reescrever D anterior |
| R12 | Cobertura e origem por fonte/linha/dia/revisão | Job concluído, mas Material SN não consultado ou contexto 3022 ausente |
| R13 | Manter alertas antigos comprovados e UI limpa | Sem alerta acionável não mostrar painel vazio; detalhes 2114/3012 intactos |
| R14 | Atualizar dia operacional 07:00, turno 07:30 | Evento às 07:15 não muda dia produtivo incorretamente |
| R15 | Nunca substituir branch funcional sem diff e comparação | Melhorou 3074 mas perdeu 3022 identity refresh |

## 5. Portão de mudanças — histórico semântico append-only

Toda melhoria cria **nova entrada imutável**, sem substituir documentos anteriores, contendo:
- `change_id`, data, demanda, autor/aprovação, PR/branch, base SHA, head SHA;
- fonte/regra antiga, comportamento anterior e novo, motivo, impacto nas nove views;
- evidência negativa/contraexemplo, fixtures, testes automatizados + físicos, cobertura por fonte;
- hipótese de regressão, reversão, prioridade, status PENDING/GREEN/RED;
- vínculo para o diff e checks do commit exato.

Não sobrescrever versões anteriores nem aplicar arquivos completos do ZIP sobre o candidato. Comparar funções e migrar **seletivamente** melhorias comprovadas. A PR69 permanece DRAFT. A CI sintética não autoriza instalação ou merge.

## 6. Gates físicos ainda PENDING

1. PCBA Motor/Vibra do dia → 3074 base → componentes do ciclo na hora da ocorrência → Cboard físico → PCBAs anteriores. Conferir cada intervalo Bind/Unbind, paginação, Y/N e prova de relação, mesmo quando dashboard mostra zero.
2. Para cada ocorrência 3028 sem horário de geração 3022, conferir a grade do próprio SN, atualização do ExtJS, END LOT no posto esperado (por CPH/família), Hist Seq, offsets, status de referência e por que não houve associação.
3. Com duas falhas da mesma PCBA em diferentes ciclos, demonstrar que 3074/2114/3022 não misturam kits e que histórico completo continua disponível.
4. Comparar Rastreabilidade, Falhas/FPY, Consulta SN, dashboard de reuso, alertas e histórico entre revisão original e candidata. Identificar claramente zero comprovado, parcial e indeterminado.

**Status:** auditoria documental salva, sem executar MES, alterar SQLite/token, instalar, publicar release, mexer na main ou dar GREEN físico.
