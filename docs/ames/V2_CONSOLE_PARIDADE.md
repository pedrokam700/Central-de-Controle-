# Console MES — checklist de paridade (migração incompleta)

Referência alvo: **V0.5.23** do manifesto `ames/releases/latest/release.json`, pacote `AMES_Central_Offline_V0_5_23_CONSOLIDADA_FABRICA.zip`, SHA-256 `1c0e7a37af4fb4b0b08b377d7c17c6895be5891e27c2ba9d37a9cc8cb6708167`.

Baseline fabril preservada: **V0.5.20 para 3028 + 3074 + 2114**, conforme aceite do usuário. ZIP local conferido com SHA-256 `8aebf57443c140cd2e44a171628f8ac1974bb0315605ce90338af759957acbb6`. Nenhum arquivo do pacote/coletor foi modificado ou executado.

## Evidência consultada e limite da comparação

- V0.5.23: ZIP mais recente em Downloads fornecido pelo usuário, hash e tamanho (707613 bytes) conferidos. Leitura direta de `ames-offline-v2.js/html`, `ames-agent/agent.py`, `engine_bridge.py`, `store.py` e `docs/CONTRATO_DADOS_AMES_OFICIAL.txt`; sem executar pacote/agente. agent.py SHA-256 `99e0417ee28e596ae96568a342dec07de235ae56c037728f51fe2efb7f285103`; engine_bridge.py `68e58f6f4dcd914d3d49e0a1204a3cfb35a43217a9e8068fc444e8d59b409ee9`; interface JS `29f7d5a1e992ece41542feb084c75577a8a8a3764db4b579928e161850bf0f0e`. O acesso pelo link falhou inicialmente; o arquivo local correto resolveu a referência.
- V0.5.22: README e SOURCE_HASHES versionados registram as 11 sheets, painel/matriz de reuso, controles herdados da V0.5.21, persistência incremental, export e bootstrap. São referência documental, não validação executada aqui.
- V0.5.20: leitura estática direta do ZIP validado, apenas `ames-offline-v2.js/html`, `ames-agent/agent.py`, `engine_bridge.py` e `store.py`, extraídos fora do repositório. JS SHA-256 `1f8fd696f3568e07ffb1ce7ad82246f24a369bf8a90977ab7ee18c30bf33ac6c`; agent.py `c59d8e9601d92f610b64784159410e906314a4dc284bf9efa10c35d69c513959`.
- Exemplos concretos na baseline: `collectCfg`, `runAllLines`, `watchJob`, `loadConfig/saveSetup`, `refreshDatabase`, `exportExcel`; servidor `/api/v1/config`, `/runs`, `/jobs/<id>`, `/base`, `/base/catalog`, `/export/excel/download`. Confirmados também na V0.5.23 por leitura direta; **não ativados no Console**. Não copiar payloads/API por presunção. A baseline possui export com menos sheets; não tratá-la como equivalente ao export mais recente.

## Checklist de paridade

“Parcial” significa somente o que o snapshot legado comprova. “No pacote” significa preservado por ausência de alterações; não significa equivalente nativo concluído. Nenhuma interface antiga foi removida. Não há segundo store, Auth, iframe, overlay ou proxy no Console.

| Função da automação isolada | preservada no Console | integrada à Central | pendência |
| --- | --- | --- | --- |
| Linha 1/2/3 (TAN10101/02/03) e visão isolada | Sim, uma linha por consulta | Mesmo state.ames | Validar com dados reais |
| FPY, Check FPY, quantidade | Sim, agregados da fonte por linha | Renderer comum | Sem drill-down inventado; escopo agregado ausente para filtros |
| Top 3 | Parcial: lista carregada | Mesmo seletor do Dashboard | Top 3 do universo completo não comprovado |
| Falhas/ocorrências, CPH, Repair Status, Defect Type | Sim, observações disponíveis e filtros exatos | Renderer comum; Reports preservados | Campos ausentes continuam “não informado” |
| Snapshot, origem, coleta, cobertura | Sim, parcial explícito | Mesmo store | Export com revisão/completude/IDs duráveis |
| Investigação PCBA e paginação | Sim, 25 registros por página | Drill-down inline compartilhado | Material SN e histórico detalhado não exportados |
| Drill-down dos contadores | Parcial: ocorrências/Top 3 carregados | Referências temporárias | Numeradores/denominadores e histórico dos demais contadores |
| Escopo da coleta | Não; filtros são de consulta | Limitação explícita | Transporte nativo e exclusão global de jobs no agente |
| Uma/várias/todas as linhas para coletar | Não; no pacote preservado | Consulta isolada disponível | Não confundir linha visualizada com lote de coleta |
| Uma/várias/todas as falhas para coletar | Não; no pacote quando suportado | Filtro exato da lista | Payload confirmado em /deep-trace; ativação bloqueada pela serialização |
| Quantidade/tipo/período/turno de coleta | Não; no pacote preservado | Indisponibilidade explícita | Parâmetros reais do agente |
| Progresso real por etapa/job | Não; no pacote preservado | Sem progresso simulado | Jobs, etapas e vínculo à linha da coleta |
| Perfis de desempenho | Não; no pacote preservado | Sem seleção fictícia | Perfis confirmados; benchmark fabril pendente |
| Waits seguros e serialização MES | Coletor intacto; Console não comanda MES | Nenhum wait/poll de coleta adicionado | Comparar tempos no ambiente fabril antes de conectar |
| Persistência de configuração do posto | Não; no pacote preservado | Somente preferência coletor/visualizador no navegador | Contrato de configuração; não persistir credenciais |
| PCBA reuse ≠ material/component reuse | Separação semântica visível | Dimensões comuns de evidência | Dados 2114/3074; nenhum cálculo por Batch Count |
| Painel de reuso/recorrência e taxas | Não; no pacote preservado | Lacuna explícita | Evidência detalhada, escopos e denominadores |
| Matriz por tipo de componente | Não; no pacote preservado | Ainda não integrada | Dados/contrato e drill-down por célula |
| Histórico 3074, Material SN, bind/unbind | Não; apenas disponibilidade/contagem legada | Dimensão preparada no trace/Console | Registros e identidades reais |
| Histórico 2114, Repair/Defect Type histórico | Não; apenas disponibilidade/contagem legada | Dimensão preparada no trace/Console | Registros e contexto histórico real |
| Excel completo de 11 sheets | Não; no pacote preservado | Não gerar Excel parcial como completo | 11 sheets confirmadas no código; integrar download original após conexão |
| Bootstrap 00_INICIAR_AQUI.bat | Documentado no onboarding; pacote intacto | Acesso discreto pelo Perfil/Console | Validar instalação real; não executado |
| Dependências, Chrome, CDP, rota, agente | No pacote preservado | Orientação para instalação existente | Readiness/contrato do agente e teste no posto |
| Perfil Wi-Fi reutilizado, sem senha salva | No pacote preservado | Nenhuma credencial nova persistida | Validar fluxo do bootstrap mais recente |
| Migration helper / base anterior | No pacote preservado | Não executado nem reimplementado | Testar cópia/migração em ambiente com backup |
| Views auxiliares, catálogo, tendências, importações, monitor/repair refresh/backup | No pacote preservado | Não substituídas pelo Console | Contratos inspecionados; migrar sem perda após serialização/conexão |
| Compartilhamento de dados coletados | Leitura parcial disponível | Listener existente aiKnowledge | Sem publicador novo; contrato/export seguro completo |
| Operação local na fábrica | Store preparado; transporte não conectado | Mesmo state.ames | Transporte verificado, sessão, CORS e serialização |
| Leitura sincronizada/remota | Sim, snapshots existentes | Dashboard/Produto/Falhas/Dia/CORA/Console | Validação autenticada/fabril; cobertura parcial |
| Fallback local | Localização documentada; pacote preservado | Instrução no onboarding | Não é arquitetura paralela criada pela Central |
| Pacote V0.5.23 atual | Manifesto/hash/link preservados | Perfil e atalho discreto; sem download forçado | ZIP/hash verificados; instalação real ainda não executada |
| Cache/offline | Cache estático corrigido | Assets e módulos nativos | Offline completo/Auth/Firebase/agente ainda não comprovados |
| Performance visual | Paginação e DOM estável em render inalterado | Renderer reutilizado, sem fetch MES extra | Benchmark com dataset/carga real e V0.5.23 |
| Processo 3022 | Somente dimensão preparada | Sem novo adaptador | Último evento válido event_time <= defect_time; NÃO GREEN |

## Validação e próximo passo

Testes direcionados: escopo exato (CPH2859 × CPH2859V, PCBA, linha, estados), referências/coverage, logout, capabilities e cache. Smoke sintético usa HTML/CSS e funções nativas: Console/Dia/CORA/onboarding em 360/390/768/1280, zoom CSS 200%, foco/teclado, correção/corrida de snapshot, paginação e ausência de rede externa. Não mede tempo de 3028/3074/2114, não executa autenticação/CRUD real ou o agente.

**Migração visual não concluída.** Próximo passo seguro: resolver a exclusão global dos jobs no agente sem reescrever o coletor 3028, validar o transporte e depois conectar cada capacidade real ao mesmo store com testes de paridade e tempos. Não remover nenhuma tela/funcionalidade isolada até essa checklist ficar sem perda funcional. V2/V0.5.23/3022 continuam NÃO GREEN.

## Bloqueio concreto encontrado na V0.5.23

O Console de consulta está funcional, mas não é seguro declarar a migração concluída ou ativar novos comandos:

- agent.py:512–516, 814–825: start_job, start_sn_lookup_job e start_deep_trace_job iniciam threads independentes sem exclusão MES compartilhada. JOBS_LOCK protege o dicionário de status, não envolve a operação MES inteira.
- agent.py:1074–1078: o monitor verifica somente jobs kind == analysis; não exclui deep_trace/SN. O lock MES_LOCK encontrado em ames_3028_live.py não é usado pelo caminho 3074/2114 de engine_bridge.py. A busca foi feita nos fontes Python do ZIP, sem executar operações.
- Uma fila JS só coordenaria esta aba; não impediria concorrência com monitor/interface antiga/outros clientes. Corrigir isso é trabalho do contrato/scheduler do agente, antes de ativar controles nativos. Nenhuma alteração no pacote real foi feita neste sprint.
- /base aceita snapshot_id, line, dataset e limit (teto 100000), mas sem offset/cursor/revisão. O enriquecimento modifica o mesmo snapshot incrementalmente. Leitura parcial pode continuar explícita; completude/transação entre datasets não pode ser presumida.
- store.py:1071–1097 deriva linha de históricos/materiais por primeira correspondência (LIMIT 1). Mesma PCBA presente em linhas distintas exige contexto/evidência inequívocos; não atribuir silenciosamente ao CPH/linha atual.

## Paridade de performance e export confirmada no código

3028 preservada bit a bit entre os ZIPs V0.5.20 e V0.5.23: ames_3028.py SHA-256 829da91ba7b685f4594bae2aad737f1eea64d7b1eaa8073e8bb263748fbe1ca1; ames_3028_live.py b512d42ad39fad326252264ce57f98f3731db5161ab8625cf5b244dffffad0e2. Nenhuma alteração nestes coletores.

V0.5.23 engine_bridge.py:188–190: fast=0s, balanced=0,03s, safe=0,12s de pausa adicional 3074/2114; waits internos do coletor permanecem intactos. UI original: poll de job 850ms, refresh parcial somente após alteração de partial_refresh e intervalo >2200ms. O Console atual não acrescenta chamadas MES nem waits: render usa snapshot já carregado, preserva DOM quando inalterado e limita lista a 25 itens. Tempos fabris e impacto de uma futura conexão não foram medidos; **não afirmar benchmark equivalente**.

agent.py:902–1028 confirma Excel de equipe com 11 sheets: TOP3_FPY, BASE_DADOS, RAW_3028, HIST_PCBA, HIST_MATERIAL, PROCESSO_3022, DASH_REUSO, PCBAS_REUSO, MATERIAIS_REUSO, CORRELACOES, TIPOS_COMPONENTE. A folha PROCESSO_3022 não comprova adaptador real. Integridade XLSX verificada pelo agente; bruto extenso recebe marcador de truncamento da célula, completo no SQLite. O Console não substitui isso por export parcial.
