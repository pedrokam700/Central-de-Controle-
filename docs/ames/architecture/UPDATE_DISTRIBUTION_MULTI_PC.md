# Central / A-MES — distribuição sustentável para vários postos

Data: 2026-10-21. Estado: decisão arquitetural e contrato de implantação. **Não significa que o atual agente já tenha autoatualização segura instalada.**

## Problema físico comprovado
- A interface no GitHub Pages acessa loopback `127.0.0.1:8765` da máquina atual, não o notebook de outro operador.
- A Central local é origem HTTP e a oficial é origem HTTPS; sessionStorage, IndexedDB e permissões do navegador não são compartilhadas automaticamente entre origens.
- O token do agente só acompanha o launcher na aba aberta por ele, ou a confirmação **local** `/workstation/parear` que redireciona ao domínio oficial. Abrir o link manualmente em nova aba exige novo pareamento; isso não indica ausência do SQLite.
- FPY de Hoje, última revisão salva e histórico são escopos distintos. Fonte em conflito não é zero e não se resolve por timestamp mais recente de outra instalação.
- Substituir pastas ZIP de usuários a cada atualização é inseguro para SQLite, automação de fábrica e escala.

## Contrato de produto
1. **Frontend**: única URL pública de operação: `https://pedrokam700.github.io/Central-de-Controle-/`; publicação GitHub Actions baseada na release e SHA comprovado. Atualiza na próxima navegação/recarga (com proteção contra SW cache). Não exigir reinstalação de Windows para CSS, texto, análise e UI que usem APIs já disponíveis.
2. **Agente do posto**: instalação **única** com caminho de dados persistente fora da pasta versionada; inicialização opcional pelo Windows já existente. Toda interação MES/SQLite fica no PC coletor; não publicar material bruto, cookies ou Repair Comments no Firebase.
3. **Pareamento**: usuário abre a página oficial; caso haja agente local detectado e não conectado, exibir ação principal “Conectar agente deste PC”. Abrir o mesmo navegador na tela de confirmação local, validar nonce, voltar via HTTPS para **a mesma aba**, token em fragmento descartado da barra e salvo apenas na sessão local. Nunca enviar token para GitHub/Firebase ou URL de analytics. Parear novamente após troca de navegador/aba quando necessário.
4. **Atualizações de backend**: não comparar apenas `release-build.sha` do frontend com o SHA do agente. Expor contrato de capabilities versionado e versão mínima do backend. Se compatível, continuar usando agente antigo normalmente. Se incompatível, mostrar atualização necessária.
5. **Atualizador Windows futuro**: componente confiável **fora da pasta substituída**, instalado uma vez. Consulta **somente** releases finais GitHub oficiais em HTTPS, valida tag, SHA de commit, digest SHA-256 de asset e formato/allowlist. Faz download para staging temporário, backup verificado de arquivos+SQLite, checa coletor/MES/job sem execução, mutex/porta única, encerra apenas processo canônico próprio, troca binários atomicamente, preserva token/config/dados e reinicia, prova /ready e funcionamento, rollback automático em falha. Sem admin, sem executar código baixado sem digest, sem sobrescrever `.venv` ou SQLite às cegas.
6. **Ciclo**: detectar atualização e **notificar** no posto; disponibilizar “Instalar quando ocioso” com consentimento, prazo/adiamento e rollback. Nunca trocar durante coleta 3028/3074/2114/3022/3012, sessão AT, sincronização pendente ou sem backup comprovado. Em rede MES isolada, baixar quando internet disponível sem bloquear a coleta.
7. **Muitos usuários**: cada coletor possui source_id estável e fila local, viewers leem snapshots sanitizados publicados sob autenticação e regras Firebase. Mesmo dia/linha com múltiplos produtores: o operador escolhe origem de modo explícito, persistindo preferência **local ao navegador**. Uma escolha anterior nunca autoriza sobrescrever outra instalação. Validar paridade A/B por line_id + período + source_id + snapshot_id + snapshot_revision + hash + registro de recebimento.
8. **Histórico**: exibir automaticamente a última revisão verificável na tela se não houver head válido do Hoje. Sempre rotulada “última coleta salva”, com período/origem/revisão; não promover métricas anteriores a Hoje. Conflitos oferecem seletor; zero só com prova de cobertura.

## Gates para habilitar o atualizador Windows
- G1: tests Node/Python + integração Edge HTTPS->loopback + anti-CSRF/PNA, nunca expor token.
- G2: Windows clean install, atualização compatível UI-only **sem ZIP**, backend update mock com verificação SHA e rollback.
- G3: agente ativo com jobs em andamento **recusa** aplicar update; nunca descarta SQLite nem reordena dados.
- G4: interrupção de energia no meio de staging e troca com recuperação; preserva configurações e histórico.
- G5: dois postos coletores + um viewer em computadores diferentes; troca de perfil Edge e reabertura; mesmo dia dois publicadores, histórico distinto.
- G6: 24h/7 dias de observabilidade e recovery no piloto de fábrica, antes de oferecer "atualização em um clique" a todos.

## Escopo desta correção
Pareamento visível no cabeçalho e recuperação do preview de última captura sem remontar o componente a cada refresh; uma revisão de Hoje salva mas sem snapshot atual pode aparecer como **última coleta salva**. Ainda **não existe** autoaplicação Windows; esta exige implementação e validação separadas, rastreada na Issue própria.
