# PR98 — matriz objetiva de continuidade até a instalação OPPO

19/11/2026. **Conferência de fonte/linhagem e evidência já existente.** Nenhum
build, regressão aprovada, instalação, banco, perfil ou MES foi executado de novo.

Produto congelado: `3ab8df55e03fa2b961df100649de6541d2232bd6`.
Apoio read-only validado: `310cf7e7a00a7cdaa8d0b6b0772736a2a3922123`.
A documentação posterior não substitui nenhum desses dois SHAs nem muda o ZIP.

## Decisão para continuar

Não foi demonstrado novo defeito de runtime nesta conferência. Não implementar
novamente o que as linhas abaixo já comprovam. O caminho continua: identificar
A por leitura → preservar/atestar estado real → autorizar janela e executar o
01_TROCAR já existente → validar histórico/funcionalidade → piloto pequeno OPPO.
O identificador é suplemento, não outro instalador ou seletor de pasta.

## Como ler as evidências

- [A]: auditoria independente dos **ZIPs reais**, ampliando o escopo anterior.
  Seus números vêm da inspeção de bytes registrada ali, não de novo download
  nesta sessão. Só arquivos de evidências finas estavam disponíveis localmente;
  não se alegou repetir a comparação integral dos ZIPs.
- [I]/[W]/[L]/[C]/[G]: execuções SUCCESS **do produto 3ab8df55**; não são resultados
  de uma execução nova. Os testes citados foram localizados e sua inclusão
  confrontada com os comandos da workflow congelada. A coluna resultado não
  significa que todo cenário físico ou cada teste histórico existente foi rodado.
- [S]: somente o identificador read-only, 22 contratos em CADA Windows 2022/2025.
  Não é uma nova CI de produto, teste MES ou prova da estação.
- Presença/ancestralidade/hash/sintaxe são evidências distintas de comportamento.
  Toda lacuna física da última coluna permanece PENDENTE.

## Requisito → origem → implementação → teste/CI → prova → lacuna

| ID | Requisito | Origem / PR | Implementação conferida | Teste ou contrato localizado | CI / fonte | Resultado comprovado | Lacuna real para a estação |
|---|---|---|---|---|---|---|---|
| C01 | Continuidade EEDACC65 → PR98 | Baseline #70; #97–98 | [verify-complete-candidate.py][f1]<br>[complete-archive.py][f2] | [candidate97-artifact.test.py][f3]<br>[archive-dependencies.test.py][f4] | [W] + auditoria [A] | 345 caminhos antigos presentes, 48 novos, 47 antigos modificados; manifesto/CRC do ZIP aprovado conferidos em [A]. | Preservação estrutural não identifica A nem prova comportamento físico das mudanças. |
| C02 | Pasta nova + 01_TROCAR; detectar A/8765/guardian/Run/jobs | Pré-EED; #69–70; #98 | [01_TROCAR.bat][f5]<br>[TROCAR_PARA_PR69_NOVA.ps1][f6] | [full-switch.py][f7] | [W] | Troca inteira com processos reais sintéticos, sem selecionar pasta, e R0/R2 comprovados. | Atestar a instalação realmente ativa e seus relaunchers antes de qualquer substituição. |
| C03 | Três linhas e identidade de período/snapshot/revisão/origem | Pré-EED; #78/#82/#87–89 | [canonical.py][f8]<br>[production-evidence.mjs][f9] | [agent-source-capture.test.py][f10]<br>[agent-trace-target.test.py][f11]<br>[ames-production-scope-isolation.test.mjs][f12] | [I] | Contraprovas de escopos divergentes e leitura da revisão exata incluídas na CI aprovada. | Confrontar linhas L1/L2/L3 e source_id reais; desconhecido não autoriza mistura. |
| C04 | Dia produtivo 07:00→07:00 separado dos turnos | Baseline #70; #88–89 | [operational_calendar.py][f13]<br>[operational-period.mjs][f14] | [agent-integrated-v5.test.py][f15]<br>[ames-operational-period.test.mjs][f16]<br>[ames-reading-period.test.mjs][f17] | [I] | Calendário/seleção por período e limites tratados em testes sintéticos. | Confirmar calendário/fuso/turnos da estação, incluindo 07:30–17:30 e 17:30–03:30; não alterar relógio para passar. |
| C05 | 3028, FPY e falhas independentes | Pré-EED; #69–70; #89 | [ames_3028.py][f18]<br>[store.py][f19]<br>[dashboard.mjs][f20] | [agent-production-trust.test.py][f21]<br>[ames-production-evidence-analytics.test.mjs][f22]<br>[ames-3028-completion.browser.mjs][f23] | [I] | Contratos de conclusão, projeção e consumo incluídos; não executou coleta OPPO. | Comparar quantidade/FPY e falhas por linha/período com referência do piloto, sem zero artificial. |
| C06 | 3012: ExtJS/View/período e reparo próprios | Baseline #70; #78/#83–84; #88 | [ames_3012_live.py][f24]<br>[repair_3012_capture.py][f25] | [ames-3012-runtime-contract.test.mjs][f26]<br>[ames-3012-physical-contract.test.mjs][f27]<br>[agent-sn-3012-fallback.test.py][f28] | [I] | Controles, prova de execução e fallback salvo testados; falha sem salvo não vira zero. | Averiguar travamentos reais/3012 e coerência de Repair Time/usuário/comentário no MES autorizado. |
| C07 | 2114: passagens/Hist Seq preservados sem associação indevida | Baseline #70; #80/#86/#89 | [process_timeline.py][f29]<br>[reuse-history-timeline.mjs][f30] | [agent-integration-projection.test.py][f31]<br>[ames-reuse-event-timeline.test.mjs][f32] | [I] | Projeção e eventos independentes preservados; Hist Seq sem data não recebe pessoa/clock 3012. | Verificar registros e eventuais travamentos 2114 reais; não inferir completude a partir do layout. |
| C08 | 3074: 1º/2º/3º uso só com evidência física | Baseline #70; #87 | [uso_pcba.py][f33]<br>[temporal_3074.py][f34]<br>[integrated_snapshot_history.py][f35] | [agent-3074-physical-classification.test.py][f36]<br>[ames-3074-physical-classification.test.mjs][f37]<br>[ames-3074-physical-classification.browser.mjs][f38] | [I] | Matriz uso 1/2/3, lacuna, sobreposição, data ausente e revisão pobre/rica; desconhecido permanece desconhecido. | Confrontar PCBAs reais indeterminadas e alegados contadores zero de segundo uso; sem inventar vínculo. |
| C09 | Componentes, transferência entre PCBAs, vínculos Y/N e histórico incompleto | Baseline #70; #86–87 | [relatorio_3028_3074.py][f39]<br>[reuse-cohorts.mjs][f40] | [agent-material-3074-link.test.py][f41]<br>[agent-3074-physical-classification.test.py][f36]<br>[ames-reuse-event-timeline.test.mjs][f32] | [I] | Vínculos/ordinais/escopo temporal conservados em cenários sintéticos, inclusive PCBA transferida. | Provar montagens e uso no instante da falha em amostra real; Y atual não autentica vínculo histórico. |
| C10 | 3022: clique View de cinco segundos e grade comprovada | Baseline #70; #75/#79/#84 | [tela_3022.py][f42] | [agent-3022-observability.test.py][f43]<br>[ames-physical-regressions.test.mjs][f44]<br>[ames-3022-grid-lifecycle.test.mjs][f45] | [I] | view.click(timeout=5000) presente; timeout/máscara/campo transitório têm contraprovas. Não alterado nesta continuidade. | Provar resposta no MES real sem aumentar clique, timeout ou aceitar grade de outra PCBA. |
| C11 | Home/OPC/ExtJS na sessão Chrome existente | Pré-EED; #81/#83/#84 | [browser.py][f46]<br>[tela_3022.py][f42] | [agent-home-cdp-recovery.test.py][f47]<br>[agent-navigation-readiness.test.py][f48]<br>[agent-3022-real-view-preflight.test.py][f49] | [I] | Readiness e recuperação tratados em fixtures sem inventar host/controle. | Sessão OPPO, permissões, CDP e falhas de campo das linhas 1/3 ainda não observados na fábrica. |
| C12 | Replay local confirmado e recuperação parcial sem repetir MES | #72/#73/#76/#88 | [process_r11.py][f50]<br>[partial_retry.py][f51] | [agent-3022-local-replay.test.py][f52]<br>[agent-3022-mixed-replay.test.py][f53]<br>[agent-trace-auto-resume.test.py][f54] | [I] | Confirmados reutilizados; Home/Chrome indisponível não apaga salvo; apenas lacunas permanecem pendentes. | Inventariar checkpoints/jobs reais sem limpar estado ou reconsultar todas as PCBAs. |
| C13 | COMPLETE não dispensa prova por PCBA e escopo | #77/#82/#88 | [partial_retry.py][f51]<br>[trace_auto_resume.py][f55] | [agent-3022-checkpoint-proof.test.py][f56]<br>[agent-3022-production-evidence.test.py][f57] | [I] | Flag sem query proof, PCBA/linha/origem/revisão incompatível e parcial não viram resposta completa. | Validar provas/checkpoints atuais; não tratar ausência de contexto como ausência de passagem. |
| C14 | Nomes históricos 3022/A6900 sem promovê-los a produção | #74 integrada pela #76; #78 | [local_sn.py][f58] | [agent-local-sn-operator-evidence.test.py][f59]<br>[ames-name-consistency.test.mjs][f60] | [I] | Leitura canônica valid=0 por PCBA, papel observed_process_operator e not_production_passage presentes. Integração #74→#76 exata. | Nome/ID só são prova se existirem na origem; nenhum mapa global BRM→nome. |
| C15 | Timeline por ocorrência: pessoa, papel, comentário, clocks; sem +N | #86 / Issue #85 | [reuse-history-timeline.mjs][f30]<br>[console-reuse-history-timeline.mjs][f61] | [ames-reuse-event-timeline.test.mjs][f32]<br>[ames-reuse-history-parity.test.mjs][f62]<br>[ames-reuse-timeline.browser.mjs][f63] | [I] | Eventos e atendimentos separados; revisão/autor/conteúdo distintos não somem; comentários/nomes visíveis nos cenários de navegador. | Confrontar histórico real multi-passagem, ausência de data e atores independentes; não chamar casos não vistos de resolvidos. |
| C16 | Horário produtivo 3022 por ocorrência, sem AT/reparo/Defect Time substituto | #82/#88 | [production_shift.py][f64]<br>[production_diagnostics.py][f65]<br>[production-evidence.mjs][f9] | [agent-3022-production-evidence.test.py][f57]<br>[ames-3022-production-evidence.test.mjs][f66]<br>[ames-3022-production-evidence.browser.mjs][f67] | [I] | Escopo exato, relógios/fuso e classes de lacuna testados; A6900 não vira referência produtiva. | Auditar ocorrências reais pendentes; 127/173 e 46 são contagens históricas, não cobertura atual. |
| C17 | Filtro BRM/END LOT: manter proteção AT | #88–89 | [process_r11.py][f50] | [agent-integration-brm.test.py][f68] | [I] | Positivos/negativos de END LOT e aliases; BRM sem prova de papel continua conservador. | Se operador BRM legítimo for produtivo, é necessária evidência física de função/estação antes de mudar proteção. |
| C18 | Consulta por SN e rastreabilidade com mesma evidência | Baseline #70; #76/#78/#86–89 | [sn_lookup_context.py][f69]<br>[local_sn.py][f58]<br>[console-sn-consistency.mjs][f70] | [ames-sn-consistency.test.mjs][f71]<br>[ames-trace-scope.test.mjs][f72]<br>[agent-p08-native-readers.test.py][f73] | [I] | Consistência de escopo/atores e leitores nativos em cópias sintéticas incluídos. | Escolher PCBAs reais conhecidas; comparar SN/trace/reuso no mesmo período/revisão sem agrupar ocorrências. |
| C19 | Nove telas, dashboards de reuso, tendências e FPY | Baseline #70; #80/#86–90; #98 | [console-view.mjs][f74]<br>[console-reuse-cohorts.mjs][f75]<br>[dashboard.mjs][f20] | [ames-experience.browser.mjs][f76]<br>[nine-screen-probe.py][f77] | [I] + [W] | Nove telas em Chromium e candidata Windows real; UI lê mesma revisão/datasets SQLite sintéticos. | Edge/perfil real, volume real e comparativos da estação ainda precisam aceite antes de ampliar coleta. |
| C20 | Contas AT offline sem e-mail e scripts de suporte AT | Preexistente no baseline EEDACC65/#70 | [at_profiles.py][f78]<br>[at_viewer_entry.py][f79]<br>[at_offline_package.py][f80]<br>[console-at-admin.mjs][f81] | Comparação de 7 arquivos fonte EED→3ab (ver seção de verificações) | Fonte verificada; [A] | Quatro módulos AT e três scripts AT-setup comparados são idênticos ao EED. Backend continua ligado ao hardened entry. | Não foi localizado teste AT dedicado nos arquivos de teste pesquisados. Não afirmar cobertura específica ou uso/provisionamento real aprovado; preservar arquivos AT de identidade/configuração. |
| C21 | Edge local separado de Chrome/MES; Auth e outboxes preservados | Fluxo histórico; #89/#98; confirmação do usuário | [offline-bootstrap.mjs][f82]<br>[offline-outbox.mjs][f83]<br>[sync.mjs][f84]<br>[START_LOCAL_CANDIDATE.ps1][f85] | [ames-offline-outbox.test.mjs][f86]<br>[ames-sync-reload.browser.mjs][f87]<br>[auth-fixture.py][f88] | [I] + [W] | SDK genuíno/sessão anterior sintética com backend encerrado e perfil vazio sem bypass; filas possuem contratos sintéticos. | Atestar UID/origem 127.0.0.1/perfil Edge/abas/ACK; navegador padrão do launcher; Chrome/CDP OPPO é outra sessão. |
| C22 | Worker/SDKs/estilos sem misturar versões | #86/#89/#90/#98 | [sw.js][f89]<br>[build-static.mjs][f90]<br>[manifest.json][f91] | [ames-integration-worker.browser.mjs][f92]<br>[nine-screen-probe.py][f77]<br>[offline-assets.test.py][f93] | [I] + [W] | SHA de cache, inventário persistente, ativação, estilos e dependências locais conferidos; 409 não foi removido. | Na estação manter cache/IndexedDB; reload orientado após salvar trabalho; 409 persistente/mistura de SHA dá STOP. |
| C23 | Desempenho com histórico completo, sem deduplicação agressiva | #90 | [canonical.py][f8]<br>[production_shift.py][f64]<br>[integrated_snapshot_history.py][f35] | [agent-performance-equivalence.test.py][f94]<br>[agent-performance90.test.py][f95]<br>[ames-performance.browser.mjs][f96] | [I] | Equivalência de registros/conflitos/ordem, comparação PR89 e benchmarks sintéticos já aprovados. | Medir responsividade/SQLite no hardware e volume reais; não truncar histórico para obter aceite. |
| C24 | Rota OPPO /32 persistente e Ethernet/Wi-Fi preservados | Preexistente no baseline EEDACC65/#70; #98 preserva fluxo | [ensure_ames_route.ps1][f97]<br>[network_watch.py][f98] | [agent-integrated-v5.test.py][f15] | [I] parcial + fonte | Fonte exige ActiveStore E PersistentStore e route -p; teste inclui proteção contra reparo Ethernet sem Wi-Fi. [W] foi LocalOnly, não prova rota OPPO. | TI deve confirmar interface/rota persistente e permissões reais. Rede/dependências podem ser preparadas antes do popup; não clicar como diagnóstico. |
| C25 | Updater legado D01/D02 e fechamento PowerShell | #92 | [update_candidate.py][f99]<br>[ISSUE57_RELAUNCH_ENROLLMENT.ps1][f100] | [agent-updater-recovery.test.py][f101] | [L] | Integridade, falhas de I/O, journaling e dependência do helper comprovados em testes sintéticos. | Este ZIP CLEAN não usa update_candidate.py como migrador/rollback. IO/energia do posto não homologados. |
| C26 | Separar backup fiel C0 de cópia desidentificada | #94 / P02 | [synthetic_deidentify.py][f102] | [agent-p02-deidentification.test.py][f103]<br>[agent-p02-projection.test.py][f104] | [L] + [I] | 36 contratos P02 sintéticos e projeções; nenhuma transformação do backup de recuperação do posto. | C0 real precisa cobertura externa, ACL, captura coerente e restauração; nunca usar derivado anonimizado como recuperação. |
| C27 | Windows/Python/SQLite/JSON1/ZoneInfo/dependências genuínas | #95 / P04; #98 | [windows_preflight.py][f105]<br>[prepare.py][f106] | [agent-p04-compatibility.test.py][f107]<br>[integration.py][f108] | [C] + [W] | Contratos P04 e GUI genuína/21 wheels no Windows LAB; checks de dependências efetivamente executados. | Windows/build/Python 3.12 x64/Edge/Chrome/armazenamento reais ainda desconhecidos ou não homologados. |
| C28 | R0/R1/R2 e preservação de dados novos entre gerações | #96 / P08; #98 | [generation_reconcile.py][f109]<br>[TROCAR_PARA_PR69_NOVA.ps1][f6] | [agent-p08-generation.test.py][f110]<br>[agent-p08-native-readers.test.py][f73]<br>[full-switch.py][f7] | [G] + [I] + [W] | Modelagem e leitores; falha I/O real após T produzir linha nova exige STOP, mantém gerações e recusa launcher antigo. | No posto preservar B/WAL/estado externo antes de recuperação. Nada autoriza restaurar C0 sobre dados novos ou reabrir A desatualizada. |
| C29 | Backup/stage, WAL/checkpoints/config/token e motor B | Fluxo histórico; #92/#96/#98 | [SAFE_STATE_TRANSFER.py][f111]<br>[issue57_update_preflight.py][f112] | [transfer-red.test.py][f113]<br>[integration.py][f108] | [W] | Backup SQLite incorpora WAL, restauração ensaiada, identidade/arquivo preservados e engine_dir redirecionado somente ao motor B conhecido. | Helper não concede lease nem cobre sozinho Edge/Chrome/outboxes/arquivos externos. C0 completo real e todos os escritores continuam bloqueadores. |
| C30 | Identificar A por 8765 sem adivinhar pasta, sem abrir estado | Apoio posterior da #98; SHA 310cf7e7 | [IDENTIFICAR_CENTRAL_8765_READONLY.ps1][f114] | [port-identification.test.ps1][f115] | [S] | 22 contratos por Windows 2022/2025; metadados privados bloqueados, PID reutilizado e listener real não agente recusados sem HTTP. | Falta executar observação autorizada na estação. IDENTIFIED não é GO; formato/política/estado ambíguos dão STOP. Código do apoio não integra o ZIP 3ab. |

## Verificações diretas e divergências de interpretação

1. **Linhagem:** metadados atuais de #69–98 consultados; #85 é Issue, não PR.
   `git merge-base --is-ancestor <HEAD-histórico> 3ab8df55` confirma #69–73,
   #75–84 e #86–97. #74 é paralela, não ancestral. O HEAD #98 de apoio 310cf7e7
   é DESCENDENTE do produto; sua não ancestralidade no sentido inverso não é perda.
   PRs consultadas continuam abertas/DRAFT; não houve merge em main.
2. **#74 → #76:** `git show` dos dois commits confirma conteúdo idêntico de
   `ames/agent/local_sn.py` e `scripts/agent-local-sn-operator-evidence.test.py`.
   Hashes SHA256 respectivos `08849a2caa111b92803b8db27e7e617b1370668199fa9075fc96bb3fe36ad31d`
   e `8415c0c774b42c9daca6503b9f9dc073a4453bf6eecacdd9a9bcac5a856ee7cc`.
   No produto o leitor continua consultando `source_view='3022' AND valid=0`,
   com PCBA exata e papel de operador observado, não passagem produtiva.
3. **ZIP antigo antes indisponível:** essa afirmação do ensaio histórico continua
   verdadeira para aquele momento. [A] passou a dispor de EEDACC65 real e confirma:
   ZIP antigo 345 membros/CRC OK/344 hashes de manifesto; novo 393/CRC OK/392 hashes;
   345 antigos presentes, 48 novos, 47 antigos modificados, 298 antigos idênticos,
   nenhum caminho removido. O relatório estático anterior não deve sobrepor essa
   evidência posterior. Isso resolve comparação estrutural, não o estado instalado.
4. **AT:** quatro módulos (`at_profiles`, `at_viewer_entry`, `at_offline_package`,
   `console-at-admin`) e três scripts (`INSTALAR_CENTRAL_AT`, `INICIAR_CENTRAL_AT`,
   `PREPARAR_DEPENDENCIAS_AT`) comparados diretamente EED→3ab são byte a byte
   idênticos. O hardened entry mantém import/instâncias e rotas at-admin. Busca
   textual nos arquivos de teste não localizou teste AT dedicado por esses nomes;
   não foi atribuída cobertura específica inexistente nem criado defeito a partir
   dessa ausência. Perfis/contas reais precisam preservação e validação autorizada.
5. **Testes e realidade:** I inclui replay puro/misto, 29 observabilidade 3022,
   nomes, 3074, 3022/BRM, projeção e leitores nativos. Chromium inclui nove telas,
   timeline, 3074 e produção 3022. W inicia a candidata real em Windows sintético,
   não o MES OPPO. Nenhuma dessas provas resolve por si os relatos antigos de
   travamento em linhas 1/3/2114/3012 ou as contagens físicas indeterminadas.
6. **Identificação e troca não são novidade:** o coordenador já detecta processo,
   porta, raiz, guardian, registro e jobs; o apoio posterior só obtém uma
   observação sem executar o coordenador mutante. Não duplicar o instalador,
   remover barreiras ou pedir ao usuário que escolha uma pasta por tentativa.
7. **Backend/operador BRM:** o filtro conservador e as contraprovas estão presentes.
   Não remover proteção AT por hipótese de END LOT legítimo; registrar caso real
   com evidência de função/estação antes de propor mudança mínima.

## Condições já cumpridas e pendentes

Já comprovados: continuidade estrutural em [A], contratos de fonte/linhagem
conferidos, produto Windows LAB completo em W, demais quatro gates do mesmo SHA,
e identificador em S. Sem novo pacote ou mudança produtiva nesta continuidade.

Bloqueadores do posto: raiz/versão executadas; todas as sessões/guardians/Run/jobs;
Edge/perfil/origem e outboxes/ACK; C0 fiel com WAL e estado externo, lease/captura
coerente/restauração; Windows/Python/JSON1/ZoneInfo/GUI/Edge/Chrome; rede OPPO e
rota persistente aprovadas; comparação de histórico e piloto autorizado.

[Procedimento curto + roteiro completo](../homologation/PR98_ATUALIZACAO_SUPERVISIONADA_OPPO_20261119.md).
Nada exige executar dezenas de comandos: primeiro usar o identificador validado
fora da Central, ver a raiz na saída privada e informar somente o estado/código
redigido. Depois executar o procedimento de troca existente, quando autorizado,
com os gates da estação resolvidos. Não abrir SQLite, ler token, parar agente ou
acessar OPPO para “completar” esta matriz.

Após a troca autorizada: comparar todos os registros antigos por identidade e
hash/digest lógico (não só contagens), revisões antigas imutáveis, novos deltas
explicados; nove telas no Edge/perfil e origem corretos, sem +N escondendo ator;
3074/3022 sem preencher desconhecido; checkpoints/restart/filas preservados.
Somente então piloto de linha/período/PCBAs conhecidos, bruto→SQLite→export→UI,
com referência independente e ACK da sincronização autorizada. R2/estado novo ou
desconhecido: STOP e preservar A/B/C0, sem reabrir A antiga ou sobrescrever banco.

P02 real, P04 real, P05/P07/P08 reais e G0–G7 físicos permanecem PENDENTES.

## Referências imutáveis

[A]: https://github.com/pedrokam700/Central-de-Controle-/pull/98#issuecomment-7013286618
[I]: https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44519337941
[W]: https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44519337968
[L]: https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44519337962
[C]: https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44519337991
[G]: https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44519338069
[S]: https://github.com/pedrokam700/Central-de-Controle-/actions/runs/44550376501
[f1]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/verify-complete-candidate.py
[f2]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/install98/complete-archive.py
[f3]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/candidate97-artifact.test.py
[f4]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/install98/archive-dependencies.test.py
[f5]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/tools/ames-workstation/01_TROCAR.bat
[f6]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/tools/ames-workstation/TROCAR_PARA_PR69_NOVA.ps1
[f7]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/install98/full-switch.py
[f8]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/ames/agent/canonical.py
[f9]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/ames/data/production-evidence.mjs
[f10]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/agent-source-capture.test.py
[f11]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/agent-trace-target.test.py
[f12]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/ames-production-scope-isolation.test.mjs
[f13]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/ames/agent/operational_calendar.py
[f14]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/ames/data/operational-period.mjs
[f15]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/agent-integrated-v5.test.py
[f16]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/ames-operational-period.test.mjs
[f17]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/ames-reading-period.test.mjs
[f18]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/ames/agent/ames_3028.py
[f19]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/ames/agent/store.py
[f20]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/ames/data/dashboard.mjs
[f21]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/agent-production-trust.test.py
[f22]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/ames-production-evidence-analytics.test.mjs
[f23]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/ames-3028-completion.browser.mjs
[f24]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/ames/agent/ames_3012_live.py
[f25]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/ames/agent/repair_3012_capture.py
[f26]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/ames-3012-runtime-contract.test.mjs
[f27]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/ames-3012-physical-contract.test.mjs
[f28]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/agent-sn-3012-fallback.test.py
[f29]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/ames/agent/process_timeline.py
[f30]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/ames/data/reuse-history-timeline.mjs
[f31]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/agent-integration-projection.test.py
[f32]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/ames-reuse-event-timeline.test.mjs
[f33]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/ames/factory-engine/core/uso_pcba.py
[f34]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/ames/factory-engine/core/temporal_3074.py
[f35]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/ames/agent/integrated_snapshot_history.py
[f36]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/agent-3074-physical-classification.test.py
[f37]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/ames-3074-physical-classification.test.mjs
[f38]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/ames-3074-physical-classification.browser.mjs
[f39]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/ames/factory-engine/reports/relatorio_3028_3074.py
[f40]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/ames/data/reuse-cohorts.mjs
[f41]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/agent-material-3074-link.test.py
[f42]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/ames/factory-engine/ames/tela_3022.py
[f43]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/agent-3022-observability.test.py
[f44]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/ames-physical-regressions.test.mjs
[f45]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/ames-3022-grid-lifecycle.test.mjs
[f46]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/ames/factory-engine/ames/browser.py
[f47]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/agent-home-cdp-recovery.test.py
[f48]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/agent-navigation-readiness.test.py
[f49]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/agent-3022-real-view-preflight.test.py
[f50]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/ames/agent/process_r11.py
[f51]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/ames/agent/partial_retry.py
[f52]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/agent-3022-local-replay.test.py
[f53]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/agent-3022-mixed-replay.test.py
[f54]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/agent-trace-auto-resume.test.py
[f55]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/ames/agent/trace_auto_resume.py
[f56]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/agent-3022-checkpoint-proof.test.py
[f57]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/agent-3022-production-evidence.test.py
[f58]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/ames/agent/local_sn.py
[f59]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/agent-local-sn-operator-evidence.test.py
[f60]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/ames-name-consistency.test.mjs
[f61]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/ames/console-reuse-history-timeline.mjs
[f62]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/ames-reuse-history-parity.test.mjs
[f63]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/ames-reuse-timeline.browser.mjs
[f64]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/ames/agent/production_shift.py
[f65]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/ames/agent/production_diagnostics.py
[f66]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/ames-3022-production-evidence.test.mjs
[f67]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/ames-3022-production-evidence.browser.mjs
[f68]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/agent-integration-brm.test.py
[f69]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/ames/agent/sn_lookup_context.py
[f70]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/ames/console-sn-consistency.mjs
[f71]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/ames-sn-consistency.test.mjs
[f72]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/ames-trace-scope.test.mjs
[f73]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/agent-p08-native-readers.test.py
[f74]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/ames/console-view.mjs
[f75]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/ames/console-reuse-cohorts.mjs
[f76]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/ames-experience.browser.mjs
[f77]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/install98/nine-screen-probe.py
[f78]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/ames/agent/at_profiles.py
[f79]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/ames/agent/at_viewer_entry.py
[f80]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/ames/agent/at_offline_package.py
[f81]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/ames/console-at-admin.mjs
[f82]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/offline-bootstrap.mjs
[f83]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/core/offline-outbox.mjs
[f84]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/ames/sync.mjs
[f85]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/tools/ames-workstation/START_LOCAL_CANDIDATE.ps1
[f86]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/ames-offline-outbox.test.mjs
[f87]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/ames-sync-reload.browser.mjs
[f88]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/install98/auth-fixture.py
[f89]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/sw.js
[f90]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/build-static.mjs
[f91]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/vendor/browser/manifest.json
[f92]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/ames-integration-worker.browser.mjs
[f93]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/install98/offline-assets.test.py
[f94]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/agent-performance-equivalence.test.py
[f95]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/agent-performance90.test.py
[f96]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/ames-performance.browser.mjs
[f97]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/tools/ames-workstation/ensure_ames_route.ps1
[f98]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/ames/agent/network_watch.py
[f99]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/ames/agent/update_candidate.py
[f100]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/tools/ames-workstation/ISSUE57_RELAUNCH_ENROLLMENT.ps1
[f101]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/agent-updater-recovery.test.py
[f102]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/tools/ames-lab/synthetic_deidentify.py
[f103]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/agent-p02-deidentification.test.py
[f104]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/agent-p02-projection.test.py
[f105]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/tools/ames-lab/windows_preflight.py
[f106]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/install98/prepare.py
[f107]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/agent-p04-compatibility.test.py
[f108]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/install98/integration.py
[f109]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/tools/ames-lab/generation_reconcile.py
[f110]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/agent-p08-generation.test.py
[f111]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/tools/ames-workstation/SAFE_STATE_TRANSFER.py
[f112]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/tools/ames-workstation/issue57_update_preflight.py
[f113]: https://github.com/pedrokam700/Central-de-Controle-/blob/3ab8df55e03fa2b961df100649de6541d2232bd6/scripts/install98/transfer-red.test.py
[f114]: https://github.com/pedrokam700/Central-de-Controle-/blob/310cf7e7a00a7cdaa8d0b6b0772736a2a3922123/scripts/install98/IDENTIFICAR_CENTRAL_8765_READONLY.ps1
[f115]: https://github.com/pedrokam700/Central-de-Controle-/blob/310cf7e7a00a7cdaa8d0b6b0772736a2a3922123/scripts/install98/port-identification.test.ps1
