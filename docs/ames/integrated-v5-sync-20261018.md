# Integração Central + A-MES + Firebase — candidato 18/10/2026

Esta correção parte de `main` e da linha oficial V0.5.25: base `e285d2adba07c023ca53d1c76159ad92c0e0db3c`. Não incorpora PRs #33/#35/#36. O SHA exato de cada pacote está em `CANDIDATE_MANIFEST.json`, `LOCAL_BUNDLE_MANIFEST.json` e `frontend/release-build.json`; resultados e hashes definitivos ficam no checkpoint da PR desta integração e Issue #31. **Factory physical: PENDING. Não é release aprovado nem deploy de produção.**

## Causas comprovadas e correções

| Defeito no código | Correção / evidência |
| --- | --- |
| Cliente e capture ligados à view Console; monitor autônomo não provocava leitura/publicação fora dela | Sessão autenticada possui o único cliente/publicador. A cada 15 s lê snapshots locais existentes, sem iniciar coleta MES. Contrato sem DOM + emulador A/B com coleta pelo agente enquanto Console nunca é montado. |
| Assinatura Firestore encerrada por erro não era recriada por Verificar | Retry com backoff e nova assinatura; callbacks antigos invalidados. Erro não desaparece com download tardio. |
| Fila durável aparecia como zero após reload offline; falha de uma linha bloqueava outras | Recupera contagem do IndexedDB antes de verificar rede, isola erros por linha e mantém entradas até concluir partes/head/histórico. |
| Cache local confundido com confirmação do servidor | Metadata de onSnapshot separa cache/servidor; hora de confirmação só avança com evento real. Verificar sem resposta não inventa sucesso. |
| Token do launcher pertence à origem/aba local; HTTPS sem pareamento recebe 401 silencioso | Erro de pareamento visível, separado de Firebase. Configurar posto permite abrir **somente** HTTPS oficial com fragmento do token, noopener/noreferrer. Token removido da URL ao inicializar cliente; nunca publicado no Firestore. |
| SW omitia imports transitivos e reutilizava cache entre SHAs | Precache completa; cache imutável por SHA gerado no build e reload guardado pela revisão. Contrato percorre imports reais. |

O fluxo continua: agente local/SQLite → cliente da sessão → outbox IndexedDB sanitizado por UID → partes Firestore → head transacional → histórico imutável → onSnapshot em usuários autorizados. `amesUsers` mantém namespace do publicador e `amesTeamLines` a visão compartilhada. Um único `state.ames`, um agente, um SQLite, nove views e fluxo MES serializado. Sem mudança de regras, projeto Firebase, coletores, launcher/8765, banco, dependências ou autenticação de produção.

## Distinções operacionais e limites

- A Central local e a HTTPS usam o projeto `central-de-controle-88962` e a mesma política Auth/Firestore. Sessão/cache/outbox/token são por origem do navegador; não são copiados entre PCs. Só evidência sanitizada é compartilhada.
- Painel existente de saúde mostra agente local separado do Firebase, último envio, recebimento, confirmação do servidor, source_id/snapshot/revisão por linha, fila e erros. O build existente identifica SHA. A leitura local tem prioridade no PC conectado; a leitura remota mostra origem de equipe. Sem dados não significa zero.
- **O publicador exige uma aba da Central autenticada e em execução no PC A, em qualquer view.** Não exige Console aberto. Aba fechada/suspensa pelo navegador não executa JavaScript. O agente continua coletando no SQLite; reabrir a Central recupera a fila e lê os snapshots atuais. Intervalos podem aumentar com throttling de abas.
- O endpoint canônico expõe os snapshots mais recentes por linha; esta tranche **não garante replay de todas as revisões históricas nunca observadas pelo navegador** quando a aba ficou fechada ou várias coletas ocorreram entre leituras. SQLite não é apagado. Histórico já publicado/entrada já enfileirada é preservado. Exportação/replay integral de períodos antigos é pendência explícita, não motivo para inventar um segundo publicador.
- Primeira autenticação e instalação do cache precisam de internet; offline posterior depende de sessão/cache já válidos. Limpar dados do navegador apaga a outbox local. Não limpar dados enquanto houver pendências.
- Usuários ativos autorizados leem as linhas compartilhadas conforme regras atuais; não foi criada política nova por equipe. Mesmo UID/linha com outro `source_id` continua recusado: preservar identidade da instalação existente, não contornar o conflito.
- `127.0.0.1:8765` é o próprio PC. PC B não controla MES de A. CORS permanece com origens HTTPS explícitas, sem wildcard/túnel. Permissão de rede local/mixed content do Chrome/Edge exige ensaio físico.
- As regras publicadas foram informadas no checkpoint da Issue #31 (comentário 6227187511); testes aqui usam emulador. Não foi feita alteração nem confirmação por escrita em produção. Firebase Auth authorized domains, permissão de navegador e execução no link oficial permanecem validações externas.
- Produção HTTPS não muda com este PR draft. Preview identifica o SHA candidato e permite validar leitura compartilhada. Pareamento local usa origem oficial fixa, não adiciona CORS para previews.

## Pacote, backup e rollback seguro

1. Baixar o artifact `central-ames-integrated-<SHA>` do run registrado na PR; o ZIP externo do Actions contém `central-ames-integrated.zip`. Conferir o SHA256 do **ZIP indicado no checkpoint** (digest do wrapper Actions não é o hash do ZIP interno). Verificar SHA dos manifests.
2. Antes de instalar, anotar SHA/source_id/snapshot/revisão/quantidades do posto funcional. Usar backup existente em Configurar posto; parar monitor/agente antes de copiar a pasta inteira da instalação oficial para backup local datado. Guardar SQLite, configuração e identidade **localmente**, nunca anexar tokens, cookies, sessão ou banco operacional ao GitHub.
3. O CLEAN é para pasta nova de teste. **Não iniciar uma instalação vazia e publicar com o mesmo UID como substituta da base existente.** Para testar preservando dados/identidade: com agente parado, manter backup completo e copiar a pasta operacional oficial para uma pasta de teste; substituir **somente `frontend/`** nessa cópia pelo `frontend/` do ZIP candidato. Esta PR altera apenas runtime frontend; manter agentes/coletores/configuração/SQLite/launcher da V0.5.25. Não rodar original e cópia simultaneamente (mesma porta/identidade).
4. Iniciar a cópia pelo launcher já existente e confirmar que `/ready` pertence à pasta de teste. Se o launcher reutilizar outra pasta, parar o ensaio e resolver essa seleção com o diagnóstico existente; não editar launcher nem matar processo desconhecido. Confirmar SHA do frontend candidato no painel. Fazer login normalmente.
5. No PC A, escolher **uma aba publicadora** pareada, preferencialmente a Central local candidata. No PC B, usar preview do SHA candidato para a validação de leitura antes de deploy. Testar HTTPS oficial também, anotando seu SHA atual; não confundir versões. Para parear HTTPS oficial no A: Console → Configurar posto → Abrir Central HTTPS pareada. Token não deve ser copiado manualmente nem enviado em print/log.
6. Rollback: parar o agente/monitor da pasta de teste; preservar a cópia e seus novos dados; restaurar apenas `frontend/` anterior na pasta que contém o SQLite mais recente, ou usar original se não houve nova coleta. Não restaurar SQLite antigo por cima de coletas novas. Reiniciar um único launcher e conferir pasta/source_id. Se houve mudança de navegador, deixar a outbox da origem intacta até drenagem. Nenhum rollback em Firebase é necessário porque formato/regras não mudaram.

## Roteiro A (MES) / B (sem MES)

Registrar em cada passo hora, build SHA, linha/período, source_id, snapshot_id, revisão, fila, confirmação servidor e quantidade conhecida. Usar dados autorizados, ocultando SN/comentários sensíveis em evidências externas.

1. **A conectado:** launcher V0.5.25 preservado + frontend candidato, login ativo. Agente conectado e SQLite preservado. Iniciar coleta conhecida; depois permanecer em Home/Dashboard (Console fechado). Monitor termina no fluxo existente. Publicação deve acontecer sem visitar Console; B vê atualização automática.
2. **B viewer:** outro usuário ativo, sem agente/MES. Login na Central candidata; Verificar pode indicar agente indisponível, mas dados de equipe permanecem consultáveis. Comparar mesma linha/período/source_id/snapshot/revisão com A. Sem fabricação de zero.
3. **Offline A:** retirar somente internet preservando a rede MES. Coletar novamente. Conferir SQLite e pendências de envio; B mantém último snapshot confirmado, não recebe sucesso inventado. Recarregar A com cache já instalado; fila deve continuar pendente.
4. **Reconexão:** restaurar internet. Entradas pendentes drenam, B recebe revisão nova sem reload. Repetir Verificar/reload não duplica ocorrência/histórico. Versão histórica anterior continua consultável.
5. **Reinício:** fechar/reabrir Central e reiniciar agente pelo fluxo normal, um de cada vez. Identidade e banco permanecem; fila por UID recuperada. Registrar o limite de revisões nunca observadas acima; não declarar replay integral aprovado.
6. **Cache/build:** abrir candidato online, conferir SHA; recarregar offline e verificar módulos/visão disponíveis. Ao publicar futuramente um novo build autorizado, verificar mudança de SHA e ausência de loop de reload. Não limpar cache para mascarar erro.
7. **HTTPS físico:** no A, abrir pareamento oficial a partir do posto local; responder conscientemente à permissão de rede local do navegador. Comparar erro 401/política navegador com estado Firebase. Falha de agente não pode apagar evidência remota. Não autorizar origem arbitrária.

**Aprovação:** todos os passos aplicáveis com evidência, dados e identidade preservados, fila drenada, B recebe nova revisão, offline não bloqueia coleta, ausência/erro distinguíveis, nenhum segredo compartilhado. **Reprovação:** perda de SQLite/outbox, mudança inesperada de source_id, sucesso sem confirmação, divergência sem origem, duplicação, snapshot corrompido aceito, publicação dependente de abrir Console, acesso de usuário desativado ou token em dados compartilhados.

## Testes automatizados / continuidade

Contratos Node cobrem lifecycle sem view, outbox, linhas independentes, confirmação/cache, corrupção, logout concorrente, pareamento e SW. Emulador executa regras reais + HTTP agente/scheduler + MES simulado + SQLite + duas identidades Firebase + coleta em background/reconexão/histórico. Browser verifica nove views/idiomas/temas/mobile e IndexedDB real após reload/troca de UID. Esses testes **não equivalem a MES/fábrica real**.

CI definitivo deve usar o mesmo SHA do pacote. Checkpoints com IDs de runs/artifacts e resultados ficam na Issue #31 e PR draft específica. Próxima ação após gates: executar roteiro A/B no posto e navegador reais; obter autorização separada antes de qualquer deploy/merge/regras. Replay histórico integral de revisões nunca vistas fica pendente, sem esconder essa limitação.
