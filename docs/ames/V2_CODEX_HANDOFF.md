# Handoff de execução ao Codex

## Continuidade após sprint econômico

Falhas `43672774db194031bf6050a5c3a3a73191bc1392` aceito; o usuário autorizou e foram implementados em sequência Rastreabilidade (`05728949f1fe9dd17fe2efc24d919651f8545e09`), Central do Dia (`97d7bb3da044701bfe39528b31f6ff762e021e83`), CORA (`5fe83c2d41a7f3a603906b127eea7cdf231bac46`) e onboarding (`7d5b4b417ea23af73f9870b398db4ddb51bf32e9`). Retomada preservou os quatro commits e ajustes não commitados. Shell final `15.1.13.45`; 46 testes, 130 checks e smoke final desktop/mobile passaram. SHA final/CI no PR #22 e Issue #21; detalhes e limites em `V2_IMPLEMENTACAO_STATUS.md`.

**Parar para revisão consolidada.** Sem transporte/publicação real, Rules, adaptador real 3022, main/merge, pacote/agente ou deploy. A implementação segura usa o store existente e evidencia indisponibilidade: contrato de transporte do agente ausente; backend CORA fora deste checkout, consumo/resposta ainda sem validação real. Próximo passo seguro: revisão + smoke autenticado com snapshots reais/fluxos manuais e contrato do agente antes de conectar transporte. **V2/V0.5.23/3022 NÃO GREEN.** As restrições de parada dos checkpoints abaixo são históricas.

## Histórico após Falhas

O usuário revisou/aprovou Produto/CPH `d3a733a94dbf8cd052a2ae1a4c9e61bdad73a0df` e autorizou **somente Falhas**. O checkpoint do shell `15.1.13.44` incorpora Manual/MES na view existente, sem vínculo persistente ou deduplicação histórica. CPH exato, linha isolada, cobertura parcial e detalhe invalidado por correção de snapshot; mesmo store/Auth e renderer compartilhado com Dashboard. 37 testes, 99 checks e smoke sintético de Falhas + regressões Dashboard/Produto passaram. Ver `V2_IMPLEMENTACAO_STATUS.md`; SHA final e CI no PR #22/Issue #21.

**Parar antes de Rastreabilidade, Central do Dia ou CORA, aguardando nova revisão.** Próximo passo seguro é revisar Falhas e validar com sessão/snapshots reais os registros por linha/CPH e fluxos manuais. Sem main, Rules, pacote, deploy ou ampliação 3022. V2/V0.5.23/3022 continuam NÃO GREEN.

## Histórico após Produto/CPH

O usuário revisou/aprovou o Dashboard `2820bc17858d45b777cf5554c94f1df6d31e4d36` para continuidade e autorizou **somente Produto/CPH**. Esse segundo consumidor está no shell `15.1.13.43`, com CPH exato, linhas separadas, cobertura e registros paginados; ver `V2_IMPLEMENTACAO_STATUS.md`. **Parar antes de Falhas, Rastreabilidade, Central do Dia ou CORA.** Próximo passo: revisão de Produto e smoke autenticado com snapshots reais. SHA e CI do checkpoint publicados no PR #22/Issue #21. Aprovação de desenvolvimento não equivale a GREEN/fábrica.

## Histórico após o primeiro consumidor nativo

O checkpoint Dashboard do shell `15.1.13.42` implementa somente a primeira view sobre `state.ames`; ver `V2_IMPLEMENTACAO_STATUS.md` para alcance e testes. Reconciliado a partir de `b76b8b40eceb15d51d7b9383d8c62944adb734d7`. O usuário determinou **parar aqui para revisão, sem avançar para Produto/CPH**. Próximo passo seguro: revisar o Dashboard e validar leitura autenticada com snapshots reais, sem promover V2/V0.5.23/3022 nem fazer merge na main. O SHA publicado e o CI ficam registrados no PR #22/Issue #21.

O restante deste handoff descreve a missão ampla; a instrução atual de parar após o sprint para revisão consolidada prevalece sobre a sequência ampla. Os limites de checkpoints anteriores abaixo são históricos.

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
