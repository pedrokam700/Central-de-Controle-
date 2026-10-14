# Interface — gate físico RED / bootstrap aprovado

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
