# Central de Trabalho V2 — arquitetura canônica

Status: proposta de implementação na branch `v2/native-fusion`.

## Objetivo

A Central e o A-MES deixam de ser dois produtos que se enxergam e passam a ser um único sistema. O A-MES é uma fonte de evidência operacional da própria Central.

A interface oficial continua sendo a Central hospedada a partir do repositório GitHub. Vercel pode ser usado somente como ambiente temporário de preview/diagnóstico; não é a fonte de verdade e não deve virar um segundo produto.

## Regra principal

Nenhuma página da Central deve ter um “bloco A-MES paralelo” quando a informação puder fazer parte naturalmente da própria página.

Exemplos:
- Dashboard usa KPIs MES como KPIs nativos.
- Produto/CPH usa ocorrências MES como parte da visão do produto.
- Falha usa evidência MES vinculada ao caso.
- Central do Dia usa estado real da linha como contexto do turno.
- CORA consulta a mesma base normalizada.
- Rastreabilidade deixa de ser uma tela isolada e vira uma capacidade reutilizável pelas demais views.

## Camadas

### 1. Coleta local

Executada somente no computador que tem acesso ao A-MES.

Responsabilidades:
- 3028: ocorrência/falha e indicadores operacionais.
- 3074: vínculo de Material SN, reuso, bind/unbind e PCBAs anteriores.
- 2114: histórico manual de defeitos da PCBA.
- 3022: processo/posto/evento da unidade no tempo.
- persistência SQLite antes de qualquer refresh visual.
- acesso MES serializado.
- nunca enviar senha, cookie, sessão, CDP ou credenciais Wi-Fi.

### 2. Modelo canônico local

As views MES não devem aparecer na camada de apresentação como quatro silos. A coleta é transformada para entidades canônicas.

Entidades mínimas:

`LineSnapshot`
- line_id
- collected_at
- shift
- product_model
- fpy
- check_fpy
- quantity
- defect_count
- repair_count
- top_defects[]

`FailureOccurrence`
- occurrence_id
- line_id
- pcba_sn
- product_model
- defect_code
- defect_desc
- defect_time
- defect_location
- repair_status
- repair_user
- repair_time
- reason_type
- reason_desc
- batch_id
- source_3028_raw_ref

`PCBAHistory`
- pcba_sn
- use_index
- previous_pcba_context
- prior_failures[]
- same_failure_before
- same_failure_family_before
- source_2114_raw_refs[]

`MaterialTrace`
- material_sn
- material_code
- component_type
- current_pcba
- use_index
- linked_pcbas[]
- unlinked_pcbas[]
- prior_failures[]
- same_failure_before
- same_failure_family_before
- source_3074_raw_refs[]

`ProcessTimeline`
- pcba_sn / product_sn
- events[]
  - process_code
  - process_name
  - station
  - line
  - operator/machine quando existir
  - event_time
  - result
- event_before_failure: último evento válido `<= defect_time`
- source_3022_raw_refs[]

`CorrelationEvidence`
- occurrence_id
- evidence_type
- evidence_id
- score/strength quando aplicável
- explanation
- status: evidence | hypothesis | confirmed

Correlação nunca vira causa automaticamente.

### 3. Persistência e sincronização

SQLite local é a fonte operacional do coletor.

Firebase recebe somente representação sanitizada necessária para compartilhamento e uso da Central fora da fábrica.

A sincronização é assíncrona e nunca bloqueia coleta local.

Regra de consistência:

`MES -> persistir SQLite -> normalizar -> atualizar índices/insights -> publicar snapshot sanitizado -> renderizar`

### 4. Identidade de produto e linha

Toda entidade operacional precisa manter explicitamente:
- linha;
- CPH/modelo;
- turno quando existir;
- timestamp;
- origem da evidência.

KPIs de linhas diferentes nunca são somados silenciosamente.

Famílias de CPH podem compartilhar análise somente quando a relação estiver configurada na Central.

## Nova arquitetura de navegação

### Início

A Home mostra trabalho e contexto operacional do usuário.

Adicionar, quando houver dados:
- linhas sob responsabilidade;
- estado atual de cada linha;
- alerta de queda de FPY;
- recorrência/reuso relevante;
- falhas que merecem investigação.

Não criar uma segunda Home A-MES.

### Dashboard

Substituir a lógica de “dashboard manual” por um dashboard híbrido:

Filtros globais:
- período;
- linha;
- turno;
- CPH/família;
- Defect Code;
- componente;
- uso da PCBA;
- uso do componente.

Camadas:
1. operação: FPY, Check FPY, quantidade, falhas, repair;
2. Pareto: Top defeitos/componentes;
3. reuso: PCBA e materiais 2º/3º+ uso;
4. recorrência: mesma falha / mesma família;
5. processo: após 3022, processo/posto anterior à falha;
6. ação: reports/falhas/atividades abertas relacionadas.

Todo KPI clicável deve abrir os registros que o formam.

### Produtos / CPH

A página do produto passa a reunir no mesmo lugar:
- cadastro e componentes da Central;
- reports manuais;
- ocorrências MES do produto;
- linhas em que está rodando;
- FPY/Check FPY por linha;
- Top 3;
- PCBAs de segundo/terceiro uso;
- componentes reutilizados;
- recorrência histórica;
- evidência de processo 3022;
- histórico e ações.

Não criar uma aba “A-MES” genérica. A informação deve entrar em `Visão Geral`, `Falhas`, `Rastreabilidade/Histórico` e detalhes de cada ocorrência.

### Falhas

Uma falha registrada manualmente e uma ocorrência A-MES são objetos relacionados, não duplicados.

A tela de falha deve mostrar:
- origem: manual / MES / ambos;
- linha/CPH/PCBA;
- evidência 3028;
- histórico PCBA 2114;
- histórico de material 3074;
- processo anterior 3022;
- same failure / same family;
- report e atividades relacionadas;
- hipótese x causa confirmada.

A Central deve sugerir vínculo com ocorrência MES quando houver combinação forte de linha + CPH + defeito + janela temporal, mas não vincular destrutivamente sem rastreabilidade.

### Rastreabilidade

Rastreabilidade continua existindo como view de investigação detalhada, porém reutiliza o mesmo modelo canônico das demais páginas.

Entrada possível:
- PCBA SN;
- Material SN;
- ocorrência;
- CPH;
- linha.

Resultado em linha temporal:
1. produção/processo 3022;
2. ocorrência 3028;
3. história de defeito 2114;
4. materiais/vínculos 3074;
5. reutilizações anteriores;
6. ações da Central.

### Central do Dia

Usar dados A-MES como contexto automático, sem transformar a página em dashboard MES.

Exemplos:
- “Linha 3 — CPHxxxx — FPY atual 98,08%”.
- Top 3 atual da linha.
- recorrência/reuso que merece patrulha.
- tarefas sugeridas ou contexto para rotinas.
- passagem de turno inclui variação de FPY e ocorrências relevantes.

### CORA

CORA deve consumir o modelo normalizado, não HTML e não apenas um texto-resumo de snapshot.

Contexto recuperável:
- linhas e snapshots;
- ocorrências;
- PCBA history;
- material trace;
- process timeline;
- reports/atividades da Central.

CORA deve distinguir:
- fato MES;
- correlação calculada;
- hipótese;
- conclusão humana validada.

## 3022 — preparado desde agora

A UI não deve ser redesenhada amanhã só para encaixar 3022.

Reservar no modelo e nas views:
- `ProcessTimeline`;
- `event_before_failure`;
- agrupamento por processo/posto;
- Pareto `processo anterior x defeito`;
- comparação de linhas para o mesmo CPH;
- comparação de processo em PCBA nova x reutilizada;
- drill-down da ocorrência para a timeline.

Regra temporal obrigatória: o processo relacionado à falha é o último evento válido anterior ou igual ao `Defect Time`, nunca o último evento absoluto da unidade.

## Onboarding / pacote do posto

Novos usuários não devem ser obrigados a instalar o coletor se só forem consultar a Central.

No primeiro acesso, depois do login:

1. Central tenta detectar `127.0.0.1:8765`.
2. Se detectar: marcar este computador como `Posto A-MES conectado` e não mostrar instalação.
3. Se não detectar: mostrar um cartão discreto:
   - `Este computador será usado para coletar dados do A-MES?`
   - `Configurar este computador`;
   - `Somente visualizar a Central`.
4. Ao escolher configurar, mostrar a release canônica atual, versão, SHA-256 e botão `Baixar pacote completo`.
5. O aviso some após escolha e continua acessível em `Meu perfil > Integração A-MES` / configuração administrativa.

A URL do pacote não fica hard-coded na interface. A Central deve ler um manifesto canônico versionado para que a próxima V0.5.xx não exija alterar a UI.

## Release manifest para onboarding

Criar um JSON pequeno na origem pública da Central, por exemplo:

`ames/releases/latest/release.json`

Campos:
- version
- package_name
- sha256
- download_url
- validated_baseline
- candidate_status
- published_at
- minimum_central_version

A Central lê isso para apresentar a instalação correta.

## Migração da V2 atual

A implementação atual `v2/index.html + iframe + v2.js` é apenas um protótipo/preview e deve ser aposentada após a fusão nativa.

`v2/native.js` também é uma ponte: ele prova que os dados podem enriquecer Dashboard, Produto, Central do Dia e CORA, mas ainda injeta cards depois da renderização. O destino final é mover cada informação para os componentes/funções nativas da Central.

Fases:

### Fase A — núcleo de dados
- cliente local do agente;
- store A-MES na mesma camada de estado da Central;
- sincronização Firebase;
- normalizadores 3028/3074/2114/3022;
- release manifest/onboarding.

### Fase B — views nativas
- Dashboard;
- Produto/CPH;
- Falhas;
- Rastreabilidade;
- Central do Dia;
- CORA.

### Fase C — remoção do paralelo
- remover iframe V2;
- remover overlay “Central V2”;
- manter no máximo uma área técnica `Integração A-MES` para diagnóstico/configuração;
- rota oficial continua a mesma Central GitHub.

## Performance

- não recarregar a página inteira durante coleta;
- persistência incremental não pode ser sacrificada por performance;
- UI usa store incremental e render seletivo;
- paginação/virtualização para tabelas grandes;
- índices por `line`, `product_model`, `pcba_sn`, `material_sn`, `defect_code`, `defect_time`;
- memoização de consultas de rastreabilidade;
- nenhuma consulta 3074/2114/3022 repetida para o mesmo identificador dentro do mesmo snapshot sem necessidade.

## Critérios para chamar de “fusão completa”

Só considerar a fusão completa quando:

- a URL oficial GitHub abre uma única Central;
- não existe iframe/proxy obrigatório;
- não existe segunda navegação “Central V2” paralela;
- Dashboard nativo usa A-MES;
- Produto/CPH nativo usa A-MES;
- Falhas conseguem relacionar evidência MES;
- Central do Dia usa contexto A-MES;
- CORA recupera dados estruturados A-MES;
- Rastreabilidade abre a partir das outras views;
- onboarding oferece o pacote certo apenas para quem vai configurar um posto;
- computador fora da rede OPPO consegue consultar dados sincronizados;
- computador da fábrica continua funcionando offline/local-first;
- Quality Gate e testes passam;
- validação real em fábrica confirma o fluxo.
