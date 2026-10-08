# Handoff de execução ao Codex

Auditoria entregue antes do código no commit `c352693`; relatório atual: `V2_AUDITORIA_ARQUITETURA.md` (23 achados). Ver `V2_IMPLEMENTACAO_STATUS.md` para o corte seguro já implementado e os limites. Estado de aceite: V2/V0.5.23/3022 NÃO GREEN.

## Missão solicitada pelo usuário

Trabalhe no repositório `pedrokam700/Central-de-Controle-`, exclusivamente na branch `v2/native-fusion`.

Leia a Issue #21, o PR #22, todos os documentos `docs/ames/V2_*` e as conclusões mais recentes da auditoria feita pelo Work.

Sua função agora é executar a arquitetura aprovada.

Prioridade:

1. criar uma camada nativa de acesso aos dados A-MES;
2. remover a dependência arquitetural de iframe/overlay V2;
3. integrar os dados diretamente às views existentes da Central;
4. fazer Dashboard, Produto/CPH, Falhas, Rastreabilidade, Central do Dia e CORA consumirem a mesma fonte estruturada;
5. implementar onboarding inteligente do agente local/pacote;
6. manter funcionamento remoto através dos snapshots sanitizados;
7. preparar o contrato de dados para 3022 sem inventar dados;
8. preservar performance e funcionamento mobile;
9. manter drill-down entre KPI e evidência;
10. executar testes e Quality Gate a cada etapa relevante.

Não faça merge na `main`.

Não reescreva tudo indiscriminadamente. Refatore em etapas verificáveis e mantenha a Central funcional durante a migração.

Se encontrar conflito entre a implementação atual e a arquitetura da Issue #21, registre o conflito no PR e siga a arquitetura canônica.

Atualize o PR #22 com cada checkpoint relevante, SHA, testes executados, riscos restantes e próximo passo seguro.

Não marque a V2 como concluída ou GREEN sem validação real em fábrica.

## Orientação do checkpoint

A fundação de leitura já existe em `ames/data/` e `state.ames`; não criar outro estado/Auth nem retornar à injeção DOM. Completar por etapas. Dados legados são parciais, sem IDs duráveis/revisão/evidência completa. O coletor não está versionado neste checkout; obter contrato/fontes reais antes de presumir endpoints, paginação, semântica de reuso ou 3022. Não ampliar publicação Firebase com as regras genéricas atuais. A confirmação humana da causa é separada do status de ingestão.

A autoridade já definida pelo usuário é a arquitetura canônica da Issue #21. Recomendações de papéis, retenção e detalhes ainda não validados da auditoria não equivalem a aprovação de fábrica nem a permissão para alterar produção sem gates. Manter a baseline documentada V0.5.20.
