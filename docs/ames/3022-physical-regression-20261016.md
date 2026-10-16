# AWIP3022 — correção da regressão física, 2026-10-16

Base remota: `d52ef38040895096aca6ee90056a3a2dfb73d4a3`, PR #27 draft.
Factory desse SHA: **RED**, conforme teste do operador. Factory do novo candidato:
**PENDING**. Tempos de 18–20 s relatados são observações, não diagnóstico da causa.

## Referência e primeiro bloqueio

O operador forneceu os ZIPs CLEAN V3 e V4/3012 LOCAL como referências históricas.
Ambos contêm a mesma `AMES_Automacao_V0_16_PADRAO_VALIDADO/ames/tela_3022.py`:
SHA256 `90c3a12e36a91d7e362071df4b182e9d4c9cefccca96d9fd27f918b378bdcdcf`,
correspondente à implementação versionada em `63ec4115`.

- ZIP V3: SHA256 `5b97ba5af6397d971f201372537891ce1c746994270a8fb242f0aa7778b3e691`.
- ZIP V4: SHA256 `b9fe2a5e6137f21466d917f57d6d130513ccd21a6f05b8b834e20b3729252aad`.

A indicação funcional vem do operador. Os documentos incluídos registram testes
com amostras reais, mas não fornecem um log independente completo de execução
SN → persistência. Não usar essa limitação para declarar o novo candidato físico GREEN.

Primeira regressão de aceitação: `ac90828766b115e31c55cbe1599f842ab6bf62d1`.
O diff com `0483dad988f5d2db1da68f02ca41da7f01501861` mostra a substituição de
`if rows: parse/return` por confirmação obrigatória de identidade nas rows ou em
cabeçalho readonly. A grade física sem PCBA/SN não satisfaz essa condição;
o laço segue até o limite e o adaptador não recebe as rows. O teste físico
registrado após ac908 confirmou exatamente a ausência de identidade exigida.

`68f53529` adicionou contexto do input; `09e21989` adicionou quatro eventos de
store e caminhos alternativos de confirmação. `d52ef380` só mudou testes: seu
coletor é idêntico ao de `09e21989`. Nenhum desses commits mudou o ranqueamento
histórico do extrator, que considera todas as grades e desempata por quantidade.
A nova exigência de visibilidade ocorre **depois** de escolher a grade: uma
oculta com mais linhas vence repetidamente, enquanto a resposta visível é ignorada.

Reprodução executando o JavaScript real do coletor d52 (sem mock do extrator):
grade oculta com 5 rows + grade visível com nova resposta de 2 rows aos 240 ms →
`grid_visible=False`, `refresh=False`, 6 polls e UNCONFIRMED aos 720 ms no limite
de teste de 700 ms. Sem a grade oculta, o mesmo código aceita. Após a correção,
aceita as 2 rows aos 240 ms e remove os listeners. Isso comprova o defeito de
seleção; sem dump Ext da fábrica, não afirma qual grade específica venceu no
teste físico d52 do operador.

## Caminho causal e contrato restaurado

| Etapas | Histórico / regressão | Candidato |
| --- | --- | --- |
| 1 página | Localizar/reutilizar AWIP3022 | Inalterado |
| 2–4 campo/escrita | Campo visível corrigido em 305f086f; preencher e conferir | Preservado; tempos de localizar/preencher/conferir separados |
| 5 View | Botão visível no frame da consulta | Preservado; usar esse frame para a grade |
| 6 grid/store | Todas as grades, maior contagem no empate; rejeição tardia da oculta | Filtrar visibilidade antes do ranking; vincular frame/grid da consulta |
| 7–8 resposta/loading | Identidade obrigatória, depois múltiplos caminhos de refresh | Um ciclo de dataset (`load` ou `datachanged` de `loadData`); não ler durante loading; falha explícita de load é terminal |
| 9–10 extração/validade | Rows reais podiam existir sem serem aceitas | Rows, loading e evento capturados no mesmo turno JS; SN nas rows é opcional |
| 11 stale | Assinatura, identidade, loading e watchers concorrentes | Sem evento novo na store vinculada, não aceitar; identidade contraditória continua fail-closed |
| 12 vazio | Histórico estabilizava por empty_confirm_s; 09e encurtou para .35 s | Restaurar janela integral configurada; vazio sem evento novo não prova zero |
| 13 tempos | Timeout/poll não identificam causa | Manter 18 s / 3 s e polling .12 s do HEAD; nenhuma otimização por palpite |
| 14 retorno | Rows/focus/passages/headers/no_data | Mesma forma e derivações; diagnóstico CONFIRMED/CONFIRMED_EMPTY |
| 15 adaptador | Mesmo Tela3022, lease MES, lote antes da fase local | Preservado |
| 16 transformação | Regras de processo, END LOT, A5700 e correlação temporal | Inalteradas |
| 17 persistência | Mesmo SQLite: raw, eventos, contextos e timeline | Inalterada; adicionar local_ms de processamento/persistência |
| 18 validação posterior | process_r11 rejeita retorno sem confirmação | Preservada; teste atravessa coletor → adaptador → SQLite real |

A assinatura é apenas telemetria. O novo fluxo não exige mudança de conteúdo
ou contagem; reconsulta idêntica com evento de dataset é válida. Não há bypass
por SN presente em rows antigas, nem fallback para tabela/grade não vinculada.
Os listeners pertencem a uma consulta e são removidos em sucesso/erro/timeout.

## Verificação e limites

`scripts/agent-3022-observability.test.py` executa os scripts reais de `evaluate`
num fixture Node/Ext com visibilidade, colunas, store/load e Ajax/loadData. A
fronteira de browser é simulada; isto **não é teste físico nem um runtime ExtJS
completo**. Os antigos mocks de `_grid_visible`, extrator e refresh foram removidos.

Cobertura: A → B sem SN nas rows; grade oculta maior; mesma contagem e conteúdo
idêntico; stale sem nova resposta; loading; load malsucedido; identidade
contraditória/mista; vazio confirmado; cleanup; coletor canônico + adaptador +
SQLite com raw/eventos/contextos/timeline das duas PCBAs. Seleção padrão dos
outros coletores permanece igual: novos filtros do helper são opt-in da 3022.

Não alterados: bootstrap/8765, 3028/3074/2114/3012, updater, dependências, UX,
Firebase, views, semântica de processo/reparo, arquitetura, main ou estado draft.

Próximo gate físico: usar o CLEAN do SHA exato com ambos os workflows GREEN;
consultar várias PCBAs em sequência (inclusive duas com contagens iguais e uma
reconsulta), confirmar View, rows novas, eventos/contextos na Central e ausência
de associação da grade anterior. Comparar `first_rows_observed`, `grid_ready`,
`response_confirmed`, `parse_completed`, `total_ms`, `query_ms` e `local_ms`.
`response_started_observed` é o primeiro sinal observado de loading/dataset,
não a hora exata do request de rede. Se houver RED, preservar query_diagnostics
e identificação/visibilidade das grades; não reduzir timeout como correção.
