# HANDOFF MESTRE — CENTRAL DE TRABALHO + A-MES
## Migração segura de conversa | 22/10/2026 | Issue #57 · PR #64

> **Finalidade**: preservar integralmente o trabalho e permitir continuar deste ponto em outro chat, sem reconstruir o projeto, refazer PRs concluídas, confundir CI com homologação ou perder as evidências do posto. Este documento é um **checkpoint**, não uma autorização para atualização física automática. Seu estado precisa ser reconciliado com GitHub a cada retomada.

## 0. Instrução operacional obrigatória para a próxima conversa

**Repositório canônico**: `pedrokam700/Central-de-Controle-` (o último hífen importa). **Fonte da verdade**: GitHub `main`, GitHub Releases, PRs, Issues, Actions e este handoff. GitHub Pages apenas entrega a UI; o que o browser exibe não prova a revisão do motor Windows.

Começar lendo este handoff integralmente e verificando remotamente `main`, última release, PR #64, Issue #57, Issue #52, últimas Actions e arquivos alterados. Não repetir tarefas já concluídas nem tratar SHA ou CI antigos como GREEN para commits novos. Manter o usuário informado com resultados curtos e evidências; executar diretamente no GitHub quando as ferramentas permitirem e houver autorização, registrando checkpoints pequenos. Nunca prometer trabalho em segundo plano. Se houver uma decisão sobre atualização física, priorizar preservar dados e validar no posto.

**Pedido em andamento**: 1) fazer a Central HTTPS conectar-se ao agente já instalado no PC da fábrica; 2) estruturar atualização simples para todos os usuários: UI recebe aviso e botão `Atualizar página` sem interromper trabalho, backend agente recebe aviso e, **no futuro após piloto seguro**, botão `Atualizar quando ocioso`, sem baixar/reinstalar CLEAN manualmente a cada release; 3) preservar dados MES, SQLite, `source_id`, token, revisões/snapshots, fila de sincronização, instalações existentes e 9 views. O usuário ainda pretende testar conexão e sincronização física das três linhas; teste real **pendente**.

## 1. Último estado remoto revalidado, em 22/10/2026

| Item | Estado |
|---|---|
| `main` oficial | `0ae190718acd2d3c6f30fc3e561506a38912238d` |
| Última release oficial | `ames-v0.5.38-multipc-20261022` |
| SHA da release | `0ae190718acd2d3c6f30fc3e561506a38912238d` |
| Asset CLEAN oficial | `AMES_Central_CLEAN_0ae19071.zip` |
| SHA-256 do CLEAN oficial | `18b0c9b632b4a938e3a55cd4b4920a73fa2e7e4012d6b958ab70aa0117914f0a` |
| GitHub Pages correto | `https://pedrokam700.github.io/Central-de-Controle-/` |
| PR #64 | `https://github.com/pedrokam700/Central-de-Controle-/pull/64`, **OPEN + DRAFT, não merged** |
| Branch PR #64 | `work/ames-update-readonly-inventory-issue57-20261022` |
| HEAD funcional PR #64 antes deste handoff | `0300b3f7d4d002f6fe131c8321d0aaa2b834b6d7` |
| Issue #57 | `https://github.com/pedrokam700/Central-de-Controle-/issues/57` — atualização instalada uma vez, rollback, multi-PC: **OPEN** |
| Issue #52 | `https://github.com/pedrokam700/Central-de-Controle-/issues/52` — A-MES, rastreabilidade, alertas: **OPEN** |
| A-MES Operational History PR #64 | run `39779438762`: **SUCCESS** nos jobs contract, browser, Windows, Firestore |
| Central Quality Gate PR #64 | run `39779445460`: **3 jobs internos SUCCESS; Published preview smoke FAILURE** |
| Causa específica do preview FAILURE | Netlify `deploy-preview-64--productcontrolcenter.netlify.app` respondeu `release_build_http_401` após espera; não provar publicação nem chamar testes internos de falhos |
| Publicação da PR #64 | **NÃO PUBLICADA**; oficial segue 0.5.38 |
| Homologação Windows real da PR #64/piloto | **PENDENTE** |

**Atenção a SHA após registrar este arquivo no GitHub**: o próprio commit do handoff na PR #64 altera o HEAD; registrar SHA novo e consultar novos checks. A evidência do `0300b3f7` vale somente para aquele commit e não deve ser indevidamente herdada.

### Links úteis
- Release oficial 0.5.38: `https://github.com/pedrokam700/Central-de-Controle-/releases/tag/ames-v0.5.38-multipc-20261022`
- CI A-MES: `https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39779438762`
- CI Quality: `https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39779445460`
- Checkpoint anterior PR #64: `https://github.com/pedrokam700/Central-de-Controle-/pull/64#issuecomment-6341722012`
- Arquitetura: `docs/ames/architecture/UPDATE_DISTRIBUTION_MULTI_PC.md`
- Handoff histórico da Issue #52: `docs/ames/handoffs/ISSUE52_LIVE_ALERTS_ESTADO_ATUAL.md` (possui trechos históricos de estados antigos; não tratar datas antigas como estado atual).

## 2. Evidência física do computador de fábrica — comprovada pelo usuário

O usuário estava no computador com MES, Edge, estação A-MES e instância ativa na porta local `8765`. Capturas e comandos demonstraram:

### 2.1 Agente vivo, mas não pareado

GET somente leitura `http://127.0.0.1:8765/api/v1/ready` devolveu:
- `ok: true`, `ready: true`
- `agent_build: CANONICAL-R11-BATCH`
- `workstation_pairing_flow: 3`
- `agent_version: 0.5.23`
- `candidate_version: 0.5.24-rc1`
- `pid: 15212` no momento do teste; **não presumir que PID ainda é o mesmo**.

GET `http://127.0.0.1:8765/release-build.json` devolveu:
- `sha: dbe424daa3efd179740c93e88575d923ab9be048`
- `branch: main`, `build: 15.1.13.49`, `project: central-cora-v2`.

**Conclusão precisa**: a UI local servida no PC corresponde à versão 0.5.36, enquanto Pages oficial já serve 0.5.38. O build da UI e o `agent_version 0.5.23` são dimensões diferentes. `workstation_pairing_flow=3` NÃO distingue o Python antigo do corrigido.

Prints da Central local mostraram `Agente local detectado · conectar`, `MES local não disponível neste computador`, `Agente local não autorizado nesta aba`, pré-teste `Agente local · 8765 — Pendente`. Clicar em Verificar não autoriza automaticamente. Compartilhamento mostrou `Equipe → este PC: Leitura no servidor confirmada`, **0/3 linhas identificadas** e envio não comprovado. **Zero linhas recebidas não comprova perda dos dados históricos**; pode ser período, origem/conflito, publicação, autenticação, cache ou seleção.

### 2.2 Tentativa oficial de pareamento recusada

Navegador foi a `http://127.0.0.1:8765/workstation/parear`; após clicar `Autorizar e abrir a Central`, exibiu `Confirmação não concluída`, com hipótese nonce expirado/recusado ou bloqueio de Origin/Fetch Metadata. Não há prova de um token emitido nessa tentativa; navegador não voltou à Central HTTPS conectada.

### 2.3 Diagnóstico seguro do próprio processo (prova mais forte)

O usuário executou no PowerShell uma inspeção **somente leitura** do processo e dos dois arquivos Python efetivamente presentes na instalação. Resultado exato:

```
PAREAMENTO: VERSAO ANTIGA
CORS: VERSAO ANTERIOR
```

Comparação GitHub dos arquivos 0.5.36 × 0.5.38: `ames/agent/workstation_pairing.py` antigo tinha `OFFICIAL_CENTRAL = "https://pedrokam700.github.io/Central-de-Controle/"` (sem hífen final no caminho do repositório), novo aponta corretamente para `/Central-de-Controle-/`. `ames/agent/origin_policy.py` antigo derivava origin cortando path via `.split("/Central-de-Controle/")`; novo usa URL split com host HTTPS fixo. Na versão 0.5.36 a origem HTTPS ainda pode coincidir com host permitido; não generalizar que **todas** as requests são impossíveis. A política nova é mais robusta. **A versão nova publicada na nuvem não atualiza os arquivos Python residentes no posto.**

### 2.4 Incidente 404 resolvido e distinção de ambiente

O repo chama-se `Central-de-Controle-`, então URL com **hífen final** é obrigatória:
- **Certo**: `https://pedrokam700.github.io/Central-de-Controle-/`
- **Errado**: `https://pedrokam700.github.io/Central-de-Controle/` — GitHub Pages 404.

Também no agente local a UI usa `http://127.0.0.1:8765/Central-de-Controle-/`. O Pages oficial 0.5.38 teve `home=200`, `index=200`, `bootstrap=200` no SHA `0ae19071`. URL do Pages no PC de casa não acessa o agente da fábrica via localhost: são máquinas distintas. Viewer remoto usa snapshots autenticados sanitizados; motor/SQLite/MES ficam no coletor.

## 3. O que já está implementado na PR #64 (draft, não na release)

**19 arquivos alterados** no HEAD funcional antes do handoff. Implementação foi feita diretamente no GitHub:

1. **Revisão pública do contrato de pareamento**: `ames/agent/agent_hardened_entry.py` passa a expor campo público não secreto `workstation_pairing_revision: 4` no `/api/v1/ready`. **Não comparar SHA do frontend como versão do motor.**
2. **Detecção conservadora**: novo `ames/data/workstation-update-policy.mjs` com estados `detected` (revisão 4 confirmada), `outdated` (versão/flow explicitamente incompatível), `unverified_revision` (fluxo 3, mas revisão ausente: NÃO provar compatibilidade nem incompatibilidade) e `unknown` (agente não verificado). Isso evita falsos positivos na 0.5.38 ainda sem novo campo.
3. **Client e UX**: `ames/agent-client.mjs`, `ames/data/onboarding.mjs`, `ames/onboarding-view.mjs`, `ames/console-view.mjs`, `ames/console-preparation.mjs` e CSS mostram aviso discreto de atualização necessária/revisão não comprovada; link para Issue #57; **não há botão executando updater Windows**. Browser sem agente deve funcionar como viewer. Não sugerir extrair CLEAN por cima do posto.
4. **PWA sem interrupção**: `sw.js` precache da nova UI e aguarda mensagem explícita de ativação em vez de ativar via `skipWaiting` automaticamente; `app.js` implementa faixa `Nova versão da Central disponível` com `Atualizar página` / `Depois`, verificações periódicas quando apropriado. Evita recarregar no meio de uma coleta. O preload deve continuar atômico e manter 9 views.
5. **Testes/CI**: `scripts/ames-workstation-update-policy.test.mjs`, `scripts/ames-cache.test.mjs`, `scripts/ames-safe-pairing-launcher.test.mjs`, `scripts/ames-agent-pairing.test.mjs`, `scripts/quality-gate.mjs`, `.github/workflows/ames-operational-history.yml` alterados, incluindo parse PowerShell no Windows e garantias de que UI não instala motor.
6. **Documento arquitetura**: `docs/ames/architecture/UPDATE_DISTRIBUTION_MULTI_PC.md` atualizado com UX final e blocos B/C/G1–G6.
7. **Piloto somente leitura**: arquivos `tools/ames-workstation/ABRIR_HTTPS_EXISTENTE_SEM_ATUALIZAR.ps1` e `.cmd`; ver seção 4.

**Não fez**: scanner geral de instalações anteriores, atualizador Windows transacional instalado uma vez, backups SQLite testados, troca de binários, rollback, atualização efetiva do agente do posto ou homologação física.

## 4. ZIP PILOTO para este PC — testável, não substitui update oficial

Cópia no chat: `AMES_CONEXAO_HTTPS_SEM_REINSTALAR_PILOTO_20261022.zip`, SHA-256 do próprio ZIP:

`50ba1a1dcec6ed84f65a148110ec0db0d07e4c6b1424a7e87019305fae734eb9`

Contém exclusivamente dois arquivos, conferidos no runtime:
- `ABRIR_HTTPS_EXISTENTE_SEM_ATUALIZAR.ps1` (2383 bytes; Git blob `31e23ad0f251e6705b3734cef797c415a8555866`)
- `ABRIR_HTTPS_EXISTENTE_SEM_ATUALIZAR.cmd` (358 bytes; Git blob `c31d8774c26111881ea69ee1c282f85ff26e5572`)

Comportamento: no **mesmo PC de fábrica e usuário autorizado**, verifica `/api/v1/ready`, identifica PID/processo canônico, lê token local existente **sem imprimi-lo nem criar outro**, abre Edge no endereço fixo oficial HTTPS com autorização em fragmento, sem encerrar processo, substituir arquivo, tocar SQLite/config/source_id/MES ou Firebase. Esse token em argumento de abertura do navegador tem risco residual de exposição local (e.g., lista de processos); por isso **somente piloto pontual supervisionado**, nunca distribuir amplamente ou registrar URL, processo ou fragmento em log/chat. Precisa da ação consciente do operador. Nenhuma homologação física recebida ainda.

Procedimento autorizado descrito ao usuário: extrair ZIP em pasta temporária NOVA fora do CLEAN; deixar agente existente como está; não rodar outro launcher/instância; executar `.cmd`; conferir fim do fragmento `#ames_agent_token` na barra e `Agente local conectado` no site HTTPS; se falhar, compartilhar apenas mensagem final e status (sem token, paths privados ou URL contendo segredo). **O link do ZIP do sandbox só deve ser usado se o runtime da conversa atual tiver o arquivo de fato; em um chat novo, não inventar link.** O arquivo pode ser recuperado dos dois blobs exatos da PR #64 ou fornecido novamente pelo usuário.

**Nota crítica**: contornar a confirmação POST 403 por token local existente NÃO é a mesma coisa que resolver o `workstation_pairing.py` físico antigo, nem substitui verificação de CORS/capabilities. Mesmo que mostre `Conectado`, validar independentemente FPY, 3 linhas, publicação e recebimento Firestore.

## 5. Estratégia de atualização para usuários — decisão do produto

Experiência desejada: simples, sofisticada, limpa, uma única Central, nada de outra ferramenta paralela ou reinstalar por atualização.

| Quem / situação | Experiência final pretendida |
|---|---|
| Viewer sem MES local | Abre o GitHub Pages e usa compartilhamento autenticado; não instala CLEAN nem agente. |
| Operador em UI-only update | Nova interface pré-carregada, faixa pequena `Nova versão disponível` e botões `Atualizar página` / `Depois`, sem interromper o trabalho; nenhum ZIP novo. |
| Coletor com backend compatível | Continua com o agente atual mesmo quando a interface muda. |
| Coletor com backend comprovadamente incompatível | Aviso claro; **somente no futuro após gates** `Atualizar quando ocioso` e `Depois`. |
| Agente com revisão não observável | Mostrar `Revisão não comprovada`, permitir diagnóstico, não declarar desatualizado nem forçar CLEAN. |
| Atualização de motor aprovada | Atualizador Windows uma vez por máquina, em diretório confiável separado; só release oficial verificada, estágio, backup, bloqueio se ocupado, troca e rollback. |

**Gates necessários para updater Windows (Issue #57 aberta):**
- B1 inventário **read-only** de instalações, identificação do PID/raiz efetivos e conflitos com outros agentes; sem expor tokens/source_ids.
- B2 capabilities versionadas + jobs/sync busy + compatibilidade mínima independente do SHA web.
- C1 baixa somente GitHub Releases finais imutáveis, verifica origem, tag/SHA, digest SHA-256 e allowlist de paths. Nada de PR preview ou URL arbitrária.
- C2 staging fora da pasta instalada + mutex, negar troca durante 3028/3074/2114/3022/3012, sync ou AT, backup SQLite **consistente** e verificável via API SQLite, configuração/token/source_id/fila; manter dados persistentes fora da árvore versionada.
- C3 journal atômico/recovery de queda de energia, trocar só binários permitidos, reiniciar apenas PID canônico comprovado, health+capabilities+comparação de dados/revisões, rollback automático se falhar.
- G1 a G6: Node/Python/Edge HTTPS-loopback, clean Windows, mock de update+rollback, recusa busy, power-loss recovery, 2 coletores+1 viewer, observabilidade 24h/7 dias no piloto físico.

**Proibido**: copy/paste de Python em processo ativo, matar `15212` por conta própria (PID pode ter mudado), iniciar outro CLEAN, misturar source_ids, alterar token, recriar SQLite, descartar backups, eliminar histórico de dia anterior ou declarar cobertura desconhecida igual a zero. O launcher padrão pode matar processos antigos conhecidos; não executá-lo sem plano seguro.

## 6. Regras essenciais de MES, história e UI que não podem ser perdidas

- Nove views são baseline obrigatória: Monitoramento, Falhas do dia & FPY, Falhas, Consulta por SN, Rastreabilidade, Processo / 3022 & AT, Dashboards de reuso, Base local e CORA conhecimento (nomes visíveis podem variar; não diminuir paridade).
- A-MES opera em rede isolada; coleta e SQLite no PC de origem, site/cloud somente snapshots sanitizados/revisões e dados autorizados, sem credenciais MES/repair comment bruto exposto em Firebase.
- Views MES envolvidas 3028, 3074, 2114, 3022 e 3012. Investigação por SN deve preservar associações conservadoras: código+descrição, PCBA+timestamp+Defect Hist Seq, origem, estado Y/N e vínculo exato.
- `Y/N` em 2114 significa vinculado/não vinculado; NÃO prova reparo. `Manual/Automatic` descreve registro de falha, não ação do AT. `Defect Hist Seq` diferencia ocorrências mas por si só não atribui pessoa nem horário de intervenção.
- Duas análises de segundo uso distintas: (1) 2º/3º uso da própria PCBA principal, falhas anteriores e número de usos; (2) reuso físico de componentes, PCBAs anteriores/desvinculadas e histórico por Material SN. Não somar kits duas vezes no agregado físico.
- Alerta alto da mesma falha na própria PCBA pode aparecer com 3 2114 distintos, mas **não** atribuir AT/causa sem prova 3012/3022; nomes apenas com evidência, comentários marcados candidatos quando não correlacionados temporalmente. Em outubro, PCBA de teste `00252700612635F300020827`, 3 2114, falha GN01-TX01 ANT0, cartões vermelhos com internos brancos; defeitos corrigidos na release 0.5.37 e herdados pela 0.5.38, homologação física de vários detalhes ainda pendente.
- Hoje / Último dia produtivo / Período são escopos diferentes (07:00→07:00), snapshots e revisões imutáveis com source_id, line_id, período, timestamp; a última coleta histórica pode aparecer automaticamente rotulada, **sem** ser FPY de Hoje. Conflito de origem requer escolha humana, nunca escolher automaticamente último timestamp de outro coletor.
- Linhas 1, 2, 3: TAN10101, TAN10102, TAN10103. `0/3` pode significar conflito, filtro, dia/snapshot, falta de publicação/recebimento; não concluir perda.
- UX do Monitoramento deve permanecer limpa, organizada, profissional, hierarquia de ações principais, opções avançadas recolhidas; SNs e descrições sem quebra por letra e código técnico sem coluna de destaque se não agrega valor.
- GitHub Pages correto com hífen final. Página não prova motor instalado; CI, release, publicação e homologação são etapas distintas.

## 7. Próximas ações em ordem segura (não reinterpretar como concluídas)

**A. Retomar PR #64 sem reconstrução**: consultar HEAD atual e CI; revisar arquitetura e novo handoff; corrigir bloqueios reais. O único job vermelho no último HEAD funcional era `Published preview smoke` Netlify HTTP401; verificar se provider tem permissão antes de tentar substituir o gate. Não fingir GREEN nem aceitar bypass silencioso. Verificar também teste de service worker e leitura no Browser no SHA exato após este handoff. PR deve ficar draft até evidência adequada.

**B. Teste físico do ZIP piloto no mesmo PC autorizado**: operador ainda não relatou resultado. Perguntar somente resultado após execução (não repetir perguntas já respondidas); observar token removido da URL e status `Agente local conectado`. Não usar `/workstation/parear` repetidamente se retorna 403. Se piloto falhar, diagnosticar reason CORS/PNA/autenticação sem apagar dados nem reduzir segurança.

**C. Validação de sincronização depois da conexão**: comparar coleta no posto com outro viewer autenticado: linha 1/2/3, source_id sem imprimir segredo, snapshot_id, revisão, período, última publicação, recebimento, FPY e Check FPY de Hoje vs histórico. Separar MES local, Firebase e cache web; não confundir 0/3 com banco vazio.

**D. Avançar na Issue #57 B/C**: scanner read-only multi-instalação, provas de root/PID, update transacional com backups, rollback; só quando completo release nova com manifesto, testes e piloto físico. Evitar instalar CLEAN repetidamente e não exigir viewer baixar nada.

**E. Publicar apenas com evidência**: não mergear draft por conveniência; após aprovação, tag imutável versionada, Gates exatos, Pages verificado em home/index/bootstrap e SHA release, teste físico claramente pendente. Registrar comentário em Issue #57 e PR #64 a cada bloco, atualizar handoff na raiz do repo.

## 8. Estilo de trabalho exigido na próxima conversa

- **Português técnico e direto**, com resultados verificáveis, ações e riscos separados. Pouca burocracia e nada de repetir o problema sem executar ações quando as ferramentas permitem.
- Melhorar a arquitetura em vez de espalhar remendos. Não refazer PRs #59–#63 já concluídas e não retomar PR #23.
- Não declarar sucesso de fábrica por sucesso do CI, nem declarificar publicação por build verde; usar SHA/URL/run e marcar o estágio exato.
- Sempre conferir primeiro o GitHub e preservar decisões canônicas; commits pequenos e checkpoints que sobrevivem a travamentos/interrupções.
- Se a conversa acabar, entregar link ao arquivo Markdown no GitHub, ZIP piloto apenas se path de arquivo realmente existir, e um texto de abertura pronto no fim deste documento.
- Não afirmar que trabalho continua autonomamente depois da resposta sem uma automação explicitamente criada.

## 9. Texto pronto para abrir um novo chat (copiar integralmente)

> Continue a Central de Trabalho + A-MES de `pedrokam700/Central-de-Controle-` exatamente do handoff canônico `docs/ames/handoffs/ISSUE57_PR64_MIGRACAO_20261022.md` na PR #64. Leia-o integralmente e reconcilie-o com GitHub `main`, Releases, PR #64, Issues #57 e #52, Actions e branch `work/ames-update-readonly-inventory-issue57-20261022`. Base oficial antes do handoff: `main`/release 0.5.38 em SHA `0ae190718acd2d3c6f30fc3e561506a38912238d`. PR #64 estava DRAFT, HEAD funcional `0300b3f7d4d002f6fe131c8321d0aaa2b834b6d7`, A-MES CI SUCCESS, Quality 3 internos SUCCESS e preview Netlify HTTP401. **O último commit pode ter mudado pelo próprio handoff: verifique de novo.** Usuário comprovou agente local canônico em 8765 com UI 0.5.36, Python de pareamento e CORS antigos, ainda não homologou conexão com 0.5.38. ZIP piloto `AMES_CONEXAO_HTTPS_SEM_REINSTALAR_PILOTO_20261022.zip` foi verificado mas aguarda teste físico. Não tocar SQLite, token, source_id, arquivos de produção nem reiniciar o agente; manter 9 views e história. Objetivo: concluir diagnóstico/piloto de conexão e implementar progressivamente atualização simples (UI opt-in já na PR #64; agente transacional ainda pendente na Issue #57). Trabalhe diretamente no GitHub, sem criar projeto paralelo nem reabrir trabalho concluído. Documente resultados de CI/publicação/teste físico separadamente, atualize o handoff após cada checkpoint e responda em português técnico objetivo.

---

*Registro inicial: 22/10/2026. Atualizações posteriores devem ser apensadas com data, SHA do commit e evidências do novo teste físico, sem apagar o contexto histórico.*

## 10. Adendo físico — 22/10/2026, 10:46–10:47 BRT (não substitui o histórico anterior)

**Resultado novo do usuário**: quatro prints compararam duas abas HTTPS. Abrir o endereço oficial manualmente em **nova aba** mostrou agente detectado, mas não autorizado e 0/3 linhas atuais compartilhadas; a autorização local `/workstation/parear` continuou em `Confirmação não concluída`. Abrir a Central através do pacote temporário existente **funcionou fisicamente**, status verde `Agente local conectado · CANONICAL-R11-BATCH` no próprio GitHub Pages oficial. A aba autorizada recuperou histórico local da Linha 3 no período 21/10 07:00 → 22/10 07:00, FPY 97,87%, Check FPY 97,87%, Quantity 2064, Falhas 44, Snapshot 4, Origem local, rotulado Histórico/Desatualizado.

**Diagnóstico comprovável pelo código**: `ames/agent-client.mjs` recebe `#ames_agent_token`, remove o fragment da barra e o guarda em `sessionStorage`. Esse armazenamento é por aba; outra aba aberta manualmente pelo endereço, no mesmo computador, pode estar sem autorização. Não confundir esse comportamento com desconexão do agente e não concluir perda SQLite/dados a partir de 0/3 linhas atuais. Não transferir token automaticamente para todas as abas nem persisti-lo em localStorage sem avaliação de segurança. O erro POST 403 local é outro problema, ainda não atribuído conclusivamente a um header/nonce específico.

**Classificação de gates**:
- PILOTO temporário no posto, com pacote: **GREEN restrito ao caminho testado** (não validou hardening do POST).
- HTTPS conectado e leitura local da Linha 3: **GREEN parcial**.
- Link puro em nova aba e formulário de pareamento local: **RED**.
- Sincronização do Hoje para três linhas entre computadores: **PENDENTE**, evidência visual 0/3.
- Updater Windows in-place com backup/rollback: **NÃO ENTREGUE**.

**Próximo teste mais barato (sem código ou dados alterados)**: na mesma aba oficial que o pacote conectou, pressionar Ctrl+L, colar `https://pedrokam700.github.io/Central-de-Controle-/`, Enter. Se mantiver conexão, confirma a hipótese de sessão por aba. Se perder, examinar SW/boot da sessão antes de qualquer modificação. Só então selecionar a correção definitiva para o POST local sem enfraquecer CSRF/nonce. Detalhes/prints registrados no comentário da Issue #57 https://github.com/pedrokam700/Central-de-Controle-/issues/57#issuecomment-6342516555.

**Atenção ao SHA**: este adendo modifica apenas documentação em branch draft; revalidar novo HEAD e não herdar gates do commit anterior.

## 11. Adendo — teste em OUTRA aba e erro Firebase (22/10/2026, 11:01–11:04 BRT)

O usuário informou explicitamente que pressionou Ctrl+L e colou o endereço **em outra aba**. O site oficial mostrou `Agente local detectado · conectar`, sem token e sem acesso MES; a confirmação `/workstation/parear` ainda falhou duas vezes. Não foi testada a navegação **na mesma aba originalmente conectada pelo pacote**. A hipótese de `sessionStorage` por aba segue válida, não falsificada por esse print. Não dar como solucionado o acesso normal pelo link.

Houve também mensagem `O Firebase recusou o acesso. Verifique as regras do Firestore.` na tela de login. Depois, o usuário autenticou-se normalmente e o problema de token da outra aba persistiu. Em `app.js`, a mensagem mapeia `permission-denied`. `finishLogin` executa `ensureUserProfile` (GET de `users/{uid}`); `onAuthStateChanged` pode mostrar alert e deslogar após falha. A transação exata causadora do erro não está comprovada, portanto **não alterar Firestore.rules ou dados por suposição**. Preservar isolamento entre Firebase Auth e authorization token do motor local.

Próximo teste físico sem alteração: voltar à **aba HTTPS efetivamente conectada pelo piloto**, Ctrl+L na mesma aba, abrir URL oficial limpa; confirmar status após a navegação. Para isolar POST 403, inspecionar via DevTools apenas HTTP status + Host/Origin/Sec-Fetch-Site/Sec-Fetch-Mode/Content-Type, sem Request Payload (nonce), token, cookies ou URL com fragment. Evidência salva na Issue #57, comentário https://github.com/pedrokam700/Central-de-Controle-/issues/57#issuecomment-6342861196.

PR #64 segue draft até revalidação; não criar novo CLEAN, não tocar SQLite, source_id, token nem atualizar o motor em uso.

## 12. Homologação restrita — navegação HTTPS na MESMA aba (22/10/2026, 11:15 BRT)

**Resultado físico informado pelo operador: “continuou conectado”.** Na aba HTTPS que o piloto havia autenticado, o usuário fez Ctrl+L e reabriu a URL limpa `https://pedrokam700.github.io/Central-de-Controle-/`, **sem abrir outra aba**. O indicador permaneceu conectado. Classificar **GREEN apenas para permanência da autorização em navegação da mesma aba**, após pareamento temporário.

Consequências: sessão por aba explicada por `sessionStorage`, sem perda de token durante reload/navegação de mesma origem; abrir outra aba sem capability continua RED por design atual; POST do botão de pareamento normal ainda RED e falta identificar exatamente a condição de 403. Observação técnica no agente 0.5.36: `workstation_pairing.confirm` valida Host/loopback, Origin/Sec-Fetch-Site, Sec-Fetch-Mode e nonce; sem cabeçalhos concretos do POST não atribuir causa. Não afrouxar checks e não copiar tokens entre abas sem novo projeto de segurança. Firebase permission-denied é incidente separado e não comprovadamente relacionado.

Próximo gate: observar metadados não secretos da requisição 403 sob DevTools, corrigir somente a condição comprovada, validar CI/Windows e estabelecer atualização segura do agente com backup antes de homologar o botão. Ver registro https://github.com/pedrokam700/Central-de-Controle-/issues/57#issuecomment-6342988228.

## 13. Atualização oficial 0.5.39 — PR #65 merged; Pages no SHA exato (22/10/2026)

**Causa física identificada no Edge DevTools**: POST `http://127.0.0.1:8765/workstation/parear` => 403 com `Origin:null`, `Host:127.0.0.1:8765`, `Sec-Fetch-Site:same-origin`, `Sec-Fetch-Mode:navigate`, `Sec-Fetch-Dest:document`, `Sec-Fetch-User:?1`, `Content-Type:application/x-www-form-urlencoded`. O agente 0.5.36 rejeitava `Origin:null` antes da validação do nonce; não afirmar que o nonce estava válido/expirado nessa tentativa.

**Correção oficial**: PR #65 foi merged à main SHA **`b283b1764432f5d90486d38a7553b30542a5c118`**. `ames/agent/workstation_pairing.py` permite `Origin:null` só em navegação de documento iniciada pelo usuário e comprovadamente mesma origem local, host/IP loopback e nonce válido de uso único/TTL300s. Casos cross-site/iframe/XHR/origem externa/replay continuam rejeitados. Testes contrato e HTTP integration registram o Edge real e controles negativos. NÃO afrouxar anti-CSRF.

- Operational History no SHA PR `16320f2e`: 5/5 SUCCESS, run `39811171452`.
- Operational History SHA `main` `b283b176`: 5/5 SUCCESS, run `39811962960`.
- Release oficial **`ames-v0.5.39-multipc-20261022`** publicada a partir do SHA de merge, arquivo `AMES_Central_CLEAN_b283b176.zip`, SHA256 `4407332be1d7e6ed78ee11ad2cf7dca893d2ba9c72e55bf4b93d453892cc482a`, 1,076,224 bytes. URL: https://github.com/pedrokam700/Central-de-Controle-/releases/tag/ames-v0.5.39-multipc-20261022
- GitHub Pages run `39812478879` SUCCESS, log `Public GitHub Pages verified: SHA=b283b1764432f5d90486d38a7553b30542a5c118 home=200 index=200 bootstrap=200`. URL oficial https://pedrokam700.github.io/Central-de-Controle-/
- Central Quality Gate da PR #65 teve RED por preview privado Netlify 401; **no SHA da main 0.5.39**, o [Central Quality Gate run 39811963191](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39811963191) concluiu **SUCCESS**, 3 jobs internos SUCCESS e preview PR SKIPPED por não ser aplicável à main. Manter evidências distintas.

**Gates ainda abertos**: Python do posto permanece anterior (a publicação da release NÃO atualizou o agente Windows), botão normal não testado na 0.5.39 física, sincronização atual entre 3 linhas não homologada, Firebase 403/permission-denied incidente separado. A PR #64 continua draft para UX de update web/avisos, e updater motor completo com backup/rollback e gates G1–G6 da Issue #57 NÃO foi entregue. Não reinstalar/extrair CLEAN sobre SQLite, token, source_id ou agente ativo. O pacote temporário conectou apenas por sessão no Edge e pode continuar sendo usado no posto autorizado enquanto houver segurança operacional.

**Registro detalhado e continuidade**: https://github.com/pedrokam700/Central-de-Controle-/issues/57#issuecomment-6345624447. Revalidar GitHub ao migrar, em especial `main`, `release`, PR #64, Issue #57; não reabrir PR #65. Próxima intervenção física só após solução externa segura de atualização do agente e prova de downtime/backup; sem acesso remoto ao PC físico não declarar aplicação concluída.

## 14. ÚLTIMO PRINT FÍSICO + MIGRAÇÃO DA CONVERSA (22/10/2026, 14:07–14:08 BRT)

**Este é o ponto de retomada prioritário para o próximo chat.** A conversa antiga atingiu o limite; o operador executou o último comando de inventário somente leitura e enviou dois prints, sem executar instalação, inicializador ou cópia. O print de 14:07 confirma:

```text
Ready          : True
Build          : CANONICAL-R11-BATCH
Versao         : 0.5.23
PID            : 15212                    [apenas na hora do teste; consultar /ready novamente]
Script         : C:\Users\producao\Downloads\AMES_Central_CLEAN_dbe424da\ames-agent\agent_hardened_entry.py
Pasta antiga   : True
Agente antigo  : True
Banco SQLite   : True
Configuracao   : True
Token local    : True
Pasta 0.5.39   : AMES_Central_CLEAN_b283b176
```

**Arquivos cuja mera existência foi comprovada (conteúdo NÃO lido/publicado):**
- `AMES_Central_CLEAN_dbe424da/ames-agent/agent_hardened_entry.py`
- `AMES_Central_CLEAN_dbe424da/ames-agent/data/ames_local.sqlite3`
- `AMES_Central_CLEAN_dbe424da/ames-agent/config.json`
- `AMES_Central_CLEAN_dbe424da/ames-agent/data/local_agent_token`.
A pasta extraída `Downloads/AMES_Central_CLEAN_b283b176` também existe. **Não se comprovou a integridade do SQLite, das filas, ausência de jobs ou disponibilidade de backup; `Test-Path=True` não equivale a backup verificado.**

**Integridade do download**: `Get-FileHash Downloads/AMES_Central_CLEAN_b283b176.zip -Algorithm SHA256` = `4407332be1d7e6ed78ee11ad2cf7dca893d2ba9c72e55bf4b93d453892cc482a`, correspondente ao digest oficial da release. Extraído, **NÃO INSTALADO**. Nenhum arquivo Python novo foi copiado para a raiz ativa e o motor do PID 15212 continuava na 0.5.36. Não iniciar a nova CLEAN; pode tentar reservar a porta 8765 ou divergir em dados/origens.

**Estado GitHub revalidado neste checkpoint**:
- `main`: `b283b1764432f5d90486d38a7553b30542a5c118`; release oficial `ames-v0.5.39-multipc-20261022` SHA igual; asset `AMES_Central_CLEAN_b283b176.zip`, 1.076.224 bytes, SHA-256 acima.
- PR #65 **merged/closed**, origem da correção estrita para o POST Edge `Origin:null`; CI oficial no SHA merge: A-MES Operational History 5/5 SUCCESS, Central Quality Gate SUCCESS e GitHub Pages SUCCESS com home/index/bootstrap 200. **Não reabrir PR #65**.
- Issue #57 **OPEN**: updater Windows in-place, prevenção de duas instâncias, inventário, backup transacional, staging, troca controlada, rollback e homologação. Issue #52 OPEN (coleta/reuso/alertas).
- PR #64 `work/ames-update-readonly-inventory-issue57-20261022` **OPEN/DRAFT**, HEAD ANTES deste adendo `3a2fa637809a0839809198b92b30d47fa24ac748`, A-MES Operational History run `39813436053` SUCCESS. **Mergeability "dirty"** depois que `main` avançou para 0.5.39: reconciliar diferenças/conflitos; não dar merge direto, não sobrescrever fix da PR #65. A alteração deste handoff produzirá novo HEAD; revalidar SHA+checks.
- Log da comprovação anterior: [Issue #57, comentário 6346547481](https://github.com/pedrokam700/Central-de-Controle-/issues/57#issuecomment-6346547481).

**Gates físicos, sem inflar os resultados**:
- GREEN: ZIP oficial íntegro, processo canônico existente, arquivos essenciais presentes, nova pasta segregada; conexão HTTPS por **pacote temporário** na aba autenticada e persistência nessa mesma aba.
- RED na instalação antiga: botão padrão de pareamento via `/workstation/parear` HTTP 403 com `Origin:null` (corrigido NO GITHUB na 0.5.39, NÃO aplicado no agente físico).
- PENDENTE: idle proof do coletor/filas, inventário de raízes concorrentes, backup SQLite consistente testado, backup config/token/source_id, staging verificável, atualização segura/rollback, restart apenas do canônico, rechecagem de /ready e POST, sincronização 3 linhas 0/3, erro intermitente Firebase `permission-denied`.

**Ação exata para continuar**: NÃO repetir o inventário já enviado. Planejar/implementar o **atualizador de agente seguro** da Issue #57 com testes Windows/SQLite e procedimento de campo; não pedir ao usuário para executar simples `Copy-Item`, `Stop-Process` ou iniciar o CLEAN novo. Primeiro auditar a arquitetura e o updater legado (`ames/agent/update_candidate.py` é legado, NÃO atende gates B/C/G1–G6), obter prova de inatividade/backup, identificar todas as instalações concorrentes, projetar transação/rollback e testar fora da produção. Quando houver procedimento validado, guiar a instalação no PC autorizado, **somente com operador presente**. Guardar checkpoints no GitHub. O usuário pretende migrar imediatamente de conversa; ao retomar, leia todo este documento e priorize este §14 sobre trechos históricos §1–9 (que ainda citam 0.5.38 por serem registro histórico).

**UX e processo de comunicação**: respostas em português técnico, objetivas e apoiadas em evidências. Fazer as operações possíveis no GitHub, sem obrigar o usuário a repetir informação comprovada. Distinguir implementação, CI, release, Pages, teste físico; manter 9 views, alertas 2114/3012/3022, histórico de FPY/snapshots e dados offline. Não oferecer novo download CLEAN como solução de upgrade físico até existir atualizador seguro.

## 15. Retomada técnica — Issue #57, incremental seguro após o §14 (22/10/2026)

**Sem alteração de estado físico:** o último inventário do §14 permanece a única prova da fábrica. O agente antigo 0.5.36 continua sendo o último processo confirmado na porta 8765; 0.5.39 segue baixada/extraída, **NÃO instalada**. Nenhum comando adicional de produção foi solicitado ou executado nesta etapa. Nem SQLite, token, `source_id`, MES nem configurações reais foram acessados.

**Reconciliação sem perda da PR #65**: o conflito estava em `.github/workflows/ames-operational-history.yml`, lista de branches. A resolução preserva a branch da PR #64 e a branch de teste de Edge da PR #65, mantendo `ames/agent/workstation_pairing.py` e os testes de `Origin:null` exatamente como na `main` 0.5.39. A PR permanece draft, nunca mergear sem checks do novo HEAD.

**Código do próximo bloco, não pronto para rollout:**

1. Inventário Windows read-only de instalações, processos canônicos e porta 8765 com `updater_eligible=false` obrigatório; scanner isolado de token/source_id.
2. Observação de jobs em memória, SQLite e scheduler exposta somente para cliente autorizado; `update_authorized=false` em todos os casos. Ainda não existe prova atômica de idle nem sync/browser/guardian interlock.
3. Pré-verificação offline para **release pinada 0.5.39**: digest do ZIP e hashes de cada arquivo; estágio separado com restrições de paths, sem executar binários. Ensaiado com ZIP oficial: SHA-256 `4407332be1d7e6ed78ee11ad2cf7dca893d2ba9c72e55bf4b93d453892cc482a`, 288 entradas válidas.
4. Backup SQLite via API SQLite em modo read-only com WAL, `quick_check` e restore ensaiado em memória; cópia de `config.json` e token para backup privado em testes isolados. **Backup total da árvore de dados não comprovado**; função retorna `data_tree_complete=false`. Não deve ser usada como procedimento físico até completar lock/ACL/backup total.
5. Modelo C3 de journal e rollback, **apenas em fixture descartável**: ensaios de falha antes/depois de renomeações e health negativo recuperam versão anterior, preservando diretório de dados separado. O modelo não executa comandos Windows nem foi testado em produção.

**Gates pendentes**: Windows CI do novo código, idle lease com bloqueio real de novos jobs/guardian/sync, snapshot dos arquivos auxiliares/filas, journal de transação, troca allowlisted, health pós-restart, rollback power-loss, piloto no primeiro coletor, 2 coletores + viewer, observabilidade G6. Não considerar CI verde como fábrica GREEN e não disponibilizar botão executável.

## 16. Incremento de admissão — Issue #57 / PR #64 (22/10/2026; aguarda CI remoto)

**Sem mudança física desde o §14.** A 0.5.39 foi apenas extraída no posto. O agente anterior e seus dados não foram tocados e nenhum novo comando de PowerShell foi solicitado. A `main`/release continua no SHA `b283b1764432f5d90486d38a7553b30542a5c118`; PR #65 mantém-se merged. Esta seção descreve código na PR draft, NÃO motor instalado.

**Progresso técnico, sem conceder updater**:

1. Criada `ames/agent/maintenance_admission.py`: barreira in-process com contador de operações mutantes, drenagem que impede nova admissão e token interno de liberação. Não é endpoint nem lease durável; só código preparatório.
2. `HardenedHandler.do_POST` cerca todos os métodos POST; `_launch_new_mes_job` cerca reserva de monitor e persistência do job; o monitor automático cerca o tick e não escreve metadados durante drain. Requisições já aceitas não são interrompidas abruptamente. O endpoint autenticado de readiness informa `new_admissions_fenced`/`inflight_mutations`, mas **sempre** `update_authorized=false`.
3. No guardian **novo** `KEEP_AGENT_RUNNING.ps1`, antes de relançar há recusa por mutex transacional ocupado ou journal persistente `.ames-update\transaction.json`. A versão antiga executada na fábrica **não** foi atualizada, portanto ainda pode disputar a porta; mutex `Local\` por si só também não protege outras sessões Windows.
4. Testes locais isolados passaram: barreira concorrente (3), readiness, pacote/dependências (7), guardian/autostart (5), scheduler HTTP/MES (12 sob permissão local), preflight WAL/manifest, simulação de rollback e testes Node para inventário/guardas (3). O runner Windows do novo HEAD e outros gates oficiais ainda precisam ser consultados após publicar o checkpoint GitHub.

**Próximos gates reais**: integrar um coordenador externo confiável com journal e identificação/controle do guardian instalado; provar bloqueio simultâneo de outbox e sync Firebase (inclusive abas abertas), jobs, monitor e requisições; obter backup completo + restore ACL e dados auxiliares; health/rollback Windows; e só então piloto supervisionado. Sem essas evidências, PR #64 fica draft, sem merge/release e sem botão de atualização do motor.

## 17. Continuidade C2 e alinhamento exclusivo ao GitHub (22/10/2026)

**Não houve comando novo na fábrica.** O último inventário válido continua sendo §14; o agente anterior permanece a última instalação observada na porta 8765. O ZIP 0.5.39 foi baixado e extraído, nunca aplicado. PR #64 continua draft, e toda implementação nova fica isolada na branch até gates suficientes.

**Mudanças deste bloco, sujeitas ao CI do novo HEAD:**

1. `backup_operational_tree` amplia o backup SQLite WAL/config/token para incluir os arquivos de operação sob `ames-agent/data` (imports, exports, checkpoints, históricos), rejeitando symlinks/junctions, limites excedidos, destino existente, mudanças detectadas na origem e backup alterado. `verify_operational_backup` confere a cópia independentemente da fonte e testa `quick_check` SQLite. Testes de fixture incluem tamper, restauração e preservação de dados de origem. **A fila Firebase/IndexedDB do navegador NÃO é abrangida e pode estar em várias abas.** O resultado segue `update_authorized=false`.
2. Confirmado que a execução antiga `Published preview smoke` do Quality Gate consultava um Netlify não oficial e recebia HTTP 401. Ela foi retirada da PR workflow, **sem remover** os três testes internos de qualidade. GitHub Pages continua como a única hospedagem oficial; `publish-github-pages.yml` já valida o commit exato de GitHub Release e home/index/bootstrap HTTP 200 depois da publicação de `main`. Novo teste de contrato impede a reintrodução desse gate Netlify na PR.
3. Fonte da verdade continua GitHub `main`, Releases, Actions, Issues e este handoff. Nenhuma atualização de produção nem merge automático é autorizado. Não confundir a cobertura de `ames-agent/data` com a prova de todos os arquivos externos, ACL real da fábrica, quiescência Firestore, troca de processo ou rollback de produção.

**Próxima implementação segura:** atestação de quiescência do navegador e outbox multiaba, guardian antigo e coordenação externa durável; em seguida, backup/restauração integral incluindo arquivos externos aprovados, swap allowlisted, health e rollback Windows. Nenhum CLEAN deve ser reinstalado manualmente enquanto esses gates estiverem abertos.

## 18. B3 — inventário browser da outbox sem autorização de instalação (22/10/2026)

**Ponto de partida remoto:** PR #64 draft sobre a `main` 0.5.39, último checkpoint SHA `583e3e90006b4dea239387be269e2bd4a8ba7761`; [Central Quality Gate #39836598164](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39836598164) com os 3 jobs internos SUCCESS. Evidência em [Issue #57, comentário 6348968380](https://github.com/pedrokam700/Central-de-Controle-/issues/57#issuecomment-6348968380). A CI A-MES Operational History desse SHA não foi revalidada por consulta; não declarar sua aprovação sem registro.

**Novo incremento em desenvolvimento (validar SHA remoto após publicar):**

1. `ames/sync.mjs`: `indexedQueue().countAll()` usa apenas `readonly`/`count()` na store `pending` de `central-ames-outbox-v2`. Examina contagem global da origem/perfil, não apenas o UID da sessão atual; mantém schema/version do IndexedDB e não extrai os payloads.
2. `createMesSync().inspectUpdateReadiness()`: consulta informativa com contadores de uploads, capturas e leituras que permanecem visíveis durante logout até a promise realmente concluir. Trata IDB ausente/erro como **desconhecido**, mudança de sessão durante leitura como observação instável. Nunca solicita envio nem modifica a fila.
3. A resposta **sempre** tem `update_authorized=false`, `exclusive_lease_held=false`, `multi_tab_attested=false`, `other_browser_profiles_attested=false`. Outras abas/perfis, filas em trânsito, guardian físico antigo e exclusão durável ainda não são atestados. Nenhum código executável Windows recebe permissão para instalar motor.
4. `scripts/ames-issue57-browser-outbox.test.mjs` testa isolamento, sessão antiga, upload/captura em voo, bloqueio por erro, mudança de geração. `scripts/ames-sync-reload.browser.mjs` estende prova em IndexedDB Chromium real; CI de `A-MES Operational History` inclui o novo contrato.

**Não houve novos comandos físicos:** o inventário do §14 continua válido, 0.5.39 apenas baixada/extraída, agente antigo preservado na porta 8765, source_id/token/SQLite/configuração intocados. GitHub-only; sem Netlify, sem merge/release/Pages até a política segura de transação estar comprovada.

## 19. C3a — diário persistente de manutenção em teste, NÃO motor físico (22/10/2026)

**Base anterior confirmada:** PR #64 em draft, último HEAD `8e31de8b1f43b39460f212bbec4fdc67478c8046`. [Central Quality Gate #39839133162](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39839133162) 3/3 SUCCESS no SHA. [Issue #57 comentário 6349300895](https://github.com/pedrokam700/Central-de-Controle-/issues/57#issuecomment-6349300895). Este adendo gerará SHA diferente; revalidar no GitHub antes de atribuir GREEN.

**Novo bloco C3a experimental:**

1. `tools/ames-workstation/issue57_maintenance_ledger.py`: arquivo de reserva `claim.lock` criado com `O_EXCL`, diário `transaction.json` de escrita durável e transições com trava extra + substituição atômica, estado/revisão/UUID estritos. O contrato do guardian **novo** já procura `.ames-update/transaction.json` na mesma raiz. **Somente fixtures** com marcador especial sob diretório temporário dedicado; nunca aceitar pasta CLEAN.
2. Falha de energia simulada entre trava/diário ou em cada lado da transição deixa a reserva persistida e força revisão, sem limpeza automática. Arquivos desconhecidos, symlinks, identidade/tipo/fase divergentes, segunda tentativa, revisão incorreta e arquivo incompleto recusados. Sentinelas de dados preservados. Nenhuma função de stop/start, alteração SQLite/token/source_id, swap de binário, download, rede MES ou sincronização.
3. `scripts/agent-issue57-maintenance-ledger.test.py`: provas isoladas e subprocesso independente, incluídas nos workflows `Central Quality Gate` e `A-MES Operational History` (Ubuntu + Windows).

**Muito importante:** o código novo ainda NÃO está instalado no posto. O guardian físico antigo pode reiniciar mesmo enquanto um atualizador escreveria o diário; `Local\` mutex não equivale a bloqueio entre sessões. Também não há drenagem autenticada do agente vivo ou da fila de todas as abas/perfis. Este ledger ainda não é o coordenador externo de produção; `update_authorized=false` em todos os estados. Não oferecer instalação 0.5.39 por cópia manual, não executar script de teste no posto.

**Próxima implementação**: contrato de atestação e exclusividade entre os processos reais (guardião instalado, processo PID + agente, navegador sincronização), provar espera por `inflight_mutations==0`, rollback durável real e backup/ACL. Só após CI+testes Windows completos planejar piloto supervisionado G1–G6.

## 20. B1b — descoberta não invasiva de relançadores Windows (22/10/2026; implementação em PR draft)

**Origem remota revalidada antes deste incremento:** `main` e release `ames-v0.5.39-multipc-20261022` no SHA `b283b1764432f5d90486d38a7553b30542a5c118`. PR #64 OPEN/DRAFT sem conflito contra main, no HEAD `ddfb982b0a7f8688041dd8e98c0dbb00a04e87e7`; Issue #57 OPEN. Central Quality Gate do checkpoint anterior: [run 39841463697](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39841463697) 3/3 SUCCESS. **Não herdar esse GREEN para a nova implementação**: consultar Actions do SHA efetivamente publicado.

1. `tools/ames-workstation/INVENTARIAR_GUARDIANS_READONLY.ps1` observa processos candidatos, HKCU/HKLM Run e RunOnce, tarefas agendadas, serviços e entradas de Inicializar do Windows. Não inicia, encerra, renomeia, altera, baixa nem instala nada. Não examina conteúdo SQLite/token/configuração; não imprime `CommandLine`, comandos de serviço, ações/argumentos de tarefas nem valores do Registro.
2. Classificação isolada em `ISSUE57_GUARDIAN_SIGNALS.ps1` detecta nomes explícitos de guardian, launcher e agente canônico e registra sinais de autostart conflitante. Script de teste Windows usa fixtures sintéticas e verifica o scanner somente leitura no runner descartável do GitHub Actions. Teste Node impede regressão para operações mutantes e autorização indevida.
3. Mesmo uma varredura sem erros **NÃO prova exclusividade global**: outras contas/sessões, mecanismo legado desconhecido, argumentos inacessíveis e cooperação real do guardian físico continuam não comprovados. O scanner mantém `updater_eligible=false`, `all_sessions_attested=false`, `installed_guardian_cooperation_attested=false` e `exclusive_maintenance_lease_held=false` invariavelmente.
4. **Fábrica inalterada** desde o §14: 0.5.39 baixada/extraída, não instalada; Python 0.5.23/instalação antiga continua a última observação; nenhum PowerShell novo solicitado e nenhum dado de produção, token, SQLite ou `source_id` tocado. Este bloco NÃO autoriza parada/troca nem fecha a Issue #57.

**Próximo gate para o atualizador executável**: identidade do guardian instalado e parada/retorno coordenados de maneira autenticada e durável entre sessões, drenagem real de jobs e outbox de todas as abas/perfis, cobertura de backup operacional externo+ACL, allowlist de troca e rollback Windows sob queda de energia. Sem autorização de instalação até todas as provas e piloto supervisionado.

## 21. C3b — guardian Global entre processos (22/10/2026; implementação pendente de CI do SHA novo)

**Retomada remota confirmada:** a `main` e a release oficial 0.5.39 continuam em `b283b1764432f5d90486d38a7553b30542a5c118`; PR #64 OPEN/DRAFT, mergeable, HEAD anterior `8728b1404a5c6e8667a080b2417d38fca2811b3a`. Esse HEAD teve [Central Quality Gate #39843461296](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39843461296) 3/3 SUCCESS e [A-MES Operational History #39843453219](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39843453219) 4/4 SUCCESS. **São evidências do checkpoint B1b, não do código abaixo.**

1. **Mudança apenas no guardian NOVO ainda não instalado** (`tools/ames-workstation/KEEP_AGENT_RUNNING.ps1`): mutex de instância `Global\CentralAMES.OperatorGuardian.8765`; trava crítica `Global\CentralAMES.UpdateTransaction.8765` mantida durante a execução do launcher. O bootstrap canônico consolidado não foi modificado.
2. Sob a trava Global, o guardian agora bloqueia automaticamente se `.ames-update` não puder ser inspecionada, for junction/reparse, não for diretório ou contiver **qualquer** entrada, inclusive `claim.lock` (antes de `transaction.json`), journal, trava de transição ou material desconhecido. Nunca apaga marcadores nem considera crash recuperação automática. É um protocolo preparatório para um coordenador externo que detenha a MESMA trava Global.
3. Novo teste `scripts/issue57-guardian-global-mutex.windows.test.ps1` exercita dois processos distintos no runner Windows com nome Global aleatório de fixture: o segundo deve ser bloqueado enquanto o primeiro segura a trava e admitido após liberação. Testes de autostart e ledger atualizados. CI do novo SHA ainda exige prova exata.
4. **Riscos não resolvidos:** guardian velho na fábrica continua fora do contrato; outras contas/ACL e sessões Windows reais ainda não foram homologadas; execução **direta** do launcher não passa pela trava desse guardian; navegador/Firestore e jobs não têm lease durável conjunto. Portanto, não há autorização de instalação nem justificativa para executar PowerShell adicional na fábrica.

**Próximo bloco**: coordenador externo com comprovação do guardian **efetivamente instalado**, bloqueio também de invocações diretas, protocolo de drenagem e confirmação multiaba/browser, backup de arquivos externos + ACL restaurável, swap allowlisted e rollback power-loss sob Windows CI. Não mergear a PR draft, não lançar release e não testar motor no posto sem gate completo.

## 22. C2b — ensaio integrado de restauração operacional (22/10/2026; novo incremento pendente de CI)

**Ponto de retomada remoto:** `main`/release 0.5.39 ainda em `b283b1764432f5d90486d38a7553b30542a5c118`; PR #64 OPEN/DRAFT e sem conflito no HEAD anterior `5545d332cc94f36aa2b76a5da39f0577f8430aa6`. Nesse SHA, [A-MES Operational History #39844898441](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39844898441) e [Central Quality Gate #39844905608](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39844905608) concluíram SUCCESS. Essas evidências **não se transferem** ao novo SHA ainda não publicado.

1. Ampliado `tools/ames-workstation/issue57_update_preflight.py`, não criado um instalador paralelo: `rehearse_operational_restore()` recebe somente o backup privado verificado (não permite destino livre). Cria uma pasta temporária isolada com permissões privadas antes de gravar, reconstrói `ames-agent/data` com importações, exportações/checkpoints, cópia consistente do SQLite, `config.json` e token; reabre o SQLite read-only, executa `quick_check`, confirma bytes/digests e valida novamente o backup de origem antes de descartar a árvore temporária.
2. Teste isolado existente `scripts/agent-issue57-update-preflight.test.py` agora exerce restauração completa, alteração maliciosa do backup, recusa de reutilização, limites e duas interrupções simuladas em limites distintos. A CI principal passa a executar esse contrato no Quality Gate, além do Windows A-MES Operational History já existente. Nos ensaios, nenhuma pasta ativa ou arquivo de produção é modificado.
3. A saída continua explicitamente `update_authorized=false`, `external_browser_outbox_attested=false`, `exclusive_maintenance_lease_held=false`. Não comprova dados externos ao agente, direitos ACL reais do posto, guardian instalado, identidade do PID, jobs/AT inativos, swap de binários ou rollback real. Não é procedimento a oferecer ao operador da fábrica.
4. **Status físico intocado:** antigo agente da última prova §14 na porta 8765; 0.5.39 baixada/extraída e não instalada; SQLite/token/config/source_id sem alterações; nenhum novo comando PowerShell solicitado. GitHub permanece fonte oficial e Netlify não participa da validação.

**Próximo gate**: integrar o coordenador de transação entre todos os atores reais e ensaiar journal/swap/rollback allowlisted no Windows com ACL e crash. Somente após evidências completas e supervisão presencial poderá haver teste de atualização do motor na fábrica.

## 23. C3c — identidade de slots e recuperação integrada (22/10/2026; verificar CI do novo SHA)

**Retomada revalidada:** `main` e release 0.5.39 em `b283b1764432f5d90486d38a7553b30542a5c118`, PR #64 OPEN/DRAFT e sem conflito antes deste incremento. HEAD remoto anterior `211eba255a66e56b67315fcc6178fa444dcd5c5e`: [Central Quality Gate #39846782063](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39846782063) 3/3 SUCCESS e [A-MES Operational History #39846768964](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39846768964) 4/4 SUCCESS, incluindo Windows. São resultados do SHA **anterior**, não do novo código.

1. `scripts/issue57_transaction_simulation.py` continua estritamente **simulação descartável**: exige marcador explícito sob diretório temporário de teste e recusa raiz CLEAN. O journal experimental passa a registrar UUID e SHA-256 do slot anterior e candidato, com verificação completa de identidade antes de promover, confirmar ou recuperar. Recusa symlinks/junctions, conteúdo não regular, colisões de nome case-insensitive, arquivo excedente e journal divergente.
2. A simulação protege a versão anterior contra restauração às cegas se os bytes não coincidirem e retém a versão candidata em quarentena sem apagar dados. Suporta recuperação idempotente após **nova interrupção durante o próprio rollback**, com testagem de tamper do slot/journal. `fsync` do diretório é exercido onde o SO permite; **não constitui prova de durabilidade de renomeação sob Windows/NTFS**.
3. `scripts/agent-issue57-integrated-recovery.test.py` reúne staging allowlisted e verificado, backup SQLite/config/token/dados, ensaio de restauração, ledger persistente e recuperação de slots em **uma fixture sintética**. Em quatro pontos de queda, health negativo e positivo, confere SQLite, token e export imutáveis, marcador de manutenção persistente e `update_authorized=false`. Os workflows `Central Quality Gate` e `A-MES Operational History` (Linux e Windows) executam ambos os contratos de troca/integração.
4. Isso **não cria nem libera** `update_candidate.py`, não identifica/para/reinicia o PID físico, não prova exclusividade entre guardian antigo, launcher direto e abas/perfis Edge, nem cobre ACL/arquivos externos. Continuam pendentes coordenador autenticado de produção, negociação de inatividade, backup abrangente, crash/rollback real sob Windows e piloto G1–G6. **Não instalar** a 0.5.39 sobre a CLEAN da fábrica.

**Estado físico preservado (última evidência §14):** instalação anterior ativa na porta 8765; ZIP 0.5.39 íntegro e extraído separadamente, não instalado. Sem novos comandos PowerShell; nenhum SQLite, `source_id`, token, configuração ou dado fabril alterado. Somente branch draft, sem merge/release/Pages; GitHub é a fonte da verdade, não Netlify.

## 24. B1c — bloqueadores explícitos do guardian/launcher, somente leitura (22/10/2026)

**Origem oficial revalidada:** PR #64 OPEN/DRAFT e mergeable, SHA anterior `2c0fe4d58c085e3af684ab63a820fe667d2c8dfe`; `main`/release 0.5.39 permanecem em `b283b1764432f5d90486d38a7553b30542a5c118`. Nesse SHA, [A-MES Operational History #39849120751](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39849120751) 4/4 SUCCESS, incluindo Windows; [Central Quality Gate #39849131718](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39849131718) 3/3 SUCCESS no attempt 2. A primeira tentativa do job de navegador foi cancelada por timeout durante download do mirror Ubuntu, e o mesmo job foi repetido sem mudança de código. **Não estender automaticamente esses resultados ao SHA posterior deste incremento.**

1. O classificador puro `ISSUE57_GUARDIAN_SIGNALS.ps1` ganhou `Get-Issue57CoordinationBlockers`, consumindo apenas observações já sanitarizadas e status das fontes consultadas. Enumera especificamente guardian observado, launcher direto (processo ou registro), agente ativo, registro desconhecido, atalho e linha de comando inacessível, além dos **bloqueadores permanentes**: guardian instalado sem cooperação comprovada, launcher direto sem fence e outras sessões Windows sem atestação.
2. `INVENTARIAR_GUARDIANS_READONLY.ps1` expõe `coordination_blockers` e `direct_launcher_fenced=false`, sem emitir argumentos, caminhos dos comandos, serviços/registro, token, configuração ou `source_id`. Inventário vazio continua **incapaz** de atestar exclusividade. Esses campos servem para diagnóstico e planejamento; `updater_eligible=false`, `installed_guardian_cooperation_attested=false` e `exclusive_maintenance_lease_held=false` são invariantes.
3. Testes sintéticos Windows verificam launcher observado, ausência de observações, processo ilegível, fonte incompleta e categoria inesperada; contrato Node verifica que o scanner permanece só leitura. Não modificar `START_AGENT_CANONICAL.ps1`, o bootstrap canônico ou o guardian físico; não reiniciar/encerrar nenhum agente. CI Windows do novo SHA deve ser confirmado antes de classificar B1c GREEN.

**Gates remanescentes:** identificar/atestar *efetivamente* os relançadores do posto e coordenar uma exclusão durável que também impeça chamada direta do bootstrap sem violar seu contrato existente; drenagem de jobs/monitor e outbox Firestore multiaba/perfil; ACL/backups externos; journal/rollback físico NTFS; piloto G1–G6. Sem cooperação comprovada do guardian legado, a atualização continua vetada, independentemente de quantos scanners retornem `checked=true`. Instalação da fábrica e 0.5.39 extraída continuam intocadas (§14); GitHub é a única fonte oficial.

## 25. C2c — atestação independente da ACL de backup privado em Windows CI (22/10/2026)

**Origem revalidada:** PR #64 continua OPEN/DRAFT, último HEAD remoto `f9052d8de528df05aea0c5eb180ea134130b8579`; [A-MES Operational History #39861384568](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39861384568) **4/4 SUCCESS** e [Central Quality Gate #39861391760](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39861391760) **3/3 SUCCESS**, incluindo Windows e interface. `main`/release oficial 0.5.39 continuam no SHA `b283b1764432f5d90486d38a7553b30542a5c118`. Estes resultados são do **HEAD anterior**, não do código abaixo.

1. **Novo verificador somente leitura** `tools/ames-workstation/VERIFY_PRIVATE_BACKUP_ACL.ps1`: percorre o backup privado e rejeita DACL raiz que ainda herda permissões, junction/reparse, principal de acesso permitido além do usuário atual/SYSTEM/Administrators, principal não resolvido ou ausência de ACE do usuário. Não lê SQLite, conteúdo do token nem configuração; não emite nomes de arquivos/caminhos/dados. A resposta declara `physical_acl_attested=false` e `update_authorized=false`, mesmo após exame bem-sucedido.
2. **Nova prova Windows descartável** `scripts/issue57-private-backup-acl.windows.test.ps1`, executada exclusivamente em `GITHUB_ACTIONS` + `RUNNER_OS=Windows`: cria SQLite/config/token/export inteiramente sintéticos sob `RUNNER_TEMP`, usa a função real `backup_operational_tree`, valida ACL independentemente, injeta permissão de leitura ampla em arquivo *de teste* e exige rejeição. O script não aceita diretório fornecido pelo usuário, não consulta o posto e remove somente sua fixture única.
3. O teste entrou no job Windows existente `A-MES Operational History` com parser PowerShell antes de executar; contrato Node confere que o verificador é apenas observacional. **Não modifica** a criação de backup real, o launcher/guardian ou o bootstrap; não habilita `update_candidate.py` nem promove binários. A ACL de qualquer usuário real e os arquivos externos ao `ames-agent/data` **ainda precisam ser homologados fisicamente**.

**Próximos gates**: CI do novo SHA exato, cooperação comprovada do guardian realmente instalado e bloqueio de launcher direto, exclusividade/drain multiatores, backup de todos os arquivos externos com ACL real, crash/rollback NTFS e piloto G1–G6. Fábrica continua no estado do §14, ZIP 0.5.39 baixado/extraído, não instalado; sem comandos novos ao operador, sem alterações SQLite/token/`source_id` e sem merge/release/Pages. GitHub é a fonte de verdade, não Netlify.

## 26. Correção da falsa conclusão do gate de fixtures Windows (22/10/2026)

**Achado concreto no SHA `b8b0e31314b337b72301faa5fa5ec0be3d0226ea`:** os workflows [A-MES Operational History #39865639896](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39865639896) (4/4 SUCCESS) e [Central Quality Gate #39865646025](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39865646025) (3/3 SUCCESS) terminaram verdes. Porém, os logs do job `reading-windows` revelaram que **somente o teste do scanner/guardian emitiu confirmação; os testes Global mutex e ACL não chegaram ao fim**. A causa é `if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}` após chamar scripts PowerShell: quando `$LASTEXITCODE=$null`, essa comparação é verdadeira e `exit $null` pode encerrar o step com código zero. Logo, **o SUCCESS desse SHA não é prova válida para C2c nem para o mutex entre processos**.

**Correção na mesma PR #64, ainda sem homologação do novo SHA:** removida essa condição após os scripts `.ps1` e exigidas três marcas distintas de término (`guardian_fixture_not_completed`, `mutex_fixture_not_completed`, `private_acl_fixture_not_completed` quando ausentes). O step só emite `Issue57 Windows fixtures: guardian + mutex + backup ACL end-to-end GREEN` depois das três fixtures concluídas, propagando erros PowerShell. Acrescentado teste Node de regressão contra o falso GREEN. Validar **log detalhado e SHA exato** da próxima execução de CI antes de atualizar este status.

**Isolamento preservado:** nada disso reinicia ou atualiza o agente do posto. `main`/release 0.5.39 permanecem em `b283b1764432f5d90486d38a7553b30542a5c118`, PR #64 draft, fábrica do §14 intocada, `update_authorized=false`. Não atribuir prova de ACL da fábrica a uma fixture do runner.

**Resultado do gate corrigido no SHA `12e696bd9780591c4d7cb3cf03ebcadf4bd04f4e`:** [A-MES Operational History #39866300145](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39866300145) **RED**, especificamente `reading-windows`: a primeira verificação ACL sintética lançou `backup_acl_verification_failed`. Os outros três jobs A-MES e os três jobs do [Central Quality Gate #39866305498](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39866305498) passaram. O erro foi sanitizado corretamente, mas ocultou a categoria da recusa. Próximo checkpoint acrescenta somente códigos de motivo explícitos, predefinidos e seguros (nunca path, identidade, conta, conteúdo ou erro nativo) ao verificador. É uma etapa de diagnóstico; **não declarar C2c GREEN** antes da nova prova Windows real.

**Diagnóstico intermediário SHA `36834c10e2abc222d18a06ddd8dd3faa15e3e89b`:** [A-MES Operational History #39866633652](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39866633652) confirmou a categoria `backup_acl_has_untrusted_allow_principal`, ou seja, há ACE `Allow` além do usuário/SYSTEM/Administrators mesmo antes da injeção adversarial. O restante do relatório foi ocultado intencionalmente. A próxima execução classificará somente *raiz ou descendente* e principal amplo comum por categoria fixa — sem revelar a conta, SID arbitrário, caminho ou arquivo. **Não relaxar a lista de ACEs aceitas para obter CI verde.**

## 27. C2d — DACL explicitamente privada na criação de backup Windows (22/10/2026; CI do novo SHA pendente)

**Evidência decisiva:** [A-MES Operational History #39866985034](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39866985034) no SHA `f2c46f6ddf3b56858fe9069c27c6e63a30fadf9f` expôs `backup_acl_verification_failed:backup_acl_untrusted_root_other`. Assim, um principal explicitamente autorizado *na raiz* da pasta privada, fora da lista restrita, sobreviveu ao `icacls /inheritance:r` do Windows; a segunda etapa adversarial **nem precisou ocorrer** para o gate falhar. Não divulgar SID ou nome de conta do runner; não confiar só na remoção das ACEs herdadas.

**Correção limitada à criação de diretório de backup NOVO**, `issue57_update_preflight.py`: depois de bloquear herança via `icacls`, uma chamada PowerShell isolada substitui todas as ACEs explícitas e herdadas por uma regra FullControl somente do SID do usuário executor com herança para subpastas/arquivos. Reabre e verifica que a DACL está protegida, nenhum principal diferente de usuário/SYSTEM/Administrators recebeu `Allow` e a conta atual está explicitamente presente. Toda execução ocorre **antes** de copiar SQLite/token/configuração para aquele diretório recém-criado. Nunca altera ACL de diretório preexistente: `exist_ok=False`; destino de produção/retorno físico não faz parte deste teste. Qualquer falha é fatal, com erro nativo suprimido.

**Gate seguinte:** CI Windows precisa comprovar que o backup sintético passa pela ACL privada inicial **e** que uma ACE ampla injetada deliberadamente em arquivo de fixture é recusada. O teste continua com `update_authorized=false`, `physical_acl_attested=false`. Sem essa prova, o novo SHA não é GREEN; guardian físico, backup externo, sincronização e atualização 0.5.39 continuam bloqueados. `main`/release e estado de fábrica §14 não mudaram.

**Primeira regressão observada no SHA `68c01f7d97f44bb3cf4c736ec51bda54a2208565`:** [A-MES Operational History #39867437876](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39867437876) falhou no passo de fixação da ACL dentro do PowerShell, ainda antes da nova inspeção independente. O erro nativo foi corretamente suprimido, mas o `CalledProcessError` de Python exibiu o script fixo sem indicar sua fase. O próximo checkpoint troca essa saída por um código de etapa numérico predeterminado (`20`–`90`), nunca path, SID, conta, token ou erro nativo. **Isso é diagnóstico de CI, não correção comprovada nem autorização física.**

**Resultado da etapa numérica:** [A-MES Operational History #39867708423](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39867708423), SHA `8325e45d7e2ff1e3cf13c6136a0fda004ebc39ff`, retornou **`windows_private_backup_acl_stage_30`** — falha no `Get-Acl` depois de `icacls /inheritance:r`, antes de tentar `Set-Acl`. Novo ajuste remove essa chamada preliminar de `icacls` que pode retirar acesso ao descritor e ainda preserva ACE explícita ampla; a rotina PowerShell agora inspeciona a pasta vazia recém-criada **antes** de qualquer alteração e substitui a DACL em uma única operação verificada. O teste Windows do SHA seguinte é obrigatório. Nada executado na fábrica.

**Nova evidência SHA `b1b28100f44aed862ca67fb456ffcb92b51ddd3b`:** [A-MES Operational History #39868162762](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39868162762) também retornou etapa `30`, mesmo sem `icacls`. Logo, não atribuir causalidade definitiva ao comando de pré-herança; a chamada de `Get-Acl` no subprocesso Windows PowerShell ainda é o bloqueio. Próximo ensaio distingue exclusivamente a **categoria** nativa (`ObjectNotFound`, `PermissionDenied`, `InvalidArgument`, etc.) por códigos numéricos, sem revelar a mensagem, usuário, SID ou caminho. A origem só pode ser corrigida após evidência do runner. **C2d segue RED**.

**Diagnóstico de categoria SHA `fed820928cffdc08f1f8c282e5c4cb1a08b3b6d5`:** [A-MES Operational History #39868430011](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39868430011) retornou `windows_private_backup_acl_stage_31` = **`ObjectNotFound` ao executar `Get-Acl`** no subprocesso Windows PowerShell 5.1. Isso não prova se o módulo/cmdlet ou o objeto foi o alvo ausente; não assumir uma causa além dessa categoria. O novo código substitui `Get-Acl`/`Set-Acl` por `System.IO.Directory.GetAccessControl`/`SetAccessControl` (.NET Framework no Windows PowerShell 5.1), preservando o isolamento de erros, a inspeção obrigatória e a ausência de escrita de segredos até a configuração passar. **Ainda requer CI Windows no novo SHA.**

## 28. C2d comprovado no Windows CI — sem autorização de instalação (22/10/2026)

**Checkpoint técnico efetivamente GREEN, SHA `8d1ec0c5da8c4eacb1113fe4c58fa9b04446c901`:** [A-MES Operational History #39868686639](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39868686639) **4/4 SUCCESS**, incluindo `reading-windows` job `120137320910`; [Central Quality Gate #39868691742](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39868691742) **3/3 SUCCESS**. O log Windows contém a marca terminal `Issue57 Windows fixtures: guardian + mutex + backup ACL end-to-end GREEN`; o workflow só a imprime após comparar três provas distintas, não consultando `$LASTEXITCODE` nulo dos scripts PowerShell. O teste ACL criou backup sintético com DACL privada e rejeitou a ACE de leitura ampla injetada em arquivo descartável.

1. A criação de backup novo no Windows agora usa `System.IO.Directory.GetAccessControl`/`SetAccessControl` do .NET Framework, estabelecendo a DACL explicitamente antes da primeira cópia de SQLite/token/configuração. O verificador *independente*, somente leitura, recusa ACE ampla e exposição de nomes/caminhos. Falha em qualquer fase continua fatal e sanitizada.
2. **Escopo exato**: esta é prova em runner Windows efêmero com arquivos sintéticos, não verificação da instalação da fábrica, ACL de contas reais, arquivos externos e IndexedDB/browser. `physical_acl_attested=false`, `browser_outbox_attested=false`, `exclusive_lease_held=false`, `update_authorized=false`; PR #64 continua **OPEN/DRAFT** e Issue #57 **OPEN**. A `main`/release 0.5.39 seguem no SHA `b283b1764432f5d90486d38a7553b30542a5c118`.
3. **Física continua exatamente como §14**: 0.5.39 foi baixada/verificada e extraída, mas NÃO instalada; agente legado preservado em 8765; nenhuma nova instrução de PowerShell ao operador; nenhum processo, SQLite, token, config ou `source_id` da fábrica alterado.

**Pendências para um atualizador de produção:** lease persistente com guardian **realmente instalado** e bootstrap direto, drain verificável de jobs e outbox multiaba/perfil e sync Firebase, inventário externo completo com privacidade ACL, swap NTFS sob pane elétrica com rollback real e piloto físico supervisionado G1–G6. **Não mergear, publicar novo pacote de produção nem autorizar instalação nesta fase.**

## 29. B2d — observação de inatividade com revisão monotônica (22/10/2026; novo SHA pendente de CI)

**Base remota comprovada:** PR #64 OPEN/DRAFT no SHA `83baa39daa7f1d0c3cda847daa87077a21b9266d`, sem conflito com a `main`/release 0.5.39 `b283b1764432f5d90486d38a7553b30542a5c118`. [A-MES Operational History #39869025279](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39869025279) **4/4 SUCCESS**, [Central Quality Gate #39869030753](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39869030753) **3/3 SUCCESS**, incluindo a conclusão Windows das fixtures guardian/mutex/ACL. Este GREEN é da base anterior; revalidar o SHA publicado após o incremento abaixo.

**Lacuna reproduzida no contrato de inatividade:** uma requisição poderia iniciar e terminar durante o próprio `observe()`, deixando contagens finais zeradas. A versão anterior não detectava esse intervalo e podia exibir `idle_observed=true` numa observação que não tinha sido estável. Isso **não** concedia autorização, mas é um diagnóstico enganoso para a futura coordenação.

1. `MaintenanceAdmission` agora fornece `admission_revision` monotônica: incrementa ao admitir/concluir uma mutação externa e ao iniciar/liberar drain. Mutações aninhadas seguem dentro da admissão externa; tentativas bloqueadas não alteram a revisão. A barreira continua apenas in-process, sem endpoint para começar drain e sem persistência/lease externo.
2. `update_readiness.observe` consulta revisão da barreira **antes** da primeira leitura do scheduler e novamente depois do SQLite read-only, jobs de memória e segunda leitura de scheduler. Copia o snapshot inicial para evitar que um dicionário mutável esconda diferenças; se revisão ou scheduler mudarem no intervalo, devolve `observation_stable=false`, `idle_observed=false` e razões sanitarizadas (`admission_changed_during_observation` / `scheduler_changed_during_observation`). Contratos ausentes ou inválidos continuam fail-closed.
3. Novas fixtures determinísticas: scheduler que muda o mesmo dicionário, mutação que começa/termina durante a consulta apesar de contagens finais zero, drain que começa/termina no intervalo, revisão legada ausente e incrementos de revisão sob concorrência/aninhamento. Não há rede MES, navegador, Firebase, porta 8765 nem SQLite de produção nos testes.

**Limite crucial:** `observation_stable=true` ainda NÃO é exclusão nem atestação global. O scheduler pode mudar depois da última leitura; tarefas não cercadas, guardian físico legado, outra sessão Windows e outbox multiaba/perfil continuam fora do protocolo. `update_authorized=false` e `maintenance_lease=false` são invariantes. Nenhum novo comando ao usuário da fábrica; o estado físico do §14 permanece intacto, 0.5.39 não instalada. **Sem merge, release ou Pages até homologação completa.**

## 30. B2e — simulação de lease com dois mutexes + claim (22/10/2026; CI novo SHA pendente)

**Base revalidada:** PR #64 OPEN/DRAFT, sem conflito, HEAD remoto `3635f6c73d6acf8b503f87762221bc9e811a696c`; [A-MES Operational History #39870846582](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39870846582) **4/4 SUCCESS** e [Central Quality Gate #39870853865](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39870853865) **3/3 SUCCESS**; esses resultados se referem ao SHA anterior. `main` e release oficial 0.5.39 ainda em `b283b1764432f5d90486d38a7553b30542a5c118` e PR #65 preservada. Issue #57 checkpoint anterior [6353489527](https://github.com/pedrokam700/Central-de-Controle-/issues/57#issuecomment-6353489527).

1. **Lacuna comprovada por leitura do código:** guardian novo usa `Global\\CentralAMES.UpdateTransaction.8765` ao invocar o launcher, enquanto o launcher direto usa `Global\\CentralAMES.CanonicalBootstrap.8765` e **não** verifica `.ames-update/claim.lock`. Sem segurar as duas exclusões em ordem fixa e cooperar com um marcador durável, um launcher independente pode disputar a atualização, sobretudo após queda/recovery. Não mexer no bootstrap consolidado sem um protocolo completo que evite deadlock com o guardian.
2. **Prova B2e implementada em código de teste:** uma fixture PowerShell exclusiva de GitHub Actions Windows cria dois mutexes `Global` de nomes aleatórios e uma raiz única em `RUNNER_TEMP`; segura ambas exclusões, exige que processos filhos distintos fiquem bloqueados, persiste `claim.lock` sintético ainda sob as duas, libera as travas e exige que processos cooperativos continuem bloqueados pelo marcador. Não há acesso à porta 8765, CLEAN, config/token, serviço, registro ou dados de produção. A fixture tem seu próprio magic marker de segurança e `update_authorized=false`.
3. **CI:** `.github/workflows/ames-operational-history.yml` passa a validar sintaxe e resultado final explícito da nova fixture; `scripts/ames-windows-readonly-inventory.test.mjs` inspeciona sua inclusão, os nomes distintos dos reais e a ausência de short-circuit por `$LASTEXITCODE`. Teste Node local PASS, mas **ainda falta comprovação do SHA publicado em Windows CI**.
4. **Não confundir prova de coordenação com implementação em produção:** o agente não concede lease externo, a interface do navegador e a fila Firestore multiaba/perfil não entram no lock, e o guardian da fábrica continua sendo o antigo. `update_authorized=false`, `exclusive_maintenance_lease_held=false`; sem novo PowerShell no posto, parada/reinício, CLEAN, SQLite, token, `source_id`, merge/release/Pages. Após CI, ainda restam integração real do coordenador e launcher, recuperação de journal, backup completo/ACL física, staging+rollback NTFS e piloto supervisionado G1–G6.

## 31. B2f — recusa antecipada no launcher direto (22/10/2026; CI do novo SHA pendente)

**Estado remoto de referência:** PR #64 OPEN/DRAFT, HEAD `f6ba651aab5efa0720cf1e48142cedb6ccd20212`, integração limpa com `main` `b283b1764432f5d90486d38a7553b30542a5c118`; release oficial 0.5.39 e PR #65 preservadas. No SHA anterior, [A-MES Operational History #39872240723](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39872240723) 4/4 SUCCESS, com evidência Windows da prova dual-lock; [Central Quality Gate #39872246185](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39872246185) 3/3 SUCCESS. **Não atribuir esses GREEN ao SHA posterior desta seção.**

1. **Correção mínima no launcher da branch:** `START_AGENT_CANONICAL.ps1` mantém fluxo de bootstrap já consolidado, porém invoca `Assert-NoPendingUpdateClaim $root` sob `CanonicalBootstrap` antes de ler estado anterior e muito antes de `Stop-AgentOn8765`/`Start-OwnedAgent`. A função verifica exclusivamente metadados de `.ames-update` e bloqueia se a pasta não for diretório comum, for reparse point, contiver qualquer arquivo/subdiretório (inclusive `claim.lock` solitário), ou a inspeção falhar. Raiz sem `.ames-update` ou com diretório vazio continua fluxo normal. Na recusa, não grava estado de startup nem toca processo/SQLite/config/token; mensagem não revela caminho/segredo.
2. **Validação isolada:** nova `scripts/issue57-direct-launcher-claim.windows.test.ps1`, exclusiva de runner Windows GitHub Actions e diretório aleatório em `RUNNER_TEMP`, extrai somente a função PowerShell do launcher por AST, sem executar startup. Testa sem pasta, pasta vazia, claim, journal, item inesperado e arquivo no lugar do diretório. Workflow exige saída terminal exata; `ames-windows-readonly-inventory.test.mjs` protege chamada depois do mutex e antes do stop. Testes locais Node, autostart Python e bootstrap Node PASS; **CI Windows do novo SHA ainda obrigatória**.
3. **Limites:** o launcher **instalado na fábrica permanece o legado** (nenhum arquivo do posto alterado), e uma instalação atualizada isoladamente do launcher não constitui lease. O coordenador futuro precisa segurar ambos mutexes no mesmo período, atestar todos supervisores/execuções diretas de Python, drenar jobs e sync/outbox multiaba e prover backup+rollback físico. `update_authorized=false`, PR draft, Issue #57 aberta; sem comando PowerShell físico, parar agente, merge, release, Pages ou Netlify.

**Conectividade de desenvolvimento verificada neste chat:** após reconectar apps, permissão específica do GitHub havia regressado de `Permitir todas as ações` para `Usar meu padrão`, apesar de a conexão funcionar. A pedido expresso do usuário foi restaurada para `Permitir todas as ações` e reconsultada com confirmação. Isso controla somente a integração GitHub; aprovações do ambiente de execução são independentes. Não conceder acesso global irrestrito a outros aplicativos por implicação.

## 32. B2g — barreira de recuperação na inicialização direta do Python (23/10/2026; CI do novo SHA pendente)

**Revalidação remota antes deste incremento:** PR #64 OPEN/DRAFT e mergeable, HEAD `bcfae211e6674cf4cc8be07f9fdb87651fae7d05` sem conflitos, base oficial `main`/release 0.5.39 `b283b1764432f5d90486d38a7553b30542a5c118`. [A-MES Operational History #39874149162](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39874149162) 4/4 SUCCESS e [Central Quality Gate #39874153777](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39874153777) 3/3 SUCCESS no SHA anterior. Registro de encerramento de CI: [Issue #57](https://github.com/pedrokam700/Central-de-Controle-/issues/57#issuecomment-6354014603) e [PR #64](https://github.com/pedrokam700/Central-de-Controle-/pull/64#issuecomment-6354016133). Os GREEN não se transferem automaticamente para o próximo commit.

1. **Lacuna:** o launcher PowerShell e guardian **novos** já recusam journal/claim, mas uma invocação direta dos entrypoints Python poderia ignorar ambos e carregar o agente quando houver recuperação pendente. A fábrica ainda utiliza software antigo e não recebe esta proteção até atualização homologada.
2. **Implementação mínima:** a entrada compartilhada `ames/agent/agent.py` executa um gate antes de importar `mes_scheduler`, tocar SQLite ou ler token/configurações. Para instalação sem `.ames-update` ou com diretório normal vazio, comportamento anterior preservado. Diretório com `claim.lock`, journal, item desconhecido, subpasta, arquivo no lugar do diretório, junction/reparse ou inspeção inválida resulta em `UPDATE_PENDING_OR_UNVERIFIED` sem imprimir caminhos ou segredos. `agent_entry.py` e `agent_hardened_entry.py` importam `agent.py`, logo participam do mesmo gate.
3. **Fixture isolada:** `scripts/agent-issue57-direct-python-recovery.test.py` extrai o prólogo exato do código e executa subprocessos sintéticos em diretórios temporários: ausência, vazio, claim, journal, arquivo inesperado, subdiretório, arquivo no lugar do diretório e symlink quando suportado. Não executa o coletor, o agente real, o A-MES, Windows do operador ou dados de produção. Incluída nos contratos Python Linux e Windows e no Central Quality Gate. Testes locais do gate, admission e bootstrap PASS; **novo HEAD e CI Windows ainda precisam de comprovação após publicação**.
4. **Limitação essencial:** é uma defesa na *nova versão do agente* durante seu próprio startup, não um lease atômico com o coordenador externo. Não abrange Python legado já rodando, processo pré-existente, outras sessões/guardians antigos, navegador/Firestore multiaba, sincronizações ou recovery sob queda elétrica. O coordenador deve manter exclusão durante validação/troca/restart e só limpar marcadores após confirmação de recuperação, com rollback independente. `update_authorized=false`, PR segue draft; sem CLEAN físico, sem novo PowerShell para a fábrica, sem parar o agente, sem merge, release ou Pages.

## 33. B2h — espera limitada por quiescência de escritores admitidos (22/10 BRT; novo SHA ainda sem CI)

**Pré-condição comprovada:** checkpoint B2g no SHA remoto `04db0b4f7f06dc8fd6c1c8e2e1be59dd01833873`; [A-MES Operational History #39876516715](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39876516715) 4/4 SUCCESS, incluindo fixture de Python direto no Windows; [Central Quality Gate #39876521822](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39876521822) 3/3 SUCCESS. PR #64 OPEN/DRAFT, base 0.5.39 `b283b1764432f5d90486d38a7553b30542a5c118`; testes verdes do B2g não validam automaticamente B2h.

1. `MaintenanceAdmission.wait_for_quiescence(lease, timeout_seconds)` observa sob a **mesma Condition** que cerca novas admissões e aguarda até `inflight_mutations=0` com `monotonic()`. Sem lease interno idêntico e ainda ativo, rejeita; timeout negativo, infinito, NaN, booleano ou acima de 60 s também rejeitado. Expiração retorna `False`, mas **mantém o drain ativo** até o titular liberá-lo explicitamente; não aceita novos escritores durante a espera.
2. Fixtures de concorrência verificam espera com trabalho já aceito, timeout mantendo fence, sucesso somente após liberação desse trabalho, token incorreto/revogado e limites de prazo. Testes locais `agent-maintenance-admission.test.py` 7/7, `agent-update-readiness.test.py` PASS e diff sem erros. Contratos existentes já executam ambas as suítes em Linux e Windows Actions.
3. A resposta `True` prova **somente** ausência momentânea de escritores contados nesta instância, sob um lease ainda ativo. Não atesta scheduler não cercado, processos externos, guardian físico legado, multiabas/perfis Edge, fila Firebase/IndexedDB, snapshot SQLite/arquivos externos ou execução autorizada. O código continua sem endpoint externo que chame `begin_drain()`; jamais concede permissão de atualizar motor, parar PID ou instalar ZIP. `update_authorized=false`, PR draft, sem mudanças no computador da fábrica e sem release/Pages/Netlify.

**Próximo gate:** definir e provar o coordenador externo que consegue adquirir e manter os mutexes Windows/claim e solicitar a drenagem *autenticada* deste agente, coordenando a fila de publicação e todos os supervisores. Sem cooperação real do guardian instalado e atestação cross-process/browser, não iniciar staging de produção nem swap/rollback físico.

## 34. B2i — rastreamento de job aceito até o fim da thread (23/10/2026; CI do novo SHA pendente)

**Base remota:** B2h no HEAD `a840e8c70437d20611c28985a4aa2445c2d97859`, [A-MES Operational History #39882581520](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39882581520) 4/4 SUCCESS e [Central Quality Gate #39882585365](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39882585365) 3/3 SUCCESS. Estes resultados validam B2h, NÃO o novo código B2i.

1. **Janela identificada:** `_launch_new_admitted_mes_job` persistia a linha `queued` e iniciava uma thread durante a admissão, mas a contagem de escritores admitidos se encerrava ao retornar a chamada de criação. A thread ainda poderia executar o MES e fazer suas últimas gravações depois disso. Embora o scheduler/SQLite também sejam observados, `wait_for_quiescence()` **não deve** parecer suficiente durante esse intervalo.
2. **Proteção implementada:** `MaintenanceAdmission.reserve_background_work()` só aceita reserva feita dentro de uma mutação já admitida; devolve um ticket de uso único que mantém `inflight_mutations` positivo através da passagem entre thread de criação e worker. O worker chama `finish()` apenas depois de suas gravações de finalização, inclusive se o MES lançar exceção. Uma falha em `Thread.start()` devolve o ticket. Dupla finalização e reserva fora de admissão são recusadas. O ticket continua contabilizado se o drain começar entre a reserva e a execução real da thread.
3. **Evidência local:** `agent-maintenance-admission.test.py` **11/11 PASS**, incluindo passagem cross-thread, drain durante execução, falha simulada em `Thread.start()` e manutenção da linha `queued` no SQLite quando o start falha; `agent-update-readiness.test.py` PASS; `agent-issue57-direct-python-recovery.test.py` PASS. Requer CI GitHub Linux/Windows no novo HEAD antes de considerar verificado remotamente.
4. **Limite de confiança:** isto protege apenas o ciclo dos jobs lançados por `_launch_new_admitted_mes_job` na versão **nova**. O MES, outros subprocessos/supervisores, threads fora desse fluxo, navegador multiaba/perfis, outbox/Firestore, locks Windows e guardian **legado instalado** continuam sem prova de cooperação. Um ticket zerado não atesta a máquina ociosa. `update_authorized=false`, sem endpoint externo de drenagem, sem parada de PID, sem alteração da fábrica, PR draft, `main`/release/Pages inalterados.

**Próximo gate:** coordenador externo com atestação positiva de guardian real e todas as origens, protocolo autenticado que permita manter a drenagem, backup/restauração completos e piloto G1–G6; não oferecer ao operador procedimento de troca manual enquanto esses itens estiverem abertos.

## 35. B2j — interrupção real do processo coordenador, exclusivamente em CI Windows (23/10/2026; novo SHA sem CI)

**Ponto de partida remoto:** B2i na PR #64 draft SHA `be46baed2225346a2baaa4bdb08828c5a7fb9af2`, [A-MES Operational History #39885188261](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39885188261) 4/4 SUCCESS (teste de admissão 11/11 no Windows) e [Central Quality Gate #39885192260](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39885192260) 3/3 SUCCESS. GitHub `main` e release permanecem 0.5.39, SHA `b283b1764432f5d90486d38a7553b30542a5c118`.

1. **Risco coberto neste ensaio:** se o coordenador morrer após adquirir `UpdateTransaction` + `CanonicalBootstrap`, o Windows libera ambos os mutexes por abandono. Uma trava volátil isolada não protege a recuperação; a reserva `claim.lock`, criada e sincronizada antes da troca de arquivos, deve sobreviver mesmo sem `transaction.json` e impedir qualquer bootstrap cooperativo.
2. **Teste Windows adicionável à CI:** `scripts/issue57-coordinator-abandonment.windows.test.ps1` aceita apenas `GITHUB_ACTIONS=true` e `RUNNER_OS=Windows`, cria uma raiz com marcador de teste em `RUNNER_TEMP` e mutexes `Global` com GUID randômico, diferentes dos nomes reais de produção. Em dois cenários, um subprocesso PowerShell adquire ambas as travas na ordem correta: **antes do claim** e **depois do claim/before journal**. O teste mata exclusivamente seu próprio subprocesso de fixture, detecta `AbandonedMutexException` na obtenção dos dois mutexes e verifica, respectivamente, ausência de marcadores ou preservação do claim incompleto. Nunca encerra, identifica nem acessa o PID 8765.
3. **Gate antifalso positivo:** o workflow Windows inclui parsing PowerShell e exige a mensagem terminal exata de sucesso após os dois cenários; o contrato Node `ames-windows-readonly-inventory.test.mjs` também exige que a nova fixture e seu resultado estejam explicitamente ligados ao gate. No Linux, o contrato Node passa (6/6); a execução da fixture PowerShell deve ser comprovada na CI Windows do **novo SHA**, não pode ser inferida dos testes anteriores.
4. **Limites decisivos:** isto comprova semântica de abandono de mutex/processo apenas no runner sintético. Não instala supervisor novo, não prova que o guardian legado da fábrica participa dos mutexes, não implementa IPC autenticado, não atesta usuários/sessões/profile Edge, SQLite fora da árvore, fila Firestore nem atomicidade física de swap NTFS. Portanto `update_authorized=false`, `exclusive_lease_held=false`, PR permanece draft; nenhum update/merge/release/Pages nem comando novo para o posto.

**Próxima etapa:** somente após CI Windows GREEN no SHA, incorporar uma coordenação autenticada que trabalhe com o guardian **efetivamente instalado**, drene job/sync em todos os escopos e recuse explicitamente qualquer cobertura desconhecida antes de permitir backup/staging/swap reais. O simulador não é procedimento de fábrica.

**Resultado do primeiro CI Windows B2j e correção da fixture (23/10):** o SHA `efeea052de178c1ae3ff539cc6a361e62b84be67` teve [Central Quality Gate #39886101989](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39886101989) SUCCESS, porém [A-MES Operational History #39886097844](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39886097844) RED em `mutex_was_not_abandoned_before_claim_update`. O motivo está no **teste**: ele abriu uma referência nova ao mutex depois que o subprocesso morreu, quando o objeto de kernel nomeado já podia ter sido destruído. A correção mantém **handles observadores pré-existentes** de ambos os mutexes desde antes de iniciar o subprocesso, prova que os dois estão realmente ocupados enquanto ele vive, mata só o subprocesso de teste e aguarda `AbandonedMutexException` nos mesmos handles. Isso não muda guardian, launcher nem código de produção. Reexecutar o gate Windows no novo SHA; não transformar o RED original em GREEN retroativamente.

**B2j no SHA corrigido:** `98d62dada0e72d302a098c1caca1acb474c86bcb`; [A-MES Operational History #39886456964](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39886456964) **4/4 SUCCESS** com prova explícita dos dois abandonos no Windows; [Central Quality Gate #39886462646](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39886462646) **3/3 SUCCESS**. Esse é o checkpoint B2j comprovado, não a aprovação do atualizador físico.

## 36. B2k — trava cooperativa de escritores do outbox por origem/perfil (23/10/2026; CI do novo SHA pendente)

**Base remota:** PR #64 aberta/draft e mergeable, HEAD B2j `98d62dada0e72d302a098c1caca1acb474c86bcb`. `main`/release/Pages oficiais permanecem no SHA 0.5.39 `b283b1764432f5d90486d38a7553b30542a5c118`. O teste de fábrica §14 não foi alterado.

1. **Risco:** `indexedQueue()` persiste publicação pendente em `central-ames-outbox-v2` (`pending`). Outra aba do **mesmo perfil/origem** pode inserir nova evidência entre a leitura de `countAll()` e a tentativa de manutenção. O resultado `pending_entries=0` isolado nunca foi uma autorização de atualizar.
2. **Proteção candidata:** `ames/sync.mjs` mantém o schema e versão IndexedDB intocados. Em navegadores com Web Locks API, `put`, `remove` e `markHistory` agora requisitam trava `shared` `central-ames-outbox-v2-cooperative-writer-v1`. A nova API **não acionada pela interface** `withCooperativeMaintenanceFence(observe)` tenta uma trava `exclusive`/`ifAvailable` de uso temporário, conta toda a fila de todos os UIDs sob o lock e permite uma observação assíncrona controlada enquanto **novos escritores cooperantes** aguardam. `Web Locks` libera a trava ao concluir/rejeitar a observação ou encerrar a aba. Sem API, lock ocupado, IndexedDB indisponível ou falha de observação: **recusar** a observação; o sincronizador normal mantém seu comportamento offline no navegador sem Web Locks.
3. **Prova proposta:** `scripts/ames-issue57-browser-outbox.test.mjs` testa recusa fail-closed sem API, lock ocupado e ausência de autorização. `scripts/ames-sync-reload.browser.mjs` cria duas abas **no mesmo BrowserContext Chromium**: mantém o lock exclusivo na primeira, verifica a requisição `shared` pendente e ausência de escrita no IndexedDB na segunda, rejeita nova tentativa exclusiva concorrente, libera lock e comprova que o `put` retoma e é removido sem perturbar outras filas. Testes locais Node/contratos e sintaxe PASS. **O teste Chromium real e o CI Windows ainda precisam ser comprovados no SHA publicado.**
4. **Limite de confiança crítico:** abas com JavaScript anterior não usam essa trava; outros perfis, origens e computadores não partilham Web Locks; uploads Firestore e transações já começadas em outras abas não são automaticamente drenados. O lock exclusivo aqui é uma *ferramenta cooperativa preparatória*, não um lease distribuído nem um interlock com supervisor/guardian/SQLite. Todo relatório preserva `multi_tab_attested=false`, `other_browser_profiles_attested=false`, `update_authorized=false`; a API não executa instalação. PR continua draft e nenhuma versão nova vai à produção.

**Próximo gate:** após CI Browser no novo SHA, projetar atestação de todos os participantes reais e integração autenticada com o coordenador externo, mais journal/rollback Windows com guardian do posto comprovadamente cooperativo. A ausência dessa prova impede mudar o agente da fábrica mesmo que o Chromium demonstre exclusão entre duas abas de fixture.

**B2k confirmado no GitHub:** SHA `cfff4ab763e3655be286ba25189a090655b7e63b`; [A-MES Operational History #39927249500](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39927249500) **4/4 SUCCESS**, e [Central Quality Gate #39927254346](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39927254346) **3/3 SUCCESS**. O job `Console themes, languages and mobile` incluiu execução real de `scripts/ames-sync-reload.browser.mjs` com Chromium, cobrindo duas abas no mesmo BrowserContext. `main`/release 0.5.39 intactas; isto **não** atesta todos os perfis nem autoriza a atualização física.

## 37. B2l — cerca cooperativa de uploads Firestore entre abas (23/10/2026; CI do novo SHA pendente)

**Base remota:** B2k GREEN em `cfff4ab763e3655be286ba25189a090655b7e63b`, PR #64 OPEN/DRAFT, Issue #57 aberta, `main`/Release 0.5.39 no SHA `b283b1764432f5d90486d38a7553b30542a5c118`.

1. **Janela ainda aberta após B2k:** uma aba pode já ter iniciado `remote.putPart`, `remote.commitHistory` ou `remote.commitHead`, mesmo quando outra aba conta zero itens no IndexedDB. A trava de escrita B2k não cobre essas promessas remotas enquanto estão em andamento.
2. **Nova proteção preparatória:** `createMesSync` usa Web Locks `shared` sob o nome `central-ames-firestore-v1-cooperative-publisher-v1` durante a etapa completa `transfer`: publicação de partes, commit de histórico/head, remoção/acknowledgement do IndexedDB e gravação do marcador histórico. O navegador libera automaticamente o Web Lock quando o callback conclui ou rejeita, inclusive em erro de envio ou encerramento de sessão. No navegador sem Web Locks, a sincronização existente permanece operacional; nenhum bloqueio de produção fica supostamente ativo.
3. **Ordem antideadlock:** a API de diagnóstico candidata `withCooperativeBrowserFence(observer)` adquire `exclusive`/`ifAvailable` primeiro na trava de **upload**, depois na trava de **outbox** B2k. Inverter seria inseguro: um upload ainda em andamento precisa obter `shared` de outbox para seu `queue.remove`. A inspeção recusa upload remoto ocupado, fila pendente, atividade local em trânsito, falta das duas travas ou erro. Sempre `multi_tab_attested=false`, `other_browser_profiles_attested=false`, `update_authorized=false`; a API não é exposta por UI nem executa atualização Windows.
4. **Testes:** novos contratos Node verificam ausência de locks, upload ocupado recusado antes de tentar outbox, ordem `remote→outbox`, nenhuma concessão a perfis desconhecidos e recusa com fila pendente. O ensaio `scripts/ames-sync-reload.browser.mjs` usa duas abas reais no mesmo BrowserContext Chromium e upload Firestore **simulado localmente**, retido por Promise: a aba observadora deve recusar a cerca dupla enquanto a outra publica, e a publicação deve concluir com `queue.remove` sem deadlock após liberar o hold; só depois é admitida a observação de fila vazia, ainda sem autorizar instalação. Testes locais Node/contratos/sintaxe PASS. **A evidência do Chromium/Windows só poderá ser declarada após CI no novo SHA.**
5. **Limite físico absoluto:** Web Locks cobre apenas abas com código cooperativo na mesma origem/perfil. Não cerca código de release antiga aberto, perfis Edge distintos, outros dispositivos, Firebase de outras sessões, guardião legado instalado nem SQLite externo. Este bloco não implementa o coordenador autenticado entre Windows/guardian/browser, não troca motor, não inicia CLEAN nem mexe nos dados da fábrica. G1–G6 e backup/staging/rollback físico continuam pendentes. PR deve permanecer draft.

**Próxima decisão após CI:** conferir atestação completa das origens/perfis/sessões realmente utilizadas e autoridade do guardian efetivamente instalado; sem identificação positiva desses participantes, não há mecanismo confiável para disparar troca de arquivos no posto e o atualizador permanece bloqueado.

**Primeiro CI B2l e correção da fixture (23/10):** o SHA `b0ea7785dad06b3e1d556f0aed46d0c55e3790f1` obteve [A-MES Operational History #39930726599](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39930726599) 4/4 SUCCESS (Windows, navegador de leitura, Firestore e contratos), mas [Central Quality Gate #39930734426](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39930734426) **RED** no job `Console themes, languages and mobile`. Log do Chromium: `page.evaluate: RangeError: Invalid time value` na chamada `publication()` da nova fixture de upload. Causa: a expressão textual `'${fixtureDay}T12:00:00Z'` foi usada **fora** do template JavaScript do servidor, no callback do `page.evaluate`, onde `${fixtureDay}` não é interpolado. Correção restrita ao teste: passar `fixtureDay` como argumento explícito de `peer.evaluate((sampleDay)=>...,fixtureDay)` e construir `new Date(sampleDay+'T12:00:00Z')`. Código de sincronização/guardian/Windows do SHA vermelho não foi alterado. Reexecutar ambos os gates no novo SHA, sem converter o primeiro RED em GREEN retroativo.

**B2l confirmado após correção da fixture:** HEAD `f270d97c8380d940050ff6c50021e7d2f0e6cb77`, [A-MES Operational History #39931116973](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39931116973) **4/4 SUCCESS**, [Central Quality Gate #39931122393](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39931122393) **3/3 SUCCESS**, incluindo Chromium de duas abas. A execução RED anterior continua registrada e não é reinterpretada.

## 38. B2m — caminhos indiretos de inicialização Windows: atalhos e comandos opacos (23/10/2026; CI do novo SHA pendente)

**Origem oficial:** PR #64 aberta/draft/mergeable, HEAD anterior B2l `f270d97c8380d940050ff6c50021e7d2f0e6cb77`; `main` e release oficial 0.5.39 continuam em `b283b1764432f5d90486d38a7553b30542a5c118`. Nenhuma operação foi feita no posto de fábrica desde a leitura §14.

1. **Causa do incremento:** `INVENTARIAR_GUARDIANS_READONLY.ps1` classificava inicialmente atalhos das pastas Startup somente pelo **nome**. Um `.lnk` chamado `Daily-Handoff.lnk` apontando para `powershell.exe -File KEEP_AGENT_RUNNING.ps1` podia ser ignorado, mesmo sendo um relançador do agente. O inventário também deixava comandos `-EncodedCommand` ou `python.exe -c` sem classificação, apesar da impossibilidade de inspecioná-los por correspondência textual.
2. **Implementação candidata exclusivamente observacional:** `ISSUE57_GUARDIAN_SIGNALS.ps1` ganhou `Get-Issue57StartupSignal` para ler **metadados** dos atalhos `.lnk` existentes por COM, inspecionando target + argumentos apenas em memória, sem abrir, executar, salvar ou divulgar seu conteúdo; alvo reconhecido como guardian/launcher é registrado por categoria. Atalho quebrado, script/interpreter não reconhecido ou comando opaco vira bloqueador explícito `startup_shortcut_unverified` / `opaque_supervisor_command_unverified`. Nomes genéricos de `.cmd/.bat/.ps1` no Startup também são classificados como incertos. Não decodifica nem exporta argumentos, tokens, nomes, caminhos ou payloads.
3. **Testes:** fixture Windows `scripts/issue57-guardian-signals.windows.test.ps1` agora cria atalhos sintéticos somente em diretório GUID sob `RUNNER_TEMP`: nome genérico + guardian real na linha de destino, `-EncodedCommand`, script desconhecido, atalho quebrado e script Startup sem leitura de conteúdo. Teste estático Node verifica chamada ao novo classificador, inspeção por COM sem persistência e invariantes read-only. Node local 6/6 PASS e `git diff --check` sem erros; **precisa do gate Windows real no SHA publicado**.
4. **Fronteira de confiança:** a classificação de um `.lnk` não prova que o guardian executado tem bytecode correto nem coordena sessões cruzadas, contas diferentes, autostart legado, launcher direto, processos já ativos, fila Firestore, transações SQLite ou rollback. Portanto os campos permanecem `updater_eligible=false`, `all_sessions_attested=false`, `installed_guardian_cooperation_attested=false` e `exclusive_maintenance_lease_held=false`. B2m não é instalador e não concede permissão de encerrar PID, sobrescrever CLEAN ou mexer em dados da fábrica.

**Após CI:** continuar a implementação do coordenador externo com atestação *positiva* do guardian realmente instalado e exclusão global, drenagem autenticada MES/browser, backups externos, journal/rollback NTFS e piloto G1–G6; jamais considerar inventário vazio como prova de autorização. GitHub/Pages são oficiais; Netlify não participa deste gate.

**B2m confirmado no GitHub:** SHA `07c6447b0a99ac3656b8f6e4cfa4036e0f0fff3f`; [A-MES Operational History #39937249020](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39937249020) **4/4 SUCCESS**, inclusive fixture Windows com marker terminal auditado; [Central Quality Gate #39937257941](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/39937257941) **3/3 SUCCESS**. PR #64 continua aberta/draft/mergeable; sem alteração de `main`, release/Pages ou posto.

## 39. Handoff mestre consolidado e correção de rumo (23/10/2026)

O usuário pediu explicitamente a preservação antecipada de toda a continuidade para migração segura de conversa, inclusive a explicação de como uma correção HTTP 403 virou projeto maior de atualizador Windows. Foi criado o documento autossuficiente **`docs/ames/handoffs/ISSUE57_PR64_HANDOFF_MESTRE_20261023.md`**, que deve ser lido integralmente junto a este histórico (sobretudo §14, §37, §38). O documento novo preserva:

1. Estado remoto 0.5.39, PR #65 já integrada, Issue #57 e PR #64 draft, SHA exato do último B2m GREEN; distinção entre CI e homologação física.
2. Último inventário PowerShell (sem repetir), pasta Python antiga versus ZIP 0.5.39 apenas extraído, arquivo SQLite/token/config existente mas ainda não comprovadamente recuperável, guardian antigo em execução no instante do teste.
3. Lista das implementações/arquivos já entregues, regressões RED corrigidas, restrições de segurança e GitHub como canal exclusivo — não Netlify.
4. **Roteiro simplificado com prioridades T1–T5**, evitando crescimento desnecessário em novas análises: T1 atestação positiva do guardian e relançadores; T2 coordenação autenticada/drain; T3 backup completo; T4 troca/rollback real Windows; T5 piloto físico. O próximo trabalho tem de aproximar a entrega real, não criar um instalador paralelo ou declarar o motor atualizado sem prova.
5. Regras para continuar mesmo que o chat exceda seu limite: revalidar HEAD/CI remoto, preservar código e histórico existentes, não forçar push/merge, não solicitar novamente os comandos da fábrica e não tocar em `source_id`, token, SQLite ou processo físico.

**Esta alteração é apenas documentação/checkpoint e não libera instalação.** O SHA deste commit de handoff e seus gates devem ser acrescentados por comentário na PR #64 após publicação; não inserir um SHA futuro especulativo neste texto. O operador poderá solicitar novo adendo se a conversa continuar por muito tempo.

## 40. Recuperação do Work e correção da prova de integridade do backup T3 (23/10/2026)

Após o limite de uso do Work, o operador forneceu o último histórico e print. O remoto havia avançado até `a4019ca1d96b8ce3cb3cace85d895e885924b1fc` com ensaio de drenagem autenticada sob dois mutexes sintéticos, PR #64 ainda draft. O último defeito encontrado pelo Work foi confirmado no `issue57_update_preflight.py`: `verify_operational_backup()` comparava a árvore operacional e `quick_check`, mas não hashes dos conteúdos privados `config.json`, token e SQLite, permitindo corrupção ou troca de identidade estruturalmente válida passar.

O incremento T3 introduz manifesto **privado v2** com SHA-256 dos três arquivos críticos, comparação independente antes da restauração e rejeição fail-closed de manifesto antigo/incompleto/corrompido. Novos testes em diretórios temporários adulteram os três arquivos (incluindo SQLite válido), depois restauram os bytes sintéticos originais; nenhum token/config/SQLite de fábrica é lido ou modificado. Hashes dos arquivos privados nunca são retornados ou impressos, embora constem no manifesto restrito por ACL; não equivalem a assinatura autenticada se o diretório privado for comprometido.

Este checkpoint é **somente preparação de T3** e não corrige por si só a ausência de cooperação do guardian físico, múltiplas origens de navegador, cobertura de dados externos ou transação NTFS. `update_authorized=false`, sem merge, release, Pages, atualização física ou novo CLEAN. Evidências exatas de commit e CI devem constar na PR #64 após o push, sem inventar GREEN.

## 41. T3 — fonte privada imutável durante a observação de backup (23/10/2026)

A verificação privada v2 do §40 rejeita backup corrompido **após** sua criação, mas não comprova que `config.json` e token não mudaram **durante** a cópia. O novo incremento prepara uma comparação hash de ambos antes do backup SQLite e depois das cópias, recusando a mudança observada com erro sanitizado. Testes alteram somente origens sintéticas temporárias nos dois instantes, nunca arquivos de produção. Não há novos endpoints HTTP, sincronização, guardian, interrupção de agentes nem permissão para instalar. Sem lease do guardian efetivo, a comparação não prova quiescência: `update_authorized=false`; PR permanece draft, `main` e release 0.5.39 intocadas. SHA/CI do novo commit devem ser registrados no comentário de checkpoint da PR #64 após publicação.

## 42. T1/T2 — testemunha externa obrigatória antes de uma drenagem autenticada (23/10/2026)

O protocolo de §40–41 autentica a troca IPC, mas a sessão remota autodeclarava PID/instalação. Um cliente poderia vincular-se ao processo errado após reutilização de PID ou troca de processo mesmo que o canal estivesse autenticado. Para impedir uma falsa comprovação, a **fixture** do coordenador passou a exigir observador externo da identidade do processo: PID, SHA da instalação, marcador de nascimento e dono do endpoint precisam coincidir e permanecer estáveis antes/depois do begin, durante polling e antes de cancelar. Ausência ou divergência torna `recovery_required` durável, sem liberar automaticamente a admissão.

Os testes de processo Python separado e IPC real exercitam troca simulada de nascimento com o mesmo PID e impedem avanço; os testes de witness ausente/inválido impedem inclusive iniciar o drain. O total local de protocolos é **15/15 PASS**; checks de T3, recuperação integrada, admissão e contrato Node também passaram. A **testemunha do fixture não corresponde a observador Win32 operacional**; ainda é preciso verificar em Windows quem detém a porta, process creation time, conta/sessão, executável, raízes e guardian/relançadores. Não existe autorização de upgrade, novo CLEAN, parada de agente ou alteração física. CI do SHA desta mudança será registrado após a publicação remota. A PR #64 continua DRAFT; apenas GitHub oficial, sem Netlify.

## 43. T1 — medição Win32 de PID/porta/script/criação (23/10/2026)

Em continuidade ao contrato de witness do §42, foi acrescentado observador PowerShell **somente leitura** que compara Win32_Process e TCP listener do próprio Windows, verifica o primeiro script Python executado por parsing `CommandLineToArgvW` (não substring), rejeita `-c`/`-m` e comandos opacos e calcula marcador estável de encarnação sem expor os dados nativos. A medição nunca liga o protocolo ao motor antigo, nunca libera lease e retorna explicitamente guardian/sessões **não atestados** e `update_authorized=false`.

Um novo teste em GitHub-hosted Windows precisa iniciar processo Python efêmero em porta loopback não 8765, conferir propriedade do listener, igualdade do marcador em leituras sucessivas e rejeitar PID/porta/script incorretos. O workflow registra o marcador terminal ou falha; o contrato estático Node passou localmente. **A prova real Windows do novo commit depende da CI do próprio SHA**, e continua distinta de homologação física. Sem consentimento supervisionado, o último status da fábrica (§14) não pode ser atualizado nem presumido mais recente. O próximo passo do caminho crítico é resolver o guardian antigo + relançadores/contas e interligar testemunha, drain autenticado, journal e escritas de navegador; só então backup/rollback operacional. PR draft, sem merge/release/Pages.
