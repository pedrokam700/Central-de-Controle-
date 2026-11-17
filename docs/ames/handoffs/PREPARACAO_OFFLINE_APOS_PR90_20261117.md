# Handoff — preparação offline após PR90

17/11/2026, America/Sao_Paulo. **Preparação documental; execução BLOQUEADA;
homologação física PENDENTE.**

Base exclusiva: PR90 `83f5db58438318c726c9b22a8d0a2d8d78124c81`.
Branch isolada: `work/ames-offline-homologation-plan-20261117`.
PR/HEAD/CI da entrega constam no checkpoint final da discussão da nova PR DRAFT.
A base #90 já tem CI de software 44113137883; ela não prova Windows/backup real.

Entregas:

- [Checklist supervisionado completo](../homologation/HOMOLOGACAO_OFFLINE_0539_PR90_20261117.md):
  gates G0–G7, passos para futura autorização, critérios PASS/FAIL/STOP/PENDING,
  segurança de backup/WAL e rollback com novas escritas, nove telas/SW/escala.
- [Template vazio de gates](../homologation/OFFLINE_GATES_TEMPLATE.json): nenhum
  gate executado/assinado e nenhum dado real. Limiares LAB apenas propostos.
- [Evidência estática](../audits/evidence/OFFLINE_PREPARACAO_ESTATICO_20261117.json):
  hashes somente de fontes públicas, achados e limites. Não contém inventário
  real de posto, credenciais/configuração privada ou fingerprints de banco.
- `scripts/audit/offline-homologation-static.test.py`: 13 contraprovas AST/texto,
  sem import do runtime/updater/builder, subprocessos, Windows ou SQLite.
- Workflow estático usa Python/Node já existentes no runner, sem setup/pip/npm,
  sem testes que executam atualização, browser, builder ou upload de artefato.

D01: rollback legado restaura agente antes de validar todos os arquivos de raiz;
backup incompleto pode deixar código parcialmente restaurado. Proposta: PR isolada
com RED de zero mutações, validação de todos os paths/hashes e staging/journal.
D02: helper PowerShell dot-sourced pelo launcher/guardian existe no mapa do
builder, mas falta na lista copiada/backupeada pelo updater. Proposta: fechamento
transitivo de entrega/cópia/backup/rollback, destino sem helper ou com versão antiga.
**Nenhum dos dois foi corrigido neste escopo.** Não atribuir falha ao posto real.

P01–P08 bloqueiam execução sem prova adicional: launchers não são offline/dry-run;
transferência copia identidade; import/boot muda dados/inicia monitor/guardian;
preflight não prova JSON1/versões/tzdata; shell frio exige SDK externo; engine/perfil
podem escapar da pasta; readiness não é lease; rollback à raiz antiga não reconcilia
nova evidência. Os contratos e tratamentos estão no checklist.

A sequência futura exige: inventário sem mutação → exclusividade atestada →
captura privada coerente DB/WAL/estado externo → backup lógico e restauração em
cópias → derivado sem identidade → comparações antes/depois → UI/recuperação/SW →
rollback sem sobrescrever novos dados → decisão supervisionada. Nenhuma dessas
etapas operacionais foi executada. Sem anonimização validada, usar só sintético.

Não executar os launchers normais para descobrir se os gates passam; não limpar
cache/IndexedDB/outbox/claims; não ligar Internet/MES para aquecer perfil; não
copiar perfil ou identidade operacional. PASS estático confirma achados, não
homologação nem correção de D01/D02. Futuro ensaio LAB não autoriza fábrica.

Únicas mudanças fora de documentação/teste/CI: supressão de auto-preview SOMENTE
nesta branch em Vercel/Netlify, antes do primeiro push. Nenhuma mudança em `ames`,
`tools`, `core`, templates, service worker, dependências ou runtime produtivo.
Main e PRs anteriores preservadas. Sem dados reais/configurações sensíveis no GitHub.
Sem builder, ZIP, instalação, atualização, backup/restore, MES, guardian/rede/Firebase,
merge, deploy, release, instalador ou homologação. **Física PENDENTE.**
