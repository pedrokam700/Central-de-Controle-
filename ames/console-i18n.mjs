import {EXTRA_EN} from './console-i18n-extra.mjs';
// The locale callback is the Central's existing language state. Technical values
// and source records are never rewritten; translations only affect presentation.
export const CONSOLE_EN = Object.freeze(Object.fromEntries(`
Monitoramento|Monitoring
Monitoramento A-MES|A-MES monitoring
Falhas|Failures
Consulta por SN|SN lookup
Rastreabilidade|Traceability
Dashboards de reuso|Reuse dashboards
Processo / 3022 & AT|Process / 3022 & AT
Base local|Local database
Histórico de produção|Production history
Hoje, último dia produtivo e revisões antigas. A coleta do dia anterior não modifica os indicadores de Hoje.|Today, last production day and previous revisions. Collecting an earlier day does not change Today's indicators.
Abrir histórico|Open history
Abrir a Central local deste computador para controlar o A-MES|Open this workstation's local Central to control A-MES
O endereço do agente local pertence ao computador onde o navegador está aberto, não ao posto remoto. O site HTTPS precisa de pareamento explícito para controlar o agente.|The local agent address belongs to the computer running this browser, not the remote workstation. HTTPS requires explicit pairing to control the agent.
O histórico pode estar somente no SQLite deste computador ou na base compartilhada.|History may exist only in this computer's SQLite or in shared storage.
Coleta local disponível; envio para a equipe ainda não confirmado. Confira a sincronização abaixo.|Local collection available; team publication not confirmed. Check synchronization below.
Há revisão imutável, mas o cabeçalho legado continua em conflito; confira a leitura no outro posto.|Immutable revision exists, but the legacy head still conflicts; verify reading on the other workstation.
Última publicação confirmada pela fila; confira a leitura no outro posto.|Latest publication acknowledged by the queue; verify reading on the other workstation.
Há revisões salvas neste computador. Local ≠ publicado no Firebase; o outro posto só recebe as versões marcadas como compartilhadas.|Revisions are saved on this computer. Local does not mean published to Firebase; the other workstation only receives versions marked as shared.
Local · não confirmado na equipe|Local · not confirmed with team
Compartilhado|Shared
Compartilhamento|Sharing
Ainda não há evidência comprovada para Hoje nesta linha. Dados de outro período não serão exibidos aqui.|No verified evidence for Today on this line. Data from another period will not be shown here.
Último dia de produção|Last production day
Histórico por data|Production history by date
Consulta avançada|Advanced query
Linha:|Line:
Última extração:|Last extraction:
Conforme evidência da revisão|According to revision evidence
O 3028 usa 07:00 → 07:00; turnos 07:30/17:30 permanecem distintos. Dados não comprovados nunca viram zero.|3028 uses 07:00 → 07:00; shifts 07:30/17:30 remain distinct. Unverified data never becomes zero.
Histórico de produção em destaque: Hoje, dia produtivo anterior, revisões AT, calendário e consultas isoladas.|Production history: Today, last production day, AT revisions, calendar and isolated queries.
CORA conhecimento|CORA knowledge
CORA · conhecimento|CORA · knowledge
Central de trabalho|Work Center
A-MES · motor local|A-MES · local engine
Views da automação A-MES|A-MES automation views
Offline por padrão.|Offline by default.
MES e banco ficam no notebook. O Console usa o mesmo agente local, SQLite e estado da Central.|MES and the database stay on the workstation. The Console uses the same local agent, SQLite and Work Center state.
Fechar menu do Console MES|Close MES Console menu
Abrir menu do Console MES|Open MES Console menu
Agente local desconectado|Local agent disconnected
Agente local conectado|Local agent connected
MES local não disponível neste computador|Local MES is not available on this computer
Abrir A-MES|Open A-MES
Configurar posto|Set up workstation
Verificar|Check
Voltar à Central|Back to Work Center
Poucos cliques na frente; coleta, snapshots e correlações por trás.|Simple controls for collection, snapshots and correlations.
FPY, Check FPY, Quantity e Top 3 sempre separados por linha.|FPY, Check FPY, Quantity and Top 3 always separated by line.
Ocorrências atuais, estados de reparo e histórico operacional.|Current occurrences, repair status and operational history.
Investigação de PCBA ou Material SN com 3074, 2114 e 3022 quando a fonte estiver disponível.|Investigate PCBA or Material SN using 3074, 2114 and 3022 when the source is available.
Coleta seletiva full, process_only ou reuse_only sem misturar linhas e respeitando capacidades do agente.|Selective full, process_only or reuse_only collection, keeping lines isolated and respecting agent capabilities.
Segundo uso de PCBA e Material SN, recorrência e vínculos históricos.|Second use of PCBA and Material SN, recurrence and historical links.
Timeline de montagem, teste, detecção, AT e retorno à linha quando 3022 estiver disponível.|Assembly, testing, detection, AT and return-to-line timeline when 3022 is available.
SQLite e datasets locais preservados para consulta e auditoria.|SQLite and local datasets preserved for queries and auditing.
Busca operacional com separação entre fato, correlação, hipótese e causa confirmada.|Operational search separating facts, correlations, hypotheses and confirmed causes.
Verificando este computador…|Checking this computer…
Dados compartilhados|Shared data
Consulte os dados compartilhados ou prepare este computador para coleta. O login A-MES permanece manual.|View shared data or prepare this computer for collection. A-MES sign-in remains manual.
Usar somente dados compartilhados|Use shared data only
Preparar este computador|Prepare this computer
Pré-teste do posto|Workstation pre-test
Agente local · 8765|Local agent · 8765
Motor A-MES|A-MES engine
Dependências|Dependencies
Chrome dedicado / CDP · 9222|Dedicated Chrome / CDP · 9222
Rede / rota A-MES|A-MES network / route
Sessão A-MES · login manual|A-MES session · manual sign-in
Capacidade 3022|3022 capability
Verificado|Verified
Pendente|Pending
Não verificado|Not verified
Pronto para teste|Ready for testing
Conclua os itens pendentes e confirme o login manual A-MES antes da coleta.|Complete the pending checks and confirm manual A-MES sign-in before collecting.
Verificar novamente|Check again
Integração A-MES|A-MES integration
Este computador coleta A-MES?|Will this computer collect A-MES data?
Configurar este computador|Set up this computer
Somente visualizar|View only
Preferência: este computador fará coleta local A-MES. A conexão só fica ativa quando o agente e o Chrome/CDP passarem no preflight.|Preference: this computer will collect local A-MES data. Collection requires the agent and Chrome/CDP preflight checks.
Somente visualizar: usa snapshots sincronizados; nenhuma coleta MES é iniciada neste computador.|View only: uses synchronized snapshots; no MES collection starts on this computer.
Escolha como pretende usar este computador. Você pode alterar esta opção aqui no Perfil.|Choose how to use this computer. You can change this preference in your profile.
Credenciais e sessão do A-MES permanecem locais. Esta configuração salva somente a preferência deste navegador.|A-MES credentials and session stay local. This setting saves only this browser's preference.
Consultando o estado do pacote local…|Checking local package availability…
Tentar novamente|Try again
Instalação em computador novo ainda bloqueada|Installation on a new computer is still blocked
Este computador já possui a automação R12|This computer already has R12 automation
O login do A-MES continua manual. A Central não recebe senha A-MES, cookies, CDP nem senha Wi-Fi.|A-MES sign-in remains manual. Work Center does not receive A-MES passwords, cookies, CDP or Wi-Fi passwords.
O que ainda precisa ser provado no posto|What still requires workstation validation
Quando o pacote fundido for gerado a partir da R12 capturada no posto e passar o gate físico, o botão de download aparecerá aqui. Até lá, não instale o pacote antigo em uma máquina nova esperando paridade R12.|The download will appear after the integrated package is built from the captured factory R12 and passes physical validation. Until then, the old package does not provide R12 parity on a new computer.
Manifesto indisponível ou inválido. Nenhum pacote será sugerido sem manifesto válido.|Manifest unavailable or invalid. No package will be offered without a valid manifest.
Baixar pacote de instalação|Download installation package
Use este download somente uma vez por computador e confira o SHA-256 antes da instalação.|Use this download once per computer and verify SHA-256 before installation.
ROTINA DA MANHÃ|MORNING ROUTINE
Fechar dia anterior|Close previous day
Consulta diretamente o 3028 no período anterior e preserva cada linha em snapshot próprio.|Queries 3028 for the previous period and preserves a separate snapshot for each line.
Atualizar dia anterior|Update previous day
DURANTE O DIA|DURING THE DAY
Monitorar hoje|Monitor today
Atualize quando quiser ou deixe recorrente. Cada ciclo consulta o 3028 direto no A-MES.|Update on demand or enable recurring collection. Each cycle queries 3028 directly in A-MES.
Atualizar agora|Update now
Iniciar monitor|Start monitor
Parar monitor|Stop monitor
Rastrear falhas|Trace failures
Rastreabilidade profunda|Deep traceability
Abrir rastreabilidade|Open traceability
Configuração da coleta|Collection settings
Configuração do posto|Workstation settings
Linhas|Lines
Linha|Line
Linha em foco|Focused line
Perfil|Profile
Rápido|Fast
Equilibrado|Balanced
Seguro|Safe
Intervalo (min)|Interval (min)
Salvar configuração|Save settings
Conectar agente|Connect agent
Cancelar job|Cancel job
Central das Linhas|Line Center
Uma linha por vez, sem misturar snapshots ou ocorrências.|One line at a time, keeping snapshots and occurrences separate.
Atualizar todas|Update all
Atualizar leitura|Refresh data
Atualizar esta linha|Update this line
Origem|Source
Atualizar|Refresh
Atualizar tela|Refresh view
Todos os modelos|All models
Todos os códigos|All codes
CPH exato|Exact CPH
Ocorrências|Occurrences
Top 3 defeitos|Top 3 defects
Ranking da lista carregada nesta linha e filtro.|Ranking of the loaded list for this line and filter.
Nenhuma ocorrência disponível neste escopo.|No occurrences available in this scope.
Ocorrências da leitura|Loaded occurrences
Limpar filtro|Clear filter
Código|Code
Descrição|Description
Nenhum registro carregado para esta combinação.|No records loaded for this combination.
Evolução do dia|Daily trend
Snapshots salvos pelo agente para a linha selecionada.|Snapshots saved by the agent for the selected line.
Atualizar evolução|Refresh trend
Coleta|Collection
Ainda não há evolução carregada nesta sessão.|No trend loaded in this session yet.
Pesquisar|Search
Todos os estados|All statuses
atuais|current
Recarregar|Reload
Removidas do export indisponíveis nesta leitura.|Removed export rows are unavailable in this read.
O agente não expôs esta dimensão; ausência de dataset não equivale a zero removidas.|The agent did not provide this dataset; missing data does not mean zero removed rows.
Presença|Presence
Falha|Failure
Comentário|Comment
Nenhum registro para os filtros. Ausência na lista parcial não significa ausência de falha.|No records match these filters. Absence from a partial list does not mean no failures exist.
Consulta individual por SN|Individual SN lookup
Bipe uma PCBA ou Material SN para cruzar histórico 2114, reutilização 3074 e processo 3022 na mesma leitura.|Scan a PCBA or Material SN to correlate 2114 history, 3074 reuse and 3022 process in one read.
PCBA / Material SN exato|Exact PCBA / Material SN
Consultar|Look up
A consulta individual aceita somente a SN. Linha, CPH/modelo e Shift abaixo são identificados pelo retorno real da fonte; não existem filtros decorativos de linha ou perfil nesta operação.|Individual lookup accepts only the SN. Line, CPH/model and Shift are identified from the actual source response.
Resultado único|Single result
Consultando A-MES…|Querying A-MES…
3074 + 2114 + 3022 quando houver evidência|3074 + 2114 + 3022 when evidence is available
Falha na consulta|Lookup failed
Agente|Agent
Pronto para consulta|Ready for lookup
Sem job de SN em execução.|No SN job is running.
Consulte uma SN para abrir a investigação completa|Look up an SN to open the full investigation
O resultado reunirá falha atual, falhas anteriores, materiais em 2º+ uso, PCBAs anteriores/desvinculadas e evidência temporal 3022 quando retornadas pela fonte.|Results include current and prior failures, reused materials, prior/unlinked PCBAs and 3022 temporal evidence when provided by the source.
2114 indisponível nesta resposta; ausência não equivale a zero ou a inexistência de histórico.|2114 is unavailable in this response; missing data does not mean zero or no history.
A 2114 foi consultada, mas não confirmou falha atual para esta SN.|2114 was queried but did not confirm a current failure for this SN.
Histórico 2114 indisponível nesta resposta.|2114 history is unavailable in this response.
3074 indisponível nesta resposta; não converter ausência de fonte em zero de reuso.|3074 is unavailable in this response; missing source data must not become zero reuse.
Usos conhecidos|Known uses
Reusos|Reuses
A 3074 foi consultada e nenhum Material SN em 2º+ uso foi confirmado nesta resposta.|3074 was queried and no Material SN in second or later use was confirmed in this response.
Regra temporal:|Temporal rule:
ocorrência atual → Defect Time → posto relevante → última passagem concluída válida ≤ Defect Time|current occurrence → Defect Time → relevant station → last valid completed passage ≤ Defect Time
3022 indisponível nesta resposta; não mostrar zero como se a tela tivesse sido consultada com sucesso.|3022 is unavailable in this response; do not display zero as if the query had succeeded.
Atenção|Attention
Linhas desta execução|Lines for this run
Completo|Full
Processo|Process
Somente horários 3022|3022 times only
Reuso|Reuse
Ocorrências máximas / linha|Maximum occurrences / line
PCBAs máximas / linha|Maximum PCBAs / line
Códigos exatos de falha|Exact defect codes
Iniciar coleta|Start collection
Cancelar|Cancel
Progresso da rastreabilidade|Traceability progress
Visualizar linha|View line
Selecione pelo menos uma linha.|Select at least one line.
Aguardando progresso detalhado.|Waiting for detailed progress.
Nenhuma coleta de rastreabilidade iniciada nesta sessão.|No traceability collection started in this session.
PCBA exata|Exact PCBA
Todas as falhas|All failures
Regra temporal obrigatória|Required temporal rule
Nunca usar simplesmente o último evento da peça. A5700 fecha o conjunto de testes relevante; packing continua preservado, mas fora do foco analítico.|Never use just the last event for the part. A5700 closes the relevant test set; packing is preserved outside the analytical focus.
Nenhum registro disponível.|No records available.
Área especializada. Segundo uso da própria PCBA e segundo uso de Material SN continuam conceitos separados.|Specialized view. Second use of the PCBA itself and second use of Material SN remain separate concepts.
Grupos|Groups
Indicadores|Indicators
itens exatos|exact items
isolada|isolated
sem aproximação|exact match only
Reuso ainda não enriquecido nesta linha|Reuse has not been enriched for this line
Execute Rastreabilidade em modo completo ou reuse_only. Ausência de dados não significa ausência de reutilização.|Run full or reuse_only traceability. Missing data does not mean no reuse occurred.
Clique apenas nos indicadores que possuem evidência exata carregada.|Click indicators with exact loaded evidence.
Abrir SNs exatos →|Open exact SNs →
Drill-down não carregado nesta leitura|Drill-down not loaded in this read
ITEM EXATO EM EVIDÊNCIA|EXACT EVIDENCE ITEM
Fechar evidência|Close evidence
Primeiro item do conjunto|First item in the set
Identificador não informado|Identifier not provided
O indicador existe, mas nenhum registro detalhado foi retornado nesta leitura.|The indicator exists, but no detailed records were returned in this read.
PCBA reutilizada|Reused PCBA
Material SN reutilizado|Reused Material SN
Correlação material ↔ PCBA|Material ↔ PCBA correlation
Base local / SQLite|Local database / SQLite
Área técnica para auditoria. Dados brutos e derivados ficam aqui para não poluir as outras oito views.|Audit tools for source and derived data.
Busca local|Local search
Contextos históricos|Historical contexts
Catálogo|Catalog
Tendências|Trends
Histórico operacional do agente|Agent operational history
Exportar a base consolidada disponível|Export the available consolidated database
Inspecionar a tabela selecionada no SQLite local|Inspect the selected table in local SQLite
Estrutura, datasets e cobertura disponíveis|Available structure, datasets and coverage
Evolução salva da linha selecionada|Saved trend for the selected line
Carregar todos os datasets disponíveis|Load all available datasets
Erro|Error
Resultados|Results
CORA · conhecimento A-MES|CORA · A-MES knowledge
Busca estruturada na mesma base operacional. Causa só é exibida como confirmada quando a fonte a classifica assim.|Structured search in the same operational database. A cause is only confirmed when classified as such by the source.
Buscar|Search
Fato / evidência|Fact / evidence
Correlação|Correlation
Hipótese|Hypothesis
Causa confirmada|Confirmed cause
Buscando conhecimento operacional|Searching operational knowledge
A CORA consulta a mesma base A-MES; ela não transforma correlação em causa.|CORA queries the same A-MES database; it does not turn correlation into causation.
Falha na busca local|Local search failed
Erro de transporte/consulta não é fato, correlação, hipótese nem causa.|A transport/query error is not a fact, correlation, hypothesis or cause.
Pesquise na mesma base da Central|Search the Work Center database
Use PCBA, Material SN, Defect Code, descrição, CPH ou posto de processo. Fato, correlação, hipótese e causa confirmada permanecem separados.|Use PCBA, Material SN, Defect Code, description, CPH or process station. Facts, correlations, hypotheses and confirmed causes remain separate.
Nenhum resultado nesta leitura|No results in this read
Isso não prova ausência no MES; significa apenas que a base local disponível não retornou correspondência.|This does not prove absence in MES; the available database returned no match.
resultado(s)|result(s)
Busca|Search
fonte local|local source
Evidência|Evidence
Arquitetura de dados|Data architecture
CORA consulta a mesma base operacional; ela não vira um segundo banco.|CORA queries the same operational database; it does not create a second database.
Fonte de verdade local|Local source of truth
SQLite mantém snapshots, vínculos e evidências estruturadas.|SQLite stores snapshots, links and structured evidence.
Índice CORA|CORA index
Busca documentos compactos derivados da base, preservando proveniência.|Searches compact documents derived from the database, preserving provenance.
Por linha|By line
Line Id acompanha as entidades; análises operacionais não misturam linhas por padrão.|Line Id follows each entity; operational analysis keeps lines separate by default.
Contexto sob demanda|Context on demand
Só o recorte relevante entra na consulta; fato, correlação, hipótese e causa confirmada continuam separados.|Only the relevant scope enters the query; facts, correlations, hypotheses and confirmed causes remain separate.
Estado do motor|Engine status
Execução avançada|Advanced execution
Diagnóstico e gate físico|Diagnostics and physical validation
Agente local|Local agent
Rede A-MES|A-MES network
Frontend SHA|Frontend SHA
conectado|connected
desconectado|disconnected
disponível|available
indisponível|unavailable
conectada|connected
aguarda conexão|awaiting connection
validado na conexão|validated on connection
em execução|running
concluído|completed
aguardando|waiting
carregando|loading
não informado|not provided
Origem de preview|Preview origin
capacidade declarada|declared capability
indisponível / não declarada|unavailable / undeclared
PRONTO PARA VALIDAR 9/9|READY TO VALIDATE 9/9
CONECTE O AGENTE|CONNECT THE AGENT
BLOQUEADO NO POSTO|BLOCKED AT WORKSTATION
PARCIAL · 3022 EM LOTE PENDENTE|PARTIAL · BATCH 3022 PENDING
Consulta SN, período e ferramentas|SN lookup, period and tools
Linha de investigação|Investigation line
PCBA ou Material SN exato|Exact PCBA or Material SN
Consultar SN · 3074/2114/3022|Look up SN · 3074/2114/3022
3028 por período / turno|3028 by period / shift
Início local do posto|Workstation local start
Fim local do posto|Workstation local end
Turno|Shift
Todos|All
Coletar período nas linhas selecionadas acima|Collect period for the lines selected above
Tendências da linha|Line trends
Atualizar reparos 2114|Refresh 2114 repairs
Backup local · criar agora|Local backup · create now
Abrir Chrome/CDP|Open Chrome/CDP
Histórico de jobs|Job history
Status do monitor|Monitor status
Atualizar somente reparos pendentes|Refresh pending repairs only
Dataset do catálogo|Catalog dataset
Falhas atuais|Current failures
Ler dataset da linha|Read line dataset
Busca local na base|Local database search
Importações existentes|Existing imports
Export detalhado 3028 (.xlsx) ou integrado (.json)|Detailed 3028 export (.xlsx) or integrated export (.json)
Enviar export 3028|Upload 3028 export
Analisar export enviado · 3074/2114|Analyze uploaded export · 3074/2114
Importar JSON integrado|Import integrated JSON
A importação preserva o arquivo no agente; não grava nada no MES. Arquivos brutos não são enviados ao Firebase.|Import preserves the file in the agent without writing to MES. Raw files are not sent to Firebase.
Carregar configuração atual|Load current settings
Início do dia operacional|Operational day start
Intervalo padrão do monitor|Default monitor interval
Porta MES|MES port
URL inicial MES|MES start URL
Diretório do perfil Chrome (opcional)|Chrome profile directory (optional)
Backups mantidos|Backups retained
Backup ao iniciar|Backup on startup
Manter configuração atual|Keep current settings
Ativado|Enabled
Desativado|Disabled
Salvar configuração do posto|Save workstation settings
Anterior|Previous
Próxima|Next
Baixar resultado JSON completo|Download full JSON result
Nenhum arquivo selecionado.|No file selected.
Selecione arquivo até 25 MB.|Select a file up to 25 MB.
Configuração atual carregada do agente sem alterar o posto.|Current settings loaded from the agent without changing the workstation.
Conecte o agente com scheduler compatível.|Connect an agent with a compatible scheduler.
Agente local não autorizado. Abra a Central pelo launcher deste posto.|Local agent is not authorized. Open Work Center using this workstation's launcher.
Informe período válido.|Enter a valid period.
Informe o SN.|Enter the SN.
Envie o arquivo antes de iniciar.|Upload the file before starting.
Coleta inválida.|Invalid collection.
Modo de rastreabilidade inválido.|Invalid traceability mode.
Linha inválida|Invalid line
Operação desconhecida|Unknown operation
Resposta Excel inválida.|Invalid Excel response.
Aguarde ou cancele o job atual.|Wait for or cancel the current job.
Intervalo mínimo do monitor: 5 minutos.|Minimum monitor interval: 5 minutes.
Histórico|History
ATUAL|CURRENT
HISTÓRICO|HISTORY
Atualizado|Up to date
Parcial|Partial
Desatualizado|Stale
Não coletado|Not collected
Cobertura completa|Complete coverage
Cobertura parcial|Partial coverage
Período ainda não coletado|Period not collected yet
Coletar este período|Collect this period
Período|Period
Início|Start
Fim|End
Abrir|Open
Última atualização|Last update
Posto coletor|Collector workstation
Histórico compartilhado indisponível. Verifique a conexão e as permissões.|Shared history unavailable. Check connection and permissions.
Consultando histórico…|Loading history…
Período não informado pela fonte|Period not provided by source
Consultar histórico|Query history
Voltar aos dados atuais|Back to current data
Sem dados compartilhados para esta linha.|No shared data for this line.
Dados históricos · coleta local desabilitada nesta consulta|Historical data · local collection disabled in this query
Abrir pacote de migração R12|Open R12 migration package
O pacote é exclusivo para computadores que já possuem R12. Preserve o backup e use o launcher incluído.|The package is only for computers that already have R12. Preserve the backup and use the included launcher.
Histórico de períodos|Period history
Sincronização pendente|Synchronization pending
Falha de sincronização|Synchronization failed
Não foi possível verificar o agente local.|Could not verify the local agent.
Dados disponíveis para consulta; coleta local indisponível.|Data is available for viewing; local collection is unavailable.
CPH, SKU, Defect Code, Material SN, PCBA|CPH, SKU, Defect Code, Material SN, PCBA
`.trim().split('\n').map(line => { const at=line.indexOf('|'); return [line.slice(0,at),line.slice(at+1)]; })));

const patterns = [
  [/^origem (.*)$/, 'source $1'],
  [/^cobertura (.*)$/, 'coverage $1'],
  [/^(\d+) linhas$/, '$1 lines'],
  [/^(\d+) registros carregados · referências temporárias desta leitura\. Ausência não significa zero\. Batch Count não é reuso\.$/, '$1 loaded records · temporary references for this read. Missing data does not mean zero. Batch Count is not reuse.'],
  [/^(\d+) registro\(s\) disponíveis\. Clique no Top 3 para filtrar rapidamente\.$/, '$1 record(s) available. Click Top 3 to filter.'],
  [/^Página (\d+) de (\d+)$/, 'Page $1 of $2'],
  [/^Históricos e reuso disponíveis · (.*)$/, 'Available history and reuse · $1'],
  [/^Origem: agente V0\.5\.23 · snapshot (.*?) · coleta (.*?)\. Cobertura parcial: API sem revisão\/cursor\. Consulta da linha inteira, independente dos filtros de ocorrências acima\. Linha histórica derivada pelo agente; PCBA histórica não implica mesmo CPH\. Correlação não confirma causa\.$/, 'Source: V0.5.23 agent · snapshot $1 · collected $2. Partial coverage: API without revision/cursor. Whole-line query, independent of the occurrence filters above. Agent-derived historical line; historical PCBA does not imply the same CPH. Correlation does not confirm causation.'],
  [/^Linha (\d+)(.*)$/, 'Line $1$2'],
  [/^Agente local conectado(.*)$/, 'Local agent connected$1'],
  [/^Atualizado às (.*)$/, 'Updated at $1'],
  [/^(\d+) registro\(s\)(.*)$/, '$1 record(s)$2'],
  [/^Registro (\d+)$/, 'Record $1'],
  [/^Agente: HTTP (\d+)$/, 'Agent: HTTP $1'],
];
export function consoleText(value, locale='pt-BR') {
  const text=String(value??''); if(!String(locale).startsWith('en'))return text;
  if(EXTRA_EN[text])return EXTRA_EN[text];
  if(CONSOLE_EN[text])return CONSOLE_EN[text];
  for(const [pattern,replacement] of patterns)if(pattern.test(text))return text.replace(pattern,replacement);
  if(text.includes(' · '))return text.split(' · ').map(part=>consoleText(part,locale)).join(' · ');
  if(text.endsWith(' —'))return consoleText(text.slice(0,-2).trim(),locale)+' —';
  return text;
}

export function createConsoleTranslator(root, locale=()=>document.documentElement.lang) {
  const originals=new WeakMap(), attributes=new WeakMap(); let disposed=false, queued=false;
  const excluded=el=>!el||el.closest('script,style,pre,code,[data-no-i18n]')||(el.closest('td')&&!el.closest('button,a'));
  function render(){
    if(disposed)return; observer.disconnect();
    const lang=typeof locale==='function'?locale():locale;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
    while(node=walker.nextNode()){
      if(excluded(node.parentElement))continue;
      const prior=originals.get(node), current=node.nodeValue;
      const source=prior&&current===prior.output?prior.source:current;
      const trimmed=source.trim(), output=source.replace(trimmed,consoleText(trimmed,lang));
      if(current!==output)node.nodeValue=output;
      originals.set(node,{source,output});
    }
    for(const el of root.querySelectorAll('[placeholder],[title],[aria-label]')){
      if(excluded(el))continue;
      const map=attributes.get(el)||{};
      for(const name of ['placeholder','title','aria-label']){
        if(!el.hasAttribute(name))continue;
        const current=el.getAttribute(name), prior=map[name], source=prior&&current===prior.output?prior.source:current, output=consoleText(source,lang);
        if(current!==output)el.setAttribute(name,output);map[name]={source,output};
      }attributes.set(el,map);
    }
    observer.observe(root,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['placeholder','title','aria-label']});
  }
  const schedule=()=>{if(!queued&&!disposed){queued=true;queueMicrotask(()=>{queued=false;render();});}};
  const observer=new MutationObserver(schedule), languageObserver=new MutationObserver(schedule);
  languageObserver.observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  render();
  return {render,clear(){disposed=true;observer.disconnect();languageObserver.disconnect();}};
}
