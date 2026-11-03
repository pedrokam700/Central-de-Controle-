# Central + A-MES — notas de implementação e verificação física

**Data:** 28/10/2026  | **Branch:** `work/ames-pilot-integration-57-66-20261027` | **PR:** #69 (DRAFT)

Este documento complementa o `AMES_MANUAL_LOGICA_CAPTURA_CRUZAMENTO_PR69_20261028.md`.

## 1. Problema de navegação observado na fábrica

Na tela **Falhas do dia & FPY**, o operador clicou numa barra de geração horária — por exemplo, 13:00. A implementação anterior alterava o filtro e trocava o modo de visualização para **Ocorrências detalhadas**, redesenhando a tela. O navegador permanecia em uma posição de rolagem onde aparecia a área separada **Tendências do histórico salvo**, sem dados coletados. A interface não mostrava diretamente quais PCBAs pertenciam à hora selecionada. A captura anexada comprova o sintoma visual, mas não fornece os registros MES completos para validar contagens individuais.

### Ajuste da candidata

- A barra do gráfico **não troca obrigatoriamente de aba**. Ela mantém a distribuição horária selecionada e abre, abaixo do gráfico, uma tabela de **PCBA, modo da falha, horário de geração 3022, horário de registro MES 3028 e linha**.
- A tabela só reúne ocorrências que possuem **passagem de geração 3022 comprovada** naquele horário. A coluna 3028 é apenas identificação/limite temporal da falha — nunca um segundo gráfico nem horário de geração.
- O clique rola até a tabela relacionada, não até um relatório histórico independente.
- O botão **Limpar horário** restaura a distribuição completa do modo de falha em foco.
- Quando se escolhe um modo de falha pelo Top 3, o painel analítico filtra as horas por esse modo e abre seu gráfico. O ranking avançado também possui **Ver horários deste modo de falha · 3022**.
- O filtro operacional passa a usar **Modo da falha**, com a descrição legível. O `Defect Code` permanece no dado bruto como chave técnica interna, mas não é o rótulo principal.
- Filtros explícitos por hora falham fechados: se não existir passagem 3022 comprovada, não retornam todas as falhas por engano.

## 2. Invariantes que não foram alteradas

- A consulta 3028 coleta **ocorrências do período/linha** selecionados, normalmente dia 07:00→07:00; a mesma PCBA pode aparecer várias vezes em falhas diferentes.
- O histórico da 3012 é consultado **por SN exata** desde o início configurado, com cache, blocos/checkpoints; **não está limitado ao dia da 3028**.
- O registro de falha da 3028 **não representa passagem de geração**. O evento de produção comprovado depende do cruzamento da 3022 por PCBA, CPH/família, posto e ciclo temporal. `Current Oper` não comprova `END LOT`.
- A Rastreabilidade investiga cada ocorrência 3028 no seu **ciclo correto de montagem**, usando vínculos 3074; a pesquisa inversa por Material SN e históricos 2114/3012 enriquecem a investigação, sem misturar componentes de montagens distintas.
- Os candidatos com vínculo incerto permanecem **indeterminados**. Ausência de prova de reuso não significa primeiro uso nem zero comprovado.
- O motor congelado `core/fluxo_3028_3074.py` continua protegido pelo hash de origem CLEAN V3.

## 3. Como verificar no PC da fábrica

1. Verifique que a Central/agent instalados correspondem ao **SHA exato** do pacote novo. Não misture dois agentes na porta 8765.
2. Na tela **Falhas do dia & FPY**, escolha a linha e o dia com cobertura 3028 existente.
3. Sem escolher modo de falha, confira a distribuição de todas as **passagens comprovadas 3022** e a fração de ocorrências sem correlação, se existir.
4. Clique em **Motor: No Vibration** no Top 3: o gráfico de horários deve mostrar **somente o modo de falha selecionado**. O total de ocorrências do modo e o número de passagens 3022 comprovadas são informações distintas.
5. Clique em uma barra de horário, por exemplo **13:00**: a tabela correspondente deve listar as PCBAs da falha naquele horário; verifique se o horário é a passagem **3022**, sem usar Defect Time 3028 como fallback. `Limpar horário` deve trazer de volta todas as barras.
6. Escolha outro modo de falha e repita. Verifique uma ocorrência em que não havia passagem 3022 comprovada: o sistema deve mostrar o **motivo da lacuna**, não inventar horário.
7. Execute separadamente o caso **Motor/Vibra → PCBA 3028 → vínculos da montagem 3074 → Cboard → PCBAs anteriores → 2114/3012**. A nova apresentação do FPY não substitui a prova física dessa rastreabilidade.
8. Preserve evidências como print de nome da falha, distribuição/horários, cobertura de coleta e detalhes do material, **sem compartilhar tokens, senha, SQLite ou dumps MES sensíveis**.

## 4. Ainda não homologado

**Não declarar GREEN físico** até haver teste MES da filtragem dos horários, do caso Motor/Vibra/Cboard e do histórico 3012. O caso anterior com sete ocorrências e somente duas referências 3022 continua sem causa física demonstrada; o ajuste da interface **não inventa** as cinco referências ausentes. O agente, o guardian, a sincronização por linha e a atualização de SQLite/config exigem seus próprios gates.

**Registros permanentes:** o histórico de mudança semântica `docs/ames/history/LOGIC_CHANGELOG.jsonl` inclui `MES-HIST-012`. A PR #69 permanece em DRAFT; não houve merge em main, release ou publicação de GitHub Pages.
