# Central de Trabalho / A-MES
## Manual canônico — captura, cruzamento e interpretação das telas

**Data:** 28/10/2026
**Candidata:** PR #69 — `work/ames-pilot-integration-57-66-20261027`
**Condição:** candidata automatizada; nenhum resultado do MES real desta nova revisão foi homologado. O código e as regras citados aqui foram examinados; os exemplos são ilustrativos, exceto quando explicitamente identificados como históricos de teste.
**Fonte de comparação:** seis ZIPs históricos, `info.txt` com as decisões anteriores, contrato V2, código atual da PR #69 e testes do GitHub.

### 1. A diferença essencial entre 3028 e 3012

**3028 = o recorte operacional consultado.** Para acompanhamento de hoje, normalmente a janela vai de 07:00 de um dia às 07:00 do próximo. Pode também consultar o dia anterior ou outra janela aceita pelo MES. Essa tela responde *quais ocorrências foram registradas no período e na linha selecionados*, suas quantidades, FPY, Check FPY, categoria, PCBA, modelo e dados já disponíveis de defeito/reparo. Não é uma fonte que deva ser tratada como histórico ilimitado de uma PCBA. Uma falha antiga fora do período pesquisado não será recuperada só porque a PCBA aparece hoje.

**3012 = pesquisa histórica de defeitos e reparos.** Para uma SN exata, a estratégia implementada tenta recuperar o período desde a data inicial configurada do A-MES até a data atual, usa a cobertura do SQLite e consulta apenas lacunas. Se uma consulta longa falhar ou atingir limite do coletor, o período é dividido em janelas menores, com checkpoint e deduplicação. *Sem limite histórico na análise* significa não ficar restrito ao dia da 3028; **não** significa que o MES aceite uma única solicitação infinita, que o banco possua dados anteriores à implantação do A-MES ou que nenhuma consulta tenha limite técnico. Para consultas gerais sem SN, utilizar janelas menores desde o começo.

**Campos de reparo:** `Repair Comment`, `Repair User`, `Repair Code` e `Repair Time` podem aparecer na 3028 para a ocorrência do período. Na 3012, esses campos são pesquisados historicamente. Se as duas fontes retornarem o mesmo reparo, preservar fonte e identidade; não duplicar a contagem. Se uma fonte estiver indisponível, não eliminar dados comprovados da outra. Comentário não confirma sozinho causa raiz ou qual passagem da AT produziu o reparo.

### 2. Conceito central: investigação por ocorrência, não apenas por PCBA

Cada ocorrência **D** contém, no mínimo, referência de snapshot/revisão, linha, PCBA, código e descrição da falha e `Defect Time` de registro. A mesma PCBA pode gerar D1, D2 e D3, com **montagens e componentes diferentes**. A consulta de dados brutos pode ser reutilizada com controle de versão/fonte, mas o recorte de montagem tem de ser calculado separadamente para cada D.

A Rastreabilidade parte da **D da 3028**. A Consulta por SN é outra análise: considera os vínculos atuais comprovados e a última falha histórica adequada da 2114; só apresenta *montagem atual × montagem na última falha* se houver prova de um novo ciclo Y posterior. Não converter uma análise na outra.

```text
3028: ocorrência D (PCBA, linha, falha, instante de registro, revisão)
  ├── 3074: PCBA → todos os vínculos de Material SN
  │    ├── Bind/Unbind/Operation → componentes do ciclo de D
  │    ├── Material SN de cada componente comprovado → consulta inversa 3074
  │    ├── PCBAs desvinculadas / ciclos históricos do material
  │    └── vínculos candidatos/incertos (SEPARADOS, nunca reuso comprovado)
  ├── 3022: passagens pelo processo, montagens, teste e reparos
  │    └── último posto RELEVANTE E CONCLUÍDO no ciclo D antes do registro
  └── 2114 + 3012:
       ├── todas as falhas da PCBA atual e PCBAs anteriores dos materiais
       ├── comentários/análises/reparos com fonte e identidade comprovadas
       └── relação: MESMA_FALHA / MESMA_FAMILIA / OUTRA_FALHA / SEM_HISTORICO
             ↓
       indicadores, alertas, histórico navegável, consultas e exportações
```

### 3. Coleta da 3028, passo a passo

1. O agente local acessa o A-MES na aba Home autenticada do Chrome dedicado, via Playwright/CDP; não guarda senha.
2. Escolhe a linha TAN10101, TAN10102 ou TAN10103, janela de coleta e demais filtros aplicáveis. Coletas de várias linhas devem ser **serializadas no MES**; cada linha mantém snapshot próprio.
3. Lê os stores ExtJS de **resumo** `grdListByConds`, **classificação** `grdListByConds2`, **agrupamento** `grdSum` e **detalhe** `grdListDetail`, percorrendo a paginação com confirmação de retorno. Esses stores têm semânticas diferentes.
4. Preserva `Line Id`, PCBA/Lot Id, CPH, Defect Code, Defect Desc, Defect Oper, `Defect Time`, categorias, Manual/Automatic e campos de reparo que vierem. Não transforma códigos desconhecidos em descrições inventadas.
5. Verifica cobertura por store e por linha/modelo. O número de **unidades defeituosas** do resumo pode ser menor do que a quantidade de **ocorrências** do detalhe, pois uma PCBA pode ter várias falhas. Por exemplo, 44 unidades e 65 ocorrências são coerentes. Não exigir `resumo == detalhe`. Reconciliar o agrupamento e o detalhe por suas próprias semânticas.
6. Salva snapshots/revisões. Ao atualizar uma linha, não apaga as outras. Se um registro desaparecer após AT remover um NG falso, o snapshot antigo permanece para auditoria; não declarar automaticamente a causa da remoção.
7. `Defect Time` é a hora do **registro/detecção** na fonte; não é o horário em que o componente foi instalado, nem a hora provável de origem física do defeito.

### 4. Coleta da 3074, passo a passo

**Pesquisa principal:** selecionar explicitamente Home/3074; após clicar View, provar atualização do ExtJS e que o grid pertence à SN consultada. Ler todas as páginas. Grade antiga, zero sem confirmação e primeira página incompleta **não** são evidência de ausência de material.

**Direção 1 — PCBA → componentes:** obter todos os Material SN serializados da PCBA, mesmo quando se investiga uma falha específica. Para D, classificar cada vínculo com `Bind Time`, `Unbind Time` e `Defect Time`: `Bind <= Defect` e, quando comprovado, `Unbind > Defect` indicam que o intervalo contém D. `Unbind == Defect`, horários inválidos, intervalos conflitantes ou N atual sem Unbind suficiente ficam **incertos**, separados dos comprovados. Material instalado **depois** de D não integra o kit atribuído à falha antiga. A foto atual `Iss Status=Y/N` não reescreve o passado.

**Direção 2 — Material SN → PCBAs:** para cada material comprovadamente relacionado a D, consultar a própria Material SN na 3074, obter todas as PCBAs vinculadas e ordenar os intervalos. Distinguir **PCBAs diferentes** de **ciclos físicos** de vínculo, pois um material pode voltar à mesma PCBA. Desconsiderar linhas duplicadas da mesma operação/ciclo. `Batch Count` da 3074 **não** é quantidade de usos.

**Estado atual da correção:** vínculos temporalmente incertos são preservados em `candidate_material_history`, nunca somados ao indicador de segundo uso comprovado. A consulta inversa extra desses candidatos é **opt-in** na função, para não alterar automaticamente o número de acessos ao MES nem misturar peças de outro ciclo; por padrão, o relatório preserva sua identificação e marca a auditoria como pendente. A varredura também marca quando a própria grade base está parcial, em vez de classificar a ausência de linhas comprovadas como zero. O retry automático de checkpoints parciais pelo orquestrador central continua exigindo validação; seu arquivo de fluxo permanece congelado pelo gate CLEAN V3.

**Reuso comprovado:** vínculo atual à montagem de D demonstrado + uso histórico elegível, observados intervalos e cobertura. Ter outros SNs de PCBA antes de D não basta, por si só, para provar a ordem física completa dos ciclos nem a causa da falha. Distinguir `segunda PCBA` de `segundo ciclo de uso`.

### 5. Coleta da 2114

1. Na aba OPC, confirmar abertura da `AWIP2114` e o Shift exigido pela consulta. Uma seleção de Shift não confirmada é falha **somente da fonte 2114**, não um motivo para apagar a 3028/3074/3022/3012.
2. Consultar **todas as histórias da PCBA atual da 3028** e, para materiais históricos elegíveis, **as histórias das PCBAs desvinculadas** que a 3074 encontrou. Não consultar só as PCBAs antigas dos componentes: perderíamos recorrência da própria PCBA atual.
3. Conservar `Defect Hist Seq`, código e descrição, `Defect Type`, `Repair Status` e Manual/Automatic sem reinterpretá-los como um único campo. `Repair Status=N + Defect Type vazio`, `MainBoard + N`, `MainBoard + Y` e `Phone Disassembly + Y` representam situações diferentes. Manual/Automatic indica modo de registro, não conclusão de reparo.
4. `Hist Seq` ordena a história do MES, mas **não fabrica Defect Time**. Para recuperar tempo ausente, tentar associar por PCBA+falha+ocorrência única comprovada em 3028/3012; se houver duas ocorrências indistinguíveis, manter ambíguo.
5. Uma PCBA anterior com **mesma falha** gera correlação investigativa. Para rotular como **falha anterior à ocorrência D**, exige-se ordem temporal demonstrada. Sem horário, mostrar histórico conhecido, não anterioridade certa.

### 6. Coleta da 3022 e horário de geração

1. Consultar o histórico do **mesmo SN** na 3022, com confirmação de que o store ExtJS atualizou após cada troca de SN. Uma grade da consulta anterior não serve.
2. Guardar passagens reais com operação/posto, horário, `Working Oper`, `Current Oper`, evento/ação, Hist Seq e informações de operador quando retornadas. `Working Oper + END LOT` é prova forte de passagem **concluída**; `Current Oper` pode apenas indicar o destino, e não conclusão.
3. Para cada D, resolver as regras por **CPH/modelo + família/código/descrição + modo da falha**. Exemplos: A5100 para começo de montagem e pré-montagens específicas; A5150 para scanner e aproximação funcional; A5162 para limpeza/tampa/câmera; A5202 para teste de corrente; A5265 marca início do segmento de testes. Isso é **configurável**, não uma tabela universal de causa raiz.
4. Se a PCBA passou mais de uma vez pelo mesmo posto após AT/retrabalho, selecionar a passagem concluída **do ciclo correto antes do Defect Time**; não pegar a última passagem global nem aquela depois da falha. Quando não se consegue identificar o ciclo, informar ambiguidade.
5. Cruzar `Operation` e `Bind Time` da 3074 com passagens do posto na 3022: um vínculo pode ocorrer antes ou próximo de uma passagem e precisa de tolerâncias e contratos de evento, não igualdade artificial de timestamps.
6. O horário exibido como **referência de geração/montagem** é exclusivamente derivado da 3022, mesmo se a falha for registrada horas depois na 3028. A passagem comprova um instante no processo relevante; ela **não prova necessariamente o instante físico exato em que o defeito surgiu**. Se não houver passagem válida, manter horário não comprovado e diagnosticar PCBA, posto, regra, grade e identidade — nunca usar o Defect Time da 3028 como substituto.
7. Turno e data de produção devem derivar do horário de passagem comprovado na 3022. Distinguir início do **dia de coleta 3028 às 07:00** da fronteira de **turno de produção às 07:30**; não recalcular a jornada com `Defect Time`.
8. A6900 / Export Repair e postos de retorno podem ajudar a obter AT, entrada/saída e retorno da peça; o posto de retorno **varia com o reparo**. Usar `Tran User`/código e nome real somente quando o MES comprovar o vínculo. Não presumir A5201 ou A5012 para todos os casos.

### 7. Coleta da 3012 e seus usos

**Consulta individual por SN:** data inicial configurada do sistema → hoje. Verificar cobertura no SQLite; solicitar somente lacunas, de preferência uma janela maior para SN exata; se exceder limite/timeout, dividir em janelas menores, checkpointar cada intervalo, deduplicar resultados e retomar. A janela técnica pode chegar a 365 dias por chamada conforme o coletor; isso não limita o histórico total da análise. Um período anterior à instalação do MES não pode ser inventado.

**Coleta direta:** ler store/grade ExtJS na tela 3012 e seus campos de falha, reparo e comentário. A mudança de exportação Excel em duas etapas não deve ser requisito para a coleta normal. Exportação é opcional.

**Três aplicações distintas:** (a) enriquecer o caso por SN individual; (b) recuperar comentário/análise de PCBAs anteriores encontradas pela 3074; (c) pesquisa histórica por período. Em qualquer uma, preservar evidência de fonte e intervalo coletado. A 3012 não substitui 2114/3028; ela acrescenta detalhes e temporalidade quando confirmados.

### 8. Cruzamentos entre as fontes

**A. PCBA atual com recorrência:** D (3028) + todas as histórias da própria PCBA (2114). Mostrar código e descrição de cada falha anterior, Hist Seq/tipo de reparo, tempo quando provado, status atual da ocorrência relevante, comentário 3028/3012/AT. A mesma família não significa mesma causa; reparar placa mais de uma vez é histórico, não prova automática de falha de placa.

**B. Componentes do ciclo de D:** PCBA D → 3074 Bind/Unbind (montagem de D) → Material SN → PCBAs anteriores do mesmo material → 2114/3012 dessas PCBAs → comparar códigos e família com D. Exibir PCBAs desvinculadas, falha anterior por descrição, comentário e horários/turnos relevantes da 3022. **Não** incluir componentes Y montados em ciclo posterior como peças da falha antiga.

**C. Datas/horários e reparos:** 3028 é registro; 3074 é vínculo/desvínculo; 3022 é passagem e ciclo operacional; 2114 é histórico de falha/classificação; 3012 é histórico detalhado de reparo/comentário. Eventos homônimos de fontes diferentes devem manter origem. Coincidência apenas de SN ou código não atribui comentário a uma ocorrência específica.

**D. Correlação de defeito:** mesmo código de falha = `MESMA_FALHA`; mesmo grupo configurado = `MESMA_FAMILIA`; outra categoria = `OUTRA_FALHA`; sem evidência suficiente = `SEM_HISTORICO` ou `INDETERMINADO`. Falha anterior **precisa ser temporalmente anterior** para ser chamada de anterior comprovada; sem Defect Time confiável, indicar associação histórica sem ordenar.

**E. Falhas em conjuntos:** LCD, speaker, sub-board etc. podem aparecer como várias Material SNs do mesmo conjunto. Preservar cada vínculo físico; não multiplicar o número de PCBAs afetadas. Métricas diferentes: PCBAs únicas, famílias/conjuntos, Material SN únicos, vínculos individuais e ciclos de uso. `2 vínculos` não significa `2 causas`.

### 9. Como os números e telas devem se comportar

**Rastreabilidade:** investiga as falhas da **3028 do período/linha escolhidos**, não última falha histórica da 2114. Cada D tem kit e evidências próprios. Histórico de outras montagens deve estar disponível separadamente para o técnico.

**Consulta por SN:** usa histórico amplo e a montagem atual quando comprovada; pode comparar atual/última falha em casos aplicáveis. Falha parcial de uma fonte não derruba toda a investigação. Alertas somente aparecem com evidência acionável. Comentário confirmado da 3012/3028 e nome de AT validado não podem desaparecer.

**Falhas do dia & FPY:** todas as ocorrências da 3028 no filtro, ranking e Pareto de todas as falhas, com horário de referência 3022 *se provado*. Mostrar `horário de registro (MES)` separadamente e não no gráfico de geração. Faltas na 3022 mostram motivo e SN. Não mostrar Defect Code cru como informação principal, mas guardá-lo internamente para o cruzamento exato.

**Dashboard de reuso:** manter tabela detalhada e visão PCBA única versus vínculos. Zero significa coleta completa que comprovou ausência; `não coletado`, `parcial`, `indeterminado`, `erro` e `cache` são outros estados. Fonte antiga, revisão, linha e dia sempre identificados. Não declarar que segundo uso causou falha.

**Linhas e snapshots:** TAN10101, TAN10102, TAN10103 independentes; uma atualização não apaga outra. O contexto operacional selecionado deve seguir entre views quando aplicável, e uma tela sem snapshot não pode parecer mostrar zero falhas de todas as linhas.

**Relatório Excel:** preservar as seis abas do padrão V0.16, tabelas planas, filtros, links, descrições e a origem/cobertura. Export não é requisito para analisar na interface.

### 10. Segurança do processo e confiabilidade da captura

- Um Chrome dedicado A-MES e um agente local por posto, com coleta serial na sessão MES e sem automações concorrentes na mesma porta.
- A rota de rede da fábrica deve coexistir com a Ethernet, sem alteração desnecessária do gateway, DNS ou proxy.
- Login manual; não guardar credenciais. O 2114 fica em OPC; 3028/3074 e a 3012 canônica ficam em Home. Não reutilizar por engano aba OPC para leitura da 3074.
- Confirmar resposta **da SN recém-consultada**, refresh do ExtJS e todas as páginas antes de declarar cobertura completa; não reutilizar cache de outra revisão/linha sem compatibilidade.
- Agente, SQLite e consulta devem funcionar localmente/offline quando os dados já estão disponíveis. Internet/Pages/Firebase não são dependências do caminho crítico de pesquisa local.
- Mudanças devem preservar o historial de fonte e ser registradas na PR/árvore de lógicas; testar antes e depois; não misturar banco, WAL, token e config de pastas diferentes; não promover CI sintética a homologação física.

### 11. Correções desta candidata e limitações conhecidas

**Ajustado na PR #69 nesta etapa:** a varredura da 3074 conserva candidatos temporais com motivo e SN (sem somá-los ao reuso comprovado), disponibiliza auditoria inversa como recurso opt-in, marca a grade base parcial e a ausência de componentes comprovados como **não equivalente a zero**, e reaproveita resultados anteriores apenas quando não classificados como erro/consulta parcial. A lógica central `fluxo_3028_3074.py` ficou restaurada byte por byte porque o gate de regressão CLEAN V3 impede alterações nela. Novo teste sintético cobre candidatos, reuso comprovado e ausência aparente com paginação parcial; o teste de múltiplos ciclos anteriores também permanece.

**Já presente, não refeito nesta etapa:** 3028 paginada/serializada, 3012 direta e histórica com cache/chunking, 3022 com referência por CPH/família e evidências de END LOT, 2114 histórico com todos os registros, Consulta SN atual versus última falha e regras de proveniência.

**Ainda dependente de evidência real:** Cboard Motor/Vibra não classificado no Dashboard; 7 falhas/2 horários no gráfico 3022; consistência entre todas as views do mesmo snapshot; 3012 do histórico da PCBA anterior com Repair Comment exato; cobertura real de paginação das fontes. Os testes atuais validam regras sintéticas e inteireza do pacote, não a correção física desses cinco casos.

### 12. Checklist de prova física na fábrica

1. Fechar/finalizar a coleta em execução. Identificar pasta instalada e origem correta; manter a anterior intacta.
2. Coletar a 3028 da linha/dia com Motor/Vibra; conferir total de ocorrências e SN da PCBA.
3. Para a D escolhida, conferir na 3074 as linhas originais da PCBA, datas Bind/Unbind, Operation e Y/N. Verificar se o Cboard é componente provado naquele instante ou apenas candidato.
4. Pesquisar **Material SN exata** do Cboard na 3074; comparar PCBAs anteriores, tempos e cobertura. Se a consulta manual provar histórico e a automática não, guardar status/cobertura e log (sem token/config).
5. Ver na 2114 os Hist Seq e defeitos da PCBA atual e das PCBAs anteriores. Confirmar se a mesma falha é **anterior** ou apenas histórica sem hora.
6. Na 3012 por SN das PCBAs relevantes, buscar histórico completo permitido pela fonte e Repair Comment antigo; não depender da janela de um dia da 3028.
7. Na 3022, validar as sete SNs e suas passagens no posto correto, END LOT, ciclo e CPH; investigar separadamente as cinco sem hora, sem fallback 3028.
8. Abrir Rastreabilidade, Consulta SN, Falhas do dia e Dashboard de reuso na **mesma linha e revisão**. Conferir que os resultados e estados de cobertura não se contradizem.
9. Só liberar candidato como GREEN fabril quando as evidências físicas forem reproduzíveis; PR #69 segue DRAFT até aprovação explícita.

---

**Regra permanente:** qualquer melhoria futura adiciona contrato, teste e entrada de histórico (`antes → mudança → motivo → prova → risco`). Não sobrescreve informações antigas apenas porque uma implementação mais recente parece mais moderna.
