# Agente 0.5.24-rc1 — candidato, NÃO GREEN fabril

Base funcional V0.5.23; baseline de fábrica V0.5.20 para 3028/3074/2114.
Central oficial: https://central-cora-v2.vercel.app

## Atualizar uma instalação existente

1. Pare monitor/coletas e encerre o agente. Preserve a pasta antiga.
2. Extraia este ZIP em outra pasta. Não extraia por cima da instalação.
3. Na pasta candidata execute:
   `ATUALIZAR_CANDIDATO.bat "C:\pasta\instalacao-existente"`
4. O atualizador verifica os coletores, faz backup automático de código/config e
   backup SQLite consistente em `candidate-backups/<id>`, depois aplica seis módulos.
   Configuração local e dados são preservados. As origens exatas aprovadas da Central/preview são adicionadas sem wildcard.
5. Inicie pelo `00_INICIAR_AQUI.bat` original. Para o gate físico do PR #23 use
   `ABRIR_PREVIEW_PR23.bat`; `ABRIR_CENTRAL_V2.bat` continua abrindo a produção e
   não deve ser usado como evidência de validação do PR. Confirme no GitHub que o
   deploy-preview está associado ao SHA exato em teste antes de iniciar o gate.
6. Conecte pelo Console MES. Permita acesso à rede local no navegador se solicitado.

Instalação nova: use `00_INICIAR_AQUI.bat` da pasta candidata. O ZIP não distribui
banco de fábrica, cookies, sessão, perfil Chrome nem senha Wi-Fi. Dependências,
bootstrap, rede, Wi-Fi por perfil existente e migration helper são os originais.
Para conservar a identidade sincronizada entre máquinas, migre a base existente.
Nunca execute dois agentes contra a mesma sessão Chrome/CDP.

## Rollback

Pare o agente. Execute `ROLLBACK_CANDIDATO.bat "C:\pasta\instalacao-existente"`.
Restaura os três módulos V0.5.23 originais incluídos no ZIP, após novo backup.
O SQLite é preservado, inclusive coletas posteriores; a migração é aditiva.
Para voltar especificamente ao código/config anterior à atualização:
`py -3 ames-agent\update_candidate.py rollback "C:\pasta\instalacao" --backup "C:\pasta\candidate-backups\ID"`.
Os bancos de backup são recuperação manual, não sobrescritos automaticamente.
A UI isolada e `03_ABRIR_CENTRAL_LOCAL_FALLBACK.bat` continuam disponíveis.

## Contrato e limites

- Um agente/scheduler FIFO. Monitor ocupado pula o ciclo sem backlog.
- SQLite, transformações e Excel fora do gate. Poll 850 ms e refresh parcial
  apenas quando alterado e >2200 ms. Perfis/waits originais mantidos.
- `/api/v1/v2/capabilities`, `/v2/snapshots` e `/v2/records`: revisões imutáveis,
  cursor por revisão/linha/dataset, proveniência e cobertura explícita.
- IDs duráveis locais identificam observações do snapshot, não IDs globais MES.
  Duplicidades indistinguíveis já perdidas no legado não podem ser reconstruídas.
- Históricos expõem todos os contextos possíveis; não escolhem a primeira linha.
- Sync autenticado é por conta/linha, sem raw payload, credenciais ou sessão.
  Outro PC entra com a mesma conta. Não há compartilhamento indiscriminado entre usuários.
- 3022: contrato/adapter/storage/projeções prontos; coletor real ausente.
  Somente evento válido mais recente <= Defect Time. Empates são ambiguidade.
- Não há benchmark nem aprovação de fábrica desta versão.

## Checklist no posto

- [ ] Backup concluído e rollback localizado; instalar candidato, iniciar agente.
- [ ] Confirmar SHA do PR #23 e abrir `ABRIR_PREVIEW_PR23.bat`, não a produção.
- [ ] Chrome/CDP, rota e Wi-Fi por perfil existente; login manual A-MES.
- [ ] Central conecta; testar linhas 1, 2 e 3 separadamente.
- [ ] 3028, 3074, 2114, SN, reparos, período/turno e escopo.
- [ ] Monitor durante coleta pula ciclo; cancelamento libera próxima operação.
- [ ] Perfis fast/balanced/safe; comparar duração com V0.5.23 isolada.
- [ ] Reuso PCBA/material, matriz, contadores e drill-down conferem com fonte.
- [ ] Excel abre com 11 sheets; PROCESSO_3022 sem dados inventados.
- [ ] Fechar/reabrir preserva configuração/base; outro PC lê revisões sincronizadas.
- [ ] Fallback local disponível; testar rollback antes de declarar baseline fabril.
