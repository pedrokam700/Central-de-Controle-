# Central + A-MES: reconciliação CLEAN V3 / PR23 / PR26 / CLEAN V5

Baseline física: CLEAN V3. CLEAN V5 é implementação a auditar, ainda sem GREEN físico.

- PR23 revalidado em `3a6602871bf1ba9cdd57f41ba9f355952daeea47`.
- PR26 revalidado em `f561a6ba65d80fef59e586e5b060a8cfbac79bc5`, incorporado como ancestral de merge da branch integrada.
- Recuperação anterior preservada no checkpoint remoto `63ec41157209c15bc4e5742c69e985cf84217fb1`.
- Branch de trabalho: `work/ames-integrated-clean-v5-20261013`. Sem merge em main, deployment de produção ou publicação de Rules.

## Reaproveitamento e diferenças

| Origem | Incorporado | Reconciliação |
|---|---|---|
| Trabalho recuperado / V3 | Motor fabril, SN e histórico de materiais, RAW 3022 e operador, tabela configurável, Shift ExtJS, startup e bundle local | Um agente, scheduler FIFO e SQLite; UI nativa com nove views |
| PR26 | 3012, consulta SN offline, guardian, readiness e proteção contra desconexão HTTP | Históricos offline incluem resultados individuais persistidos; startup aponta somente para loopback; tabela duplicada de reuso removida |
| V5 | Classificação temporal de produção e Check FPY em cards pequenos | Campos `production_shift`, `production_operational_date`, `production_event_time`, `production_shift_source=3022`; horários UTC da grade convertidos ao fuso fabril; sem fallback para Defect Time |
| 3012 PR26/V5 | Grid/store ExtJS e campos de defeito/reparo/análise | Corrigida assinatura do evento load; timeout rejeita grade antiga; valida campos e paginação; IDs/proveniência preservam divergências. Nenhuma nova view |
| Guardian PR26/V5 | SSID, interface/índice, rota, alcance, log e recuperação conservadora | Recusa reparo se TAXXX_5G/interface não confirmados; somente 172.29.185.215/32; sem mudanças em DNS/proxy/gateway Ethernet |
| Tabelas | Busca, filtros combinados, colunas/ordem/largura/presets, exportação CSV | CPH exato; turno e Repair User; KPIs de PCBAs e vínculos separados; drill-down mantém SNs exatos |

## Evidência e limites

3022 temporal é classificação/correlação, nunca causa raiz. 3012 permanece fonte complementar: candidatos da mesma PCBA não sobrescrevem 2114/3028. Cobertura parcial e ausência local continuam explícitas. Operador é extraído somente de campos identificados; o exemplo nominal do posto não foi comprovado pelos anexos.

Hashes congelados (gate obrigatório):

- `ames_3028.py`: `829da91ba7b685f4594bae2aad737f1eea64d7b1eaa8073e8bb263748fbe1ca1`
- `ames_3028_live.py`: `b512d42ad39fad326252264ce57f98f3731db5161ab8625cf5b244dffffad0e2`

Testes direcionados: 4 Python (fronteiras/fuso/ausência, migração/revisão/reparo/offline, segurança do guardian, divergência 3012) e 13 Node (inclui os contratos anteriores de reuso, 3028, Shift ExtJS e processo) passaram. Quality Gate completo: registrado no relatório final da branch/bundle.

Gates físicos restantes: seleção automática Shift 2114; 3012 com campos/filtros/paginação reais; turno por processo 3022; desconexão/reconexão TAXXX_5G e rota /32 persistente; reboot e desempenho do candidato integrado. V3 funcional na fábrica não transfere GREEN para esses deltas.
