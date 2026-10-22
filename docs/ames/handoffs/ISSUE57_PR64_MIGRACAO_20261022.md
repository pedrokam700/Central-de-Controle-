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
