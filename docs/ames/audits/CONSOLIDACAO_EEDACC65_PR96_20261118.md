# Consolidação da próxima Central completa — EEDACC65 → PR96

18/11/2026, America/Sao_Paulo. Auditoria estática; nenhum builder importado ou
executado, nenhum ZIP criado. Esta preparação fica na mesma PR96 DRAFT, sem
abrir outra pesquisa. O objetivo seguinte é uma candidata completa para download,
com todas as melhorias acumuladas, após autorização específica para sua geração.

## Referência correta e alcance

O último pacote de TESTE informado pelo usuário é
`CENTRAL_AMES_PR70_3022_VELOCIDADE_RESTAURADA_EEDACC65_TESTE(1).zip`, origem
`eedacc65445dea9967a92085777b878c1ee9c123`. As referências anteriores são
`16980fb503573431c5ddcb4d5950b69459c34e21` e
`7e49cc45c5947dfabf7d70c049b8fada7be35082`. A main/release oficial 0.5.39,
`b283b1764432f5d90486d38a7553b30542a5c118`, é outra referência histórica; não é
o último pacote de teste recebido e não será usada para substituir esta linhagem.

Git confirma EEDACC65 ancestral direto da PR95, 116 commits depois, e da PR96.
PR70 final `fddc75438796cdfcc8a133eb8193d08fa1d9b783` acrescentou auditoria/testes
depois do EEDACC65. As PRs continuam abertas/DRAFT, sem merge; #85 é issue.
#74 foi integrada por cherry-pick `a7002afb` na #76, não por ancestralidade de
seu HEAD. A ausência desse HEAD na cadeia não implica perda dos seus blobs.

O [checkpoint de paridade anterior](https://github.com/pedrokam700/Central-de-Controle-/pull/95#issuecomment-6978726363)
relata leitura dos três ZIPs reais: 345 membros, CANDIDATE_MANIFEST com 344
hashes, LOCAL_BUNDLE_MANIFEST com 276; cobertura conjunta consistente. Também
relata que o `sw.js` empacotado foi transformado para usar EEDACC65 como revisão,
em vez da revisão literal do source. Isso é evidência histórica referenciada,
não uma nova verificação dos arquivos nesta sessão.

Nenhum desses ZIPs nem seus manifestos extraídos foi encontrado no workspace
desta retomada. Os anexos de texto não fornecem os bytes do ZIP. Não há prova
nova de CRC, hashes finais, assinatura ou igualdade de todos os 345 membros do
arquivo recebido. Essa comparação permanece explicitamente aberta.

## Reconstrução dos contratos #69–96

Foram confrontados handoffs PR69/70, auditoria transversal, revisão/parecer
independentes #71, parecer de integração #89, handoffs #86–90 e #92–95,
preparação #91/G0–G7, checkpoint obrigatório #96 e discussões de continuidade.
Links centrais: [PR70 último clique 5s](https://github.com/pedrokam700/Central-de-Controle-/pull/70#issuecomment-6863608748),
[PR84](https://github.com/pedrokam700/Central-de-Controle-/pull/84#issuecomment-6921476609),
[PR86 independente](https://github.com/pedrokam700/Central-de-Controle-/pull/86#issuecomment-6924176720),
[PR89 independente](https://github.com/pedrokam700/Central-de-Controle-/pull/89#issuecomment-6950145034),
[PR92 independente](https://github.com/pedrokam700/Central-de-Controle-/pull/92#issuecomment-6958164717),
[PR95 independente](https://github.com/pedrokam700/Central-de-Controle-/pull/95#issuecomment-6978345613),
[PR96 retomada](https://github.com/pedrokam700/Central-de-Controle-/pull/96#issuecomment-6979031239).
Relatos fabris históricos não transferem aceite para um SHA novo.

| Linhagem | Contrato que a candidata deve conservar | Prova disponível / limite |
|---|---|---|
| #69–70 / EEDACC65 | Central integrada, SQLite/revisões locais, recuperação seletiva, 3012 com janela comprovada, clique View único com teto 5s, nunca trial 650ms ou teto 12s | Código/história e observabilidade; não garante sessão MES física atual |
| #71–76 | Replay confirmado sem Chrome; recuperação mista preserva êxitos; operadores não END LOT legíveis; breaker após duas falhas de input | Contratos SQLite sintéticos, engine e nomes; não presumir COMPLETE por rótulo |
| #77–79 | Checkpoint por PCBA com prova própria; mesmo nome explícito/PCBA/ID/linhagem; 29 testes de observabilidade | Suites integradas preservadas; nenhum mapa global BRM→nome |
| #80–84 | Histórico 2114 sem duplicata, rota/visibilidade/OPC, isolamento de source/linha/snapshot/revisão/período, recuperação Home e ExtJS pré-lote | Testes positivos/negativos e UI; sem login automático ou host adivinhado |
| #86 | Timeline única, todos os eventos/papéis/comentários/clocks, sem +N | Unitários e Chromium; Hist Seq não recebe relógio 3012 inventado |
| #87 | Uso físico 3074 separado de quantidade observada; Y/N, lacunas, transferências, revisões antigas | Scanner→SQLite→canônico→dashboard sintéticos; 98 indeterminadas históricas não recontadas |
| #88 | Produção por ocorrência exata e passagem anterior; diagnósticos explícitos; AT/reparo não vira produção | Fixtures e Chromium; 127/173 histórico não é medição da candidata |
| #89 | Dependências updater, aliases BRM/linha, fatos 2114, AT sem rótulo produtivo, isolamento SW entre abas | Contratos integrados; proteção BRM mantida sem nova comprovação física |
| #90 | Índices/caches locais equivalentes, históricos integrais, guard efetivamente carregado | Benchmarks sintéticos e igualdade; não SLO fabril |
| #91–92 | Gates de atualização, hashes/backup integral/staging/journal/barreira; helper PowerShell no contrato | 27 D01/D02 em Linux/Windows; não atomicidade multiarquivo ou maintenance lease |
| #93 | Entrada LAB separada, stdio/SQLite sintéticos; não usar launchers produtivos como LAB | 30 contratos Linux/Windows; não sandbox do SO nem clone da fábrica |
| #94 | Mestre fiel privado separado da cópia desidentificada e recibo público | 36 P02 e cinco projeções nativas; perfil de fixture, não anonimização universal |
| #95 | Python/SQLite/JSON1/timezone/wheels/imports em Windows descartável | 50 contratos, 13 wheels, nove negativas; GUI completa bloqueada por seis wheels ausentes |
| #96 | C0/A/B, R0 sem restauro, R1 passivo com dados B, R2 STOP, leitores nativos, recusas/journal | 51 contratos + cinco leitores + preservação; não retorno operacional automático |

As nove telas permanecem: Monitoramento, Top3/FPY, Falhas, Consulta SN,
Rastreabilidade, Dashboards de reuso, Processo/3022 & AT, Base local e CORA.
Uma Central/state.ames/Auth/agente/SQLite/scheduler, sem miniapp ou segundo serviço.

## Inventário reproduzível sem empacotar

`python3 -B scripts/audit/package-source-inventory.py` lê árvores Git, AST de
constantes e seleções de extensões. Emite somente JSON em stdout: mapa completo
destino→source→SHA256 do source e indicação de geração/transformação. Não importa
builders, não chama build-static, não cria payload/dist/ZIP nem abre SQLite.
Seu resultado é um MODELO estático da seleção, não um manifesto do produto.
O job Linux P08 o executa sob guard de distribuição e conserva a saída nos logs.

Modelo na árvore EEDACC65: **345 membros**. Modelo na fonte produtiva preservada
da PR95/96: **349**, nenhum caminho antigo removido. Alterações exclusivamente
LAB/testes/docs desta retomada não mudam os módulos produtivos selecionados.

| Grupo de destino | EEDACC65 | Atual | Fontes antigas alteradas | Acréscimos |
|---|---:|---:|---:|---|
| Raiz | 22 | 22 | 0 diretas | 0; identidade/README gerados exigem validação posterior |
| frontend | 170 | 172 | 13 | Dois módulos de timeline #86 |
| ames-agent | 54 | 56 | 9 | production_diagnostics.py e lab_entry.py |
| factory-engine | 74 | 74 | 7 | 0 |
| suporte | 6 | 6 | 0 | 0 |
| at-setup | 7 | 7 | 0 | 0 |
| network | 1 | 1 | 0 | 0 |
| evidence | 11 | 11 | 0 | 0; material histórico ainda antigo |

Fontes do agente alteradas desde EEDACC65: canonical, integrated_snapshot_history,
local_sn, material_trace_provenance, partial_retry, process_r11, production_shift,
store e update_candidate. Factory-engine: navigation, tela_3022, failure_taxonomy,
temporal_3074, uso_pcba, relatorio_3028_3074 e relatorio_v015. Não é downgrade;
são os pontos de correção auditados acima, com teste de comportamento exigido.

No frontend mudaram: console-failure-evidence, console-failure-process,
console-fastlane-sn-reuse, console-i18n-extra, console-improvements.css,
console-reuse-cohorts, console-sn-repair-evidence, console-specialized-views,
daily-failure-analytics, data/canonical, data/production-evidence,
data/reuse-cohorts e sw.js. Os módulos da timeline são adicionais.

Há **17 membros derivados ou potencialmente transformados**. Entre eles estão
os três wrappers de início, os dois manifestos, LEIA_PRIMEIRO, documentos com
placeholder SHA, TROCAR_PARA_PR69_NOVA.ps1, index/app/sw de frontend, index raiz
e release-build. SHA256 de SOURCE desses arquivos não autentica o OUTPUT.
`build-static.mjs` altera bootstrap/index, inicialização Firebase de app.js e
CACHE_REVISION. A candidata deve manter offline-bootstrap e Central completa,
nunca substituir por local-entry de um Console separado.

As duas capturas 3028 congeladas continuam com os hashes exigidos pelo builder.
O código de rede/guardian e scripts de suporte/startup/troca mantém os mesmos
sources do EEDACC65; isso prova preservação, não segurança de sua execução LAB.

## Lacunas reais para a candidata — propostas, sem alteração produtiva

| ID / gravidade | Evidência | Fechamento necessário |
|---|---|---|
| C01 / bloqueio de paridade de artefato | ZIP/manifestos EEDACC65 ausentes aqui; SW empacotado difere do source historicamente | Comparar os 345 membros reais, manifestos, CRC e transformações quando bytes estiverem disponíveis. Não usar só contagem/tamanho/ancestralidade |
| C02 / alta se rotas de atualização forem confundidas | CLEAN integrado não gera ames-agent/candidate-files.json; quatro ROOT_FILES do updater legado não entram em seu inventário: ROTA_AMES_APLICAR.bat, ROTA_AMES_REMOVER.bat, CAPTURAR_MOTOR_R12_SEGURO.bat e capture-r12-engine.py (todos sob suporte/ames-workstation). update() exige esses contratos | Escolher um único caminho de instalação/atualização e qualificar seu inventário completo. Não instruir update_candidate.update com CLEAN. Não remover checks nem simplesmente copiar quatro arquivos para afirmar fechamento; extras têm whitelist própria |
| C03 / alta documental | Builder integrado mantém evidence antigo, README/nomes PR69 e fallback literal para instalação oficial 0.5.39; não inclui handoffs #86–96 ou ferramentas externas P02/P04/P08 | Revisar instruções da futura candidata e anexar manifesto de compatibilidade/limitações. Referência anterior deve ser A realmente comprovada, não inferida da release antiga |
| C04 / bloqueio de workstation offline | Requirements usam faixas abertas; preflight P04 valida núcleo com lock de 13 wheels, mas seis dependências GUI sem wheel oficial impedem atestar workstation completa | Inventário e dependências auditados para alvo/arquitetura, sem remover requisitos nem instalar sdist para mascarar o gate. AT scripts não constituem pendrive AT pronto |
| C05 / bloqueio de retorno operacional | Switcher/SAFE_STATE_TRANSFER são fontes herdadas; P08 novo não foi conectado a launchers/updater nem prova código A executando dados B | Não oferecer rollback automático pós-execução como qualificado. Se B escreveu ou estado externo é desconhecido: STOP e preservação. Integração produtiva futura requer proposta/testes/autorização separados; esta PR não a aplica |
| C06 / pendência offline | Shell frio/SDK/cache e identidade de versões do output ainda não ensaiados em instalação isolada real; browser sintético não prova bootstrap sem cache | P05 e comparação SHA de manifestos/release/script/cache/módulos servidos; conservar outbox/IndexedDB, atualização por gesto explícito |
| C07 / bloqueio físico | P02 real, P04 completa/real, P07 exclusividade/guardian/escritores/estado externo, P08 real e G0–G7 não atestados | Homologação supervisionada específica, backup consistente e rollback que não reintroduza histórico A desatualizado como atual |

C02 é incompatibilidade estática ENTRE formatos/caminhos, não prova de que o
01_TROCAR da CLEAN chama esse updater. C03–C07 não são novos defeitos físicos
atribuídos sem captura. Nenhum builder/launcher/runtime produtivo foi modificado
para facilitar testes ou dar aparência de instalador pronto.

## Plano concreto da próxima candidata, ainda sem geração

1. Fixar o SHA final aprovado desta linhagem e preservar EEDACC65 e A comprovada.
   Exigir mesma revisão nas quatro CIs, nove roteiros Chromium, inventário fonte
   e diff produtivo; não somar testes de SHAs diferentes para aprovar.
2. Fechar C02/C03 no desenho de entrega: pacote completo integrado com frontend,
   agente e motor, identidade única SHA, instruções e limites atuais. Não confundir
   CLEAN, overlay incremental, migration bundle e pendrive AT. Manter apoio de
   laboratório separado e passivo; não transformar launcher produtivo em ensaio.
3. Somente sob autorização específica futura de GERAÇÃO, usar checkout limpo
   descartável do SHA aprovado, sem dados/config/identidade operacional. Produzir
   uma única candidata completa; nunca patch manual de ZIP, nem --development.
   A permissão para gerar não equivale à permissão para instalar ou publicar release.
4. Verificar inventário real versus este modelo, todos os hashes SHA256 e ambos
   os manifestos, CRC/duplicatas/paths seguros/ausência de SQLite/WAL/token/cookies/
   perfis/outbox/segredos, fechamento Python/JS/PowerShell e identidade conjunta
   ExpectedSha + manifestos + release-build + CACHE_REVISION. Registrar diferenças
   justificadas dos 345 membros antigos, não exigir que o número fique artificialmente 345.
5. Com bytes do EEDACC65, verificar paridade arquivo a arquivo do artefato e
   transformações. Disponibilizar somente um link real de candidata identificada,
   com SHA do source e SHA256 do arquivo, finalidade/limitações e físico PENDENTE,
   quando a publicação também estiver autorizada. Nenhum link de download existe agora.
6. Homologação futura separada: isolamento externo/lease/backup e inventário
   autorizados antes de qualquer original. C0 fiel privado imutável e cópia LAB
   desidentificada separados. Comparar todas as linhas/revisões/evidências e nove
   telas, reinício/offline/latência; interromper em identidade divergente ou estado
   externo não comprovado. Não recolher lote MES para ocultar perdas históricas.
7. R0 não restaura. R1 somente dados atuais em destino novo e compatibilidade
   realmente demonstrada. R2/nova evidência/outbox/jobs/unknown interrompe retorno,
   preserva C0/A/B e requer recuperação supervisionada. Nunca SQLite antigo sobre B.

**Próxima ação exata:** revisar e fechar o contrato de entrega C02/C03 e a
comparação C01 com fontes/manifestos existentes, na linha da Central completa;
preparar a candidata para autorização específica de geração. Não abrir outra
fase genérica sem ligação com a entrega. Não executar build, instalação ou
homologação com base neste plano. **Homologação física PENDENTE.**
