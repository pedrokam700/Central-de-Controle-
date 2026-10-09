# Console MES — paridade atual após scheduler e transporte nativo

Referência funcional: **V0.5.23**; baseline fabril preservada: **V0.5.20 para 3028 + 3074 + 2114**. V2/V0.5.23/3022 continuam **NÃO GREEN**. A migração visual integral ainda não está concluída: funções auxiliares permanecem na interface isolada, que não foi removida.

Base deste sprint: `0e5ce764497b53c58bfc3bdf6ca06582e15ed6f6`. Scheduler consolidado: `680d04deeea073654a78147483650d141e20e824`. Integração Console↔agente: `ba59b1995eeb471b6f6e96ccafc467aa83147dae`. Branch exclusiva `v2/native-fusion`.

## Checklist

| Função da automação isolada | preservada no Console | integrada à Central | pendência |
| --- | --- | --- | --- |
| Escopo de coleta | Sim: 3028 hoje/dia anterior; 3074/2114 com limites | Endpoints reais /runs e /deep-trace | Período customizado/importação/turno avançado continuam na UI isolada |
| Uma/várias/todas as linhas | Sim, seleção explícita | Mesmo state.ames, leitura isolada por linha | Validar posto real |
| Uma/várias/todas as falhas suportadas | Sim, códigos exatos em /deep-trace; vazio = todas | Formulário nativo, sem filtro fictício na 3028 | Validar códigos reais |
| Progresso real | Etapa/status do job; contadores 3074/2114 da fonte | /jobs/id; sem progresso estimado novo | 3028 conserva progresso original por etapa |
| Perfis de desempenho | fast/balanced/safe | Enviados aos endpoints existentes | Benchmark fabril ainda não executado |
| Waits seguros | Preservados | Sem sleeps no scheduler | Corpo indivisível 3028 mantém normalização/waits originais |
| Exclusão MES global | FIFO por seção MES, reentrância, finally e cancelamento cooperativo | Analysis, deep, SN, monitor, reparos e Chrome/CDP | Testar concorrência com Chrome real |
| Monitor sem backlog | Sim: ocupado/job normal ativo → pula ciclo | Ativar/desativar com intervalo original | Status lido ao conectar/comandar; resultados por atualização explícita; monitor persiste após logout |
| Persistência de configuração | Linhas e perfil no config do agente | /config, sem senha | Limites/códigos são por execução; demais configurações no pacote |
| Estado real do agente | Health e marcador do scheduler; motor/CDP/rede | Conexão explícita; original sem patch rejeitado | Readiness é a leitura da conexão, não monitoramento contínuo |
| FPY/Check FPY/quantidade/Top 3 | Agregados da linha e Top 3 da lista parcial | Renderizador compartilhado | Sem completude/denominador inventado |
| CPH/PCBA/defeito/Repair Status/Defect Type | Filtros exatos; CPH2859 ≠ CPH2859V | Mesmos seletores de Dashboard/Produto/Falhas | Não inferir CPH de PCBA histórica |
| Origem/snapshot/coleta/cobertura | Sim | Snapshot fixado antes/depois de ler datasets | API sem revisão/cursor; correção no mesmo ID não é transação atômica |
| Drill-down dos contadores | Ocorrências e indicadores com drilldowns reais | Paginação inline 25 registros | Sem drilldown fictício para agregados sem registros |
| PCBA reuse separado de material reuse | Sim, grupos originais separados | Dados reais /insights, sem cálculo por Batch Count | Evidência parcial; não comprova causa |
| Painel de reuso/recorrência | Indicadores e linhas de evidência originais quando ready | /insights por linha/snapshot | Rótulos de recorrência são da fonte; validar dados/semântica em fábrica |
| Matriz de componentes | Registros originais paginados quando disponíveis | Mesmo store | Validar equivalência visual e material real |
| 3074 / Material SN / bind-unbind | Registros reais disponíveis | /base material_reuse | Limite 100000; cobertura parcial; sem contexto histórico inventado |
| 2114 / histórico PCBA | Registros/contextos reais disponíveis | /base pcba_history e history_contexts | Linha histórica derivada pelo agente; não tratada como proveniência completa |
| Excel original 11 sheets | Download original, sem reconstruir no navegador | /export/excel/download?team=1 | Export real validado sinteticamente; conferir conteúdo fabril e datasets acima do limite do export |
| Consulta SN | Preservada no agente com gate | Ainda na interface isolada | Sem UI nativa nova; não ativar 3022 por presunção |
| Bootstrap 00_INICIAR_AQUI.bat | Preservado byte a byte no candidato | Orientação discreta no Perfil | Executar no posto real |
| Dependências / Chrome / CDP / rota / agente | Preservados no pacote | Readiness e orientação | Instalação física, CORS/origem exata e permissão de rede local do navegador |
| Perfil Wi-Fi sem senha | Preservado no bootstrap | Central não guarda credenciais | Validar reutilização do perfil real |
| Migration helper | Preservado byte a byte | Instruções com backup | Migração real não executada; UI nativa não substitui helper |
| Contratos/views auxiliares, catálogo, tendências, importação, backup, repair refresh | Preservados no agente/UI antiga; reparos com gate | Parcial: leitura dos datasets relevantes | Ainda não têm todos os controles nativos equivalentes |
| Compartilhamento/leitura coletada | Leitura local + snapshots remotos existentes | Mesmo store/Auth/listener | Sem novo publicador de históricos enriquecidos |
| Fábrica/local e remoto sincronizado | Transporte local real + remoto existente | Leitura local conectada, remoto/cache no store | E2E fábrica → Firebase → remoto pendente |
| Fallback local | Interface original preservada | Localização no onboarding | Não foi instalado/iniciado outro agente |
| Pacote V0.5.23 do manifesto | Original/hash/link mantidos | Instalação acessível, sem download forçado | Original não contém patch; candidato separado disponível para teste |
| Mobile/teclado/foco/cache | Sim | Smoke 360/390/768/1280 + zoom CSS 200%; SW .47 | Dispositivo real/Auth/cache integral ainda pendentes |
| Performance | Poll 850 ms sem sobreposição; refresh somente mudança >2200 ms ou fim/ação explícita | /team-dashboard evita recalcular /insights só para conferir IDs; uma leitura de insights por linha/refresh | Sem equivalência de benchmark afirmada |
| 3022 | Nenhum adaptador novo | Dimensão indisponível; regra <= Defect Time preservada | NÃO GREEN; sheet original não comprova coleta real |

## Validação executada

- **12 testes Python**: FIFO/exclusão/reentrância; sucesso/erro/cancelamento; liberação ao cancelar connect; monitor 1000 tentativas sem fila e entre consultas; processamento/SQLite/HTTP paralelos; orquestração real deep com browser/views simulados e pausas 0/0,03/0,12; exportador original gerando as 11 sheets enquanto MES ocupado; hashes 3028.
- **64 testes JavaScript** no Quality Gate: 56 regressões + 8 contratos/transportes. Incluem payloads reais, agente antigo bloqueado, linhas/CPH exatos, snapshot corrigido/substituído, logout/resposta tardia, monitor, configuração e Excel sem reconstrução.
- **Quality Gate final: PASS, 158 checks**, build `15.1.13.47`. Um aviso preexistente de locale hardcoded.
- Smoke Edge headless: Console/Dia/CORA/onboarding, Dashboard, Produto e Falhas; 360/390/768/1280 e zoom CSS 200%; controles, progresso, matriz, download, foco, correção e logout. Respostas do agente no navegador são sintéticas; teste Python usa Handler/Store/Excel reais com MES simulado. Não é login/CRUD real ou benchmark fabril.
- Busca direcionada no agente/bridge: 3028, Chrome/start, refresh_2114, run_full_v016, run_deep_v016_records e run_individual_lookup estão cobertos. Subprocesso restante gera Excel sem MES. Importação full usa flows originais no processo para não escapar do gate; seed checkpoint V010 preservado.

## Pacote e integridade

Original V0.5.23: `1c0e7a37af4fb4b0b08b377d7c17c6895be5891e27c2ba9d37a9cc8cb6708167`.
Candidato local `AMES_V0523_FIFO_CONSOLE_CANDIDATO.zip`: SHA-256 `bad73651a14decdd1cefb84c32ecc20e8239fc5aa478dca745d7be518b023fa7`.
Builder `scripts/build-agent-candidate.py` recusa sobrescrita, verifica original e todos os membros preservados. Somente agent.py/engine_bridge.py substituídos; mes_scheduler.py e PATCH_FIFO.md acrescentados. Nenhuma instalação existente/config/SQLite foi alterada. Não publicado no manifesto nem promovido.

Hashes 3028 confirmados:
- ames_3028.py: `829da91ba7b685f4594bae2aad737f1eea64d7b1eaa8073e8bb263748fbe1ca1`
- ames_3028_live.py: `b512d42ad39fad326252264ce57f98f3731db5161ab8625cf5b244dffffad0e2`

## Próximo passo seguro

Instalar o patch em posto de teste com backup e um único agente; permitir a origem exata da Central no config local; testar 3028/deep/SN/monitor concorrentes, cancelamento, 3074/2114 e Excel; comparar tempo com V0.5.20/V0.5.23 nos três perfis. Validar Wi-Fi/CDP/rota/login e leitura sincronizada autenticada. Somente depois avaliar equivalência fabril.

Pendências de engenharia independentes de fábrica: revisão/cursor/IDs duráveis e proveniência histórica no contrato, controles auxiliares ainda não nativos, publicação de históricos enriquecidos e equivalência integral da UI. Não retirar a interface isolada antes de fechar essas lacunas. Sem main, Rules, produção ou Vercel.
