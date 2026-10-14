# Bootstrap: disputa de porta entre instalações CLEAN

## Checkpoint 1 — reprodução antes da correção (2026-10-14)

Base remota confirmada: `b95f76fb690f3545b43b20e35566ae0867037c2e`, branch `work/ames-integrated-clean-v5-improvements-20261013`.

Evidência física informada pelo usuário: launcher encerra legado em 8765, inicia candidato e recebe build `CLEAN-V4-3012` durante validação. String ausente do pacote 2bbc verificado pelo usuário. Não há evidência de GREEN físico para esta correção.

Inspeção comprovada no código da base:

- A limpeza prévia de processos sem listener limita-se à mesma pasta.
- `agent_bootstrap.pyw` existe no CLEAN V5 fornecido e importa `agent_clean_entry`; não é reconhecido pelo filtro antigo de listener.
- `/ready.pid` não é comparado com o PID criado. A resposta pode vir de outro processo.
- Não há mutex de startup, estabilidade de propriedade da porta ou retry controlado de reocupação.
- Falhas anteriores ao bloco `try` principal não preservam `agent_startup_state.json`.

Escopo desta tarefa: launcher, testes Windows/gate e documentação de evidência. Nenhuma alteração em coletores, frontend, dados ou CLEAN V3/V4 em disco.

Arquivos deste checkpoint: fixture de legado sintético, barreira de teste Python, teste Windows e Candidate Gate com upload `always()` dos logs. A fixture inicia um legado e um agente conhecido sem listener; após o candidato ser criado, outro legado reocupa 8765. Exige PID exato, package_root exato, H1 com token atual, encerramento dos conhecidos, recusa de desconhecidos e arquivos antigos intactos.

Teste Windows pendente no Actions deste commit; esperado vermelho antes da correção. A barreira `sitecustomize` existe somente em `scripts/fixtures` e não entra no ZIP. O Windows venv pode usar processo redirecionador: a correção deve medir/provar o PID real criado, sem aceitar um PID apenas por ter respondido HTTP.

Próxima ação exata: inspecionar o resultado/log do job Windows, registrar reprodução e implementar arbitragem por identidade forte + mutex + PID/porta/root/token/H1 + retries limitados. Depois executar Full Quality e Candidate Gate no SHA corrigido, gerar ZIP final apenas quando ambos passarem. Gate físico continua PENDING.

### Correção da fixture de reprodução

Checkpoint remoto inicial `b2bcbf24579f9898f0c69da58092abfeb5400aee`; Candidate run `38562506084`. Instalação e smoke/restart Windows passaram. O teste de disputa parou antes de criar o legado porque PowerShell rejeita um argumento vazio em `Start-Process -ArgumentList`. Isso NÃO comprova reprodução. Corrigida somente a montagem dos argumentos da fixture; executar novamente o Candidate Gate. Implementação do bootstrap ainda não publicada neste checkpoint.

### Reprodução Windows confirmada

SHA testado: `8fb07d777acb2e0522994eb6a26782ca47ee1ad5`. Candidate [38563132437](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/38563132437), Windows job `115849092616`, artifact `11893512668`. O artefato preservado contém:

- `race-gate/result.json`: legado inicial PID 5144, reocupação por PID 9592 depois da criação canônica.
- `agent_startup_state.json`: status `failed`, PID iniciado 1272, mensagem **Build inesperado apos startup: CLEAN-V4-3012**.
- stdout confirma encerramento do legado 5144 e limpeza do processo novo 1272.

Isso reproduz a causa reportada na fábrica. Full Quality do mesmo SHA passou (run `38563132129`). A leitura de ExitCode da fixture ficou nula no Windows PowerShell; este checkpoint retém explicitamente o handle para preservar esse diagnóstico. O resultado da reprodução independe desse código de saída: estado e stderr comprovam o build errado.

Arquivos alterados neste checkpoint: teste Windows e este handoff. Próximo passo: publicar correção isolada do launcher, executar os dois gates e analisar evidências do retry e PID real. Gate físico PENDING; ZIP final ainda não liberado.

## Checkpoint 2 — correção estrutural

Pai remoto reconciliado: `ade7373345348246bbcb4c1cbdaaae7014ffae3c` (reprodução e evidência). Este commit altera somente o launcher canônico, seu contrato de teste, asserções da fixture Windows e este handoff.

Implementado: mutex global de startup; inventário de processos com argv exato, caminho e dois hashes congelados do pacote A-MES; limpeza também de conhecidos sem listener e wrappers antigos conhecidos; serviço desconhecido bloqueia sem ser morto. Antes de encerrar, revalida nascimento/PID/entrypoint e usa handle verificado. Nenhum arquivo de CLEAN antigo é alterado.

PID iniciado é o intérprete real, evitando o redirecionador do venv Windows: usa o mecanismo `sys._base_executable` + `__PYVENV_LAUNCHER__` do CPython multiprocessing. Exige listener e `/ready.pid` iguais a esse PID, package_root exato e H1 autenticado com token da pasta atual, com estabilidade e nova checagem de posse. Reuso só de PID previamente registrado pelo launcher com mesmo nascimento/entrypoint. Até 3 tentativas (máximo configurável 5); reocupação registra PID/caminho e passa pela mesma limpeza controlada. Estado atual atômico, histórico por invocação, estado anterior e stdout/stderr por tentativa preservados. Tokens nunca são registrados.

Validação local: `node --test scripts/ames-workstation-bootstrap.test.mjs`, 11/11 PASS. Reprodução Windows anterior está comprovada acima; os gates Windows/Full Quality desta implementação ainda PENDING até o Actions deste commit. Próxima ação exata: inspecionar ambos os runs e baixar os logs/state da disputa; corrigir somente falhas observadas, registrar cada resultado e repetir gates. Não gerar ZIP final até ambos PASS; físico continua PENDING.
