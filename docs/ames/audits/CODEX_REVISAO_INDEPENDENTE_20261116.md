# ORDEM DE TRABALHO PARA CODEX / WORK — AUDITORIA INDEPENDENTE (16/11/2026)

> Copiar este conteúdo como tarefa para uma sessão de **Codex com acesso ao repositório**. Primeiro trabalhar SOMENTE LEITURA. Não declarar regressões resolvidas nem instalar software com base em análise estática. A análise deve ser genuinamente independente: tentar refutar os achados do documento da auditoria, não apenas concordar com ele.

## Contexto e segurança obrigatórios
Repositório: `pedrokam700/Central-de-Controle-`.
Branch de referência: `work/ames-3012-reuso-auditado-20261106`, PR #70 DRAFT; estado no início desta tarefa: depois do commit `10f23ddfd6285152264e14f7330d54f719e0d344`.
Baseline oficial `main`: `b283b1764432f5d90486d38a7553b30542a5c118`, intocável. Candidatas físicas anteriores F22E344, F78CE7CB, 60ECEF60, 16980FB5, 7E49CC45, EEDACC65. Não assumir que uma dessas versões está instalada sem evidência.
**Primeiro leia** `docs/ames/ACTIVE_ARCHITECTURE_MAP.md`, `docs/ames/REQUISITO_CANONICO_CONSOLE_MES_9_VIEWS.md`, `docs/ames/handoffs/HANDOFF_CANONICO_3022_R12_20261020.md`, `docs/ames/audits/AUDITORIA_TRANSVERSAL_CENTRAL_20261116.md`, e os handoffs PR69/70. Auditar PRs #35, #36, #42, #47, #55, #59, #64, #67, #69 e #70 com atenção a regressões anteriores e contratos de observabilidade.
**PROIBIDO** modificar `main`, fazer merge de PRs, instalar na fábrica, limpar/mesclar SQLite, credenciais, tokens, Firebase Rules, alterar guardian, rotas persistentes, iniciar 2º agente ou contatar MES de produção. Não gerar ZIP novo neste pedido.

## Objetivo real do operador
Restaurar estabilidade e fidelidade anteriores nas nove telas. Exige **UMA timeline** por PCBA/material (em vez de tabelas 2114/3028 + 3012 + 2114 repetido), com cada visita e período independente; nomes verdadeiros dos técnicos históricos quando comprovados pelos dados 3022; Repair User 3012 separado do operador A6900 da falha; comentários originais visíveis sem mouse; Rastreabilidade, Reuso, Consulta SN e Falhas/FPY mostrando o MESMO fato e a mesma cobertura por linha.
A captura 3022 precisa voltar a ser rápida, tolerar browser CDP sem Home/ExtJS mascarado sem falhar todo job, manter checkpoint/recovery real sem reconsultar tudo. Nenhuma mudança no usuário final sem aprovação de UX.

## Evidência física para reproduzir
Cinco screenshots fornecidos na conversa de 16/11/2026: job de Rastreabilidade falha em ~4s com `Aba principal do A-MES não encontrada no Chrome dedicado` (nenhuma etapa consultada); seleção TAN10101 L1 snapshot 11 r16 versus L2 snapshot 12 r1 e L3 snapshot 13 r1; Falhas/FPY **127/173** horários 3022 comprovados e **46** sem prova (L2/L3 `sem contextos carregados para a linha/revisão`); Dashboard componente com duas PCBAs, quatro `Hist Seq 2114` antigas sem horário, tabela adicional de cinco 3012, anteriores BRM00079/BRM00102/BRM00093 sem nome e último reparo com nome `Jamesson Domingos`; usuário rejeita duplicidade e mudanças no layout sem solicitação.
Bugs físicos anteriores: 98/98 uso indeterminado enquanto havia 85/89 PCBAs com vínculos datados 3074 e snapshots preservados; extensões F78 e navegador frontend antigo; 3022 botão View e Chrome ExtJS `x-mask`; versão 16980FB5 introduziu `trial=True` 650ms que produziu 72 erros para 130 PCBAs; versão EEDACC65 retirou trial e restaurou `view.click(timeout=5000)` mas falta validação física.

## Faça esta investigação completa, nesta ordem, sem conjecturar que um nome apareceu ou a coleta passou
1. Construir gráfico real de dependências/caminho de dados `3028→3074/2114→3022+3012→SQLite→snapshot/revision→API→state.ames→9 views`. Identificar **cada local** onde se resolve `Repair User`, `Tran User`, `A6900`, `operator_name`, `hist_seq`, `defect_time`, `repair_comment` e classificação de reuso.
2. Comparar diffs semânticos entre F22E344, F78CE7CB, 60ECEF60, 16980FB5, EEDACC65. Para cada regressão proposta, localizar commit, função, contrato quebrado, teste ausente. **Provar ou rejeitar** a hipótese de que mudanças de Consulta SN afetaram diretamente a navegação/3022; diferenças temporais não bastam.
3. Investigar proveniência dos nomes antigos: os registros históricos 3022 contendo `Tran User`/ID estão mesmo presentes em payload/SQLite do escopo da tabela? `cached3022Operators` recebe PCBA histórica correta? `normalize3022OperatorRows` cobre formatos raw/adapter e `source_id`? Cuidado: nome histórico não deve ser inventado se só houver BRM. Testar quando nomes estão presentes e ausentes, para múltiplas PCBAs e mesmo usuário.
4. Analisar as rotas CDP/Chrome: `browser.py`, `navigation.py`, `ui_helpers.py`, `tela_3022.py`, `agent_entry.py`, `process_r11.py`, `mes_scheduler.py`; Home faltando, Login, aba OPC, URL certa sem view carregada, máscara ativa, erro antes do lote, falha entre PCBAs, partial/retomada e preservação de raw SQLite. Checar `_has_visible` usando `count()` como suspeita de falso readiness e a busca estática por host.
5. Examinar redundâncias 2114/3012/3028 nas tabelas do reuso e o contraste com a timeline da Consulta SN. Propor projeção **única** com evento e papel explícitos, sem agrupar ocorrências por `PCBA+defect_code` sozinho, sem forçar igualdade entre relógios 3012/3022/2114 e sem colar 3012 em todas as Hist Seq.
6. Verificar escopo `source_id+line+snapshot_id+revision+period` no front, API e SQLite, especialmente os 46 horários sem contexto L2/L3; distinguir falta de captura vs cruzamento insuficiente vs fonte não solicitada.
7. Medir impacto de cada novo retry/timeout/refresh. Healthy path 3022 comparável ao baseline, sem delays fixos por PCBA e sem múltiplos clicks. Observar que 5s é limite, não pausa. Detectar loops de polling/sync e travamento ao trocar abas.
8. Avaliar lacunas reais de CI: suíte de unidade não garante integridade MES real; criar fixtures anonimizadas multi-linha e cenário E2E entre Rastreabilidade, Consulta SN, Dashboard de reuso, alertas, FPY e processo usando o MESMO snapshot e eventos.

## Entregáveis — estritos
**Passo 1 (sem mudar código produtivo):**
- Tabela com gravidade, arquivo/função/linha, impacto, evidência, hipótese/certeza, teste RED proposto, mitigação e dependências.
- Diagrama de fluxo do dado, e lista de acoplamentos indevidos.
- Comparação de baseline `F22E344 vs branch atual` e da deriva de UX.
- Plano em fases pequenas ordenadas por risco, com rollback em cada fase. Se divergência com o relatório existente, indicar explicitamente por que.
- Salvar em `docs/ames/audits/CODEX_PARECER_INDEPENDENTE_<DATA>.md` numa branch própria de trabalho, sem tocar `main`; abrir PR DRAFT contra branch adequada quando possível, sem merge.

**Passo 2 (somente após fechar auditoria e fixtures):**
- Implementar primeiro TESTES DE CONTRATO que falhem nas regressões reais e documentar saída RED; consertar por subsistema, um de cada vez, até GREEN sintético. Não alterar interface para adicionar tabelas ou mudar rótulos sem demonstrar paridade do baseline.
- Exigir por mudança, além de CI geral: testes cruzados das cinco fontes nas quatro telas, teste de ausência de Home CDP, teste de limite/latência 3022, recuperação parcial sem reconsulta, prova de nomes antigos quando operador existia, integridade SQLite/revision.
- Documentar SHA e CI exatos, diff revisado, risco residual e checklist de gate físico. **Não liberar ZIP nem declarar GREEN físico.**

## Decisões técnicas que podem ser contestadas
- Nomes históricos devem surgir quando há MES `Tran User` documentado; não devem ser calculados de um simples BRM.
- Uso físico `7 ciclos` na 3074 não significa que falha ocorreu no sétimo.
- Reparos 3012 independentes podem ficar visíveis na **mesma** timeline sem afirmar vínculo 1:1 com Hist Seq.
- Prioridade: recuperação de Chrome/sessão → prova/cobertura do dado → resolver de técnicos e papéis → timeline única → reuso/FPY → CI E2E + gate físico. Corrigir um nível não deve alterar arbitrariamente outro.
