# PR70 — A6900, nomes da AT e PCBA de uso indeterminado (10/11/2026)

## Problema observado em campo

- A coluna **Técnico AT** de *Dashboards de reuso* mostrou dois campos vazios e, em outras linhas, nomes obtidos ao casar um `Repair User` 3012 com qualquer transação 3022 do mesmo BRM.
- A *Consulta por SN* mostrou um nome de pessoa do encaminhamento/reparo como se fosse da análise de falha. O operador que o usuário quer identificar é o do evento da própria PCBA na estação **A6900** da 3022.
- Uma coleta de falhas de 04/11 mostrou **86 PCBAs, 0 classificadas em 1º uso, 0 em 2º+ uso e 86 com uso não determinado**, apesar dos componentes permanecerem classificados (581 no primeiro, 191 no segundo ou posterior).

## Correção implementada (somente exibição/inferência, sem reconsultar MES)

1. O operador da falha de 3022 **A6900** é uma identidade separada do usuário de reparo informado na 3012. A associação exige PCBA exata, posto A6900, nome real explícito e horário dentro da janela da falha/reparo. Se dois operadores distintos aparecerem ou a evidência faltar, devolve `null`.
2. *Dashboards de reuso* chama o campo **Técnico AT · A6900** e não importa mais nomes somente por ID BRM de um posto qualquer. Dados antigos no SQLite só são usados se preservaram posto, horário e nome da transação 3022.
3. Alertas da *Consulta por SN* apresentam separadamente **técnico da falha · 3022 A6900** e **usuário de reparo · 3012**. A hora do reparo 3012 é denominada como tal.
4. A escolha geral da passagem preferida em `sn-forensics` não aceita `Export Repair` de outra estação como A6900.
5. Quando **todas** as PCBAs têm uso indeterminado, os cartões de 1º e 2º+ uso mostram `—` (não comprovado) em vez de dois zeros que parecem absolutos. A população continua registrada como desconhecida: nenhuma montagem foi inventada.

## Limite não resolvido sem evidência do posto

O número de componentes de primeiro/segundo uso vem de vínculos físicos de materiais; ele **não** demonstra o primeiro/segundo ciclo da **PCBA principal**. As classificações de placa exigem linha própria da PCBA na 3074 (ou retorno confirmado 2114→3022). Os testes do reconstrutor com 1º e 2º uso continuam passando. Não há cópia do SQLite operacional nem o resultado bruto 3074 da coleta de 04/11 no repositório: logo **a causa dos 86 indeterminados não está provada** e **não é seguro afirmar que seja uma regressão do algoritmo ou que faltaram as linhas no MES**.

Para encerrar a causa raiz, obter **somente diagnóstico read-only** da mesma revisão e linha de coleta:

- `insights.proof_diagnostics`: `raw_pcbas_observed`, `raw_pcbas_with_self_rows`, `pcba_occurrences_classified`;
- uma PCBA indeterminada, com a contagem (não necessariamente os SNs completos) de linhas da `base_query` 3074 com `Barcode == PCBA` e indicação dos campos `Aut Cmf1`, `Sn Type`, `Bind Time`, `Batch Id`, `Prod Time`;
- `Defect Time` 3028 da ocorrência e se o vínculo da 3074 ocorre antes ou depois da falha;
- versão/SHA local e estado completo/parcial da coleta 3074.

Não copiar tokens, banco SQLite, credenciais, IPs, dados de outros funcionários nem relatório pessoal inteiro para uma issue pública.

## Antirregressão

- Coletor 3012, automação 3028, persistência 3074 e banco SQLite **não modificados**.
- Testes com pessoa do encaminhamento diferente da A6900, outra PCBA, outra data, dois analistas no mesmo intervalo, A6900 sem nome e histórico 3022 preservado na base local.
- Verificar gate central completo, cache offline da dependência nova, geração do pacote CLEAN e gates CI do SHA exato antes de disponibilizar para teste em posto.
- Classificação física do dia 04/11 permanece **pendente de inspeção real**; não anunciar GREEN de fábrica.
