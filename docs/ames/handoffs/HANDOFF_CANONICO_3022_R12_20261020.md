# HANDOFF CANÔNICO — LÓGICA COMPLETA DA A-MES 3022

**Projeto:** Central de Trabalho / Automação A-MES Offline  
**Referência local mais recente desta sequência:** V0.5.23 LOCAL 3022 R12  
**Objetivo:** preservar integralmente a lógica técnica já definida e implementada parcialmente, evitando regressões, simplificações e interpretações incorretas.

## 1. O que a 3022 realmente faz

A tela `AWIP3022 — Vw View Lot History`, rota `UAWIP.form.VwViewLotHistoryView`, permite consultar o histórico de passagem de uma peça pelos postos de fabricação, montagem, testes, retrabalho, assistência técnica e eventualmente embalagem.

A consulta aceita **SN / IMEI / A-S**.

A finalidade principal da 3022 não é simplesmente mostrar o último posto por onde a peça passou.

Ela deve permitir responder:

- Em que horário real a unidade passou por determinado posto?
- Em qual etapa uma condição defeituosa poderia ter sido introduzida ou deveria ter sido controlada?
- Quando a unidade passou pelo processo relevante antes da falha investigada?
- A peça passou mais de uma vez pelo mesmo posto?
- Houve retrabalho e retorno à montagem?
- Qual passagem pertence ao ciclo anterior à falha atual?
- Em que horário entrou e circulou na AT?
- Qual é o histórico completo de montagem, teste e reparo?

**Regra fundamental:** o `Defect Time` representa o horário de registro/detecção da falha. Ele não é necessariamente o horário em que a condição defeituosa foi criada.

Exemplo: vinte peças com falha de receiver podem ter sido registradas às 23:57, mas suas passagens relevantes pela montagem ocorreram às 14:21. O processo das 14:21 pode ser o horário correto para investigar a origem.

Isso não confirma automaticamente uma causa.

---

## 2. Como a 3022 entra na automação

O fluxo completo previsto é:

```text
3028
  ↓
Identificar falhas atuais:
- PCBA SN
- CPH/modelo exato
- Linha
- Defect Code e descrição
- Defect Time
- Informações da ocorrência

3074
  ↓
Identificar componentes físicos:
- Material SN
- Bind/Unbind
- Vinculações atuais
- PCBAs anteriores/desvinculadas
- Quantidade comprovada de usos
- Componentes substituídos

2114
  ↓
Reconstruir histórico da PCBA:
- Falhas antigas e atuais
- Repair Status
- Defect Type
- Manual/Automatic
- Reparos e retrabalhos
- Phone_Bat_Cover
- MainBoard
- Phone_Disassembly
- Status e comentários

3022
  ↓
Reconstruir timeline real:
- Passagens por postos
- Horários
- Operações e sequências
- Montagem e teste
- Retornos por retrabalho
- Entrada e circulação na AT
- Eventos posteriores à falha

CORRELAÇÃO
  ↓
Relacionar a ocorrência específica
com o processo relevante anterior

SQLite
  ↓
Monitoramento
Top 3 & FPY
Falhas
Consulta por SN
Rastreabilidade
Dashboards de reuso
Processo / 3022 & AT
Base local
CORA
Excel
```

As PCBAs identificadas na 3028 devem alimentar automaticamente as consultas 3022. A consulta manual por SN continua existindo, mas não pode ser obrigatória para a coleta completa.

Também devem existir modos independentes:

- **Completo:** 3074 + 2114 + 3022.
- **Somente processo/horários:** 3022.
- **Somente reuso/histórico:** 3074 + 2114.

Uma coleta isolada não deve apagar os dados válidos das outras fontes.

---

## 3. Divisão dos processos da fábrica

A separação operacional definida é:

| Região | Referência |
|---|---|
| Início da montagem principal | A5100 |
| Montagem e vínculos | A5100 até antes de A5265 |
| Primeiro posto de teste | A5265 |
| Inspeção final de aparência | A7600 |
| Último posto da linha de testes | A5700 |
| Packing/embalagem | Depois da conclusão do A5700 |

**A5700 é a fronteira do fim da linha de testes.**

A embalagem normalmente não será prioritária nas investigações de falhas, pois grande parte das unidades com defeito é identificada antes desse fluxo.

Entretanto, o histórico completo precisa continuar salvo. Packing pode ser ocultado do foco padrão, mas nunca excluído dos dados brutos.

A classificação deve respeitar a rota real dos modelos, inclusive retornos e retrabalhos, não apenas a ordem numérica dos códigos.

---

## 4. Correção crítica do A5700 — validada com dados reais

Durante os testes reais identificamos uma diferença muito importante entre:

**A5700 alcançado** e **A5700 concluído**.

Uma linha da 3022 pode mostrar:

```text
Working Oper Code = A7600
Current Oper Code = A5700
```

Isso significa que a unidade chegou ao A5700, mas não comprova que concluiu esse posto.

Já uma transição como:

```text
Working Oper Code = A5700
Current Oper Code = K6070
```

pode comprovar a saída do A5700 para packing, desde que a operação tenha sido efetivamente concluída.

Para identificar essa fronteira, o motor deve examinar:

- `Working Oper Code`
- `Current Oper Code`
- `Station`
- `Working Type` / tipo da operação
- `Hist Seq`
- Horário real
- Evidência de conclusão, especialmente `END LOT`

**Uma operação iniciada ou alcançada não deve ser tratada como operação concluída.**

Nos dados reais analisados, houve um caso com:

```text
Eventos totais: 66
Montagem/teste: 62
Pós-A5700/packing: 4

Conclusão A5700:
2026-09-18 04:10:20

Hist Seq da fronteira: 62
```

Uma versão anterior interpretava o limite às 03:51:41 e dividia incorretamente em 61 + 5.

A correção posterior recuperou a transição efetiva, sem eliminar eventos.

Em outros casos, a peça ainda não havia concluído A5700. Neles não se deve inventar packing.

---

## 5. Regra temporal obrigatória

Para investigar determinada ocorrência, o sistema precisa obter seu `Defect Time`.

Depois, para cada posto relevante, buscar a **última passagem válida e concluída anterior ou igual àquele Defect Time**.

Exemplo:

```text
Falha atual:
10:32

A5162:
09:41 — concluído
09:53 — concluído
10:10 — concluído
10:38 — concluído

Passagem relevante:
10:10
```

A passagem das 10:38 ocorreu depois da falha e não pode explicar retroativamente aquela ocorrência.

A ordenação deve usar horários normalizados corretamente no fuso da fábrica e `Hist Seq` quando necessário para ordenar/desempatar registros.

Também é obrigatório diferenciar:

1. **Último processo concluído antes da falha:** contexto temporal geral.
2. **Última passagem pelo posto relevante da falha:** evidência temporal de montagem/controle.
3. **Posto onde a falha foi detectada:** informação de detecção.
4. **Eventos posteriores:** retrabalho, reparo e movimentações seguintes.

Essas quatro informações não são equivalentes.

---

## 6. Matriz de processo por modelo e família de falha

Não existe um posto universal para toda falha.

A estrutura correta é:

```text
CPH / modelo exato
      +
Defect Code
      +
Família da falha
      +
Manual / Automatic
      +
Regras de processo aplicáveis
      ↓
Posto ou postos relevantes
      ↓
Última passagem comprovada
antes da falha específica
```

A matriz deve ser configurável, não estar presa em diversos `if` espalhados pelo código.

Na implementação local, foi prevista em:

`config/regras_processo_3022.json`

É necessário respeitar diferenças entre modelos. Alguns componentes chegam pré-montados; outros são instalados durante o fluxo principal.

**CPH2859 e CPH2859V não podem ser tratados automaticamente como o mesmo produto.**

Uma regra provisória deve aparecer como provisória, não como verdade comprovada.

---

## 7. Câmera com impureza/mancha — referência A5162

Este é um dos exemplos mais importantes explicados pelo usuário.

Falhas de aparência de câmera, como impureza, sujeira ou mancha na câmera ou na lente/tampa, são frequentemente detectadas na inspeção final `A7600`.

Mas o posto de montagem/controle relevante para esses casos é o **A5162**.

Nesse posto ocorre o processo de limpeza associado à câmera e à tampa.

Portanto:

```text
Falha de câmera/aparência
        ↓
Registro Manual, quando comprovado
        ↓
Detecção posterior, por exemplo A7600
        ↓
Consultar histórico 3022
        ↓
Procurar último A5162 concluído
antes do Defect Time
        ↓
Mostrar horário real desse A5162
```

O resultado deve separar:

```text
Detecção: A7600
Horário de registro: Defect Time

Referência de montagem/controle: A5162
Horário da passagem relevante: 3022
```

**A5162 é referência de investigação, não causa confirmada.**

Não se deve aplicar A5162 indiscriminadamente a qualquer falha com registro Manual. Essa regra diz respeito à família de câmera/aparência pertinente, conforme o modelo e o processo.

---

## 8. Manual e Automatic na 2114

Na 2114, `Manual/Automatic` descreve a forma de registro da falha após caracterização/reteste, **não o tipo de reparo**.

A regra operacional informada foi:

- **Automatic:** normalmente representa falha capturada por teste/funcional.
- **Manual:** pode representar falha registrada manualmente, como aparência identificada no processo de inspeção.

Isso deve auxiliar a seleção da regra temporal.

Exemplo:

```text
CAMERA
+
Aparência/impureza
+
Manual
    ↓
A5162
```

Para falhas funcionais automáticas, o motor deve consultar a regra específica de `CPH + família`.

Se não houver regra segura, mostrar o histórico e o processo anterior como **CONTEXTO**, sem inventar o posto de origem.

Em caso de divergência entre dados da 3028 e 2114, registrar conflito/proveniência e não escolher silenciosamente um valor.

---

## 9. Retrabalho de câmera — Phone_Bat_Cover

Esta regra exige especial atenção.

Uma unidade pode apresentar impureza de câmera e ser enviada à AT.

O técnico remove a tampa traseira, limpa o conjunto e devolve a unidade ao processo.

O modo de reparo pode aparecer como:

`Phone_Bat_Cover`

Essa operação pode envolver:

1. Remover a tampa anterior.
2. Desvincular a tampa antiga, pois sua cola precisa ser retrabalhada.
3. Limpar a câmera/lente.
4. Retornar a unidade à rota.
5. Passar pelo posto `A5201`, onde se verificam parafusos, inclusive parafusos ausentes ou altos.
6. Prosseguir pelo fluxo de montagem.
7. Inserir/vincular outra tampa conforme o processo.
8. Gerar novas passagens no histórico 3022.

A 3074 deve ajudar a comprovar a desvinculação da tampa antiga e a vinculação de outra, quando esses eventos existirem.

**Não basta encontrar um Phone_Bat_Cover para presumir que todas essas operações ocorreram.** É necessário identificar os registros efetivamente disponíveis.

---

## 10. Falhas repetidas e múltiplas passagens pelo A5162

Uma mesma PCBA pode passar repetidamente pelo A5162.

Exemplo:

```text
09:00 — A5162 concluído
09:40 — Falha de câmera nº 1

10:00 — AT / Phone_Bat_Cover
10:20 — Retorno à linha
10:25 — A5201
10:40 — A5162 concluído

11:15 — Falha de câmera nº 2

11:40 — Novo retrabalho
12:10 — A5162 concluído
```

**Falha nº 1:** passagem A5162 relevante = 09:00.

**Falha nº 2:** passagem A5162 relevante = 10:40.

O evento das 12:10 não pode ser usado para explicar a falha nº 2, porque ocorreu depois dela.

Portanto, a correlação não pode ser simplesmente:

`PCBA → último A5162 de toda a vida`.

Precisa ser:

`PCBA + ocorrência específica + Defect Time → último A5162 concluído antes dessa ocorrência`.

Se a passagem não puder ser comprovada, o resultado correto é:

**“Passagem relevante anterior não comprovada.”**

Não preencher o campo com o primeiro registro encontrado nem com um evento posterior.

---

## 11. P-sensor e receiver — referência provisória A5100

Para determinadas condições relacionadas a P-sensor e receiver, foi definido inicialmente o **A5100** como referência de entrada da montagem.

Exemplos de problemas:

- Borracha do P-sensor torta/desalinhada.
- Placa do P-sensor torta.
- Receiver invertido.
- Cola do receiver desalinhada ou para fora.

O motivo é que esses componentes podem já estar pré-montados no LCD quando o conjunto entra na linha principal.

A5100 é então o primeiro ponto de referência da PCBA/LCD no fluxo principal.

Porém:

**P-sensor/receiver = A5100 não é uma regra universal.**

Deve depender do CPH e da arquitetura real de montagem.

Se outro modelo utilizar postos diferentes, a matriz configurável precisa refletir essa diferença.

---

## 12. Postos relevantes que não podem ser confundidos

### A5100

Início da montagem principal e referência inicial para algumas condições de LCD/P-sensor/receiver.

### A5150

Posto importante de vinculação física/lógica de componentes, principalmente por scanner.

Permite investigar quando determinados materiais foram associados à unidade.

### A5162

Referência de limpeza de câmera e tampa, especialmente em falhas de aparência/impureza pertinentes.

Pode aparecer múltiplas vezes quando existe retrabalho.

### A5201

Referência do retorno ao fluxo após determinados reparos de tampa, com inspeção de parafusos.

Não é automaticamente o posto de origem da impureza.

### A5202

Teste de corrente, com unidade ainda aberta e alimentação por contato/agulhas.

Pode executar testes funcionais e vínculos eletrônicos de determinados componentes.

**Não confundir com A5150.**

### A5265

Primeiro posto de teste; separa a região de montagem da região de testes.

### A7600

Inspeção final de aparência. Pode ser o local de detecção de problemas de câmera e outras condições visuais.

### A5700

Último posto da linha de testes. Sua conclusão marca a fronteira com etapas posteriores, como packing.

---

## 13. Histórico da AT e status de reparo

A 3022 também serve para reconstruir a circulação da unidade na assistência técnica.

As informações relevantes incluem:

- Última passagem em linha antes da falha.
- Horário de detecção/registro.
- Entrada em AT.
- Estações de reparo percorridas.
- Horários de movimentação.
- Esperas, quando os marcos temporais forem comprovados.
- Processo de reparo.
- Retorno à linha.
- Finalização.

A 2114 fornece contexto complementar:

- `Repair Status = N` com `Defect Type` vazio pode indicar ocorrência ainda não analisada/finalizada.
- `MainBoard + N`: aguardando/enviada para reparo de placa.
- `MainBoard + Y`: reparo de placa concluído.
- `Phone_Disassembly + Y`: fluxo de desmontagem concluído.
- Outros tipos de reparo devem ser preservados.

Não aplicar automaticamente o fluxo `Phone_Bat_Cover → A5201 → A5162` a reparos de MainBoard, Phone_Disassembly ou outros processos diferentes.

---

## 14. Turnos da 2114 e horários

A automação deve selecionar o Shift automaticamente no OPC/2114:

```text
1st Shift:
07:30 até 17:30

2nd Shift:
17:30 até 07:30 do dia seguinte
```

A seleção precisa ser validada na própria interface ExtJS, incluindo o caso de turno anterior já selecionado.

A R8 introduziu correções para essa seleção automática, posteriormente preservadas nas versões locais.

A data da consulta, o turno MES, o período de extração 3028 e os horários reais 3022 são dimensões diferentes e não devem ser confundidos.

Na correlação temporal, normalizar corretamente o horário local da fábrica (`America/Sao_Paulo`) antes de comparar os eventos, evitando misturar instantes UTC, horários locais e valores sem fuso.

---

## 15. Identidade da unidade consultada

Durante testes reais, uma consulta por IMEI retornou no cabeçalho da 3022 o SN correspondente.

Exemplo validado:

```text
Consulta por IMEI:
865765083781890

SN retornado:
00252700611335C300010178
```

Isso permite cruzar identificadores, mas é essencial preservar a origem de cada um.

A consulta 3022 deve guardar:

- Identificador consultado.
- Tipo do identificador consultado.
- SN/IMEI retornados no cabeçalho.
- PCBA identificada pela 3028, quando comprovada a relação.
- Referência bruta da consulta.

**IMEI, PCBA SN e Material SN não são o mesmo tipo de identidade.**

Não correlacionar peças somente por prefixo, sem vínculo comprovado.

---

## 16. Persistência, evidências e integração

Os eventos 3022 devem ser persistidos no SQLite, preservando histórico bruto e informações normalizadas.

Cada evento deve manter, quando disponíveis:

- Identidade consultada e resolvida.
- PCBA SN.
- Linha e CPH comprovados.
- Posto/estação.
- Working Oper Code.
- Current Oper Code.
- Tipo/status da operação.
- Hist Seq.
- Horário original e horário normalizado.
- Resultado da passagem.
- Referência bruta/proveniência.
- Identificador local estável da observação.

Cada correlação falha ↔ processo precisa preservar:

- Identificação da ocorrência investigada.
- Defect Code e família.
- Defect Time.
- Manual/Automatic e origem do campo.
- Regra aplicada.
- Posto relevante.
- Evento 3022 escolhido.
- Horário da passagem.
- Se o evento é **REFERÊNCIA**, **CONTEXTO** ou evidência insuficiente.
- Informação de retrabalho anterior e posterior.
- Proveniência e cobertura.

Quando a ocorrência não puder ser identificada de maneira inequívoca, a relação não deve ser apresentada como comprovada.

Uma revisão de evidência não deve eliminar registros históricos já coletados.

---

## 17. Como devem aparecer os resultados

### Falhas

Exibir horário de registro da falha e horário do posto relevante em campos separados.

Não chamar os dois de “horário da falha”.

### Consulta por SN

Integrar 3022 com:

- Falha atual da PCBA.
- Falhas anteriores da própria PCBA.
- Componentes de 2º/3º+ uso.
- PCBAs anteriores/desvinculadas desses materiais.
- Mesma falha / mesma família / outra falha, quando comprovado.
- Passagens e retrabalhos anteriores.
- Horário do processo relevante para a falha específica.

### Rastreabilidade

Mostrar a sequência histórica e permitir investigar uma ocorrência específica, com seus materiais e passagens correspondentes.

### Processo / 3022 & AT

Mostrar claramente:

**Falha → detecção → posto relevante → passagem anterior comprovada → retrabalho/AT → retorno ao fluxo.**

O “último processo anterior” deve aparecer como contexto separado do posto relevante.

### Dashboards de reuso

Continuam específicos para segundo uso de PCBAs e componentes. Não podem ser substituídos pelo Dashboard geral da Central.

Indicadores clicáveis precisam revelar os itens exatos responsáveis pelo número e destacar esses registros no drill-down.

### CORA

Consumir fatos estruturados, horários, materiais e histórico. Separar:

- Fato comprovado.
- Correlação.
- Hipótese técnica.
- Causa confirmada por investigação.

A CORA não deve transformar automaticamente uma passagem pelo A5162 ou A5100 em causa confirmada.

---

## 18. Algoritmo canônico resumido

```text
PARA CADA ocorrência identificada pela 3028:

    1. Obter identidade exata da PCBA
       e Defect Time da ocorrência.

    2. Obter CPH, linha e família da falha.

    3. Consultar 2114 para contexto,
       classificação e reparos.

    4. Consultar 3074 quando for necessário
       relacionar componentes e vínculos.

    5. Consultar 3022 da unidade.

    6. Preservar TODOS os eventos brutos.

    7. Normalizar horários e sequências.

    8. Distinguir operações iniciadas
       de operações concluídas.

    9. Identificar montagem, teste,
       packing e processos de AT.

   10. Consultar matriz:
       CPH + família + código + tipo de log.

   11. Identificar posto(s) relevantes.

   12. Considerar somente eventos
       concluídos até o Defect Time.

   13. Para o posto relevante, escolher
       a última passagem válida anterior.

   14. Identificar retrabalhos
       anteriores e posteriores,
       preservando os ciclos repetidos.

   15. Separar:
       - Detecção
       - Processo anterior contextual
       - Posto relevante
       - Reparos posteriores

   16. Se faltar evidência,
       retornar INDISPONÍVEL/
       NÃO COMPROVADO.

   17. Persistir resultado auditável
       no SQLite com sua proveniência.

   18. Disponibilizar nas 9 views locais,
       Central integrada, Excel e CORA,
       conforme o contrato de cada tela.
```

---

## 19. O que foi realmente validado

A evolução local foi:

- **R2/R3:** primeiras consultas reais 3022 e reconhecimento de A5700.
- **R4:** distinção entre A5700 alcançado/concluído, validação com múltiplos JSONs reais e integração temporal inicial.
- **R5:** lógica configurável por CPH/família, Manual/Automatic, câmera A5162 e retrabalho repetido.
- **R6:** correção de agente antigo ocupando a porta 8765.
- **R7:** coleta isolada/completa, consulta SN enriquecida e drill-downs.
- **R8:** correção do Shift automático 2114 e melhoria do diagnóstico da coleta.
- **R9–R12:** estabilização de launcher, ambiente Python/Playwright, scheduler, identificação do agente e inicialização.

A R12 foi reportada como abrindo corretamente no posto após as correções de bootstrap.

**A coleta real 3022 e a separação A5700 foram comprovadas em cenários reais. Isso não equivale a declarar todo o fluxo integrado GREEN.**

Ainda é necessário validar fisicamente, com ocorrências reais:

- Fluxo automático 3028 → 3074 → 2114 → 3022.
- Falhas Manual de câmera e referência A5162.
- Uma PCBA com múltiplas passagens pelo A5162.
- Retrabalho Phone_Bat_Cover seguido de retorno.
- Falhas repetidas antes/depois do retrabalho.
- Regras funcionais por CPH.
- Shift automático no OPC.
- Persistência correta no SQLite.
- Consulta SN, tabelas, Excel e CORA após a coleta.

A Central V2 anteriormente incorporada à `main` tinha a infraestrutura 3022 preparada, mas ainda estava marcada **READY FOR ADAPTER**, sem integrar esse coletor real. Não presumir que as melhorias locais R3–R12 já estão naquela versão remota.

---

## 20. Requisitos que não podem ser perdidos

1. A 3022 não é apenas uma tabela de horários; é um motor de rastreabilidade temporal por ocorrência.
2. `Defect Time` é limite temporal, não necessariamente horário de montagem.
3. Um mesmo posto pode aparecer inúmeras vezes.
4. Retrabalho pode gerar novos ciclos e novos vínculos de componentes.
5. Não associar uma falha a passagens futuras.
6. A5162 é referência para os casos pertinentes de câmera/aparência, não regra universal.
7. A5100 é referência provisória para determinados problemas de P-sensor/receiver.
8. A5150 e A5202 são postos com funções diferentes.
9. A5265 inicia a região de testes.
10. A5700 concluído marca o fim da linha de testes.
11. Packing deve ser preservado nos dados, mas não dominar a análise padrão.
12. A 2114 Manual/Automatic não indica o tipo de reparo.
13. A 3074 deve comprovar vínculos e histórico físico de componentes.
14. Cada linha precisa continuar independente: TAN10101, TAN10102 e TAN10103.
15. A matriz por CPH/família deve ser configurável.
16. Não inventar horários, estações, vínculos, conclusões nem causas.
17. A automação deve continuar offline-first e não depender do Firebase para coletar dados MES.
18. O acesso ao Chrome/CDP/A-MES deve ser serializado para evitar conflitos.
19. Preservar as 9 views locais da automação, com a V0.5.22 como baseline mínima e as melhorias posteriores quando efetivamente superiores.
20. Não alterar os coletores 3028 congelados sem justificativa e validação de regressão.

**Princípio final:** investigar a ocorrência certa, com o material certo, no modelo certo, na linha certa, no ciclo certo e no horário certo — sempre distinguindo evidência temporal de causa confirmada.