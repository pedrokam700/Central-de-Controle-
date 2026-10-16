# Candidata integrada: Central + A-MES

A branch `v2/console-parity-r12` / PR #23 incorpora o polimento do PR #25, mantendo seus commits. Sem merge em main, alteração de produção ou publicação de Rules. Build do shell: 15.1.13.49. O SHA autoritativo está em `/release-build.json`, no diagnóstico do Console e no `FRONTEND_GATE.json` do bundle.

## Alterações

- Retorno à Central no login e dentro do Console; caret e foco visíveis.
- Tema e idioma globais nas nove views, incluindo preparação, estados vazios e diagnóstico. Códigos MES permanecem intactos.
- Detecção automática do agente local; consulta compartilhada sem agente; preparação com verificações explícitas. Sessão MES não é inferida de uma porta aberta: login continua manual.
- Atual por linha com cobertura, CPH e data; histórico imutável de períodos/CPH em Base local, sem substituir o atual e sem comando MES remoto. Revisões antigas sem período explícito não recebem um período inventado.
- Histórico verifica hash, escopo e metadados ao abrir. Falha de autorização do histórico conserva a fila e não bloqueia o atual de outras linhas. Novas Rules permanecem somente no código/emulador.
- Link discreto para artifact de migração somente quando corresponde ao SHA exato do frontend. Pacote universal de PC novo continua bloqueado.
- Pré-teste somente leitura; bundle inclui esse módulo; hashes dos coletores congelados, backup, rollback, reparo de dependências, Auth, store, client, SQLite e scheduler preservados.

## Evidência local

166 contratos Node, sete suítes Python, gate estático, Rules + E2E de sincronização em emulador e navegador com nove views × dois idiomas × dois temas. Navegador inclui ausência/presença de agente, histórico, CORA, mobile, retorno e login. Dados MES usados nesses testes são sintéticos; não substituem a fábrica. Actions repete os testes e publica evidência visual e bundle por SHA.

## Limitações explícitas

- Histórico compartilhado exige futura aprovação/publicação das Rules; nada foi publicado nesta sessão. Até lá, consulta pode indicar indisponibilidade e a fila pode ficar pendente, preservando os dados atuais.
- R12 real, Shift 2114 automático, temporalidade 3022 com retrabalho, rede/CDP/sessão, duração real, Excel, três linhas e reboot exigem o posto. Não foi inserido cronômetro nos coletores congelados; medir as etapas no gate físico.
- Snapshot com fonte parcial permanece parcial. Dado ausente nunca significa zero.
- A consulta histórica lista o índice da linha; paginação/retencão de longo prazo não foi introduzida neste fechamento. Revisões só são arquivadas quando capturadas pela sincronização; não há backfill automático de todo o SQLite antigo.
- Auditoria direcionada encontrou risco preexistente no bootstrap de admin de `/users`: e-mail fixo sem exigência de `email_verified`. Não foi alterado nem publicado; avaliar separadamente antes de promover Rules. As Rules de partes sanitizadas validam envelope, não interpretam JSON: a sanitização continua sendo responsabilidade do publicador autorizado.
- Preview e launcher só são válidos quando `/release-build.json` responde JSON com o SHA do pacote. Proteção/401/HTML ou SHA divergente bloqueiam o gate; não contornar nem usar produção.

## Amanhã, na instalação R12 existente

1. Conferir preview e SHA do pacote; se houver bloqueio, parar antes de migrar.
2. Parar o monitor/agente antigo, extrair o bundle e executar `ATUALIZAR_R12_EXISTENTE.bat`, informando a pasta R12. Backup/rollback são preservados.
3. Abrir `00_INICIAR_AQUI.bat` na instalação atualizada → Console → Preparar este computador → verificar → login A-MES manual.
4. Testar 3028 pequena → 3074 + 2114 pequeno → 3022 simples/retrabalho → modos seletivos → Excel/reuso → três linhas → reboot e duração por etapa.
5. Se houver regressão, parar coleta e usar `ROLLBACK_R12_EXISTENTE.bat`; guardar evidência do erro. Não promover sem gate físico.

## Primeiro uso de outro funcionário

Entrar na Central → Console MES → Usar somente dados compartilhados. Para coletar, usar Preparar este computador em um posto R12 validado e fazer login A-MES manual. Computador novo continua aguardando o pacote validado na fábrica.


## Publicação alternativa

O caminho prebuilt usa a mesma construção do preview normal a partir de fontes confirmadas no Git. Inclui offline-bootstrap e core/login/Auth, verifica os imports publicados e exclui configurações/sessões ignoradas pelo Git. O teste também rejeita código local não confirmado.
