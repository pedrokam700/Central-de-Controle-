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

## Causa no código atual

`ames/factory-engine/ames/shift_2114.py` assume que o seletor é um `combobox`/`field` ExtJS, procurando `input[name="desc"]` ou `fieldLabel` contendo `shift`. A UI física exibida é uma janela/lista com registros de turno; o contrato atual retorna `combo_missing` mesmo com os dois turnos visíveis.

Há ainda um acoplamento incorreto em `ames/agent/engine_bridge.py::run_deep_v016_records`: o fluxo abre 3074, depois abre 2114 e exige `ensure_current_shift_2114()` antes de executar `executar_fluxo(...)` da 3074. Assim, uma falha exclusiva do 2114 impede a fonte 3074 de produzir/persistir evidência.

## Regra desta correção

1. Descobrir e selecionar o Shift 2114 pela estrutura ExtJS real, com fallback explícito para grid/lista/store e confirmação do registro selecionado; sem coordenadas e sem sleeps longos como solução.
2. Preservar suporte ao combobox antigo se ele existir.
3. Produzir diagnóstico estrutural útil quando nenhuma variante conhecida for encontrada.
4. Executar 3074 independentemente do sucesso de 2114.
5. Falha de 2114 deve resultar em estado parcial, preservando 3074 e permitindo etapas posteriores tecnicamente independentes.
6. Consulta por SN deve degradar por fonte: erro em 2114 não pode apagar 3074/3022/SQLite/3012 disponíveis.
7. Não alterar bootstrap, 3028 validado, navegação Central↔Console ou redesign geral neste gate.

## Gate

Automação/CI pode comprovar contratos e degradação parcial, mas o gate físico continuará `PENDING` até o usuário testar novamente no A-MES real.
