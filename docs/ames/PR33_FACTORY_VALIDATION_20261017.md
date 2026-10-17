# PR #33 — gate físico da fila Falhas / Consulta por SN

Data de preparação: 2026-10-17  
Branch: `work/ames-investigation-ux-20261017`  
Base da PR: `main`  
Estado esperado da PR durante este gate: **draft / aberta / não mergeada**

Este checklist valida fisicamente os nove blocos da PR #33 sem ampliar o escopo e sem alterar os coletores estabilizados `3012`, `3022`, `3028`, `3074` e `2114`.

## 0. Estado antes do teste físico

Base funcional imediatamente anterior a este checklist: `6ab2710ff618855f1a57ef11f528184518d051a2`.

No workflow desse SHA:

- A-MES Node: `394` testes, `392` PASS e `2` FAIL;
- os dois FAIL são os já isolados da PR #32 em onboarding/manifesto (`ames-capabilities.test.mjs` e `ames-onboarding.test.mjs`, ambos por `Manifesto pendente não pode anunciar pacote antigo`);
- Agent + sync E2E com Firestore Rules: **PASS**;
- browser/experiência: falha conhecida ao aguardar o texto antigo `Installation on a new computer is still blocked`;
- o job estático parou antes da etapa de build e, portanto, **não gerou CLEAN/local candidate para teste físico**;
- o único artefato desse workflow é a evidência de browser `console-experience-6ab2710ff618855f1a57ef11f528184518d051a2`.

**Estado atual do gate físico: BLOCKED até existir um pacote canônico do HEAD exato sem contornar o quality gate.**

Não vale:

- montar ZIP manual ignorando o gate;
- usar pacote de SHA anterior como se fosse o HEAD atual;
- reutilizar candidato da PR #32;
- usar a candidate `b83bbb...` rejeitada;
- declarar GREEN físico apenas por testes de CI.

## 1. Identificação obrigatória do teste

Preencher antes de abrir o A-MES:

- Resultado geral: `[ ] PASS  [ ] FAIL  [ ] BLOCKED`
- SHA exato do HEAD testado: `______________________________`
- SHA/identificador do pacote CLEAN/local candidate: `______________________________`
- Origem do pacote / workflow: `______________________________`
- Data/hora do teste: `______________________________`
- Linha MES: `[ ] TAN10101  [ ] TAN10102  [ ] TAN10103`
- CPH exato: `______________________________`
- SN consultado: `______________________________`
- PCBA atual: `______________________________`
- Operador do teste: `______________________________`

Se o SHA exibido pelo pacote, launcher ou `FRONTEND_GATE.json` não for exatamente o SHA registrado acima, marcar **BLOCKED** e parar.

## 2. Caso físico principal — PCBA com 2114 + 3074 + 3022 + 3012

Escolher uma PCBA real que permita observar o máximo possível das quatro fontes. Ausência real de uma dimensão é aceitável, mas deve continuar explícita como `—`/UNKNOWN; nunca transformar ausência em zero.

### 2.1 Falha atual e 2114

Registrar:

- Defect Code: `______________________________`
- descrição: `______________________________`
- `Registro da falha (MES)` / Defect Time: `______________________________`
- `Manual / Automatic`: `______________________________`

Critérios:

- `[ ] PASS` Defect Time exibido é o da evidência 2114 da ocorrência correta;
- `[ ] PASS` `Manual / Automatic` é preservado como modo de registro da falha, não reinterpretado como reparo;
- `[ ] PASS` se 2114 não trouxer o campo, a UI mantém `—`;
- `[ ] FAIL` se usar horário de produção 3022 no lugar do Defect Time;
- `[ ] FAIL` se preencher Manual/Automatic por inferência.

Evidência a anexar: print do card de Falha da PCBA + print/registro 2114 correspondente.

### 2.2 Contexto 3022 da ocorrência

Registrar somente quando houver `reference_process` comprovado para a ocorrência/PCBA correta:

- Posto de referência: `______________________________`
- Horário de geração: `______________________________`
- Turno comprovado: `______________________________`

Critérios:

- `[ ] PASS` a evidência escolhida pertence à PCBA/ocorrência consultada;
- `[ ] PASS` seleção temporal respeita a regra canônica e não pega arbitrariamente o último evento;
- `[ ] PASS` posto, horário e turno ficam `—` quando não há prova suficiente;
- `[ ] PASS` uma passagem 3022 de outra ocorrência não preenche a ocorrência atual;
- `[ ] FAIL` qualquer evento futuro ou apenas próximo no tempo for promovido a contexto da falha;
- `[ ] FAIL` 3022 for apresentada como causa raiz.

Evidência a anexar: print do resumo SN + timeline/passagens 3022 usadas como prova.

### 2.3 Materiais reutilizados / 3074

Para cada item relevante:

- Material SN: `______________________________`
- Tipo: `______________________________`
- PCBA anterior: `______________________________`
- Bind anterior: `______________________________`
- Unbind anterior: `______________________________`
- PCBA atual: `______________________________`
- Bind atual: `______________________________`
- Unbind atual: `______________________________`

Critérios:

- `[ ] PASS` segundo/terceiro uso da própria PCBA permanece separado de segundo/terceiro uso de componentes;
- `[ ] PASS` vínculo/desvínculo usa horário real 3074 quando disponível;
- `[ ] PASS` horário UTC é apenas apresentado em horário da fábrica, sem reescrever a evidência bruta;
- `[ ] PASS` cache já local não sofre conversão dupla;
- `[ ] PASS` registros agregados/duplicados não fingem um único intervalo exato;
- `[ ] PASS` PCBA anterior/desvinculada continua ligada ao Material SN correto;
- `[ ] FAIL` Bind/Unbind for apresentado como Defect Time ou causa da falha;
- `[ ] FAIL` `Batch Count` for usado como quantidade de usos.

Evidência a anexar: print do material + detalhe de vínculo atual/anterior + fonte 3074 correspondente.

### 2.4 Reparos / 3012 + nome humano por 3022

Para cada reparo associado exatamente à ocorrência:

- Repair User bruto: `______________________________`
- Nome humano exibido, se provado: `______________________________`
- Repair Time: `______________________________`
- Repair Code/Desc: `______________________________`
- Repair Comment completo: `______________________________`

Critérios:

- `[ ] PASS` ID 3012 sempre é preservado;
- `[ ] PASS` nome humano só aparece com correspondência **exata** de ID em evidência 3022 da mesma PCBA/contexto permitido;
- `[ ] PASS` ID parecido, outra PCBA, ausência de nome ou conflito de nomes mantém apenas o ID bruto;
- `[ ] PASS` Repair Comment longo/multilinha aparece completo sem corte de conteúdo;
- `[ ] PASS` Repair Time continua sendo horário de reparo, separado de Defect Time e geração 3022;
- `[ ] FAIL` nome humano for inferido por fuzzy match ou por evento de outra PCBA.

Evidência a anexar: print 3012 + evidência 3022 usada para o nome + card final de reparo.

## 3. Alertas de correlação

Testar um SN com histórico suficiente para produzir alerta, quando disponível.

Critérios:

- `[ ] PASS` resumo mostra separadamente correlações da PCBA e de componentes;
- `[ ] PASS` quantidade de alta prioridade aparece quando aplicável;
- `[ ] PASS` decisão/alerta fica visível sem obrigar leitura do bloco técnico inteiro;
- `[ ] PASS` `Ver evidências completas` expande falha histórica, reparos, comentários, 3074, retorno 3022 e comparação com falha atual;
- `[ ] PASS` limites da evidência permanecem separados;
- `[ ] PASS` correlação continua explicitamente diferente de causa raiz;
- `[ ] PASS` ausência de correlação comprovada não é apresentada como prova de ausência de histórico;
- `[ ] FAIL` qualquer correlação cruzar PCBA, ocorrência ou vínculo temporal sem prova.

Evidência a anexar: print do alerta recolhido + print expandido das evidências completas.

## 4. UNKNOWN ≠ ZERO

Executar pelo menos um caso em que uma fonte/dimensão não esteja disponível ou não esteja comprovada.

- `[ ] PASS` ausência/erro/not-collected continua `—`, UNKNOWN, parcial ou estado equivalente;
- `[ ] PASS` zero só aparece quando a execução da fonte comprova zero real;
- `[ ] PASS` evidência positiva parcial pode aparecer como limite mínimo (`N+`) sem alegar completude;
- `[ ] FAIL` fonte ausente virar `0`.

## 5. Regressão rápida dos blocos anteriores

### Top 3

- `[ ] PASS` clicar numa falha abre o detalhe sem destruir/reduzir o Top 3 original;
- `[ ] PASS` `Abrir ranking completo` limpa apenas o drill-down local.

### Ordenação de Falhas

Validar os quatro modos:

- `[ ] Ocorrências: maior → menor`
- `[ ] Ocorrências: menor → maior`
- `[ ] Falha: A → Z`
- `[ ] Falha: Z → A`

A tabela agrupada deve mudar imediatamente e manter os filtros atuais.

### Falhas agrupadas

- `[ ] PASS` código técnico não domina a leitura agrupada, mas continua nos detalhes;
- `[ ] PASS` `PCBAs 2º+`, `C/ item 2º+` e `Mesma falha/fam.` continuam dimensões distintas;
- `[ ] PASS` várias ligações do mesmo aparelho não inflam a contagem de PCBAs;
- `[ ] PASS` `Última ocorrência` é exibida em horário da fábrica sem alterar o timestamp bruto;
- `[ ] PASS` `F1_9999`, se aparecer, continua bruto e sem significado inventado.

## 6. Não regressão estrutural

- `[ ] PASS` 3012 não sofreu mudança de coletor;
- `[ ] PASS` 3022 não sofreu mudança de coletor;
- `[ ] PASS` 3028 não sofreu mudança de coletor;
- `[ ] PASS` 3074 não sofreu mudança de coletor;
- `[ ] PASS` 2114 não sofreu mudança de coletor;
- `[ ] PASS` continuam exatamente 9 views canônicas;
- `[ ] PASS` Agent + sync E2E continua operacional;
- `[ ] PASS` nenhuma credencial/sessão A-MES aparece em sync, Firebase ou evidência compartilhada.

## 7. Resultado do gate

### PASS

Só marcar PASS quando:

1. o pacote corresponde ao SHA exato registrado;
2. os campos de 2114/3022/3074/3012 foram validados em evidência real;
3. não houve regressão nos blocos Top 3 / ordenação / Falhas agrupadas;
4. UNKNOWN não virou ZERO;
5. prints/logs foram anexados;
6. nenhuma falha nova dos coletores estabilizados apareceu.

### FAIL

Marcar FAIL se existir comportamento incorreto reproduzível no escopo desta PR. Registrar:

- passo exato;
- SN/PCBA/linha/CPH;
- esperado;
- observado;
- print/log;
- se a falha é de apresentação/derivação ou se existe prova causal de coletor.

Não alterar coletor sem essa prova causal.

### BLOCKED

Marcar BLOCKED quando o teste não puder ser executado com segurança — por exemplo, pacote do SHA exato inexistente, preview incorreto, A-MES indisponível ou fonte necessária inacessível. BLOCKED não conta como FAIL da funcionalidade.

## 8. Evidências finais

Anexar ao comentário da PR #33 ou ao handoff do teste:

1. SHA do HEAD e do pacote;
2. print do launcher/identificação do build;
3. Consulta por SN resumida;
4. card 2114 da falha;
5. contexto 3022;
6. vínculo 3074 atual/anterior;
7. reparo 3012 e Repair Comment;
8. alerta recolhido e expandido;
9. Top 3 antes/depois do drill-down;
10. ordenação e Falhas agrupadas;
11. qualquer erro de console relevante.

Até existir o CLEAN/local candidate canônico do SHA exato, o resultado oficial deste documento permanece **BLOCKED — pacote físico ainda não produzido pelo gate normal**.
