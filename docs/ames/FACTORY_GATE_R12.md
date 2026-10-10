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

### Preview da branch e CORS local

Para o PR #23, usar preferencialmente o preview que estiver associado ao **SHA exato em validação**. As origens atualmente autorizadas são somente estas três:

- produção: `https://central-cora-v2.vercel.app`;
- preview Vercel da branch: `https://central-cora-v2-git-v2-console-parity-r12-pedrokam700-6477.vercel.app`;
- deploy-preview do PR #23: `https://deploy-preview-23--productcontrolcenter.netlify.app`.

Se o Vercel estiver bloqueado por cota/build-rate-limit, o deploy-preview do PR pode ser usado desde que o status do commit confirme que ele foi publicado para o SHA sob teste.

O candidato gerado pelo PR possui dois atalhos separados:

- `ABRIR_PREVIEW_PR23.bat` abre o deploy-preview usado no gate;
- `ABRIR_CENTRAL_V2.bat` abre a produção e **não** deve ser usado como evidência de validação do PR #23.

O agente usa allowlist **exata** de origem. Antes do gate, se a origem escolhida ainda não existir em `ames-agent/config.json`, executar o helper idempotente:

`scripts/ames-authorize-preview-origin.ps1`

Sem parâmetro, ele prepara o deploy-preview atual do PR #23. Para outra origem aprovada, usar `-Origin` explicitamente.

O helper:

- aceita apenas as três origens exatas listadas acima;
- não usa wildcard Vercel/Netlify;
- se a origem já estiver autorizada, termina sem regravar o arquivo nem criar backup desnecessário;
- altera somente `allowed_origins` quando realmente há mudança;
- cria backup antes de qualquer escrita;
- grava UTF‑8 sem BOM;
- não lê nem grava senha, cookie, sessão, Wi‑Fi ou credencial;
- exige reinício do agente somente quando a configuração for alterada.

## 2. Ordem do gate

### Gate A — conexão e isolamento

1. Confirmar no GitHub o SHA atual do PR #23 e o status verde do preview ligado a ele.
2. Abrir `ABRIR_PREVIEW_PR23.bat` ou diretamente o preview ligado ao SHA em validação.
3. Console MES → Monitoramento → Verificar.
4. Confirmar no painel **Gate físico · posto de fábrica**:
   - agente conectado;
   - motor disponível;
   - Chrome/CDP conectado;
   - rede A‑MES conectada;
   - scheduler validado;
   - build identificado.
5. Confirmar que Linha 1=`TAN10101`, Linha 2=`TAN10102`, Linha 3=`TAN10103` continuam separadas.

Resultado esperado: no máximo **PRONTO PARA VALIDAR 9/9**. Isso ainda não é GREEN físico.

### Gate B — 3028

Executar hoje e dia anterior.

Para cada linha, registrar:

- FPY;
- Check FPY;
- Quantity;
- Top 3;
- quantidade de ocorrências;
- snapshot/origem;
- tempo de execução.

Falha se houver vazamento entre linhas, CPH aproximado ou ausência convertida em zero.

### Gate C — 2114

Usar ocorrências reais de ambos os turnos quando possível.

Obrigatório:

- Shift 1 = 07:30–17:30;
- Shift 2 = 17:30–07:30;
- seleção automática de Shift;
- nenhuma intervenção manual no OPC para escolher Shift;
- `Manual/Automatic` preservado como modo de registro, não tipo de reparo;
- estados N/Y e Defect Type preservados.

### Gate D — 3074 / reuso

Confirmar separadamente:

- segundo/terceiro uso da própria PCBA;
- segundo/terceiro uso de Material SN;
- PCBAs anteriores/desvinculadas;
- Bind/Unbind em relação ao Defect Time;
- `Batch Count` nunca usado como contagem de usos.

Clicar em KPI de reuso deve abrir o item/SN exato que sustenta a contagem.

### Gate E — 3022 / processo

Executar caso simples e caso com múltiplas passagens/retrabalho.

Regra obrigatória:

`ocorrência atual → Defect Time → posto relevante → última passagem válida <= Defect Time`

Validar ao menos:

- processo separado de Defect Time;
- A5162/A7600 em falha de aparência de câmera quando a evidência real existir;
- retorno A5201 em retrabalho de tampa quando houver evidência;
- A5700 como corte principal de análise antes de packing;
- nenhuma estação promovida automaticamente a causa.

### Gate F — modos seletivos

- `full`: 3074 + 2114 + 3022;
- `process_only`: somente 3022;
- `reuse_only`: 3074 + 2114 sem 3022.

`process_only` deve permanecer fail‑closed se o agente não declarar `process_timeline=true`.

### Gate G — Consulta por SN

Usar PCBA real e Material SN real.

Resultado deve reunir, quando houver evidência:

- falha atual;
- falhas antigas da PCBA;
- materiais 2º+ uso;
- PCBAs anteriores/desvinculadas;
- 3074;
- 2114;
- 3022;
- processo/horário distinto de Defect Time.

### Gate H — concorrência e cancelamento

- nenhum comando A‑MES simultâneo;
- jobs normais FIFO;
- monitor pula ciclo ocupado sem criar backlog;
- cancelamento cooperativo não corrompe snapshot nem SQLite.

### Gate I — experiência e recuperação

- 9 views desktop;
- mobile sem overflow estrutural;
- Excel;
- Base local;
- CORA conhecimento;
- reiniciar agente/notebook;
- configuração preservada;
- bootstrap repara dependências se necessário;
- nenhuma senha A‑MES persistida.

## 3. Performance

Medir no posto, por linha e por etapa:

- 3028;
- 3074;
- 2114;
- 3022;
- total full.

Comparar com a automação local R12. Não declarar ganho/perda sem medida real.

## 4. Critério de promoção

Somente após evidência dos gates acima:

1. registrar diferenças reais;
2. corrigir regressões;
3. repetir apenas os gates afetados + regressão global;
4. obter aprovação explícita do usuário;
5. então decidir merge do PR #23.

CI verde e preview funcional são necessários, mas nunca suficientes para GREEN físico.
