# PR42 — Central por GitHub: instalação guiada + sincronização A→B (20/10/2026)

## Versão GREEN de fábrica ≠ novo candidato da interface

- **Versão GREEN de fábrica relatada:** `e60cef8d4f033c4654b3fb730573e1ecfdd174bd`; 5/5 CI GREEN na execução `39459840466`. Não validar automaticamente as mudanças de UI posteriores.
- **Download oficial permanente do CLEAN aprovado:** https://github.com/pedrokam700/Central-de-Controle-/releases/download/ames-v0.5.25-factory-20261020/AMES_Central_CLEAN_e60cef8d.zip
- **Verificação GitHub Releases**: tag `ames-v0.5.25-factory-20261020`, target commit `e60cef8d4f033c4654b3fb730573e1ecfdd174bd`, digest ZIP `sha256:f73f12f2894e666700231b1fc9c7e16252e03ddebdf307ae807c2b52451bc152`, íntegro, sem SQLite de produção. A release foi criada pelo GitHub Actions lendo **somente** o artifact verificado dessa execução, sem reconstruir código diferente.
- **Novo candidato de UI nesta PR42**: onboarding e saúde de sincronização no Console existente, **ainda requer CI do seu HEAD final e validação física**. Não mudar `main` nem URL oficial antecipadamente para fingir que já está disponível a todos.

## Um PC virgem

**Somente visualização de dados da equipe:** abrir o link autorizado da Central, entrar com conta ativa, abrir Console MES → Configurar posto → `Este PC só consulta dados`. Não instalar agente, não tentar conectar localhost de outro PC. Monitoramento mostra os snapshots sanitizados publicados por A, com `receiving=server_confirmed` somente após resposta online do Firestore; cache/sem evidência/conflito ficam distintos de zero.

**PC novo que realmente vai coletar:** Central → Configurar posto → `Este PC coleta A-MES` → `Primeira instalação neste PC` → link permanente do GitHub Release. Conferir digest no PowerShell:
`(Get-FileHash -Algorithm SHA256 .\AMES_Central_CLEAN_e60cef8d.zip).Hash.ToLower()`
com `f73f12f2894e666700231b1fc9c7e16252e03ddebdf307ae807c2b52451bc152`. Extrair em pasta **nova e independente**; executar `00_INICIAR_AQUI.bat`; no primeiro uso instala dependências e cria banco local daquele PC, sem importar SQLite de outro. Login do A-MES permanece manual e depende da rede da fábrica. O navegador da Central autenticado precisa ficar aberto para publicar Firestore; rede A-MES não depende de cloud.

## PC A que JÁ possui agente

- Acessar a Central local no **próprio** PC pela URL `http://127.0.0.1:8765/Central-de-Controle-/`, idealmente via launcher. O localhost **não é** a máquina de outro funcionário. A identificação da fonte se faz com /ready, /health e /v2/capabilities com token local da aba autorizada; uma porta HTTP sem credenciais não prova o conteúdo do SQLite.
- Para ir do launcher local até o endereço HTTPS oficial, usar **Abrir HTTPS oficial pareado neste computador**; token no fragmento é consumido em sessionStorage e retirado da URL. Nunca colar ou compartilhar o URL contendo token.
- Se a Central HTTPS receber HTTP 401, mostrar `Agente encontrado · falta pareamento`, não `agente inexistente`. Se uma chamada for bloqueada por CORS/PNA/Chrome, dizer `não foi possível confirmar` e oferecer abertura local. **Nunca** exibir “instalado” somente porque um hostname respondeu; autorização e capacidade precisam estar comprovadas.
- Não reinstalar sobre o SQLite/backup/outbox já em uso; o CLEAN GitHub é **instalação nova**. Atualização in-place exige backup validado e updater com rollback. Uma única instância usando a porta 8765.

## PC A → Firestore → PC B (físico ainda pendente)

1. PC A: Central logada + agente conectado; selecione Linha 2 e Linha 3 e confira snapshots reais, período 07:00→07:00, `source_id`, `snapshot_id`, revisão. Sem MES novo se os dados já estiverem no SQLite.
2. A publicou quando índice de histórico imutável e partes foram confirmados no Firestore e a fila `pending=0`. Um `shared_history_legacy_conflict` pode indicar head antigo bloqueado mas histórico imutável disponível. Evitar ler `synchronized` como prova do B.
3. PC B: conta ativa, link oficial, sem acesso MES; escolher `somente consulta`. Comparar **mesma linha / dia operacional / snapshot / revisão** recebida com A. Deve indicar leitura confirmada pelo servidor, não cache. Testar histórico da Linha 3 e Linha 2, inclusive 16/10 e fonte anterior, sem forçar origem de outro posto.
4. Testar queda/reconexão, retorno da aba, preservação da outbox IndexedDB, atualizações tardias 3012/AT como **nova revisão do período original**, mudança de usuário e isolamento. A página aberta em A publica periodicamente (~15 s); a varredura histórica percorre lotes 8/90 s. **Aba fechada não publica**, ainda que o agente salve no SQLite.
5. Coletas locais completas de SN/3074/2114/3022/3012, capturas brutas e journal de reparo **não são compartilhadas integralmente** pelo Firestore atual. PC B recebe projeções canônicas e índices permitidos, não sessões MES ou SQLite de A. Distinção `não coletado != zero` sempre.

## Arquitetura preservada / segurança

Uma Central, um state.ames, agente local na porta 8765 e SQLite local; exatamente nove views MES. Publicador não é nova view nem novo agente. Dados sanitizados sob regras Firestore atuais; não implantar novas regras na produção sem inspeção/teste físico. Nem Firebase/Auth, nem main, nem 3028/3074/2114/3022/3012 sofreram alteração pelos ajustes desta etapa. Source_id e snapshots pré-existentes ficam imutáveis. Novo widget de instalação é parte do botão `Configurar posto`, disponível também no mobile; download exibido somente com manifesto GitHub Release em domínio/path esperado, SHA completo e hash.

## O que continua pendente

- Publicar/atualizar interface no endereço HTTPS usado pela equipe **somente após homologar o novo SHA** e confirmar o método atual de distribuição da Central. O GitHub Release do GREEN já está disponível agora para download direto; isso não significa que a nova UI foi distribuída via web.
- Gate físico A/B — dados e revisão idênticos em dois PCs, Firestore de produção devidamente autorizado, reconexão e saúde dos estados. Não tratar testes do emulador como prova física.
- Updater seguro da instalação existente sem substituir SQLite; transporte offline completo para PC sem internet, e Consulta por SN remota completa são evoluções que exigem projeto e gate próprios, não entram falsamente como prontos nesta etapa.
