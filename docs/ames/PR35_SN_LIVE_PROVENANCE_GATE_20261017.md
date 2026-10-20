# PR #35 — Bloco 15 · proveniência da Consulta por SN ao vivo

## Escopo
A Consulta por SN já possui estados de fonte (3028/3074/2114/3022/3012), base SQLite e detalhes históricos. Este bloco adiciona **somente** a rastreabilidade de cada resposta A-MES ao vivo num painel técnico recolhido, sem mudar coletor nem disparar outra consulta.

## Regras de aceitação
- Painel `Proveniência das fontes · consulta ao vivo` fica recolhido por padrão, imediatamente após badges da consulta SN.
- Exibe status por fonte do `buildLiveSnForensics`, usando a consulta atual: `ok`, `zero`, `not_collected`, `unavailable`, `error`, `partial`, `cached`. Não mistura uma fonte com outra.
- Snapshot ID, revisão, collected_at, source_id, workstation_id, período início/fim só aparecem se **explicitamente presentes dentro daquela fonte**. Defect Time, Repair Time e Tran Time **não** são substitutos de collected_at.
- `local_snapshot` 3028 é cache; nunca afirmar que corresponde a nova coleta em tempo real. SN isolado não comprova linha, CPH ou posto de origem.
- Ausência de metadados aparece como `—`, jamais como zero, PC inventado ou data estimada; erro de 3074 não apaga 2114/3022/3012.
- PT/EN, escaping dos valores, sem inserir HTML recebido do MES.
- Atualização de idioma, troca de SN e re-render substituem o painel, sem duplicá-lo.
- Coletores 3012/3022/3028/3074/2114, Firebase, porta 8765, PR #33, `main` e candidate físico intocados.

## Validação
- Node: `scripts/ames-sn-source-provenance.test.mjs` e outras suítes `ames-*.test.mjs`.
- Browser: `scripts/ames-experience.browser.mjs` com as 9 views e PT/EN.
- Python/canônico/agent+Firestore no GitHub Actions, SHA exato, separando smoke externo de GREEN interno.
- Produção/fábrica: **PENDING** até evidência da máquina com MES. Nenhum merge/deploy baseado apenas em CI.
