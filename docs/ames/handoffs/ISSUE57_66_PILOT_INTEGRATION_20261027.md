# Candidato de integração Issue #57 + Issue #66 — 27/10/2026
Status: PARCIAL, NÃO INSTALAR. Branch de integração independente, sem tocar PR #64/PR #68.
Base PR68 SHA aed135624320f1c4a76fc95731c538d8e583c3e6; guardian/update PR64 SHA 9b8140413984347e71df1af65aabd4ac1e9b5231; main oficial 0.5.39 preservada.

Foram incorporados 61 arquivos EXCLUSIVOS da PR64 que não estavam alterados na PR68.
Ainda restam 8 arquivos comuns, exigindo reconciliação explícita sem perder alterações: 
- .github/workflows/ames-operational-history.yml
- .github/workflows/quality-gate.yml
- ames/agent-client.mjs
- ames/console-view.mjs
- ames/sync.mjs
- app.js
- scripts/build-integrated-candidate.py
- sw.js

A CI da integração parcial é diagnóstica; não declarar GREEN geral prematuramente. update_authorized=false.
Fábrica 27/10: agente PR68 selftest Windows com porta efêmera, 5/5 hashes e Python, antiga pasta dbe424da ~120 MiB, backup preliminar tree/SQLite/restauração True. Porta 8765 livre após reboot e busca de guardian por nome sem retorno. Isso NÃO comprova ausência de relançadores/abas em outros perfis.
Não pedir repetição dos 63 bancos. Não iniciar agente novo na 8765 nem alterar dados/guardian até backup, drenagem, lease e rollback realmente integrados.
Pendências: reconciliar 8 conflitos, integrar packaging, CI, instalação supervisionada, validação física 3074/L3, rollback e identidade multi-PC.
