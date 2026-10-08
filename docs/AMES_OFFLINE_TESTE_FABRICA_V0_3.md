# A-MES Offline V0.3 — checklist de validação na fábrica

## Preparação
- Extrair a pasta completa V0.3 sem misturar versões.
- Manter `AMES_Automacao_V0_16_PADRAO_VALIDADO` ao lado de `ames-agent`.
- Abrir o Chrome dedicado e entrar manualmente no A-MES.
- Iniciar o agente local e confirmar `Agente local conectado` + motor V0.16 encontrado.

## 1. Export manual 3028
Enquanto o adapter direto da 3028 ainda não foi mapeado, usar `Analisar export 3028` com `Detailed_Report_of_Defective_Passthrough_Rate.xlsx`.

Validar que a Central:
- lê FPY oficial do Overall Report Of FPY;
- separa tudo por Line Id;
- calcula Top 3 por linha;
- dispara 3074 + 2114 pelo motor V0.16;
- cria snapshot local;
- consegue exportar o Excel V0.16 aprovado.

## 2. Atualização N/Y da AT
- Usar um lote com PCBAs em Repair Status N.
- Clicar `Atualizar N / Y`.
- Conferir amostras diretamente na 2114.
- Repetir após a AT finalizar algumas unidades e confirmar N → Y / Defect Type atual sem perder históricos antigos.

## 3. Falha removida do export
- Criar um snapshot de um período.
- Refazer o mesmo período mais tarde.
- Uma falha que sumiu do export deve continuar no histórico local e aparecer como `Removida do export / validar AT`.
- Não classificar automaticamente como falha falsa.

## 4. Multilinha
- Coletar duas linhas no mesmo arquivo/consulta.
- Confirmar que FPY, Top 3, falhas, rastreabilidade, Base local e busca CORA permanecem separados por linha.

## 5. Mapear o adapter direto da 3028
Inspecionar uma vez os campos/botões reais para automatizar:
- início/fim;
- Line Id;
- Shift;
- View/Search;
- botão exato do Detailed Report Of FPY;
- conclusão do download.

Não usar sleeps fixos quando houver estado real de store/download disponível.

## 6. Mapear 3022
- Abrir 3022 e rodar o inspector existente da V0.16.
- Consultar pelo menos uma PCBA com histórico de montagem e uma que foi para AT.
- Confirmar Current Oper Code / Current Oper / Tran Time e demais campos.
- Ligar a saída à tabela local `process_events`.

## 7. Segundo plano
- Iniciar uma análise real.
- Minimizar Central e Chrome dedicado.
- Usar outro programa.
- Confirmar que progresso/checkpoint continuam sem depender de foco físico.

## 8. Performance
- Medir primeiro o fluxo serial validado.
- Testar paralelismo somente depois, começando com duas consultas simultâneas.
- Não tornar três workers padrão sem evidência de estabilidade.

## Critério GREEN
3028 oficial por linha correto; 3074/2114 completos com checkpoint; N/Y atualizável; histórico preservado; multilinha totalmente separada; Excel V0.16 correto; execução minimizada estável; 3028/3022 mapeados para os adapters diretos.