# Factory Gate R12 — execução física 9/9

Este documento transforma o requisito canônico em sequência de teste no notebook da fábrica. Ele não autoriza merge, produção nem Firebase Rules.

## 1. Antes de coletar

Manter a arquitetura única:

`R12 local → agente local 127.0.0.1:8765 → state.ames → Console MES nativo → Central/CORA`

Não iniciar segunda aplicação, segundo agente ou segundo banco.

Checklist de preflight:

- Ethernet normal pode permanecer para internet;
- Wi‑Fi OPPO `TAXXX_5G` conectado para o A‑MES;
- rota para `172.29.185.215` funcional;
- Chrome dedicado/CDP em `127.0.0.1:9222`;
- agente local em `127.0.0.1:8765`;
- login A‑MES manual;
- scheduler compatível;
- nenhuma senha/cookie/sessão A‑MES em config, SQLite, Firebase ou sync.

### Preview da branch, SHA exato e CORS local

O bundle de migração R12 gerado pelo CI contém `FRONTEND_GATE.json` com o **HEAD exato do PR #23** usado para gerar o pacote. O launcher `00_INICIAR_AQUI.bat` não confia em alias por nome: ele consulta `release-build.json` e abre somente um preview cujo `sha` seja exatamente igual ao `expected_sha` do bundle.

As origens aprovadas para o gate são:

- preview Vercel da branch: `https://central-cora-v2-git-v2-console-parity-r12-pedrokam700-6477.vercel.app`;
- deploy-preview do PR #23: `https://deploy-preview-23--productcontrolcenter.netlify.app`.

Produção (`https://central-cora-v2.vercel.app`) não vale como evidência do PR #23. O parâmetro `/prod` existe apenas como override explícito e não deve ser usado no gate.

Fluxo automático do launcher:

1. lê `FRONTEND_GATE.json`;
2. tenta Vercel e Netlify;
3. consulta `/release-build.json` sem cache;
4. escolhe a primeira origem cujo SHA seja exatamente o esperado;
5. grava somente `FRONTEND_GATE_STATE.json` com `SHA + URL + horário`, sem segredo;
6. se a internet externa cair depois dessa validação, aceita reutilizar apenas a mesma origem já validada para o mesmo SHA, permitindo que o Service Worker/cache da Central assuma o shell offline;
7. se nunca houve validação daquele SHA e nenhum preview exato está acessível, o launcher falha fechado e não inicia o posto.

Isso remove a dependência de o Vercel estar disponível: se ele estiver bloqueado por cota/build-rate-limit e o Netlify estiver publicado no HEAD correto, o launcher seleciona o Netlify automaticamente.

O agente mantém allowlist **exata** das origens Vercel, Netlify e produção; não existe wildcard. O updater acrescenta apenas as origens aprovadas a `ames-agent/config.json`, preservando o restante da configuração. Nenhuma senha, cookie, sessão, Wi‑Fi ou token é lido/escrito por essa etapa.

## 2. Migração do notebook que já possui R12

Antes do gate físico:

1. manter uma cópia íntegra da instalação R12 atual;
2. parar agente/monitor antigos;
3. extrair o bundle de migração gerado para o HEAD atual;
4. executar `ATUALIZAR_R12_EXISTENTE.bat` e informar a pasta raiz da R12 existente;
5. **antes de alterar a instalação**, o script tenta criar `R12_ENGINE_CAPTURE_PREMIGRATION.zip` com o motor original sanitizado; se a captura automática não localizar/validar o motor, apenas avisa e deixa disponível a captura manual durante o gate;
6. o updater valida os hashes congelados do 3028, cria backup de código/configuração/SQLite e só então aplica a camada canônica;
7. executar `00_INICIAR_AQUI.bat` dentro da instalação atualizada;
8. o launcher valida frontend, ambiente Python, dependências, rede A‑MES, agente, Chrome/CDP e só então abre a única Central;
9. login A‑MES permanece manual.

O bundle também inclui `ROLLBACK_R12_EXISTENTE.bat`. Sem parâmetros adicionais ele localiza o backup candidato mais recente e restaura código/configuração/launcher anteriores, preservando a base SQLite operacional. Arquivos introduzidos somente pela migração, como `FRONTEND_GATE.json`, são removidos quando não existiam na instalação original.

### Captura segura do motor R12

A captura pré-migração é automática em modo best-effort. Se aparecer aviso de que ela não foi criada, executar durante a validação:

`suporte\ames-workstation\CAPTURAR_MOTOR_R12_SEGURO.bat`

A captura é necessária para fechar o futuro pacote de **PC totalmente novo**. Ela coleta somente código/manifesto/hashes necessários e exclui SQLite, logs, outputs, `.venv`, perfil Chrome, cookies, sessão e credenciais. O pacote para PC novo permanece bloqueado até essa captura ser comparada e validada.

## 3. Ordem do gate

### Gate A — conexão e isolamento

1. Confirmar no GitHub o SHA atual do PR #23 e que Static Quality + Agent/Sync E2E/Firestore estão verdes nesse HEAD.
2. Executar `00_INICIAR_AQUI.bat` da instalação migrada.
3. Confirmar no console do launcher o **Frontend exigido** e a **Central selecionada**.
4. Console MES → Monitoramento → Verificar.
5. Confirmar no painel **Gate físico · posto de fábrica**:
   - **Frontend SHA** igual ao HEAD do PR #23 sob teste;
   - agente conectado;
   - motor disponível;
   - Chrome/CDP conectado;
   - rede A‑MES conectada;
   - scheduler validado;
   - build do agente identificado.
6. Confirmar que Linha 1=`TAN10101`, Linha 2=`TAN10102`, Linha 3=`TAN10103` continuam separadas.

Resultado esperado: no máximo **PRONTO PARA VALIDAR 9/9**. Isso ainda não é GREEN físico.

### Gate B — 3028

Executar hoje e dia anterior.

Para cada linha, registrar FPY, Check FPY, Quantity, Top 3, quantidade de ocorrências, snapshot/origem e tempo de execução. Falha se houver vazamento entre linhas, CPH aproximado ou ausência convertida em zero.

### Gate C — 2114

Usar ocorrências reais de ambos os turnos quando possível. Obrigatório: Shift 1=07:30–17:30, Shift 2=17:30–07:30, seleção automática de Shift, nenhuma intervenção manual no OPC, `Manual/Automatic` preservado como modo de registro e estados N/Y/Defect Type preservados.

### Gate D — 3074 / reuso

Confirmar separadamente segundo/terceiro uso da própria PCBA, segundo/terceiro uso de Material SN, PCBAs anteriores/desvinculadas, Bind/Unbind em relação ao Defect Time e que `Batch Count` nunca é usado como contagem de usos. KPI de reuso deve abrir o item/SN exato.

### Gate E — 3022 / processo

Executar caso simples e caso com múltiplas passagens/retrabalho. Regra obrigatória:

`ocorrência atual → Defect Time → posto relevante → última passagem válida <= Defect Time`

Validar processo separado de Defect Time, estações relevantes somente quando houver evidência real, A5700 como corte principal quando aplicável e nenhuma estação promovida automaticamente a causa.

### Gate F — modos seletivos

- `full`: 3074 + 2114 + 3022;
- `process_only`: somente 3022;
- `reuse_only`: 3074 + 2114 sem 3022.

`process_only` deve permanecer fail‑closed se o agente não declarar `process_timeline=true`.

### Gate G — Consulta por SN

Usar PCBA real e Material SN real. Resultado deve reunir, quando houver evidência: falha atual, falhas antigas da PCBA, materiais 2º+ uso, PCBAs anteriores/desvinculadas, 3074, 2114, 3022 e processo/horário distinto de Defect Time.

### Gate H — concorrência e cancelamento

Nenhum comando A‑MES simultâneo; jobs normais FIFO; monitor pula ciclo ocupado sem backlog; cancelamento cooperativo não corrompe snapshot nem SQLite.

### Gate I — experiência, equipe, offline e recuperação

- 9 views desktop;
- mobile sem overflow estrutural;
- Excel, Base local e CORA conhecimento;
- usuário/posto A coleta e usuário ativo B consegue ler o snapshot MES sanitizado já sincronizado;
- usuário B não recebe agente local, sessão A‑MES, cookie, credencial ou capacidade de comando remoto;
- após primeiro acesso online/cache válido, cortar internet externa e confirmar abertura do shell/dados persistidos;
- reconectar internet e confirmar retomada da sincronização Firebase;
- reiniciar agente/notebook e confirmar configuração preservada/bootstrap;
- nenhuma senha A‑MES persistida.

## 4. Performance

Medir no posto, por linha e etapa: 3028, 3074, 2114, 3022 e total full. Comparar com a automação local R12. Não declarar ganho/perda sem medida real.

## 5. Critério de promoção

Somente após evidência dos gates acima: registrar diferenças reais; corrigir regressões; repetir gates afetados + regressão global; obter aprovação explícita do usuário; então decidir merge do PR #23; somente depois decidir publicação das novas `firestore.rules` e produção.

CI verde e preview funcional são necessários, mas nunca suficientes para GREEN físico.
