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
