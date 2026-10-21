# Handoff de fábrica — histórico Linhas 2/3, origem, revisão e atualização — 21/10/2026

## Entrada física
Prints do operador na rede isolada: PC com A-MES 3028 e Central local em `127.0.0.1:8765`. Agente identificado como CANONICAL-R11-BATCH. Na Linha 2, após escolha explícita da origem remota, a Central mostrou FPY 97,24%, Check FPY 97,73%, Quantity 1.628, 45 falhas e snapshot 3. Isso prova leitura de uma revisão, **não** que seja a mais recente da fonte. Linha 3 permaneceu vazia no mesmo teste. O operador relatou que a Linha 2 tinha dados manuais que não mudaram, a Linha 3 mudou e a escolha de origem desapareceu após abrir uma coleta.

## Causas verificadas no código anterior
1. `reading-period-controller.mjs` eliminava `source_choices` após resolver o conflito; `console-reading-period.mjs` mostrava a seleção somente em conflito pendente. Não havia jeito direto de trocar uma origem já escolhida.
2. `console-legacy-parity.mjs` conectava o botão global "Atualizar leitura" apenas ao refresh do agente, não necessariamente à consulta `history.list` e abertura de revisão.
3. `data/store.mjs` mantinha a visualização histórica antiga em memória até ser sobrescrita; quando a revisão desaparecia do índice ou deixava de corresponder, a tela não invalidava a evidência visual.
4. `console-latest-capture.mjs` escondia a última coleta anterior caso o modo não fosse Hoje ou quando Hoje possuísse uma revisão. Escolha de origem desse painel não reaproveitava preferência previamente escolhida.

## Correções da PR #51
- Com opções de mais de uma origem, a seleção permanece disponível **também depois da abertura**, exibindo origem, carimbo de coleta e revisão. Mudar a seleção atualiza só a linha e o período em leitura, sem MES.
- Preferência de origem validada por linha, aplicada apenas se aquela origem realmente existir no período consultado. Gravada no armazenamento local do navegador, não em banco de equipe nem no agente; se origem indisponível, não é presumida.
- Leitura posterior da mesma origem abre a revisão recente; não mantém uma revisão visual antiga se o índice comprovar que não está mais disponível. SQLite, outros snapshots, outbox e registros manuais **não são excluídos**.
- Última coleta histórica anterior ao início de Hoje aparece separadamente também em outros modos, sem preencher FPY/Quantity de Hoje com dados de ontem. Alterar o período de leitura não chama MES.
- "Atualizar leitura" solicita novo índice imutável, além de atualização passiva de estado. Novas coletas locais em andamento bloqueiam botões de iniciar outra coleta no mesmo posto; apenas ler histórico segue permitido.
- GitHub Release offline fallback atualizado para versão **0.5.30 já comprovada no GitHub**, sem anunciar o candidato 0.5.31 como publicado. Workflow imutável 0.5.31 espera 5/5 do novo SHA em main.

## O que NÃO se pode declarar resolvido sem evidência
- O material manual da Linha 2 não foi editado; é necessário provar no PC se foi salvo em outra camada/escopo ou se a revisão de origem remota não reflete a extração.
- Nomes AT e paginação de 3074 continuam dependendo de prova real no MES.
- O breve flash da tela de login reportado não foi diagnosticado com trace de auth, console/network e ciclo de service worker. Não alterar silenciosamente auth e risco de acesso sem evidência.
- Dois **computadores** podem consultar o MES em paralelo; a Central conserva origens/revisões independentes, mas não oferece bloqueio distribuído durante ausência de rede/Internet. Não substituir um job físico em curso por outra instalação.
- Homologação física permanece RED até teste da própria fábrica.

## Roteiro próximo teste
1. Consultar histórico do dia 20/10 (07:00→07:00) da Linha 2 e Linha 3 sem iniciar MES. Confirmar opção de troca **continua** após seleção.
2. Conferir coletado em `collected_at`, source_id, revision, snapshot id e comparar com as planilhas/3028 reais. Manter manual e offline sem sobrescrever SQLite.
3. Se novos dados existirem, apertar **Atualizar leitura**. A leitura não deve disparar coleta nem alterar valores manuais em outra camada. Validar histórico e troca da fonte.
4. Com job MES ainda rodando em **outro PC**, verificar somente leitura e distinguir quem publicou a nova revisão. Não iniciar uma coleta duplicada por engano.
5. Observar flash de login (local x URL online) com horário e print em novo gate se se repetir.

Fonte oficial: GitHub `main` + Releases, não Vercel/Netlify. A interface servida por HTTPS deve estar vinculada ao SHA aprovado. PR da implementação: #51.
