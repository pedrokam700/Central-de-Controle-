# PR #69 — retomada da falha 2114, recorrência e alerta (28/10/2026)

Fonte: prints físicos enviados pelo operador e branch `work/ames-pilot-integration-57-66-20261027`.
**Estado da fábrica: PENDENTE.** Este checkpoint não atesta captura real corrigida.

## Caso físico de referência

- A PCBA `002527005C0535F300007060` tem dois registros visíveis na AWIP2114: `Defect Hist Seq 0` e `1`, ambos `GN01-TX02 — Antenna: ANT1 test failed`. O MES mostra características de análise distintas e a tela de investigação anterior retornou **histórico 2114 = 0**. A resposta anterior não prova ausência das falhas: houve perda de captura/projeção.
- No uso físico, o turno da primeira consulta às vezes exige abrir manualmente o bloco Shift. O operador também observou atraso na troca das PCBAs e um campo superior de reuso que não navegava.
- O alerta vermelho antigo (faixa lateral, fundo vermelho-claro, títulos/indicador vermelhos e cartões brancos) é o referencial visual. Mostrar falhas 2114, materiais 3074, comentários e operadores 3012/3022 com identidade e horário quando disponíveis, sem inventar reparo/correspondência temporal.

## Correções preservadas do histórico imediato da PR

- `ffa142d`, `7790c29`, `4012df5`, `31acdf2`, `0c18d7f`, `39a2268`, `2d24313`, `bfd1e25`: abrir trigger Shift real na 2114, evitar lookup repetido, aceitar grade nova com Lot ID exato sem esperar evento ExtJS opcional, classificar recorrência Seq 0→1 sem horário, restaurar alertas vermelhos e tornar o card superior de PCBA navegável.

## Refinamentos desta retomada

1. O navegador `ensure_current_shift_2114` tolera um campo em transição e permite que o lookup real faça a seleção; em modo estrito ainda repassa erro de confirmação.
2. O coletor individual remove verificações duplicadas de Shift; cada `Tela2114.consultar` valida e seleciona uma vez somente se necessário. Se a navegação da 2114 falhar, o resultado dessa fonte registra erro e a investigação das outras fontes continua.
3. O fluxo profundo evita a segunda tentativa redundante antes de `turno_atual`, deixando a 2114 degradar a fonte sem suprimir o que a 3074 capturou.
4. A seleção do histórico Python preserva Hist Seq numérico `0` independentemente da ordem visual das linhas, recuperando `MESMA_FALHA_REPETIDA` para Seq `1,0` invertidos.
5. O modelo JS distingue duplicatas sem Defect Time e a tela detalhada classifica o registro atual pelo **Hist Seq** quando PCBA/código/horário se repetem. Uma falha anterior não aparece mais como “falha atual”.
6. A resposta individual traz `trace_2114.status` (`complete`, `partial`, `error`) para impedir que uma navegação/Shift mal sucedida seja apresentada como zero comprovado.
7. Revisão do service worker modificada para separar o frontend corrigido da versão cacheada anterior. A ativação continua sujeita à política segura de atualização, sem forçar coleta em andamento.

## Contratos que não mudaram

- Rastreabilidade ancora cada falha da 3028 no seu kit temporal 3074; Consulta por SN é uma investigação individual, ancorada no histórico 2114 e montagem atual. Não compartilhar a seleção de componentes entre ambos.
- Hist Seq ordena eventos 2114 da **mesma** PCBA; não fornece horário de reparo, prova de um segundo ciclo físico, nexo causal ou vínculo com AT. A classificação *segundo uso* continua exigindo evidência de ciclo/vínculo, não duas falhas.
- 3012 conserva consulta histórica ampla; 3022 comprova passagens de posto e seus horários quando encontrados. Nunca usar timestamp 3028 como substituto da geração 3022.
- Vínculo material↔PCBA com instante incerto fica investigativo; não vira componente culpado ou histórico anterior comprovado.

## Gate de aceite físico ainda necessário

1. Iniciar um ensaio seguro em instalação separada; consultar primeira PCBA da 2114 **sem clique humano no Shift** e confirmar o valor no campo principal.
2. Executar a SN de referência e comprovar 2 linhas (`0`,`1`), mesma falha, tempos por PCBA e status real de ambas as fontes, inclusive 3074/3012.
3. Cronometrar troca de dez PCBAs e verificar se alguma espera atinge 15 s; não há prova de latência física na CI.
4. Clicar no card superior do dashboard de reuso, conferir recorte e PCBA, comparar o painel Placas/PCBAs; não contar duas vezes o mesmo evento.
5. Comparar visual vermelho com prints antigos, verificar nomes/AT/comentários e conferir componentes da antiga PCBA.
6. Investigar a cobertura 3074 parcial e as cinco passagens 3022 ausentes sem gerar zeros ou horários falsos.

**PR #69 permanece DRAFT, sem merge, release, publicação web ou alteração do posto.**
