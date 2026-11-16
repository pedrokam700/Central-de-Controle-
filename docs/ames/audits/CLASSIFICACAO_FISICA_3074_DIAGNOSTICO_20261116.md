# Diagnóstico independente — classificação física 3074

Fase de investigação, anterior a mudanças de runtime. Base obrigatória: PR86,
`5c19beee85125830e0b483c5cf9708eb8de25228`; CI de referência
[43907084203](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/43907084203).
Branch isolada: `work/ames-3074-physical-use-audit-20261116`.
Nenhum dado operacional foi acessado. Este diagnóstico demonstra mecanismos
com registros sintéticos; não atribui a eles as 98 PCBAs indeterminadas da fábrica.

## Antecedentes confrontados

Leitura dos contratos e auditorias transversais de 16/11: `AUDITORIA_TRANSVERSAL_CENTRAL_20261116.md`,
`CODEX_REVISAO_INDEPENDENTE_20261116.md`, `CODEX_PARECER_INDEPENDENTE_20261116.md`,
mapa de arquitetura ativo e requisito canônico das nove views. Continuidade:
handoffs PR69 recuperação/auditoria 3012, PR70 fronteira 3012, UNKNOWN/2114,
regressão reuso/técnicos e continuidade de 12/11; cadeia de PRs #71–84 e seus
testes de recuperação, nomes, checkpoint, escopo, Home/CDP e ExtJS.
PR86 e seu handoff/diagnóstico são a referência da timeline já aprovada.
O parecer anterior registra igualdade dos módulos de classificação F22→F78;
isso afasta atribuir automaticamente toda regressão a alteração nesses arquivos,
mas não testa os dados de entrada, seleção de revisão ou projeções posteriores.

## Caminho dos dados e contratos

1. `core/varredura_3074.py` recebe a consulta da própria PCBA e consulta reversa
   de cada componente. `components_no_momento` separa vínculo temporal comprovado
   de candidato; cobertura parcial impede certificar zero PCBAs anteriores.
2. `store.save_snapshot_payload` guarda o head e revisões brutas imutáveis em
   `snapshot_payload_revisions`. `material_reuse` é índice derivado dos componentes,
   não substitui as linhas brutas de montagem da própria PCBA.
3. `agent.trace_insights` carrega apenas o SQLite/snapshot selecionado; com mais
   de uma revisão usa `integrated_snapshot_history.recover_snapshot_line` por
   identidade exata PCBA+código+instante+linha. Não busca outro dia/banco.
4. `engine_bridge.build_trace_insights` chama `reports/relatorio_v015._build_views`.
   A própria PCBA usa `core/uso_pcba.reconstruir_usos_pcba`; os componentes passam
   por `reports/relatorio_3028_3074.extrair_linhas` e pelo resumo material V015.
5. `canonical.export_revision` persiste projeções por versão/epoch. Um insight
   `ready:true` da mesma versão é reutilizado. Atualização de semântica precisa
   invalidar a versão da projeção, preservando exports antigos.
6. `data/reuse-cohorts.mjs` consome datasets e insights para os comparativos e
   Dashboards. Timeline da Issue85 descreve eventos, não calcula usos físicos.

Contratos: 3074 armazenada não equivale a vínculo físico próprio; 2114/3022,
número de defeitos, estações, PN e quantidade de componentes não provam ordinal.
`Iss Status N` atual não apaga montagem histórica. Contagem conhecida e ordinal
no instante da falha são fatos diferentes. Cobertura parcial não prova ausência.
Nenhum campo ausente autoriza inventar vínculo, zero, primeiro ou segundo uso.

## Causas demonstradas na base

| ID | Evidência de código | Reprodução e contrato violado |
|---|---|---|
| P1 | `integrated_snapshot_history.base_score`: presença/quantidade de own rows antes da revisão; reconciliação retorna cedo se seleção não tem Bind Time | SQLite conserva revisão com vínculo válido; nova consulta com três linhas próprias sem data vence a antiga com uma data. Insight passa de uso 1 para sentinela desconhecido 0. Informação armazenada foi ocultada na seleção. |
| P2 | `relatorio_v015._pcba_item_map`: chave somente SN; filtro de linha ocorre depois de `_build_views` | Mesmo SN em duas linhas no mesmo payload: última base vazia da outra linha substitui a base válida. Linha solicitada perde classificação antes do filtro. |
| P3 | `temporal_3074`: funções reversas exigem `Sn Type` contendo PCBA; classificador próprio aceita também `Aut Cmf1=PCBA` | Linha explicitamente marcada PCBA em Aut Cmf1 com Sn Type vazio é ignorada na reversa. Vínculo presente não reconhecido, embora própria PCBA aceite esse formato. Não se propõe aceitar barcode sem marcador PCBA. |
| P4 | `uso_pcba`: fallback para último ciclo anterior mesmo com Unbind anterior à falha; sobreposição escolhe último candidato | Histórico conhecido é convertido em ordinal durante lacuna temporal; duas montagens sobrepostas recebem ordinal arbitrário. Deve manter contagem conhecida e ordinal desconhecido. |
| P5 | `relatorio_3028_3074`: `(previous_pcba_count or 0)+1`; V015: `int(... or 0)+1` | Contador ausente vira primeiro uso, inclusive componente com histórico conhecido mas sem vínculo na falha. São duas conversões consecutivas; corrigir só a primeira não resolve o insight. |
| P6 | `canonical.export_revision` deriva `material_use_index` sem verificar cobertura; ingestão aceita legado parcial com zero | Registro parcial explicitamente marcado `incomplete_page`, current confirmado e zero anterior vira primeiro uso. O coletor atual normalmente evita produzir esse zero; o índice/projetor precisa defender a leitura de legado. |
| P7 | `canonical.PROJECTION_VERSION=11`, cache `ready:true`/epoch inalterado | Sem renovar versão, dados já salvos não são recalculados com as correções. Teste com SQLite real exige nova revisão e conserva a antiga. É requisito da implantação da correção, não prova de que a versão 11 era incorreta quando criada. |
| P8 | `reuse-cohorts.add` só rejeita linha explícita, `reference` carimba origem/revisão raiz | Insight com source_id/snapshot/revisão explicitamente contraditórios ainda classifica uso 2 e parece evidência da raiz. Reprodução de fronteira; não há evidência de que o produtor atual tenha emitido tal payload na fábrica. |

## RED e controles

`python3 scripts/agent-3074-physical-classification.test.py`: 12 testes, 9 falhas
de asserção, sem erros de execução. `node --test scripts/ames-3074-physical-classification.test.mjs`:
2 testes, 1 falha. Commit RED contém apenas estes testes, este diagnóstico e
gate CI da nova branch. Nenhum runtime alterado nesta fase.

Matriz positiva: PCBA em usos 1/2/3, Y e N, operações duplicadas por ciclo;
componente transferido por 1/2/3 PCBAs. Negativos: sem self-link, sem relógio,
data inválida/futura, lacuna, sobreposição, outra linha, revisão menos informativa,
outro snapshot vazio, fonte/revisão contraditória, histórico parcial e histórico
conhecido sem prova temporal. Testes usam `TemporaryDirectory`/SQLite novo,
sem importar o startup de `agent.py`, acessar Chrome fabril ou abrir o MES.

## Cinco situações exigidas

| Situação | Decisão auditável |
|---|---|
| Vínculo realmente ausente | Sem linha própria PCBA identificada, não inferir uso a partir de componentes ou 2114. Contagem 0 interna significa nenhum ciclo reconhecido, não prova física de zero usos. |
| Presente mas ignorado | P1/P2/P3 reproduzem perda/recusa de evidência já disponível. Corrigir seleção/identidade/alias comprovado. |
| Montagem conhecida sem prova na falha | Manter ciclos conhecidos; P4/P5 eliminam ordinal fabricado na lacuna, conflito e componente não comprovado. |
| Escopo/linha/source/snapshot/revisão | P1/P2/P7/P8 demonstram perda/reuso indevido. Não recuperar de outro SQLite, snapshot ou linha; não reescrever revisões antigas. |
| Persistência/normalização/projeção | Brutos/revisões permanecem íntegros no teste P1; erro ocorre depois da persistência. P3 normalização; P5/P6 projeção; P7 cache. Não há prova de perda do bruto no armazenamento fabril. |

## Plano mínimo por módulos

1. Seleção local: favorecer self-row confirmado com data interpretável (Bind ou
   Batch+Prod reconhecido pelo motor) sobre volume sem prova. Preservar a união
   existente apenas de self-bindings confirmados, sem unir materiais/páginas.
2. Relatório: indexar base por ocorrência e linha, manter desconhecido material
   em ambas as projeções. Não alterar timeline, nomes ou fonte de técnicos.
3. Temporal: reconhecer marcador explícito Aut Cmf1 PCBA também na reversa;
   exigir intervalo único na falha; não alterar a coleta nem os cinco segundos.
4. Canonical/ingestão: não certificar primeiro uso de parcial explícito;
   renovar versão derivada sem migração de schema nem reescrita de bruto.
5. Dashboard: rejeitar linhagem explicitamente incompatível antes de adicionar
   evidência; aceitar legado sem metadado opcional conforme contrato existente.
6. Rodar matriz, motor completo, todos os contratos Node, contratos cruzados
   Python e Chromium nove telas + timeline/sync/pairing/conclusão 3028. Publicar
   CI e handoff de mesmo SHA; PR DRAFT baseada em #86. Sem instalador.

## Pendências e hipóteses que não viram correção arbitrária

- Não possuímos SQLite/captura/identidade/revisão do posto que explique os números
  98/825 e as diferenças dos prints. Os mecanismos P1–P8 são comprovados em
  código/sintético, a incidência fabril de cada um continua sem comprovação.
- Batch Id+Prod Time sem Bind é contrato histórico explícito do motor V013;
  permanece base temporal `pcba_batch_prod`, não é fabricado Bind Time. A equivalência
  entre esse horário de lote e vínculo físico exato precisa de validação MES.
- Componentes contam PCBAs distintas no contrato vigente. Retorno da mesma peça
  à mesma PCBA, intervalos incompletos e identificadores de sessão ausentes não
  autorizam converter quantidade de linhas em ordinal exato. Alterar essa definição
  exige prova física/contrato novo; não será incluído como conserto silencioso.
- Uma página parcial permite apenas observações/lower bounds; não passa a provar
  completude histórica ou populacional. Não resolver lacunas executando nova coleta.
- Instalação, guardian, rede, main, PR70/84/86, dados operacionais e referências
  permanecem preservados. GREEN sintético nunca equivale a GREEN físico.
