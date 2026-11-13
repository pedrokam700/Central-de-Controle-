# PR70 — 3022 antes do posto previsto, tendências e prevenção de regressões

Data: 10/11/2026. Base imutável: `2ddf4ef3dbfefb8aba70b31c21df25fe0639b738`.

## 1. Evidências de campo, com escopo

- Na linha 3, a coleta física de 10/11 reportou 3074 27/27, 2114 28/28, 3022 27/27 e 3012 28/28 completos. Esse **checkpoint é real para o job/linha testados**, mas não certifica regressões futuras nem todas as linhas.
- Nas páginas Falhas do dia & FPY, a linha 2 mostrava 25/36 ocorrências com referência 3022 e 11 sem, e a linha 3 mostrava 17/27 e 10 sem. As mensagens eram predominantemente ausência de posto configurado para CPH/família.
- Históricos reais AWIP3022 mostrados nos prints: montagem de placa A5100 com `END LOT`; etapas intermediárias A51xx; posteriormente o mesmo código A5100 aparece no contexto de `REPAIR END` da AT. **Código da estação isolado não identifica montagem produtiva.**
- Os gráficos exibiam **1 de 30 dias com dados**, apesar de várias capturas. Isso não comprova defeito de deduplicação: múltiplas revisões do mesmo dia devem continuar sendo um ponto. Sem dois dias distintos há apenas um ponto, não uma curva histórica.
- Auditoria do código encontrou **outro erro concreto e independente**: `readHistory()` referenciava `c`, criado apenas dentro de `renderPanel()`. Em uma execução sem outra variável global homônima, a consulta automática lançava `ReferenceError`; o antigo teste apenas verificava que o módulo importava, sem executar uma leitura da interface. Corrigido para obter `context()` no próprio `readHistory()` e coberto por um teste de interface que realmente abre o painel, espera a leitura e confere gráfico e revisão.
- Não recebemos índice bruto completo de capturas de cada origem/dia nem o SQLite da instalação. Não é possível afirmar que todos os dias supostamente ausentes estejam indexados ou na origem selecionada. Não alterar índices ou fabricar agregados para preencher lacunas.

## 2. Critérios de seleção da 3022

1. Fazer a correlação pelo SN exato e Defect Time da ocorrência (3028/2114/3012 quando a associação temporal for única). Nunca usar timestamp da falha como substituto de produção.
2. Prioridade A: falha explicitamente registrada na montagem A5100–A5162 por CHANGE CMF no momento correspondente; é ponto da **detecção**, não origem causal.
3. Prioridade B: última passagem concluída no posto configurado, **anterior ou igual** ao Defect Time.
4. Prioridade C: quando o posto configurado ainda não foi alcançado, ou inexiste mapeamento, usar a **última passagem efetivamente concluída** em Working Oper A5100–A5162, antes da falha. Um novo ciclo real A51xx depois de A5700 anterior não deve ser descartado só pelo rótulo `POS_A5700_PACKING`.
5. Só aceitar `END LOT` real; não aceitar `REPAIR`, `REPAIR END`, `CHANGE CMF`, `MO_MAPPING`, Current Oper sem conclusão, operação identificada como reparo/desmontagem, usuário explicitamente AT/BRM, outra linha, passagem de teste ou futura.
6. Classificar prioridade C separadamente como `FALLBACK_COMPLETED_ASSEMBLY`, confiança `OBSERVED_ASSEMBLY_PASSAGE_NOT_CAUSE`, regra `LAST_COMPLETED_ASSEMBLY_BEFORE_DEFECT`. Não inferir defeito do componente, posto exato de origem, nem presença de montagem ausente.
7. Se não existir prova suficiente, continuar com `—` e diagnóstico. Uma coleta 3022 completa não prova necessariamente a referência temporal de todas as falhas.

## 3. Tendências e coletas múltiplas

- A identidade de um ponto é **linha + origem + dia operacional da janela 3028 (07:00–07:00)**, não horário em que a captura terminou.
- Para cada dia: usar a **revisão FULL mais recente com prova de 3028, 3074, 2114 e 3022**. Parcial posterior não apaga a FULL. Se nunca houve FULL, mostrar última parcial apenas como **observação**, não como fechamento comparável.
- Não somar snapshots sucessivos do mesmo dia (ex.: 09:00, 10:00, 15:00); revisões originais continuam imutáveis para auditoria.
- Não unir por linha gráfica origens/CPHs diferentes, nem parciais não certificadas. Dias sem dados não são zeros; múltiplas origens no mesmo dia não são combinadas silenciosamente.
- A tela explica agora quantas revisões estavam indexadas nos dias exibidos e por que 1/30 dias produz um ponto. O filtro de origem é explícito e pode ocultar capturas de outras identidades; o operador pode selecionar Detectar conflitos, mas não mesclar origens.
- Necessita conferência física: origem selecionada, data final da janela, índice de datas e revisões do mesmo dia. Com apenas um dia capturado, um gráfico sem curva é o resultado correto.

## 4. Post-mortem da 3012: erro de método

### Por que demorou

- Tratamos repetidas falhas detectadas por validação como se fossem prova de correção, sem fechar a cadeia **formulário visível → parâmetros HTTP reais → resposta atual → vínculo ao SN/período → cobertura no SQLite → exibição**.
- A interface mostrava datas corretas, mas o 3012 enviava representações numéricas de timestamp que o validador inicial não reconhecia. A hipótese baseada apenas em campos visíveis produziu vários patches sem corrigir o contrato da requisição real.
- Testes unitários/mocks eram GREEN, mas os testes de fábrica falhavam. Faltou usar o mesmo formato de dados que chegava pelo A-MES e distinguir validação de código de verificação física.
- Recuperação seletiva confundia fonte não programada (`include_3012=false`) com fonte que falhou, gerando jobs de segundos que pareciam sucessos sem nova coleta. Além disso, o indicador `100%` representava etapas percorridas, não completude das fontes.
- Alterações sobrepostas entre coletores, orquestração e interface dificultaram identificar a regressão. Não congelamos o checkpoint funcional cedo o suficiente.

### Procedimento obrigatório nesta e em futuras mudanças

1. **Congelar checkpoint funcional:** commit/SHA, pacote, linha, período, fonte, job, contagem de confirmação, prints de campo; não substituir o pacote que passou.
2. **Diagnóstico antes de patch:** reproduzir a mesma falha com dados reais redigidos/anonimizados; identificar a camada de quebra e provar a hipótese com comparação antes/depois. Não publicar mais uma “solução definitiva” só por um teste simulado.
3. **Contrato por etapa:** pedido, parâmetro real, identidade da resposta, cobertura transportada, persistência, projeção e apresentação. Um `done` não torna fonte `complete`.
4. **Correção mínima e isolada:** não alterar a 3012 quando o defeito é na 3022 ou nos gráficos. Cada mudança deve indicar arquivos alterados e limites de escopo.
5. **Regressões negativas:** testar reparo confundido com montagem, data/linha incorreta, resposta parcial, múltiplas capturas, múltiplas origens e registros ausentes. Casos sem prova permanecem sem valor, nunca zero falso.
6. **Teste independente:** suite automatizada + pacote com SHA exato + pequeno teste físico pelo cenário relatado. Guardar status separados `LAB PASS` e `CAMPO PASS`; CI não certifica MES físico.
7. **Retomada idempotente:** nunca repetir 3022/3074/2114 só para reprocessar correlações locais quando o bruto íntegro já está salvo; preservar histórico, identidades e fontes.
8. **Rollout reversível:** instalar em pasta nova; não tocar em SQLite/WAL, tokens, configuração, guardian ou rota sem inventário e backup verificados. Nada de promoção automática de PR DRAFT.
9. **Observabilidade útil e discreta:** registrar categorias de formato e estados de prova, sem capturar dados sensíveis ou credenciais. Evidências de progresso separadas de cobertura.
10. **Critério de aceite antes do próximo ZIP:** listar cenário esperado e contraexemplos, executar testes de regressão, congelar SHA e solicitar um único reteste de campo direcionado.

## 5. Gates da candidata

- Teste Python na correlação `test_v019_3022_midpoint_reference.py` e teste do adaptador `scripts/agent-3022-origin-fallback.test.py` cobrem o caminho completo e os contraexemplos AT, futuro, CPH sem mapeamento e ausência de montagem.
- Testes JS de tendências preservam último FULL, captura parcial posterior, revisão ilegível, mistura de origens e falta de dias.
- Novo teste executa o painel (DOM controlado), a leitura automática, a contagem `1/30`, o aviso de ausência de dois dias e o elemento de gráfico; impede a volta de variável de escopo inválida mesmo quando a análise sintática passa.
- **PENDENTE NO CAMPO**: confirmar que as 11 e 10 lacunas exibidas realmente passam a ter referência apenas nos casos com END LOT A5100–A5162 anterior à falha; nenhuma referência de REPAIR END; tendência 1/30 sem duplicidade. Não mudar a 3012 nem reconsultar MES em massa para comprovar apenas a lógica visual.
