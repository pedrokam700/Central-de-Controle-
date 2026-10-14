# Mapa de arquitetura ativa — Central + A-MES

Este arquivo reduz a ambiguidade causada pelo histórico do repositório sem apagar referências antes do GREEN físico.

## Caminho ativo do produto

### Central / Console
- `index.html` + `app.js`: shell oficial da Central.
- `ames/console-view.mjs`: entrada das 9 views MES nativas.
- `ames/data/*`: contratos, store, canonicalização, selectors e regras de leitura.
- `ames/sync.mjs` + `ames/firebase-sync.mjs`: compartilhamento sanitizado/offline; não substituem o SQLite local.

### Agente local canônico
- `ames/agent/agent_hardened_entry.py`: entrypoint canônico endurecido.
- `ames/agent/agent_entry.py`: boundary de compatibilidade R11/R12.
- `ames/agent/agent.py`: servidor/base operacional preservado.
- `ames/agent/store.py`: SQLite operacional.
- `ames/agent/canonical.py`: contrato canônico para o Console.
- `ames/agent/mes_scheduler.py`: scheduler serial/FIFO.
- `ames/agent/ames_3028*.py`, `repair_3012.py`, `ames_3012_live.py`, `process_*`, `network_watch.py`: fontes e extensões do agente atual conforme gates.

## Referência/compatibilidade — não usar como segunda arquitetura

- `ames/factory-engine/`: motor histórico e referência de comportamento/regressão. Não criar um segundo runtime a partir dele.
- `v2/`: protótipo histórico da migração/fusão. Não é a Central atual.
- arquivos e módulos com `fastlane` no nome: parte do histórico/compatibilidade da evolução; não definem uma aplicação paralela.
- backups antigos na raiz (`V10*`, `V11*`, `index*erro*`, etc.): referência histórica; não são entrada ativa do produto.

## Regras de evolução

1. Uma Central, um `state.ames`, um agente local, um SQLite e um scheduler.
2. Não criar iframe, loader, proxy ou segundo store para resolver feature nova.
3. Não substituir coletores validados sem regressão e evidência.
4. `production_day_start` é limite do dia de coleta; `work_shifts` classifica turno. Não são a mesma coisa.
5. Local primeiro: a operação não depende de Firebase/Vercel para coletar ou consultar o notebook da fábrica.
6. Cloud serve compartilhamento sanitizado e estado da Central; não vira autoridade sobre evidência MES local.
7. Antes de remover arquivos históricos, concluir gates físicos, registrar tag/checkpoint e confirmar que nenhum teste/build depende deles.
