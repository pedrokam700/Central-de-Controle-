# Interface — gate físico RED / bootstrap aprovado

## Checkpoint de encerramento da correção — 2026-10-14

**Bootstrap cc1f61c: aprovado fisicamente pelo usuário e preservado byte a byte. Interface: correção automatizada GREEN; validação física nova PENDING (último teste físico da interface continua RED até reteste).**

Código corrigido e revalidado no GitHub: `7877b18ec10edb6f94bc85285ab7fc2d5720130d`. Este checkpoint modifica somente documentação. Commits de implementação: `23fc75372e14c5be267fd95496b782e31a6d6060` (seleção/limites/labels e job observável) e `7877b18ec10edb6f94bc85285ab7fc2d5720130d` (navegação completa e teste).

### Comprovado

- Causa do clique silencioso: FormData recebia section, lançando exceção antes do try e antes de qualquer POST. Corrigido para form real e erro visível. Job antigo não encobre erro novo.
- Falhas agrupadas pelo código, descrição humana e contagem somada nas linhas escolhidas; código permanece valor interno. Todas/Selecionadas preservadas, seleção vazia não dispara coleta abrangente.
- Limites técnicos recolhidos em `Limites avançados`; padrão vazio apresentado como `Sem limite`, convertido em 0 internamente. Entrada manual de códigos recolhida.
- Início imediato, criação de job novo identificável, polling, etapas/linha e resumo dos campos realmente devolvidos. Materiais/históricos são identificados como valores no snapshot, não como incremento inventado.
- Descrição ausente ou sentinel `Undefined error` recebe `Descrição não informada` nos labels; código continua identificado. Dados brutos/contratos não alterados.
- Voltar à Central carrega offline-bootstrap e app.js completos, com sidebar/topbar, navegação nativa e acesso explícito de volta ao Console local. Home placeholder removida. Auth/cache da Central permanecem os existentes; primeiro acesso de conta exige conexão. Console local continua independente desses serviços.
- Nenhuma mudança em bootstrap Windows, agentes/coletores 3028/3074/2114/3022/3012, factory-engine ou dados operacionais. Verificado com `git diff cc1f61c -- tools/ames-workstation/START_AGENT_CANONICAL.ps1 ames/agent ames/factory-engine` vazio.

### Evidência dos gates no SHA 7877b18

| Gate | Resultado | Evidência |
| --- | --- | --- |
| Contratos locais Node | 225/225 PASS | `node --test --test-isolation=none scripts/ames-*.test.mjs` |
| Full Quality | GREEN | [Run 38570976144](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/38570976144): estático, Firestore e experiência browser |
| Candidate Gate | GREEN | [Run 38570975763](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/38570975763): contratos, CLEAN e Windows |
| Windows | GREEN | Job `115875884990`, instalação real/restart/disputa de porta do bootstrap preservado |
| Browser real de interação | PASS | Job `115875765919`: seleção/contagem; POST /deep-trace com token; job novo; polling 3074/2114/3022; resultado; erro novo nas duas views com job anterior |
| Navegação real / 1920x1080 | PASS | Mesmo job: entrada local → Central completa/Auth/app.js → Início/Tarefas/Início → Console local |
| Físico da interface | PENDING | Usuário deve retestar; não promover a GREEN por resultado automatizado |

Capturas [artifact 11897167738](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/38570976144/artifacts/11897167738), retenção 7 dias: `central-complete-1920x1080.png`, `console-local-return-1920x1080.png`, `trace-job-result-1920.png`, mais evidências das 9 views/PT/EN/temas/mobile. Capturas da Central completa e do retorno foram inspecionadas: sidebar/topbar e largura corretas, sem overflow horizontal. O teste de trace isolado comprova comportamento; seu screenshot não é uma avaliação do layout do Console completo. Firebase e serviço MES dos testes browser são sintéticos; não são prova de coleta física.

### Arquivos alterados nesta etapa

```text
.github/workflows/ames-integrated-quality.yml
ames/advanced-table.mjs
ames/agent-client.mjs
ames/automation-view.mjs
ames/collection-status.mjs
ames/console-i18n-extra.mjs
ames/console-legacy-parity.mjs
ames/console-shift-summary.mjs
ames/console-specialized-views.mjs
ames/console-trace-scope.mjs
ames/daily-failure-analytics.mjs
ames/daily-failure-summary.mjs
ames/defect-label.mjs
ames/evidence-view.mjs
core/local-entry.mjs
core/local-workstation.mjs
docs/ames/integrated-v5-interface-physical-red-handoff.md
scripts/ames-local-navigation.browser.mjs
scripts/ames-trace-interaction.browser.mjs
scripts/ames-trace-scope.test.mjs
scripts/build-integrated-candidate.py
sw.js
```

### Próximo passo seguro

Confirmar os dois gates também no commit documental deste checkpoint antes de gerar o ZIP CLEAN exato desse HEAD. O builder exige checkout limpo, grava SHA no manifest e verifica hashes/ausência de dados operacionais. Entregar o pacote somente após GREEN; então **parar e aguardar o teste físico do usuário** dos cinco pontos. Não retomar PR #23 ou funcionalidades laterais. Não alterar o bootstrap já aprovado. Se houver nova falha, revalidar remoto e analisar a evidência física antes de implementar.

Os registros abaixo são históricos e não substituem este estado mais recente.

---

## Checkpoint antes da implementação — 2026-10-14

GitHub revalidado: branch `work/ames-integrated-clean-v5-improvements-20261013`, HEAD `ea7668587e4b575d1c759ab54c852dbe0fb901e7`. Checkout limpo e reconciliado.

O usuário confirmou em 14/10/2026 que o bootstrap `cc1f61c7855abb1e1cff1eb4f4d2e240ce42fa71` **passou fisicamente na fábrica**. Essa confirmação encerra a pendência física do bootstrap registrada no handoff anterior; não valida a interface. **Bootstrap congelado: não alterar.** Full Quality e Candidate Gate desse SHA já estavam GREEN.

O novo gate físico da interface está **RED**, conforme relato do usuário. Escopo exclusivo autorizado:

1. Rastreabilidade: selecionar falhas pelos snapshots carregados, com código + descrição + contagem agregada nas linhas selecionadas. Valor interno continua código. Todas/selecionadas; códigos manuais só em opção avançada.
2. Limites técnicos de ocorrências/PCBAs por linha em seção recolhida `Limites avançados`. Padrão sem limite (0 interno), sem exigir que o operador interprete zero.
3. Rastrear 3074/2114/3022: provar botão → collect('deep') → /deep-trace → job → polling. Mostrar início imediato, erro novo mesmo com job anterior, substituição do job, etapas/linha e resumo real. Teste de interação e polling, não só markup.
4. Voltar à Central: Central completa, preservando Console MES offline/local e retorno explícito ao Console. Validar viewport desktop 1920x1080.
5. Falta de descrição: código + `Descrição não informada`, nunca `Undefined error` como label.

Inspeção inicial confirma que `ames/console-trace-scope.mjs` lista somente códigos e que `core/local-workstation.mjs` esconde sidebar/topbar e substitui a volta por uma home mínima. O defeito de erro escondido em `automation-view.mjs` foi relatado pelo usuário; investigação do fluxo completo é o próximo passo.

Este checkpoint altera somente este documento. Nenhuma implementação iniciada. Não alterar coletores 3028/3074/2114/3022/3012 nem contratos sem necessidade comprovada. Não retomar PR #23 nem tarefas antigas.

Próxima ação exata: mapear rastreabilidade e entrada da Central completa, registrar as causas comprovadas e implementar somente este escopo com testes de clique/job/polling e navegação desktop. Salvar commits pequenos e revalidar remoto antes de cada bloco. Após correção: Full Quality + Candidate Gate; ZIP final somente após ambos GREEN. Depois parar para novo teste físico da interface.

## Investigação concluída antes da correção

Checkpoint inicial publicado: `932d6efac4b657962de270422e9ae31561c81fbd`. Confirmado no código:

- `createTraceConsoleView` cria `section[data-trace-form]`, mas o handler chama `new FormData(form)` antes do try. O navegador lança TypeError porque o elemento não é HTMLFormElement; o fluxo para antes de `client.collect('deep')`.
- Tanto Rastreabilidade quanto Monitoramento priorizam job antigo na renderização. O client já publica erros, mas o status não os mostra consistentemente.
- O polling descarta `result` de jobs deep_trace (mantém apenas sn_lookup), embora o backend já forneça resultado por linha, escopo e etapas. Basta preservar esses campos no client; nenhum contrato/backend precisa mudar.
- O retorno local chama o botão home escondido, cujo handler mostra uma home mínima e mantém a classe que oculta a navegação completa. A entrada completa já existe em `?online=1` e carrega a Central real com Auth/cache existentes. A correção usará essa entrada, com volta explícita ao Console local; não criará outra Central.

Próximo passo seguro: corrigir formulário/estado de submissão/renderização e seleção humana; testes reais do clique e polling. Depois corrigir navegação com teste da entrada real no viewport 1920x1080. Bootstrap e coletores continuam congelados.

## Correção parcial persistida — rastreabilidade e labels

Base reconciliada `ff8ba54fb7754049b080d3af695ae9de3c637524`. Formulário real, captura de erro abrangendo a coleta, submissão imediata e feedback compartilhado entre Rastreabilidade/Monitoramento. Client mantém resultado e escopo já retornados pelo job deep_trace. UI mostra etapas/linha e resumo dos campos efetivamente retornados (materiais/históricos no snapshot, eventos/contextos 3022), sem declarar contagens cumulativas como novas coletas.

Seleção usa código+descrição+contagem agregada; limites/manuais recolhidos, vazio convertido em 0 no pedido. Labels de falhas tratam descrição ausente/Undefined error somente na apresentação, preservando dados brutos. Novos módulos incluídos no cache offline.

Teste novo `scripts/ames-trace-interaction.browser.mjs` executa clique real → POST /deep-trace autenticado → job novo → polling → etapas → resultado, além de erro com job anterior nas duas views. Adicionado ao Full Quality. Contratos de seleção locais passaram; browser local não iniciou (Chromium disponível encerrou SIGSEGV antes de abrir página), portanto a prova browser depende do Actions deste checkpoint e não foi contada como PASS.

Pendente: navegação Central completa/retorno Console + prova 1920x1080, resultados dos gates e ZIP final. Bootstrap/coletores não alterados. Próxima ação: verificar CI deste checkpoint, corrigir somente falhas observadas e completar navegação autorizada.

Validação local adicional deste checkpoint: `node --test --test-isolation=none scripts/ames-*.test.mjs` — 225/225 PASS.

## Navegação corrigida / primeira execução CI

SHA parcial `23fc75372e14c5be267fd95496b782e31a6d6060`: Candidate Gate run `38570507980` GREEN, inclusive Windows. Full Quality run `38570507950`: estático e Firestore GREEN; experiência 9 views/PT/EN/temas/mobile GREEN. O novo browser provou seleção, clique/POST, job novo, polling 3074→2114→3022, resumo e erro HTTP no Monitoramento; falhou só no último caso, porque a fixture tentou repetir uma submissão falha com escopo diferente, corretamente bloqueado pelo request_id existente. Ajustado o teste para repetir o mesmo escopo nas duas views, sem remover essa proteção de idempotência.

Retorno local agora navega à entrada completa `?online=1`, carregando offline-bootstrap/app.js existentes. Removida a home placeholder; grid local corrigido para uma coluna enquanto a sidebar está oculta. A Central completa mantém Auth/cache originais (primeiro acesso da conta ainda exige conexão), com links explícitos ao Console MES local na navegação e na tela de login. Nenhuma alteração em app.js/Auth ou bootstrap Windows.

Adicionado teste browser da entrada real, app.js real e layout 1920x1080, com Firebase exclusivamente sintético no transporte de teste. Valida navegação Início→Tarefas→Início e retorno Console offline. 225/225 contratos locais continuam PASS. Próximo passo exato: executar ambos os gates neste commit, examinar logs/screenshots e corrigir apenas regressões comprovadas. Gate físico da interface continua RED aguardando candidato automatizadamente GREEN.
