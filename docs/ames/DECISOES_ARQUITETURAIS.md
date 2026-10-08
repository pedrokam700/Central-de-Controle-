# DECISÕES ARQUITETURAIS — CENTRAL A-MES

1. **Offline/local first.** A-MES, SQLite e processamento ficam no notebook.
2. **Chrome dedicado + CDP.** Sessão separada; login manual; sem senha em código.
3. **Rede dual validada.** Ethernet normal + TAXXX_5G A-MES via rota específica.
4. **Acesso MES serial.** Nunca executar duas consultas A-MES simultâneas; a fila local protege ExtJS/sessão.
5. **Linhas isoladas.** TAN10101/TAN10102/TAN10103 são universos operacionais independentes.
6. **Snapshots preservam histórico.** Nova coleta cria novo snapshot; remoção posterior não apaga o anterior.
7. **3028 direto é preferido.** Store/backend ExtJS > automação visual > Excel como fallback/export.
8. **Excel é opcional.** UI/SQLite são primários; V0.16 continua padrão para exportação.
9. **CORA usa a base local.** Conhecimento operacional deve vir de dados persistidos/cruzados, não de memória solta.
10. **3074: uso ≠ Batch Count.** Reuso é calculado por associações/ciclos e tempo de binding.
11. **2114: histórico completo.** Preservar todas as ocorrências e usar a relevante mais recente para o estado atual.
12. **3022: lógica temporal.** Usar o último processo válido anterior ao Defect Time.
13. **Correlação é evidência, não culpa.** Mesma falha/família/diferente/sem histórico.
14. **UX simples.** Complexidade sistêmica fica atrás da interface. V0.5.18 usa uma linha em foco, não três painéis grandes simultâneos.
15. **Gates reais.** Teste local ajuda, mas GREEN operacional exige evidência de fábrica quando o gate depende do MES.
16. **Mudança mínima durante validação.** Se um motor acabou de passar teste real, a próxima versão não deve reescrevê-lo para resolver apenas uma questão visual.
17. **Fonte de continuidade.** `docs/ames/` + pacote registrado na Library do projeto são a referência para novos chats; não depender apenas do histórico de uma conversa.