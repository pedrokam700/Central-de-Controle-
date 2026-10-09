# Console MES — paridade nativa 0.5.24-rc1

Referência funcional V0.5.23; baseline fabril V0.5.20 (3028/3074/2114).
Build Central 15.1.13.48. Mesma state.ames, mesmo Firebase Auth e um agente.
A equivalência operacional e de desempenho ainda exige teste físico. Nenhuma tela antiga foi removida.

| Função da automação isolada | preservada no Console | integrada à Central | pendência |
| --- | --- | --- | --- |
| Escopo, uma/várias/todas as linhas | Sim, linhas explícitas | /runs e /deep-trace | Testar MES físico |
| Uma/várias/todas as falhas suportadas | Sim, códigos/limites no deep trace | Contrato real; 3028 sem filtro inventado | Testar códigos reais |
| Hoje, dia anterior, período customizado e turno | Sim | Formulário nativo /runs | Semântica de turno permanece a original do coletor |
| Consulta SN | Sim, PCBA/Material SN, resultado paginado e JSON completo | /sn-lookup, sem ativar 3022 | Rede/login físico |
| Progresso real e histórico de jobs | Sim | /jobs, contadores por etapa/linha | 3028 conserva progresso original |
| Perfis fast/balanced/safe e waits | Preservados | Perfis reais; pausas 0/0,03/0,12 s | Benchmark fabril |
| Scheduler global e cancelamento | FIFO por seção MES; monitor pula ciclo | 3028/3074/2114/SN/reparos/Chrome | Confirmar indivisibilidade em Chrome real |
| Monitor | Ativar/desativar/status real | Configuração persistente no agente | Persiste após logout; refresh de resultados explícito |
| Configuração persistente | Linhas/perfil/host/porta/URL/Chrome/início do dia | /config, sem senha | Configuração correta de cada posto |
| Catálogo, datasets, tendências e busca local | Sim, paginação visual e JSON completo | Endpoints existentes | Datasets auxiliares legados limitados a 100000; enriquecidos canônicos usam cursor |
| Importação export 3028 / JSON integrado | Sim, upload e execução original | /upload/3028, /runs e /import/integrated | Arquivo até 25 MB, matéria-prima não sincronizada |
| Backup e refresh de reparos | Sim | /backup e /repairs/refresh | Backup permanece local |
| FPY/Check FPY/quantidade/Top 3 | Sim, por linha | Componentes compartilhados | Top 3 da lista parcial; não universo completo |
| Filtros CPH/PCBA/defeito/Repair Status/Defect Type | Exatos; CPH2859 ≠ CPH2859V | Views nativas existentes | Nenhuma linha agregada silenciosamente |
| Origem/snapshot/revisão/coleta/cobertura | Sim | Revisão imutável, cursor, transporte verificado | Fonte legado sempre parcial |
| IDs e proveniência histórica | IDs locais duráveis e todos os contextos possíveis | SQLite/schema v2 | Não são occurrence_id globais fornecidos pelo MES; perdas anteriores não reconstruíveis |
| Drill-down dos contadores | Sim quando registros carregados | Paginação inline; invalida em revisão/logout | Não inventar drill-down de agregado sem registros |
| PCBA reuse separado de material reuse | Sim, grupos originais | Insights por linha/snapshot | Batch Count não é reuso |
| Painel reuso/recorrência e matriz | Sim, dados/indicadores originais e export completo | Mesmo store; visual paginado | Correlação da fonte não confirma causa |
| 3074, Bind/Unbind, 2114 | Sim, registros e contextos | Revisões/cursor/proveniência | Tempos não presentes continuam ausentes |
| Excel original 11 sheets | Sim, download original | /export/excel/download?team=1 | Conferir conteúdo real em fábrica e limite original do Excel |
| Bootstrap 00_INICIAR_AQUI.bat | Preservado no pacote | Orientação discreta no Perfil | Executar no Windows |
| Dependências/Chrome/CDP/rota/agente | Helpers preservados; Chrome/status nativos | /health e /chrome/start | Login A-MES manual |
| Wi-Fi sem guardar senha | Helper original reutiliza perfil existente | Orientação no pacote | Rede física |
| Migration helper e fallback local | Preservados no pacote | Instruções na Central | Migrar a mesma base para preservar source_id |
| Compartilhamento/leitura remota | Pipeline enriquecido por usuário/linha | Firebase Auth existente, fila offline, hash, retry | Outro PC usa a mesma conta; não abre dados a outros usuários |
| Pacote do manifesto | Candidato 0.5.24-rc1 reproduzível; V0.5.23 preservada | Link explícito; download nunca forçado | Validação física para promover baseline |
| CORA estruturada | Linha/CPH/PCBA/material/falha/2114/3074/reuso/revisão/cobertura | Fato/correlação/hipótese/causa separados | Backend IA depende de serviço externo existente |
| ProcessTimeline3022 | Adapter, storage, flag, projeções e Excel preparados | Produto/Falhas/Trace/Console/CORA | READY FOR ADAPTER; coletor real ausente, NÃO GREEN |

Performance: poll 850 ms; refresh parcial só quando mudou e >2200 ms. Revisões sem
alterações reutilizam dados carregados; projeção histórica indexa PCBAs em memória.
SQLite/export/sync não disputam o gate MES. Nenhuma equivalência de benchmark afirmada.

Contrato: `central-ames-v2`. IDs locais identificam observação dentro da base/snapshot;
revision é crescente e imutável. Cursor não cruza linha/dataset/revisão. Uma correção
preserva a identidade disponível e publica nova revisão. Sem relação persistente
Manual↔MES. Fonte parcial é distinta de transporte completo da revisão armazenada.

Pacote: AMES_Central_0.5.24-rc1_CANDIDATO.zip.
SHA-256: f6c320010a503c2702df411355029c5327d2e09334d9f738625c060e40be3679.
Dois builds independentes produziram os mesmos bytes. Banco runtime do ZIP de origem
foi excluído da distribuição; coletores, motor, interface isolada e helpers mantidos.
Instruções de instalação/rollback e checklist físico: [README do agente](../../ames/agent/README.md).

Validações: Quality Gate 165 checks; suítes JS/Python; Rules Emulator e pipeline E2E
cliente→agente real HTTP/scheduler→MES simulado→SQLite→Firebase→segundo cliente;
smokes Dashboard/Produto/Falhas/Dia/CORA/Console/Perfil 360/390/768/1280 e zoom 200%.
Nenhuma validação física nem 3022 real foi executada.
