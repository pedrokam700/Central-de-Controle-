# Central de Trabalho + A-MES — ponto canônico de retomada

> Este arquivo é um **checkpoint**, não uma fonte eternamente atual. Antes de qualquer alteração, revalide o GitHub. A fonte de verdade é: Roadmap #28 + PR ativo #27 + HEAD remoto + workflows/gates do HEAD exato.

## Bloco 4 em andamento — 2026-10-15

Leia primeiro `docs/ames/operator-block4-20261015.md`. A1 (formatação de horários)
salvo; próximas subpartes e testes estão nesse checkpoint. Blocos 1–3 preservados.
Não rodar gates pesados/Bloco 5 antes de concluir Bloco 4.

## Checkpoint anterior — Bloco 3, 2026-10-15

Blocos 1 e 2 concluídos e preservados no parent `403b5878f3000b9c363c9e4eca63fe1b51175cbf`.
Bloco 3 de correlações técnicas concluído em código + 30 testes direcionados PASS.
O SHA deste checkpoint está nos comentários da Issue #28 e PR #27.
Leia primeiro `docs/ames/operator-recovery-20261015.md` (seção Bloco 3).
Próximo: Bloco 4 de UI/histórico; não refazer Blocos 1–3. Full Quality/Candidate
finais e validação física continuam PENDING. Nenhum CLEAN gerado neste bloco.
As referências anteriores abaixo são históricas e exigem revalidação.

## Ordem obrigatória ao retomar

1. Ler o Roadmap Mestre: Issue **#28 — ROADMAP MESTRE — Central de Trabalho + A-MES**.
2. Revalidar o PR **#27 — AMES: operator UX parity for traceability and SN investigation**.
3. Confirmar a branch ativa `work/ames-operator-ux-parity-20261014` e o HEAD remoto atual.
4. Verificar os workflows/gates associados ao **SHA exato** antes de declarar qualquer estado automatizado.
5. Separar sempre `CI GREEN` de `FÁBRICA GREEN`.
6. Só depois comparar este checkpoint com o remoto e continuar.

## Checkpoint registrado em 2026-10-14/15

- Roadmap canônico: **#28**.
- PR de execução/estabilização: **#27**, aberto/draft, não mergear sem nova validação física.
- Branch: `work/ames-operator-ux-parity-20261014`.
- HEAD no momento deste checkpoint: `39e14e5c275582f7cb87015ee028e448c955c5ad`.
- A-MES Integrated Full Quality no SHA acima: **GREEN automatizado** (`38659187195`).
- A-MES UX Physical Candidate no SHA acima: **GREEN automatizado** (`38659187125`).
- Resultado físico do candidato acima: **PENDING**. CI/Windows smoke não substituem fábrica.

## Arquitetura que não pode regredir

- **Uma Central**.
- **Um `state.ames` / uma sessão operacional**.
- **Um agente local** em `127.0.0.1:8765`.
- **Um SQLite local** como base factual offline do posto.
- **Exatamente 9 views MES**; não criar 10ª view paralela, mini-app, store, agente ou banco duplicado.
- Console MES é uma view interna da própria Central; Central ↔ Console não deve relogar nem fazer roundtrip canônico para outra aplicação.
- A coleta MES local não depende da nuvem.
- Não sincronizar senha, cookies, sessão A-MES, CDP ou credenciais Wi-Fi.
- `unknown != zero`: não coletado, indisponível, erro, parcial, cache e zero comprovado são estados distintos.
- Correlação/reuso/processo nunca promovem automaticamente hipótese a causa raiz.

## Gates físicos conhecidos

### GREEN físico / congelado salvo nova evidência

- Bootstrap/porta 8765: correção de arbitragem validada fisicamente. **Não mexer sem nova evidência**.
- Bootstrap histórico aprovado no commit `cc1f61c7855abb1e1cff1eb4f4d2e240ce42fa71`.

### PENDING físico

- 2114: seleção automática real do Shift sem intervenção manual.
- 3022: latência real por PCBA e risco de grade ExtJS antiga durante troca de SN.
- Consulta por SN: repetir caso real em que a PCBA atual tem falha e a PCBA anterior também tem falha; ausência de uma fonte não pode virar “não existe”.
- Dashboard de reuso: validar cards/drill-downs positivos com evidência real.
- Persistência de Linha/Turno/CPH/Falha entre as 9 views em uso real.

## Estado funcional consolidado

Já existe em grande parte e deve ser **auditado/polido, não refeito do zero**:

- Consulta por SN operador-first com 3074 + 2114 + 3022 + 3012 + SQLite local e degradação por fonte.
- Recuperação de falhas da PCBA atual e PCBAs anteriores a partir da 2114/local cache quando a associação resumida falha.
- Repair User / Repair Comment e evidência 3012 quando disponíveis.
- Processo 3022 com preservação do bruto e separação montagem/teste/packing baseada em evidência.
- Base local estilo SAP: catálogo/datasets, busca, filtros, ordenação, escolha de colunas, presets, paginação e exportação.
- Assistência Técnica offline usando SQLite local; ainda evoluir transportabilidade/sincronização e cobertura/data da base.
- Central do Dia: checklist tipado, valores/evidências, rotinas editáveis, histórico, política de atraso/não cumprimento e exclusão segura de registros de teste.
- Dashboard administrativo com filtros/alocação/execução como baseline a auditar.
- Notificações internas + navegador + antecedência como baseline parcial.
- Sincronização multi-PC/snapshots como baseline parcial, sem tornar a nuvem caminho crítico.
- Atualização do posto já possui backup de SQLite, validação de hashes e rollback explícito; falta consolidar UX/migração/health check automáticos.
- Saúde/proveniência e auditoria local já existem; observabilidade de desempenho ainda precisa ser ampliada.

## Próxima tranche autorizada

**Observabilidade não invasiva da 3022, antes de otimizar waits.**

Objetivo imediato:

- medir navegação 3022;
- medir tempo total da consulta por PCBA;
- separar tempo gasto dentro do coletor do tempo de parsing/correlação/persistência/timeline;
- registrar resultado, linhas retornadas, `no_data`, erros, timeout/empty-confirm configurados e métricas reutilizáveis;
- preservar comportamento atual até existir evidência para reduzir espera;
- usar a Base local/Auditoria para permitir inspeção/exportação do diagnóstico sem poluir a UX diária.

Depois do primeiro teste físico com essas métricas, decidir se vale instrumentar internamente o polling ExtJS/primeira mudança de grid ou otimizar a espera adaptativa.

## Recursos GATED — não implementar agora

- Hotspot de processo.
- Investigações persistentes.
- Genealogia visual.

Só liberar conforme a ordem do Roadmap #28 e depois de a base factual anterior estar confiável.

## Regra para futuras conversas/agentes

Nunca responda “o que falta” apenas pela memória ou por este arquivo. **Revalide #28, #27, HEAD e gates primeiro.** Se um requisito do roadmap estiver marcado BASELINE/AUDITAR, procure a implementação e os testes existentes antes de propor nova arquitetura. GitHub é a fonte de verdade; este arquivo existe justamente para impedir que uma conversa volte para um estado antigo como V0.5.23 quando a branch já avançou muito além dele.
