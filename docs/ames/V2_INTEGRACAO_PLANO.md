# Central de Trabalho V2 — integração A-MES

A V2 deixa de tratar a Central online e o coletor A-MES como produtos separados.

Princípios:
- A Central online continua sendo a interface principal.
- No notebook da fábrica, a Central detecta o agente local `127.0.0.1:8765` e usa dados locais em tempo real.
- Fora da rede OPPO, a mesma Central usa apenas dados A-MES já sincronizados e sanitizados no Firebase.
- A coleta A-MES permanece local-first, serial e independente de cloud.
- Senha, cookie, sessão, CDP e acesso à TAXXX_5G nunca são enviados ao Firebase.
- Dados A-MES alimentam Dashboard, páginas de produto/CPH, Central do Dia, Radar de recorrência e CORA.
- `aiKnowledge` é usado como barramento compatível com as regras Firestore existentes para snapshots A-MES sanitizados; não é usada uma coleção nova nesta etapa.
- A V0.5.20 continua baseline funcional do núcleo 3028+3074+2114. A V0.5.22 é candidata local com dashboards/reuso.
- A V2 deve ser validada em preview/branch antes de substituir a Central atual.

Primeiro corte da V2:
1. shell integrado da Central com A-MES no mesmo produto;
2. detecção do agente local;
3. sincronização por linha para Firebase quando autenticado;
4. leitura remota do último snapshot sincronizado;
5. painel A-MES global com FPY, Top 3, reuso e recorrência;
6. enriquecimento de Dashboard, produto/CPH e Central do Dia;
7. documentos A-MES validados pelo sistema em `aiKnowledge`, permitindo que CORA pesquise o contexto automaticamente;
8. área administrativa discreta para instalação do posto e diagnóstico;
9. sem comando remoto do MES nesta etapa.
