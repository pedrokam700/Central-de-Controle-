# Central de Trabalho / A-MES — candidata consolidada e transição supervisionada

Checkpoint de 23/10/2026. Repositório oficial `pedrokam700/Central-de-Controle-`.

## Escopo e regras

- A `main` e a última release oficial permanecem na 0.5.39, SHA `b283b1764432f5d90486d38a7553b30542a5c118`, salvo verificação remota posterior.
- PR #67 / Issue #66 contêm correções funcionais recentes e têm homologação física **PENDENTE**. Sua última base auditada nesta integração foi `ca64094e63b02d4e51d83b6fb113b9eb91510594`.
- PR #64 / Issue #57 tratam do mecanismo transacional de atualização/backup/rollback e permanecem **DRAFT**; última revisão conhecida `9b8140413984347e71df1af65aabd4ac1e9b5231`. Não transplantar seu updater inacabado para a candidata funcional, nem alterar essa branch.
- A nova branch de consolidação é `work/ames-unified-candidate-20261023`, baseada na PR #67, isolada das PRs antigas.
- Não fazer merge, release oficial, deploy, publicação de regras Firebase, instalação no posto ou remoção de processo sem autorização expressa e evidência física.
- O ambiente de entrega oficial é GitHub (repositório, Actions, Releases e GitHub Pages). Referências históricas a Netlify não são gate deste projeto.

## Auditoria de PRs DRAFT antigas

- #40 e #42: seus HEADs são ancestrais da base funcional atual; não representam dezenas de arquivos perdidos a fundir novamente. Revalidar por comportamento quando necessário.
- #32: painel de suporte, origem, saúde e desempenho do agente; nove commits funcionais selecionados e reintroduzidos, com testes. Não copiar o commit antigo de manifesto `release.json`, pois ele apontaria para versão obsoleta.
- #33/#35/#36: branches antigas empilhadas com lógica de Top3, reuso e histórico temporal. Muitas funcionalidades foram implementadas posteriormente na linha oficial. Não mesclar indiscriminadamente: verificar equivalência com Issue #66, identificar lacunas comprovadas e preservar evidência conservadora.
- #24: preview antigo; não mesclar.
- #1: mobile antigo; não mesclar.
- #26: fastlane histórico; preservar funções úteis já presentes sem restaurar entrypoint antigo.
- #38: identidade L3 antiga e ainda não comprovada; não incorporar até análise funcional específica.

## Incrementos da candidata consolidada

1. Painel adicional **Suporte, origem e desempenho** na Automação: origem/frescor/horário do snapshot por linha, status de runtime, backup, monitor, sync e diagnóstico de integridade; histórico recente de jobs em leitura local opcional. Sanitização do conteúdo recebido do agente. Sem iniciar coleta ou alterar MES ao ler o diagnóstico.
2. Novo módulo `ames/automation-support.mjs` no cache offline canônico para preservar todos os imports quando sem rede.
3. **Barreira suplementar na inicialização**: o launcher examina a porta 8765 e recusa subir outra instância quando encontra listener existente. Também falha se não houver capacidade de consultar os listeners. Esse preflight **não consegue provar a ausência de guardian legado** que esteja momentaneamente sem agente.
4. O `LEIA_PRIMEIRO.txt` da candidata explicita que **não se deve rodar `00_INICIAR_AQUI.bat` no computador 0.5.39 antes da migração supervisionada**. O ZIP não é um updater Windows.
5. O fallback público de download estava preso à antiga 0.5.35. Agora aponta para a release oficial 0.5.39 comprovada no histórico do projeto, SHA `b283b176...`; a descoberta pela API GitHub rejeita respostas mais antigas que esse fallback, evitando sugerir um pacote obsoleto em caso de resposta defasada.

## Ordem de validação e implantação — sem atalhos

### A. Primeiro contato com o mesmo PC da fábrica (somente leitura)

1. Continuar usando o posto atual; o pacote novo baixado e extraído pelo operador ainda não foi executado.
2. Executar **somente** o kit independente `ISSUE57_INVENTARIO_GUARDIAN_READONLY.zip`, preferindo `INVENTARIAR_GUARDIANS_READONLY.ps1`, sem copiar/alterar SQLite, tokens, perfis ou tarefas agendadas. O kit está fora da nova candidata.
3. Compartilhar apenas metadados de PID, caminho dos executáveis, comandos/inicializadores, serviços/tarefas e horário do processo; ocultar token, cookies, URLs com `#ames_agent_token=` e outros segredos.
4. Cruzar inventário com `Root/logs`, demais locais de runtime, processos e filas pendentes. Caso não seja possível comprovar writer ou origem, **bloquear** inscrição/atualização.

### B. Migração única do guardian antigo — após A e homologação

1. Planejar janela sem coleta/reparo em andamento e comprovar autorização do operador.
2. Inventariar processos/guardian e manifestos; manter backup consistente de configurações, SQLite/WAL/journal, snapshots/outbox e artefatos referenciados. Validar restauração em destino isolado.
3. Desativar o mecanismo antigo de reinício **somente depois de identificá-lo exatamente**. Não usar mata-processo por nome amplo nem deixar guardiões antigos atuarem em paralelo.
4. Instalar e verificar o novo launcher/guardian em diretório controlado, preservando identidade do posto, token, fonte, dados e coletores congelados. Observar porta/PID/raiz/health e recuperação.
5. Executar testes supervisionados na candidata, incluindo consulta SN, rastreabilidade de último dia, FULL 3028+3074+2114+3022, histórico/material de segundo uso, dashboards e compartilhamento entre PCs. Manter rollback funcional.
6. Se uma verificação falhar, **não promover**; recuperar a configuração anterior comprovada.

### C. Atualizações futuras

Só após o piloto de B, o coordenador transacional da PR #64 pode ser elegível para atualização com bloqueios persistentes, drenagem, backup/restore, identidade dos writers e rollback. CI GREEN não substitui homologação física. `update_authorized=false` até liberação explícita.

## Requisitos funcionais a preservar da Issue #66

- Consulta por PCBA: destacar vínculo Y atual; se não houver nova montagem, reconstruir vínculo da última falha N e distinguir comprovado/candidato; nunca promover histórico indeterminado a certeza. Uma nova montagem é o foco atual, sem misturar materiais antigos.
- Consulta por Material SN: 3074 → PCBAs anteriores → falhas/famílias e migração de falha acompanhando o componente, com origem/tempo e prova separada de hipótese.
- Rastreabilidade usa a ocorrência exata do 3028, não a regra isolada de Consulta por SN.
- Último dia produtivo deve sair do bloqueio; FPY/Quantity exigem fechamento FULL comprovado, não mera leitura 3028 ou zero inventado.
- Falhas agrupadas devem mostrar valores observados exatos quando houver prova, e indicar cobertura incompleta sem extrapolar.
- Dashboard: categorias configuráveis PCBA/material reusado, mesma falha/família, união/interseção sem duplicação; sensibilidade do Check FPY separada de causalidade; dois gráficos navegáveis e tendência vinculada a fechamentos FULL comprovados.

## Gates

- Testes de módulo/cache/suporte/launcher: devem ser GREEN no SHA efetivo desta branch.
- Qualidade CI GitHub: revalidar somente o SHA exato depois de qualquer commit.
- Candidato ZIP: manifesto interno e hashes SHA-256 de cada entrada; nenhum dado local, token ou cookie dentro.
- Teste físico de 3074/2114/3022, processos guardian, 0.5.39 e sincronização multicomp.: **PENDENTE** até evidência enviada pelo operador.
- Merge/Release/produção: **NÃO AUTORIZADOS** neste checkpoint.

## Ponto de retomada

1. Confirmar `main`, PR #67, PR #64 e CI da branch de consolidação no GitHub.
2. Resolver qualquer teste não verde; construir candidato ZIP com `scripts/build-integrated-candidate.py` no HEAD limpo, verificando hashes e o aviso de migração.
3. Entregar o kit read-only e instruções de fase A ao operador. **Não** pedir que execute o ZIP da candidata no posto atual enquanto o guardian legado estiver desconhecido.
4. Com os metadados reais, finalizar a transição supervisionada, validar e então discutir promoção.
