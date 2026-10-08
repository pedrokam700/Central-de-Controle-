# DECISÕES ARQUITETURAIS — CENTRAL A-MES

1. **Offline/local first.** A-MES, SQLite e processamento ficam no notebook.
2. **Chrome dedicado + CDP.** Sessão separada; login manual; sem senha em código.
3. **Rede dual validada.** Ethernet normal + TAXXX_5G A-MES via rota específica.
4. **Acesso MES serial.** Nunca executar duas consultas A-MES simultâneas; a fila local protege ExtJS/sessão.
5. **Linhas isoladas.** TAN10101/TAN10102/TAN10103 são universos operacionais independentes.
6. **Snapshots preservam histórico.** Nova coleta cria novo snapshot; remoção posterior não apaga o anterior.
7. **3028 direto é preferido.** Store/backend ExtJS > automação visual > Excel como fallback/export.
8. **Excel é opcional.** UI/SQLite são primários; V0.16 continua padrão para exportação/correlação.
9. **CORA usa dados persistidos.** Conhecimento operacional deve vir da base estruturada/cruzada, não de memória solta.
10. **3074: uso ≠ Batch Count.** Reuso é calculado por associações/ciclos e tempo de binding.
11. **2114: histórico completo.** Preservar todas as ocorrências e usar a relevante mais recente para o estado atual.
12. **3022: lógica temporal.** Usar o último processo válido anterior ou igual ao Defect Time.
13. **Correlação é evidência, não culpa.** Mesma falha/família/diferente/sem histórico não prova automaticamente causa.
14. **UX simples.** Complexidade sistêmica fica atrás da interface; uma linha em foco é o padrão.
15. **Gates reais.** GREEN operacional exige evidência de fábrica quando o gate depende do MES.
16. **Mudança mínima durante validação.** Não reescrever motor recém-validado para resolver questão adjacente.
17. **Fonte de continuidade.** `docs/ames/` + release index do GitHub + pacote persistente são a referência entre chats.
18. **Escopo configurável antes de aprofundar.** 3074/2114/3022 permitem selecionar linhas, falhas/códigos e quantidade/amostra.
19. **Progresso verdadeiro.** Barras usam current/total do plano/checkpoint real.
20. **Performance primeiro por medição/cache.** Deduplicar SNs, reaproveitar checkpoint/memo e remover waits somente quando seguro.
21. **Instalador fora do fluxo diário.** O pacote de novo posto fica em acesso discreto/admin porque normalmente é usado uma vez.
22. **Compartilhamento sem transformar cloud em dependência.** Falta de internet/cloud nunca bloqueia coleta local.
23. **Nunca sincronizar credenciais/sessão MES.** Senha, cookies, token e acesso à rede OPPO ficam exclusivamente no coletor local.
24. **Leitura remota ≠ comando remoto.** Consultar dados sincronizados é diferente de disparar nova consulta A-MES.
25. **Checkpoint funcional não é GREEN automático.** Baseline validada e candidata atual devem ficar explicitamente separadas.
26. **Resultado incremental é preferível a tela vazia até o fim.** PCBA/material/histórico concluído pode aparecer enquanto o lote continua.
27. **Refresh da UI não pode virar carga de backend.** Dataset pesado só recarrega quando dado novo é persistido.
28. **Perfis de desempenho não removem integridade.** Todos confirmam a SN esperada antes de aceitar o grid.
29. **3028 validado fica congelado durante otimização 3074/2114.** Regressão 3028 exige investigação separada.
30. **Bridge da Central é somente de dados coletados.** Nunca dirigir o A-MES remotamente por essa API.
31. **Persistência vem antes da visualização.** Refresh agrupado da UI nunca autoriza descartar linha, vínculo, histórico ou bruto retornado pelo MES.
32. **Todo KPI investigativo importante é auditável.** Um número de 2º uso, mesma falha, mesma família, material reutilizado ou correlação deve abrir os registros exatos que o formaram.
33. **PCBA e material são entidades distintas.** “PCBA em segundo uso” e “material em segundo uso” não podem compartilhar contagem sem explicitar o universo.
34. **Material reutilizado carrega contexto de PCBAs antigas.** Sempre que disponível, mostrar PCBAs desvinculadas, inclusive subconjuntos com mesma falha e mesma família.
35. **Dashboards respeitam denominador e linha.** Taxas precisam informar o universo calculado e sempre usar a linha ativa; nunca somar linhas por conveniência visual.
36. **Excel é trilha de auditoria, não substituto da base.** Export deve conter visão limpa e abas técnicas; evidência completa continua no SQLite/raw_json.
37. **Export corrompido falha fechado.** O agente valida a estrutura XLSX antes de disponibilizar a planilha.
38. **GitHub é a fonte canônica da release.** `ames/releases/latest` aponta a candidata atual e publica manifesto/hashes. O ZIP binário exato pode ficar no Drive/Library desde que o SHA-256 canônico esteja no GitHub.
39. **Vercel não define versão do agente.** Bridge/web é integração opcional e nunca substitui a release canônica do GitHub.
40. **Novo posto deve ser reproduzível sem segredo embutido.** O pacote pode automatizar Python, dependências, Chrome, rota, agente e perfil dedicado; Wi-Fi/A-MES exigem credenciais do próprio usuário e nunca são embalados.
41. **Migração explícita preserva continuidade.** Novo pacote deve oferecer migração controlada de SQLite/config/backups da instalação anterior, sem sobrescrever silenciosamente.
