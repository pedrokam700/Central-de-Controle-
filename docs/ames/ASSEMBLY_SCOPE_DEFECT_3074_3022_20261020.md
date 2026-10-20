# Gate físico — identificar montagem da ocorrência (3028→3074→2114→3022)

Data 2026-10-20. PR #42 candidata; não alterar agente instalado/SQLite/outbox/porta 8765 ou main/Firebase por estas instruções.

## Problema observado no posto

A AWIP3074 devolve **vários ciclos** de vínculo para a mesma PCBA, incluindo componentes do passado, da montagem que falhou e de remontagens **posteriores**. Em Iss Status, **Y/N descreve a situação atual da consulta**, não o vínculo no instante da falha. AT pode já ter desvinculado tudo (N) ou linha pode já ter criado novos Y. Consultar indiscriminadamente todos os Barcode do grid da PCBA faz busca em material SN de montagens erradas e fabrica associação entre falha e materiais não presentes naquele conjunto.

## Regra canônica — uma ocorrência, uma montagem temporal

1. **Âncora da falha** = PCBA SN + Defect Code + Defect Time **da ocorrência 3028** selecionada. Horário local de falha é America/Sao_Paulo (-03:00 para evidência MES de 2026); grid 3074 mostra instantes com offset e/ou UTC. **Nunca** selecionar montagem pelo último Iss Status, último Bind, data atual da consulta ou maior snapshot.
2. **Consulta 3074 da PCBA uma vez**: preservar o grid bruto como auditoria; para **cada Barcode material** reconstruir [Bind Time, Unbind Time). Apenas o vínculo comprovadamente ativo no instante T entra no escopo: `bind <= T` e `unbind > T` (ou, quando Unbind vazio, Y e ausência de conflito). Se vínculo terminou antes de T, excluir; se começou depois T, excluir; se hora não existe/é contraditória, empate no mesmo segundo, N sem hora de Unbind, ou intervalos conflitantes, **não tratar como pertencente à falha**. Esses casos ficam separados como `time_unknown`/`boundary_ambiguous` para revisão. Vínculos com N hoje mas com Unbind depois de T continuam pertencentes à montagem de T.
3. **Somente após esse corte**, consultar as **Material SN selecionadas** individualmente na 3074, com memoização por execução/SN e checkpoint. Na consulta do material, filtrar associações iniciadas **até T** e distinguir PCBA atual das PCBAs anteriores/desvinculadas. Vínculos mais novos que T são histórico completo visto agora, **não** evidência da montagem que falhou. A consulta do material deve confirmar também a PCBA atual; sem essa segunda confirmação, material fica `VINCULO_PCBA_ITEM_NAO_CONFIRMADO`, histórico anterior como candidato separado, sem promover reuso comprovado.
4. A **2114** consulta a PCBA falhada e PCBAs anteriores ligadas **somente aos materiais selecionados**; comparação de defeito igual/semelhante é contexto, jamais causa. 2114 Manual/Automatic é modo de registro do caracterizador, não reparo.
5. A **3022** identifica passagens de posto para a **mesma PCBA**. A `Operation` da 3074 aponta o posto do vínculo; comparar com `Working Oper` que tenha um `END LOT` realmente concluído na 3022, entre Bind Time e Defect Time. Não usar `Current Oper` como prova de conclusão. Se não houver 3022, data incompatível ou código diferente, marcar `not_confirmed/unavailable`, sem inventar passagem nem negar o vínculo da 3074. Não fixar posto por nome de componente.
6. **Duas dimensões separadas**: uso da PCBA principal (índice de uso/quantos vínculos/últimas desmontagens) e reutilização de cada material físico (SN, tipo, PN, PCBAs anteriores, falhas anteriores). Recontar kit LCD como componentes físicos distintos somente quando têm identidade comprovada. Taxas e componente sem falha exigem coorte e desfecho observados, não amostra de defeitos.

## Duas modalidades de consulta

- **Rastreio profundo a partir das Falhas 3028**: âncora **exata** por ocorrência, filtro 3074 por T **antes** de buscar Material SN. Conjunto histórico não é todos os vínculos da PCBA. Saída `assembly_scope.basis='3028_exact_pcba_defect_time'` e campos `selected_items`, `uncertain_items`, `future_links_excluded`, `past_links_excluded`. Sem registros 3074 temporais comprovados = `incomplete/unknown`, nunca valor zero de peças utilizadas.
- **Consulta individual por SN sem ocorrência 3028 explícita**: **não** pesquisar os materiais indiscriminadamente. Primeiro obter 2114 da PCBA e usar o último Defect Time disponível **apenas como referência investigativa provisória**, rotulada `selected_at_latest_2114_candidate`, então consultar somente materiais correspondentes. Se 2114 não trouxer Defect Time válido, `no_defect_anchor` e **zero chamadas de consulta para materiais**, deixando o histórico bruto e a insuficiência de prova visíveis. Esse resultado não valida um caso 3028 antigo distinto. Para histórico de uma falha específica, executar rastreio profundo do 3028.
- **Sem confundir limite físico**: a AWIP3074 vista em 20/10 mostra muitas linhas de montagens passadas e atuais; ela não prova por si só a integridade/completude da história. 3022 e 2114 são corroborativos, não garantias de que a grade 3074 registrou todos os vínculos.

## Casos de prova obrigatórios

- PCBA reutilizada com várias remontagens, item antigo N/desvinculado **antes** de T excluído; item N desvinculado **depois** de T selecionado; item Y criado **após** T excluído mesmo se mais recente.
- N atual sem Unbind Time e Bind Time antigo = não se sabe quando saiu, **não promover**. Vínculos com Unbind exatamente igual a Defect Time são ambíguos no segundo MES; não incluir por aproximação.
- Mesmo item com duas linhas no **mesmo vínculo** por posto deduplicado. Intervalos de ciclos incompatíveis = condição indeterminada, nunca escolher pelo maior Bind aleatoriamente.
- Material consulta: se Item SN não confirma vínculo com a PCBA falhada, não promover PCBAs anteriores e taxa de reuso como comprovadas.
- Prova do posto: `Working Oper` e `END LOT`, PCBA igual e `bind<=event<=defect`; `Current Oper`, REPAIR e evento futuro não validam a passagem.
- Fluxos de consulta: sem repetir consultas MES dos mesmos componentes em falhas da mesma montagem quando memoizadas, sem inventar reparo 3012 por PCBA isolada. Dados locais e shared permanecem distintos e protegidos.

## Gate de homologação

Scripts isolados `scripts/agent-assembly-scope.test.py` e `scripts/agent-individual-assembly.test.py` em Linux/Windows. CI confirma lógica de contrato, não garante AWIP3074 real: no posto da fábrica, com backup e autorização, comparar uma PCBA com múltiplos vínculos, datas e 3022; registrar número de candidatos (excluídos futuros/anteriores/desconhecidos) e os materiais efetivamente pesquisados. **Até essa prova, PR42 segue draft e físico PENDING**. Nunca sobrescrever a pasta anterior ou reiniciar coleta passada cegamente.
