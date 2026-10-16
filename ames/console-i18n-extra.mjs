export const EXTRA_EN=Object.fromEntries(`
Falhas carregadas|Loaded failures
Selecione pela descrição. A contagem soma as ocorrências nas linhas escolhidas. Selecionadas exige ao menos um código antes de iniciar.|Select by description. Counts add occurrences across the chosen lines. Selected requires at least one code before starting.
Nenhuma falha carregada nas linhas selecionadas.|No failures loaded for the selected lines.
Limites avançados|Advanced limits
Sem limite por padrão. Preencha somente para limitar esta execução.|Unlimited by default. Fill in only to limit this run.
Sem limite|Unlimited
Códigos manuais (avançado)|Manual codes (advanced)
Separados por vírgula|Comma-separated
Nenhuma coleta iniciada nesta sessão.|No collection started in this session.
Iniciando rastreabilidade...|Starting traceability...
Descrição não informada|Description not provided
Resultado da coleta|Collection result
Valores informados pelo job; cobertura disponível no snapshot.|Values reported by the job; coverage available in the snapshot.
Linha aguardando informação|Waiting for line information
Em execução|Running
Aguardando|Waiting

Turno de produção|Production shift
Data operacional|Operational date
1º Turno|1st Shift
2º Turno|2nd Shift
1º Turno · contextos|1st Shift · contexts
2º Turno · contextos|2nd Shift · contexts
Turno sem evidência|Shift without evidence
Todos|All
Pronto|Ready
Rede do posto|Workstation network
Modo local-first: dados já salvos continuam consultáveis mesmo sem internet. Para novas consultas MES, conecte o agente local.|Saved local data remains available without internet. Connect the local agent for new MES queries.
Consulta por SN enriquecida|Enriched SN lookup
Investigação de PCBA ou Material SN com 3074, 2114, 3022 e 3012 quando a fonte estiver disponível.|PCBA or Material SN investigation with 3074, 2114, 3022 and 3012 when available.
Timeline 3022 e histórico 3012 de defeito, reparo e análise.|3022 timeline and 3012 defect, repair and analysis history.
Consultar A-MES|Query A-MES
Consultar base local|Query local database
No posto MES, use Consultar A-MES para buscar fontes ao vivo. Na Assistência/offline, use Consultar base local para cruzar tudo que já foi armazenado no SQLite.|At the MES workstation, query A-MES for live sources. For assistance or offline use, query the local database to cross-reference stored SQLite evidence.
3012 · Defect Repair Inquiry|3012 · Defect Repair Inquiry
Defeito + reparo + análise/Repair Comment. A coleta lê a grid ExtJS diretamente; exportação Excel não é requisito.|Defect, repair and analysis/Repair Comment. Collection reads the ExtJS grid directly without Excel.
GATE FÍSICO|FACTORY GATE
Início|Start
Fim|End
Modelo|Model
Coletar 3012|Collect 3012
Consultar SQLite|Query SQLite
implementada · gate físico ainda pendente|implemented · physical validation pending
Sem SN, períodos grandes são divididos automaticamente em blocos de 31 dias. Com SN, blocos maiores são usados. Cada bloco fica checkpointado para retomada após queda de rede/Chrome.|Without an SN, long periods are split into 31-day chunks. Larger chunks are used with an SN. Each chunk is checkpointed within the collection job.
Ethernet mantém internet; Wi-Fi A-MES e a rota exclusiva para 172.29.185.215 são monitorados sem alterar DNS ou gateway padrão.|Ethernet keeps internet access; A-MES Wi-Fi and the host route to 172.29.185.215 are monitored without changing DNS or the default gateway.
A-MES conectado|A-MES connected
Wi-Fi A-MES desconectado|A-MES Wi-Fi disconnected
Wi-Fi diferente do perfil A-MES|Wi-Fi differs from the A-MES profile
Rota A-MES não confirmada|A-MES route unconfirmed
A-MES sem resposta|A-MES not responding
alcançável|reachable
sem resposta|no response
Auto-recuperação|Automatic recovery
parada|stopped
ativa|active
observando|observing
Verificar rede|Check network
Reparar Wi-Fi / rota A-MES|Repair A-MES Wi-Fi / route
Cloud não é requisito para operar o Console local.|Cloud is not required to operate the local Console.

Relação histórica|Historical relation
Defect Code antigo|Prior defect code
Defect Description antigo|Prior defect description
Defect Time antigo|Prior defect time
Operador / 3022|Operator / 3022
Operador|Operator
Campos retornados pela fonte; não confirma causa raiz.|Fields returned by the source; does not confirm root cause.

Iniciar monitoramento|Start monitoring
Chrome dedicado / CDP · 9222|Dedicated Chrome / CDP · 9222
Chrome dedicado / CDP|Dedicated Chrome / CDP
Sessão A-MES · login manual|A-MES session · manual sign-in
Sessão A-MES|A-MES session
login manual|manual sign-in
Parar|Stop
AT / REPARO|AT / REPAIR
Atualizar estados|Refresh status
Atualizar N/Y|Refresh N/Y
Baixar Excel|Download Excel
Status da coleta:|Collection status:
pronto. Ao iniciar, o andamento ou erro aparecerá aqui.|ready. Progress or errors will appear here after starting.
Execução avançada e filtros|Advanced execution and filters
Escopo da coleta|Collection scope
Conectar agente local|Connect local agent
Linhas da coleta|Collection lines
Todas|All
Salvar linhas/perfil|Save lines/profile
Turno / metadado|Shift / metadata
vazio = todas|empty = all
Intervalo monitor|Monitor interval
Atualiza 2114 das PCBAs já conhecidas ou executa rastreabilidade 3074 + 2114 + 3022.|Refreshes 2114 for known PCBAs or runs 3074 + 2114 + 3022 traceability.
Rastrear 3074 + 2114 + 3022|Trace 3074 + 2114 + 3022
2114 · histórico PCBA|2114 · PCBA history
3074 · material/reuso|3074 · material/reuse
3028 · falhas|3028 · failures
3022 ainda não foi coletado para este snapshot/linha. Ausência de contexto não significa horário zero nem ausência de passagem no MES.|3022 has not been collected for this snapshot/line. Missing context does not mean zero time or no MES passage.
3022 automático|Automatic 3022
3022 em lote indisponível neste agente|Batch 3022 unavailable in this agent
3022 em lote não está habilitado no agente conectado. Evidência 3022 já persistida continua visível nesta página; nova coleta de processo exige agente 3022-R12+ ou coletor canônico validado.|Batch 3022 is not enabled in the connected agent. Saved 3022 evidence remains visible; new process collection requires a 3022-R12+ agent or validated canonical collector.
3022 múltiplas passagens / retrabalho|3022 multiple passages / rework
3074 + 2114; 3022 será marcado como indisponível|3074 + 2114; 3022 will be marked unavailable
A coleta selecionada nunca mistura linhas e um modo não apaga evidência já existente dos outros modos.|Selected collection keeps lines isolated and never erases evidence from other modes.
A consulta individual ainda pode tentar a tela 3022 e devolver aviso explícito, mas este agente não declara timeline 3022 integrada. Trate horários de processo como indisponíveis até haver evidência retornada pela fonte.|Individual lookup may try 3022 and return a warning, but this agent does not declare an integrated 3022 timeline. Process times remain unavailable until the source returns evidence.
Atualiza 2114 e reuso 3074. O 3022 em lote fica explícito como indisponível até o agente declarar essa capacidade.|Refreshes 2114 and 3074 reuse. Batch 3022 remains unavailable until the agent declares this capability.
Base local pronta para inspeção|Database ready for inspection
Bloqueado até agente R12/canônico declarar process_timeline.|Blocked until the R12/canonical agent declares process_timeline.
Bootstrap, rota, Wi-Fi e migration helper continuam no pacote Windows. Nenhuma senha é solicitada ou salva aqui. O seletor antigo “Segundo plano / Chrome visível” não é reproduzido porque o agente auditado não consumia esse campo; abrir o Chrome dedicado continua sendo uma ação real acima.|Bootstrap, routing, Wi-Fi and migration tools remain in the Windows package. No passwords are requested or saved here. The old background/visible Chrome setting was unused by the agent; dedicated Chrome can still be opened above.
Coletar período selecionado|Collect selected period
Com horário relevante|With relevant time
Cruzamento temporal da mesma base. Defect Time é detecção/registro; horário de processo é evidência de passagem e nunca causa automática.|Temporal comparison in the same database. Defect Time means detection/registration; process time is passage evidence, never automatic causation.
Códigos exatos separados por vírgula|Exact codes separated by commas
Códigos selecionados|Selected codes
Diagnóstico técnico e gate físico|Technical diagnostics and physical validation
Escolha uma ação acima. Esta é a área técnica para 3028, 2114, 3074, process_events, process_defect_contexts, tendências e jobs.|Choose an action above to inspect 3028, 2114, 3074, process_events, process_defect_contexts, trends and jobs.
Evidência carregada|Loaded evidence
Evidência que ainda exige o posto|Evidence still requiring the workstation
Falha → evidência temporal / AT|Failure → temporal evidence / AT
Falhas carregadas · selecionar sem digitar código|Loaded failures · select without typing codes
Falhas para rastreabilidade|Failures to trace
Gate físico · posto de fábrica|Physical validation · factory workstation
Histórico PCBA · 2114|PCBA history · 2114
Indisponível|Unavailable
Conectada|Connected
Conectado|Connected
Disponível|Available
Pronto|Ready
A validar|To validate
Último backup|Last backup
Motor|Engine
AGUARDANDO|WAITING
Informações de validação ficam recolhidas para não poluir a operação diária.|Validation details stay collapsed during daily operation.
Investigue a ocorrência pela falha, PCBA e posto relevante — sem confundir Defect Time com horário real de processo.|Investigate by failure, PCBA and relevant station. Defect Time is distinct from actual process time.
Limpar seleção|Clear selection
Manual/Automatic é modo de registro da falha; retrabalho, A5162, A5201 e retornos continuam separados como evidência.|Manual/Automatic describes failure registration; rework, A5162, A5201 and return passages remain separate evidence.
Múltiplas passagens|Multiple passages
Nenhum contexto de falha/processo carregado neste recorte.|No failure/process context loaded in this scope.
Nenhum evento 3022 carregado para este recorte.|No 3022 events loaded in this scope.
Nenhum job iniciado nesta sessão.|No job started in this session.
O agente conectado não declara coleta 3022 em lote. Reuso 3074/2114 continua disponível; process_only fica bloqueado até um agente 3022-R12+ ou o agente canônico incorporar o coletor validado.|The agent does not declare batch 3022 collection. 3074/2114 reuse remains available; process_only is blocked until a 3022-R12+ or canonical agent incorporates the validated collector.
O navegador é apenas a interface.|The browser is only the interface.
Ocorrências máximas / linha (0 = todas)|Maximum occurrences / line (0 = all)
Operações do agente local. Linha selecionada abaixo é contexto solicitado; a consulta SN não comprova por si só a linha ou o CPH de produção. A coleta 3022 em lote só é habilitada quando o agente declara capacidade; a consulta individual tenta 3022 quando disponível e retorna aviso explícito quando não houver evidência.|Local agent operations. The selected line is requested context; an SN lookup alone does not prove the production line or CPH. Batch 3022 requires declared capability; individual lookup attempts 3022 when available and warns when evidence is missing.
PCBAs máximas / linha (0 = todas)|Maximum PCBAs / line (0 = all)
Painel de reuso indisponível: enriquecimento ainda não disponível.|Reuse dashboard unavailable: enrichment is not available yet.
Pendente prova física sem seleção manual de OPC.|Physical validation without manual OPC selection is pending.
Pendente reinício do notebook e recuperação da configuração.|Workstation reboot and configuration recovery are pending.
Pendente validação visual e funcional no ambiente real.|Visual and functional validation in the actual environment is pending.
Pesquisar evidências locais|Search local evidence
Progresso da execução|Execution progress
Quando há filtro de falha, a timeline mostra somente PCBAs pertencentes aos contextos dessa falha. A5100, A5150, A5162, A5201, A5202, A5265, A5700 e A7600 permanecem como postos relevantes conforme família/regra. Múltiplas passagens precisam preservar a ordem real.|With a failure filter, the timeline only shows PCBAs in that failure's contexts. A5100, A5150, A5162, A5201, A5202, A5265, A5700 and A7600 remain relevant stations according to family/rule. Multiple passages preserve their actual order.
Rastrear 3074 + 2114 · 3022 indisponível|Trace 3074 + 2114 · 3022 unavailable
Registros disponíveis|Available records
Removida do export · indisponível|Removed from export · unavailable
Shift 2114 automático|Automatic 2114 Shift
Use apenas quando precisar limitar linha, período, falha ou desempenho.|Use when you need to limit line, period, failure or performance.
abra o preview do PR #23; produção não vale como gate|open the PR #23 preview; production is not valid for this gate
exige ao menos um código antes de iniciar. A lista usa apenas códigos já presentes nos snapshots das linhas escolhidas.|requires at least one code before starting. This list only uses codes present in the selected lines' snapshots.
indisponível neste agente|unavailable in this agent
ocorrência atual → Defect Time → posto relevante → última passagem válida ≤ Defect Time|current occurrence → Defect Time → relevant station → last valid passage ≤ Defect Time
removidas · dimensão indisponível|removed · dataset unavailable
3028 → 3074 → 2114 → 3022, sem misturar as linhas.|3028 → 3074 → 2114 → 3022, keeping lines isolated.
Origem desta Central|Work Center origin
GREEN físico somente após evidência no posto e aprovação do usuário.|Physical GREEN requires workstation evidence and user approval.
Falhas anteriores|Previous failures
Falha atual|Current failure
Materiais em 2º+ uso|Materials in second or later use
PCBAs anteriores/desvinculadas|Previous/unlinked PCBAs
Não foi possível salvar a preferência neste navegador.|Could not save the preference in this browser.
Período não informado pela fonte|Period not provided by source
Não há registros na revisão disponível.|No records in the available revision.
Carregando…|Loading…
Carregando...|Loading...
Não identificado|Unidentified
Nenhum|None
Sem fonte|No source
sem fonte|no source
sem snapshot|no snapshot
idade desconhecida|unknown age
MES local|Local MES
Pacote deste frontend ainda não disponível no Actions.|The package for this frontend is not yet available in Actions.
Esse é o caminho de migração suportado para o gate atual. Preserve a pasta R12 como rollback, aplique o candidato canônico e inicie pelo|This is the supported migration path for the current gate. Preserve the R12 folder as rollback, apply the canonical candidate and start with
. A interface operacional continua sendo esta Central; o agente local permanece em|. Work Center remains the operational interface; the local agent remains at
O ZIP público anterior não contém a fusão atual e deixou de ser oferecido por segurança. Estado:|The previous public ZIP does not contain the current integration and is no longer offered. Status:
code_ready_factory_package_pending|code ready; factory package pending
CPH não informado|CPH not provided
ausência não equivale a zero|missing data does not mean zero
Instalar o candidato 0.5.24-rc1 com patch FIFO e autorizar a origem exata da Central no config.json local|Install candidate 0.5.24-rc1 with the FIFO patch and authorize Work Center's exact origin in local config.json
Contrato v2 com revisão/cursor; cobertura da fonte continua parcial|v2 contract with revision/cursor; source coverage remains partial
Validação física de CDP, rede, duração, Excel e paridade fabril ainda pendente|Physical validation of CDP, network, duration, Excel and factory parity is still pending
Falhas agrupadas|Grouped failures
Primeiro veja o nome da falha e a quantidade. O código é apenas referência técnica. Clique em uma falha para abrir só suas ocorrências.|Start with the failure name and count. The code is only a technical reference. Click a failure to open only its occurrences.
Código técnico|Technical code
Código técnico não informado|Technical code not provided
Última ocorrência|Latest occurrence
Mostrar todas|Show all
Ordenar ocorrências|Sort occurrences
Falha A → Z|Failure A → Z
Mais recentes|Newest first
Mais antigas|Oldest first
Todas as falhas|All failures
Top 3 falhas|Top 3 failures
Descrição humana em destaque; o código fica apenas como referência técnica.|Human-readable description is emphasized; the code remains only a technical reference.
Buscar nome da falha|Search failure name
`.trim().split('\n').map(line=>{const i=line.indexOf('|');return [line.slice(0,i),line.slice(i+1)];}));
