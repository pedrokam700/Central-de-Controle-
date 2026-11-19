# AGENTS.md — instruções de continuidade do projeto Central A-MES

> **LEITURA OBRIGATÓRIA ANTES DE QUALQUER TRABALHO NESTE REPOSITÓRIO.**
>
> Fonte canônica e atualizável: **[Issue #99 — Estado único da Central A-MES](https://github.com/pedrokam700/Central-de-Controle-/issues/99)**.
>
> Estado de execução: [PR #98](https://github.com/pedrokam700/Central-de-Controle-/pull/98), mais os handoffs e a matriz de 30 requisitos. **Não confiar que as SHAs deste arquivo são as mais recentes; consultar refs e CIs ao vivo.**

## Protocolo de abertura de TODA sessão Codex

1. Ler a Issue #99 integralmente; ler a PR ativa, handoff, CI e commit/ZIP do **SHA exato**; verificar `git status --short`, HEAD, branch e alterações locais antes de editar. Se não houver acesso à Issue, **informar a limitação** em vez de inventar o estado. Preservar trabalho não publicado.
2. Reconstruir **a próxima ação a partir da meta do usuário**, não a partir da última mensagem isolada. Meta: **instalar e usar a Central A-MES com as melhorias e com os dados históricos preservados**. Evitar tarefas intermediárias sem efeito nessa entrega.
3. **Não confundir** código/branch de suporte, CI focada, ZIP completo publicado, Windows LAB e instalação física. Registrar cada estado separadamente. Nenhuma CI sintética homologa MES OPPO real.
4. **Não pedir novamente fatos já informados**: usuário atualiza extraindo ZIP em pasta nova e executando `01_TROCAR.bat` há várias versões; interface Edge em `http://127.0.0.1:8765/Central-de-Controle-/`, automação MES Chrome separado, rede OPPO com rota persistente. PC informado como livre para instalação/testes: NÃO impor TI como requisito sem prova de política corporativa específica. A versão A realmente instalada **ainda precisa de identificação**.
5. Antes de criar nova função/diagnóstico, **ler os fluxos e testes existentes** (`01_TROCAR`, guardian, SQLite/WAL, Run, recuperação, rede, jobs e Chrome). Não reinventar identificação pela porta 8765 ou confundir PID com porta.
6. **Lição comprovada de 19/11/2026:** usuário foi levado a fazer hash/PS1, PowerShell, Policy e consulta PID. PS1 bloqueado por PSSecurityException; `Get-ExecutionPolicy -List` todo Undefined; consulta 8765 mostrou somente owner_count != 1. Não inferir corrupção, falta de banco ou necessidade de TI. **Não repetir comandos ad hoc nem recomendar Bypass**, e não executar BAT de troca para diagnóstico.
7. Preservar limites: nunca sobrescrever A/C0, restaurar SQLite antigo sobre B com novos dados, apagar WAL/journals/cache/filas, abrir A após B ter possivelmente escrito; em caso incerto R2 STOP. Mudanças operacionais ou coleta real exigem autorização específica e pré-condições reais comprovadas.
8. Funcionalidades que NÃO podem regredir: 3028/3074/2114/3012/3022 nas linhas 1–3; fonte/linha/período/snapshot/revisão; histórico por passagem independente, técnico/papel/comentário visíveis (não `+N`), usos físicos comprovados sem zeros falsos, exclusão A6900 do horário produtivo, recovery parcial, Consulta SN, FPY, dashboards, alertas, AT e rede persistente. Conferir [matriz de 30 requisitos](https://github.com/pedrokam700/Central-de-Controle-/blob/5d20a1b5211d30d6ca92adc2b685df58f3b1132d/docs/ames/audits/PR98_MATRIZ_CONTINUIDADE_INSTALACAO_20261119.md).
9. **Não usar a main antiga 0.5.39 como base da versão entregue ao usuário.** Últimos ZIPs anteriores vieram da linhagem PR70 (16980fb5 → 7e49cc45 → eedacc65), posteriormente PRs #69–98, com PR74 de branch irmã incorporada pela PR76. A versão ativa física não se deduz desses ZIPs.
10. Antes de concluir: verificar HEAD final/CI/artifact exatos; registrar data, SHA, ZIP+hash, evidências físicas, bloqueios e **única próxima ação** na Issue #99. Se CódigoX não concluiu, preservar checkpoints e handoff. Evitar criar nova PR, build ou auditoria só para demonstrar progresso.

## Regra de comunicação

- Dizer claramente **o que foi comprovado** e **o que continua pendente**, sem citar GREEN de outro SHA.
- O usuário quer ações úteis e curtas; **não enviar lista longa de comandos**, nem pedir para ele testar o que a CI pode testar. Um STOP deve vir com causa específica e decisão segura, não com dez diagnósticos sucessivos.
- **Fonte de verdade dinâmica = Issue #99 + GitHub live + evidência da estação**, não apenas este documento. Atualizar a Issue #99 sempre que houver mudança de versão/instalação/objetivo.
