# V2 — status de implementação

Continuidade: Issue #21, PR draft #22, branch `v2/native-fusion`.

## Auditoria entregue

`V2_AUDITORIA_ARQUITETURA.md`: baseline `8cbd5fee9558e5e60e312faea583a85435915dda`, 23 achados, modelo alvo, oito fases de implementação após a auditoria e matriz de gates. Primeiro checkpoint documental: `c352693`, publicado antes do código. Markers V2 antigos são históricos e não autorizam outra branch.

## Corte seguro — fundação de leitura (fase 1 parcial)

- `ames/data/contract.mjs`: projeção conservadora do schema legado, identidade por linha/snapshot, CPH exato, cobertura parcial e ausência de evidência explícita. Valores inválidos/desconhecidos não viram zero.
- `ames/data/store.mjs`: estado nativo em `state.ames`, seleção explícita local/remoto/cache e consultas por linha/produto/defeito/PCBA. Documentos remotos são substituídos integralmente para refletir deleções. Duplicatas ambíguas por linha são rejeitadas.
- `app.js`: reutiliza Firebase/Auth/listener aiKnowledge existentes; não cria segundo app ou coleção. Listeners protegem troca de sessão e respostas tardias. Logout limpa todas as coleções em state e o store MES.
- Contrato 3022 puro: eventos válidos da mesma linha/PCBA, tempo explícito e último evento <= Defect Time; empate sem ordenação comprovada permanece ambíguo. Não há coletor nem dado real 3022.
- Build do shell `15.1.13.41`; novos módulos incluídos no cache. Isso é versão técnica do shell, não promoção da V2 nem da release do agente.
- 18 testes comportamentais, incluindo execução dos listeners reais do shell em ambiente isolado, e 62 checks do Quality Gate local passam. O workflow existente executa a suíte nova via quality-gate.mjs.

## Limites e próximo corte

Nenhum transporte local foi ativado e nenhum upload novo foi criado. As APIs replaceLocalSnapshots/setLocalConnected estão preparadas para o adaptador real, mas não detectam a porta nem comandam MES. O store lê snapshots já existentes; as views ainda não usam esses novos seletores para métricas. Rastreabilidade, onboarding, dados estruturados CORA e remoção do protótipo seguem pendentes.

Não inferir normalização completa 3074/2114 a partir de contagens: os respectivos datasets permanecem unavailable no adaptador legado. Campos de revisão, IDs duráveis, timezone e bruto não podem ser inventados. Projeção do leitor não substitui sanitização/autorização da publicação. A fila offline antiga e dados persistidos/conversas fora de state ainda exigem revisão de identidade.

Próximo passo seguro: obter fontes/API reais do agente referenciado pelo GitHub e fixar export coerente/paginado, IDs e evidências sanitizadas; em paralelo conceitual, desenhar regras e testes em emulador. Depois migrar views por etapas com smoke autenticado, desktop/mobile e gate de cada checkpoint.

Sem teste autenticado/mobile/fábrica neste checkpoint. V2/V0.5.23/3022 NÃO GREEN. V0.5.20 permanece baseline documentada. Não fazer merge na main.

## Evidência de CI do código

Checkpoint `dbeb3a679af9e14e62afb3664d0e6f90916f0535`: [Central Quality Gate, run 37857100470](https://github.com/pedrokam700/Central-de-Controle-/actions/runs/37857100470), concluído com sucesso. CI não substitui E2E autenticado, emulador de regras nem validação de fábrica.
