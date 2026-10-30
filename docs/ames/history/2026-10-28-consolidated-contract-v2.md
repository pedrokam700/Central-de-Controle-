# Contrato consolidado A-MES V2 — segunda auditoria, 28/10/2026

**Fonte:** seis ZIPs de fábrica enviados pelo operador; manifesto `2026-10-28-archive-manifest.json`, árvore `2026-10-28-archive-logic-lineage.md` e código real PR69. **Status:** revisão estática + testes sintéticos; ACEITE FÍSICO PENDING. PR69 DRAFT, sem merge/deploy/release. Não subir ZIP/SQLite/tokens.

## A decisão: grafo temporal é projeção derivada, não substituição

A proposta de relacionar falhas, montagens, materiais, passagens e reparos é compatível com as regras antigas **apenas se** implementada primeiro como visão de evidências somente leitura, mantendo coletores, banco, report V0.16, nove views, relatórios e alertas anteriores.

Referencial **único da Rastreabilidade**: ocorrência `D` da 3028, definida por snapshot/revisão, linha, PCBA, Defect Code/descrição, horário de registro da falha e modo de detecção. Quando a mesma PCBA falha D1, D2, D3, cada D precisa do seu próprio recorte temporal 3074, histórico de materiais, passagens e correlações. Uma única consulta de grade da PCBA pode ser reutilizada com validade/revisão, mas o **resultado da seleção não pode ser reaproveitado entre as falhas**.

### Linha do tempo e diferenças entre as fontes

- **3028**: registra/detecta falha e comentário Repair Comment disponível. `Defect Time` é limite temporal e chave de ocorrência, não hora de fabricação/geração.
- **3074**: `PCBA+Material SN+Sn Type+Operation+Bind+Unbind+Iss Status`; eventos de montagem, desmontagem quando comprovada e vínculos Y/N atuais. N hoje com Unbind depois da falha pode pertencer a D; N sem Unbind é indeterminado. Y novo com Bind posterior à falha não entra no kit da D.
- **3022**: passagens de processo por posto e SN; `Working Oper + END LOT` evidencia posto concluído, `Current Oper` é frequentemente próximo destino e não prova conclusão. Para D, buscar última passagem **relevante e concluída antes de D no ciclo correto** conforme CPH/família; corroborar `Operation` da 3074 com posto da 3022 quando houver prova. Horário do processo não é necessariamente o instante exato de origem física do defeito.
- **2114**: histórico com `Hist Seq`, tipo de análise (Phone Disassembly/MainBoard), Repair Status e falhas. Hist Seq não substitui timestamp ausente; tempo/ordem entre PCBAs distintas não pode ser adivinhado.
- **3012**: reparo e comentários, AT cruzado com `3022 Tran User` somente com evidência temporal/identidade; não atribuir reparo à falha por coincidência de PCBA.

**Grafo de prova:** D(3028) → C(D)(montagem temporal 3074) → Material SN realmente elegível → histórico completo 3074 do material → PCBAs distintas/ciclos anteriores → falhas 2114/3012 → relação código/família + grau temporal. Em paralelo, D → passagem concluída 3022 da PCBA no posto aplicável, turno e eventos de reparo/retorno. Outras montagens da PCBA investigada permanecem no histórico, **não no kit C(D)**.

**Consulta individual por SN NÃO usa a mesma âncora.** Ela trata última falha 2114 e montagem Y atual; comparação “atual x última falha” somente com prova de novo Y posterior à falha, sem apagar recorrência própria da placa.

## Cobertura e números

**Não confundir** segunda PCBA distinta que usou um componente com segundo ciclo físico de montagem do mesmo componente (que pode voltar à mesma PCBA). `historico_completo_pcbas_do_item` deduplica PCBAs; `ciclos_fisicos_do_material` deduplica intervalos físicos. Duplicatas de posto/linha de grid não contam como novo uso. Nunca contar `unknown` como zero.

Para cada fonte/ocorrência exigir status próprio: `NOT_COLLECTED`, `PARTIAL`, `COMPLETE`, `NO_MATCH`, `AMBIGUOUS`, `ERROR`. Uma coleta concluída não garante que todos os Material SNs foram consultados, nem que as 7 ocorrências receberam hora 3022. No gráfico de geração, só referências 3022; ausências devem apontar PCBA, razão e posto, **nunca fallback da 3028**. Preservar dia operacional 07:00 e turno 07:30.

## Diferenças dos ZIPs e integridade

- S1 V0.8: âncora 3028 + intervalos 3074, checkpoints.
- S2 0.5.22: integração 3028/3074/2114, lógica anterior aos limites temporais reforçados.
- S3 931f/S6 PR37: proteção do ciclo ExtJS 3022 e da resposta do SN correto.
- S4 dbe424da: `boundary_ambiguous`, N sem Unbind incerto, `assembly_scope`, `corroborar_posto_3022`, regras A5150 estimativas e atualização de turno/data.
- S5 1e65eb71: variante de processamento 3022 com proteção de refresh da tela menos explícita; não copiar integralmente.
- PR69: preserva componentes verificados da S4 e proteções posteriores, além do binding da página Home 3074 atrás do SessionObject. **Presença do código não prova resultado físico.**

## Duas lacunas concretas encontradas nesta auditoria, sem alteração precipitada de KPI

**GAP-T01 — histórico posterior pode ser confundido com falha anterior.** Em `ames/factory-engine/reports/relatorio_v015.py`, `_reuse_analysis(row, pcba_map)` compara a falha de D com **todos** os `histories` 2114 das PCBAs anteriores, sem filtrar nessa função os horários históricos relativos a D. Uma falha registrada depois de D ou sem Defect Time pode aparecer como “mesma falha” num histórico geral. Isso não comprova uma falha anterior à D nem culpa o componente. **Próximo passo:** preservar KPI legado como `relação histórica observada`, acrescentar status `anterior comprovado/posterior/tempo ausente` com fixtures, conciliar com MES real e só então mudar KPI/alerta de anterioridade.

**GAP-T02 — outra PCBA observada até D não implica anterioridade física comprovada.** `pcbas_do_item_ate_a_falha()` exige que outro vínculo tenha **iniciado** antes do horário D, mas não prova sozinho que terminou antes de começar o vínculo da PCBA investigada. No grafo separar `PCBAs com vínculo anterior a D` de `uso anterior ao ciclo atual comprovado` e `intervalos conflitantes`, preservando ambas as visões.

## Gates obrigatórios, sem perda silenciosa

1. D1/C1 LCD-A+Cboard-X; D2/C2 LCD-B+Cboard-Y na mesma PCBA, mesmo código; nunca misturar kits.
2. Y após falha excluído do kit, N com Unbind após D incluído, N sem Unbind ou duplicação conflitante indeterminado.
3. Material Y/ N com 2 PCBAs históricas, Material SN pesquisado na 3074, 2114 de cada uma e comparação da falha com fonte.
4. Mesmo material em 2 ciclos da mesma PCBA: diferenciar ciclos físicos de PCBAs distintas; não inflar com registros de posto.
5. Falha 2114 posterior à D, sem hora e anterior comprovada: não promover causalidade/antecedente sem tempo.
6. 3022 troca SN com grade antiga: negar resposta até ciclo atualizado; `Current Oper` não é posto concluído; A5150 pode ser aproximação e não causa raiz.
7. 7 falhas 3028 / 2 horas 3022: 5 diagnósticos; não inventar hora de geração.
8. Alertas antigos: nomes/observações 3012/3022 comprovados visíveis, candidatos detalhados e caixa vazia escondida.
9. Fonte/revisão/linha protegidas, dashboard de reuso separado de Consulta SN, histórico imutável e origem informada.
10. Pareamento/guardian, local/Pages, atualizações seguras e 9 views não podem sofrer regressão.

**Aplicado agora na PR69:** teste sintético integrado `scripts/agent-multi-cycle-3028-3074.test.py`, conectado à Quality Gate, que executa o orquestrador verdadeiro com duas D, C1/C2, Cboard reutilizado em duas PCBAs e N sem Unbind. Não alterou cálculos/coletores em produção. CI do SHA exato no GitHub é a evidência de teste.

**Condição para alterar produção:** primeiro provas automatizadas para GAP-T01/T02 + caso Motor/Vibra/Cboard real e 3022 com 7→2; diff seletivo, evolução append-only, comparação de resultados antes/depois e aprovação física. PR69 continua DRAFT.

## Adendo de captura do histórico legado

A revisão do arquivo histórico `info.txt` revelou detalhes de captura que complementam este contrato sem substituí-lo: três stores da 3028 e o caso legítimo de unidades defeituosas ≠ ocorrências; consulta bidirecional da 3074 e proibição de usar `Batch Count` como contagem de reuso; coleta de todas as histórias 2114 da PCBA atual e das PCBAs anteriores; diferenças entre Manual/Automatic e Repair Status; 3012 direta pela grade/store com cache/chunking; fonte 3028 de Repair Comment; postos 3022 e Mat Id de produto ainda sem prova de BOM. Matriz verificada, status dos códigos e testes recomendados: [`2026-10-28-legacy-source-capture-audit.md`](./2026-10-28-legacy-source-capture-audit.md).

**Sem mudança funcional nesta revisão.** Não restaurar antigas instruções de instalação ou fases encerradas a partir de um arquivo histórico. Incertezas permanecem pendentes de teste físico.
