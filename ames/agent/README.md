# Agente 0.5.25-rc1 — código candidato, NÃO GREEN fabril

Base funcional preservada da automação local e arquitetura canônica da Central V2.
Baseline de fábrica: V0.5.20 para 3028/3074/2114; R12 local continua sendo a
referência operacional que precisa ser comparada fisicamente antes da promoção.

## Estado atual

- 3028 validado permanece byte-a-byte congelado no pacote candidato.
- 3074 e 2114 continuam usando o motor local e o scheduler MES único.
- 3022 em lote agora existe no agente canônico por `agent_entry.py` +
  `process_r11.py`, reaproveitando o contrato temporal real provado no R11:
  `Tela3022`, `correlacionar_falha_3022` e `extrair_passagens_processo`.
- O adapter se recusa a anunciar `process_timeline` se o motor instalado não
  expuser esse contrato. O código é explicitamente marcado
  `R11_DERIVED_R12_FACTORY_GATE`; isso não equivale a afirmar paridade R12.
- `full`, `process_only` e `reuse_only` são executados pelo mesmo agente/scheduler.
- `process_defect_contexts` e `process_events` ficam no mesmo SQLite e também são
  projetados para a timeline canônica `/v2`, sem transformar timing em causa.
- A interface operacional é somente a Central V2. A UI V0.5.23/R12 é referência
  funcional/visual e rollback de segurança, não uma segunda aplicação ativa.

## Computador que já possui a R12

1. Preserve a pasta R12 e o SQLite como rollback.
2. Pare monitor/coletas e o agente antes da atualização.
3. Aplique o candidato canônico; o updater faz backup consistente do SQLite,
   código, configuração e iniciadores do posto antes de substituir arquivos.
4. Inicie por `INICIAR_POSTO_CENTRAL_V2.bat` (também publicado como
   `00_INICIAR_AQUI.bat` no pacote fundido).
5. O launcher verifica/instala o ambiente local quando necessário, tenta o perfil
   Wi-Fi OPPO já salvo, aplica somente a rota temporária `172.29.185.215/32`,
   inicia o agente canônico, abre o Chrome/CDP e então abre a única Central.
6. O login do A-MES continua manual. Nenhuma senha/cookie/sessão/CDP/senha Wi-Fi
   é armazenada ou enviada ao Firebase.

## Computador novo

O ZIP público `0.5.24-rc1` anterior foi bloqueado no onboarding porque não contém
esta fusão atual. Não use esse ZIP esperando paridade R12.

O código do pacote fundido está preparado pelo `build-agent-candidate.py`, porém a
publicação do novo ZIP permanece bloqueada até capturarmos/compararmos a R12 exata
do notebook da fábrica e executarmos o gate físico. Até lá, `release.json` deve
manter `package_available=false`.

## Offline / rede

- O A-MES local independe da nuvem: `127.0.0.1:8765` + Chrome/CDP 9222 + rede OPPO.
- A rota temporária usa `ActiveStore`, somente para `172.29.185.215/32`, sem trocar
  gateway padrão, DNS ou proxy. Reiniciar o Windows remove a rota.
- O shell da Central e suas views nativas são precacheados pelo Service Worker.
- O Firestore é inicializado com cache persistente antes de `app.js`; após um
  primeiro acesso online válido, conteúdo já sincronizado pode continuar
  disponível durante perda de internet/reinício, sujeito às políticas do navegador.
- Escritas operacionais suportadas pela fila offline permanecem locais e são
  sincronizadas quando a internet externa retorna.
- Um computador totalmente novo ainda precisa de internet pelo menos para o
  primeiro login Firebase e para obter/instalar o pacote local.

## Rollback

O updater nunca apaga/reset o SQLite. Cada atualização gera backup em
`candidate-backups/<id>` e preserva configuração e identidade local. O rollback
restaura os arquivos anteriores do agente e os iniciadores do posto a partir desse
backup. A antiga interface isolada pode ser mantida fisicamente como contingência
até o 9/9, mas não é o runtime principal da Central.

## Contrato e limites

- Um agente/scheduler FIFO. Monitor de baixa prioridade pula quando MES está ocupado.
- Lock cobre somente a seção crítica A-MES/Chrome e sempre é liberado em `finally`.
- `/api/v1/v2/capabilities`, `/v2/snapshots` e `/v2/records`: revisão/cursor,
  `source_id`, `record_id`, `content_hash`, proveniência e cobertura explícita.
- IDs são duráveis localmente, não IDs globais inventados do MES.
- Linha continua isolada; CPH é exato; ausência nunca vira zero.
- PCBA reutilizada e Material SN reutilizado continuam conceitos separados.
- Manual/Automatic continua significando como a falha foi registrada.
- Regra 3022 permanece: ocorrência atual → Defect Time → posto relevante → última
  passagem concluída válida `<= Defect Time`, nunca simplesmente o último evento.
- CORA recebe fato/correlação/hipótese/causa humana separados.
- CI/preview verde não substituem validação física R12 nem benchmark de fábrica.

## Gate físico obrigatório antes de merge/promoção

- [ ] Frontend SHA corresponde exatamente ao HEAD do PR #23.
- [ ] Backup/rollback localizados e reboot/bootstrap validados.
- [ ] Chrome/CDP, Ethernet + OPPO, rota temporária e login manual A-MES.
- [ ] 3028 hoje/dia anterior e L1/L2/L3 sem mistura.
- [ ] Shift 2114 automático sem OPC manual.
- [ ] 3074/2114 com reuso PCBA/material e PCBAs anteriores exatas.
- [ ] 3022 simples, múltiplas passagens e retrabalho comparados com a R12 local.
- [ ] `full`, `process_only`, `reuse_only` e cancelamento/concorrência.
- [ ] Consulta SN, Falhas, Reuso, Processo, Base local e CORA.
- [ ] Excel, desktop/mobile, reinício e persistência offline.
- [ ] Performance por linha comparada com a automação R12 antes de qualquer GREEN fabril.
