# PR97 — candidata completa autorizada, evidências de empacotamento

Base exclusiva PR96 3a9e22f57d4cc8c6ee2336685273a0e4a9f628f3.
O pedido de 18/11 autoriza builder isolado, ZIP candidato, extração/validação,
Windows passivo e artifact GitHub Actions. Não autoriza instalação, launcher,
updater operacional, MES, dados reais, rede/guardian/Firebase, release/deploy/merge.

RED de contrato publicado antes da correção: caminhos Windows/escape, colisão de
case, WAL/SHM, identidade candidata ausente e instrução antiga de retorno 0.5.39.
O fluxo separado de geração só publica a entrega depois das regressões do mesmo
SHA e da validação efetiva Linux/Windows. Guards das regressões permanecem ativos.

C01: ZIP original EEDACC65 não disponível. Comparação com sources/manifestos Git
e transformação explícita, sem afirmar paridade com bytes do arquivo ausente.
C02: entrega CLEAN integrada; não mistura candidate-files/ROOT_FILES do updater
legado. Scripts produtivos preservados, sem execução. C03: identidade e instrução
atual específicas, sem oferecer rollback automático para release antiga.

Resultados, SHA final, inventário, hash ZIP e URLs serão registrados no checkpoint
da PR e no handoff final somente após validação. Homologação física PENDENTE.
