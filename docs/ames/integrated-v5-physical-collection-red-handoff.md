# Gate físico RED — coleta 3074 / 2114 / 3022

Data: 2026-10-14

Branch: `work/ames-integrated-clean-v5-improvements-20261013`

Base revalidada antes desta investigação: `c1424ac42d5cdd3324a102fc9045a5556c7391d6`.

## Evidência física reproduzida

O bootstrap `cc1f61c` já passou fisicamente na fábrica e não faz parte deste gate.
A interface corrigida em `23fc753` / `7877b18` cria o job de rastreabilidade e mostra progresso, portanto o clique silencioso anterior foi resolvido.

No teste físico do CLEAN `c1424ac`:

- AWIP2114 / OPC abre automaticamente.
- A janela de Shift fica visível com duas opções reais: `1st Shift` (07:30–17:30) e `2nd Shift` (17:30–07:30).
- A automação não seleciona o turno; o usuário confirmou que, em versões anteriores, selecionar manualmente o turno permitia a coleta prosseguir.
- O erro físico atual é `2114: Shift 1st Shift não confirmado pela store/valor efetivo ... reason: combo_missing`.
- O mesmo erro aparece na Consulta por SN.
- O job de rastreabilidade fica sem dados efetivos de 3074/2114/3022.

## Causa no código anterior

`ames/factory-engine/ames/shift_2114.py` assumia que o seletor era um `combobox`/`field` ExtJS, procurando `input[name="desc"]` ou `fieldLabel` contendo `shift`. A UI física exibida é uma janela/lista com registros de turno; o contrato retornava `combo_missing` mesmo com os dois turnos visíveis.

Havia ainda um acoplamento incorreto em `ames/agent/engine_bridge.py::run_deep_v016_records`: o fluxo abria 3074, depois 2114 e exigia a preparação do Shift antes de executar a coleta 3074. Assim, uma falha exclusiva do 2114 impedia a fonte 3074 de produzir/persistir evidência.

## Correção implementada

SHA funcional validado automaticamente antes deste checkpoint: `b900bd248c47f25d23d952be350fbc2bf9087a54`.

Principais mudanças:

- `ames/factory-engine/ames/shift_2114.py`
  - preserva a variante antiga de combobox com confirmação forte de `value`, `submit value`, registro e raw value;
  - adiciona suporte explícito à variante física lookup/grid da 2114;
  - reconhece grid/store contendo simultaneamente `1st Shift` e `2nd Shift`;
  - seleciona exatamente o registro esperado sem coordenadas;
  - dispara seleção/eventos do próprio componente e só aceita sucesso quando o campo principal `input[name="desc"]` permanece com o turno esperado;
  - abre o trigger do lookup quando a janela ainda não está pronta;
  - usa polling limitado, não sleep longo, e devolve diagnóstico estrutural em falha.
- `ames/factory-engine/ames/navigation.py`
  - preparação de Shift no fluxo composto passa a ser não fatal por padrão;
  - `strict=True` continua disponível para consumidores que realmente exigem pré-condição dura.
- `ames/factory-engine/ames/tela_2114.py`
  - distingue Shift confirmado de `SHIFT_UNCONFIRMED`;
  - consulta individual continua fail-closed: nenhum SN é enviado ao 2114 sem confirmação real do Shift.
- `ames/factory-engine/core/fluxo_2114.py`
  - Shift indisponível vira resultado `partial` estruturado da fonte 2114;
  - preserva a evidência 3074 já obtida;
  - registra erro por fonte/PCBA e checkpoint;
  - um erro 2114 não aborta os demais alvos nem deve impedir 3074/3022 tecnicamente independentes.

Não foram alterados o bootstrap/porta 8765, o coletor 3028 validado, a navegação Central↔Console já aprovada ou o redesign geral da interface neste gate.

## Testes adicionados / endurecidos

- `scripts/agent-2114-shift-partial.test.py`
  - espera confirmação efetiva, não apenas lookup aberto/linha selecionada;
  - prova modo não fatal versus `strict=True`;
  - prova que Shift não confirmado não envia nenhuma consulta 2114 e retorna `partial`;
  - prova que erro em uma PCBA 2114 não aborta a seguinte.
- `scripts/ames-clean-v3.test.mjs`
  - mantém os arquivos não relacionados do engine congelados por hash;
  - libera somente os deltas 2114 intencionais e verifica suas salvaguardas;
  - mantém contrato forte da variante combobox antiga;
  - adiciona fixture que simula a janela física com duas linhas `Name / Time / Desc`: `1 / 7:30-17:30 / 1st Shift` e `2 / 17:30-07:30 / 2nd Shift`, provando que somente o registro correto é selecionado e confirmado.

## Gates do SHA b900bd2

- Full Quality — run `38579826442`: **GREEN / SUCCESS**.
- Candidate Gate — run `38579826449`: **GREEN / SUCCESS**.
- Candidate Gate construiu e instalou o CLEAN exato no Windows e passou os contratos integrados e o gate Windows do bootstrap.

Esses gates automatizados não equivalem ao A-MES físico. O comportamento real da janela de Shift precisa ser validado novamente na fábrica.

## Próximo teste físico exato

1. Extrair o CLEAN correspondente ao HEAD final deste checkpoint em uma pasta nova.
2. Executar `00_INICIAR_AQUI.bat`.
3. Abrir Rastreabilidade e iniciar uma coleta pequena em uma linha/falha já carregada.
4. **Não selecionar o Shift manualmente na primeira tentativa.** O objetivo é provar que a automação abre o lookup e escolhe sozinha o turno correto.
5. Observar no A-MES se o campo Shift da 2114 passa a exibir `1st Shift` ou `2nd Shift` conforme o horário.
6. Confirmar no painel que 3074 progride e produz evidência mesmo se 2114 ainda tiver problema.
7. Se 2114 funcionar, confirmar sequência 3074 → 2114 → 3022 e resultados persistidos.
8. Se a seleção automática ainda falhar, não mascarar a primeira tentativa: preservar print/erro. Depois, como teste controlado, selecionar o turno manualmente e verificar se 2114 passa — isso separa definitivamente seletor de consulta.

## Gate

Gate automatizado: GREEN no SHA funcional `b900bd248c47f25d23d952be350fbc2bf9087a54`.

Gate físico da coleta 3074/2114/3022: **PENDING** até o novo teste no A-MES real.

GitHub é a fonte de verdade. Não avançar para mudanças laterais de contexto global, semântica de zero, dashboard de reuso ou UX 3012 antes de fechar este P0 físico.
