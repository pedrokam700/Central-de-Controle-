# Bootstrap: disputa de porta entre instalações CLEAN

## Checkpoint final — aguardando teste físico (2026-10-14)

**Estado autoritativo desta etapa: implementação concluída e gates automatizados GREEN no SHA `cc1f61c7855abb1e1cff1eb4f4d2e240ce42fa71`; gate físico PENDING.**

Branch: `work/ames-integrated-clean-v5-improvements-20261013`. HEAD remoto e checkout reconciliados no SHA acima antes deste checkpoint. O commit que contém este registro altera somente este documento; o CLEAN a testar continua sendo o **cc1f61c**, sem nova implementação ou novo pacote nesta etapa.

### Causa e reprodução comprovadas

No PC da fábrica, após encerrar um legado e iniciar o candidato, outro agente de instalação antiga voltou a responder em 8765 como `CLEAN-V4-3012`. O pacote 2bbc não continha essa string, conforme verificação informada pelo usuário. O bootstrap anterior não vinculava `/ready.pid` ao processo criado, limpava resíduos sem listener apenas da mesma pasta e não recuperava a reocupação com retry controlado.

A mesma sequência foi reproduzida em Windows no SHA `8fb07d777acb2e0522994eb6a26782ca47ee1ad5`, [Candidate run 38563132437](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/38563132437), job `115849092616`, artifact `11893512668`: legado inicial PID 5144 encerrado, processo novo PID 1272 iniciado, legado PID 9592 reocupando a porta; `agent_startup_state.json` terminou `failed` com **Build inesperado apos startup: CLEAN-V4-3012**. Essa reprodução é sintética e não substitui o teste físico.

### Correção e arquivos alterados

SHA da correção: `cc1f61c7855abb1e1cff1eb4f4d2e240ce42fa71`.

Arquivos alterados em toda esta etapa, em relação ao HEAD inicial `b95f76fb690f3545b43b20e35566ae0867037c2e`:

- `tools/ames-workstation/START_AGENT_CANONICAL.ps1`: arbitragem dos processos conhecidos, mutex global, PID real iniciado, validação de posse da porta/PID/root/token/H1, retry limitado e evidência persistente.
- `.github/workflows/ames-integrated-gate.yml`: execução Windows da disputa e preservação dos logs mesmo em falha.
- `scripts/ames-bootstrap-race.windows.ps1`: reprodução da reocupação, prova do retry/PID exato, recusa de desconhecido e verificação de arquivos antigos intactos.
- `scripts/fixtures/bootstrap-race/legacy_agent.py`: legado sintético `CLEAN-V4-3012`.
- `scripts/fixtures/bootstrap-race/sitecustomize.py`: barreira determinística exclusiva do teste; não distribuída no CLEAN.
- `scripts/ames-workstation-bootstrap.test.mjs`: contratos do bootstrap atualizado.
- `docs/ames/integrated-v5-bootstrap-race-handoff.md`: checkpoints, evidências e continuidade.

Não houve alteração em agentes/coletores 3028, 3074, 2114, 3022, 3012, factory-engine, frontend ou dados operacionais. A limpeza termina somente processos reconhecidos por identidade/caminho e hashes do pacote; não modifica as instalações antigas CLEAN V3/V4.

### Gates revalidados no GitHub

| Gate no SHA cc1f61c | Resultado | Evidência |
| --- | --- | --- |
| Full Quality | GREEN / completed success | [Run 38563887343](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/38563887343): full-static-quality, firestore-emulator e console-experience passaram |
| Candidate Gate | GREEN / completed success | [Run 38563887396](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/38563887396): integrated-contract e windows-clean-artifact passaram |
| Windows instalado a partir do ZIP exato | GREEN | [Job 115851629348](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/38563887396/job/115851629348): instalação real, smoke/restart/idempotência e disputa passaram |
| Fábrica / gate físico | **PENDING** | Depende do resultado do usuário no PC da fábrica |

O passo Windows **Legacy agent reoccupation and unknown-owner Windows gate** passou entre `2026-10-14T12:28:43Z` e `12:28:57Z`. Log final: `PASS: CLEAN-V4-3012 reoccupied 8765; canonical won with exact PID/root/token/H1; old files and unknown service preserved.` O teste exige pelo menos duas tentativas, dentro do limite, compara `/ready.pid` ao último PID registrado como criado pelo launcher e exige evidência do PID que reocupou a porta. Também valida `package_root` atual e H1 com o token da pasta atual.

Logs e estados preservados no artifact [windows-bootstrap-evidence-cc1f61c7855abb1e1cff1eb4f4d2e240ce42fa71](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/38563887396/artifacts/11893568800), retenção configurada de 14 dias. Os resultados essenciais ficam registrados neste documento para continuidade após a expiração do artifact. Contratos locais do bootstrap: 11/11 PASS.

### Próxima ação exata / parada deliberada

**Usuário testar o CLEAN cc1f61c na fábrica. Aguardar o resultado físico antes de qualquer nova implementação.**

Não retomar PR #23, reconciliações antigas ou tarefas laterais do painel de progresso. Não promover o gate físico a GREEN sem a evidência enviada pelo usuário. Em uma nova conversa, primeiro revalidar o HEAD remoto e este checkpoint; manter cc1f61c como SHA do código/pacote automatizadamente validado. Se o teste falhar, analisar os logs e `agent_startup_state.json` dessa execução antes de propor outra alteração.

---

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
