# A-MES Offline — V0.1

## Objetivo

Criar uma tela local/offline da Central de Trabalho para orquestrar a coleta e análise A-MES sem depender do fluxo manual de exportar arquivos e arrastá-los para a automação.

Fluxo alvo:

`Central offline -> agente Python local -> A-MES -> 3028 -> 3074 -> 2114 -> 3022 -> correlação -> resultados -> exportação Excel/CSV`

## O que já existe nesta branch

- `ames-offline.html`: shell local sem dependências externas.
- Importação de JSON integrado V0.16 para validação em casa.
- Visões: Execução, Análise, Histórico PCBA, Histórico material, Processo/3022 e Base de dados.
- Status de conexão com agente local em `127.0.0.1:8765`.
- Formulário preparado para período, linhas, turno, perfil de desempenho e execução em segundo plano.
- Base local exportável em CSV.
- 3022 aparece explicitamente como pendente de integração real; não inventa timeline.

## Contrato do agente local

Base URL planejada: `http://127.0.0.1:8765/api/v1`

### GET /health

Resposta mínima:

```json
{
  "status": "ok",
  "version": "0.1",
  "ames_connected": false,
  "capabilities": ["health", "import-json"]
}
```

### POST /runs

Entrada planejada:

```json
{
  "start_at": "2026-10-07T07:00",
  "end_at": "2026-10-08T07:00",
  "lines": ["TAN10102", "TAN10103"],
  "shift": "1st Shift",
  "performance": "normal",
  "background": true
}
```

Resposta planejada:

```json
{
  "run_id": "uuid",
  "state": "QUEUED"
}
```

O agente deverá manter checkpoint por PCBA/material, retry/backoff e retomar sem repetir consultas concluídas.

## Semântica já fechada

### 3028
- Fonte da falha atual, linha, modelo, Defect Time, Repair Comment etc.

### 3074
- Componentes montados no momento da falha por Bind/Unbind Time.
- Reuso da própria PCBA e reuso dos componentes são conceitos separados.
- Material reutilizado não implica recorrência de falha.
- PCBAs anteriores dos componentes são tratadas como PCBAs desvinculadas.

### 2114
- Todos os históricos da própria PCBA devem ser preservados.
- Todos os históricos das PCBAs desvinculadas relevantes também devem ser preservados.
- `Repair Status = Y` + `MainBoard` significa reparo de placa concluído.
- `Repair Status = N` + `MainBoard` significa encaminhado/aguardando reparo de placa.
- `Repair Status = N` + Defect Type vazio significa ainda não analisado/finalizado pelo auxiliar.
- Qualquer outro Defect Type deve ser exibido como veio do MES.
- Manual/Automatic representa origem do registro da falha, não resultado do reparo.

### 3022
- A 3022 é timeline real de montagem e AT, não apenas “último posto antes da falha”.
- Para falhas funcionais, Defect Time é horário de detecção/registro e não deve ser confundido com horário em que o defeito foi montado.
- A análise deve mapear falha/modelo/família para posto de referência da montagem e selecionar a passagem apropriada desse posto.
- A5100 é referência possível para itens pré-montados no LCD em determinados modelos (ex.: receiver/P-sensor), mas não deve ser hardcoded para todos os modelos.
- A5150 é grande ponto de vinculação física por scanner.
- A5202 é teste de corrente/energização e também pode vincular componentes eletronicamente.
- A5162 é referência conhecida para limpeza câmera/tampa em casos de impureza.
- A5265 marca o início da região de teste no fluxo descrito.
- Timeline de AT deve ficar separada da timeline de montagem e preservar horários/estações de reparo.

## Próxima validação na fábrica

1. Abrir a 3022 e capturar sua estrutura real.
2. Validar campos de estação, hora de entrada/saída e identificadores da PCBA.
3. Identificar estações/processos da AT.
4. Implementar adapter 3022 no agente local.
5. Ligar `POST /runs` ao pipeline existente 3028/3074/2114/3022.
6. Só depois integrar o launcher diretamente ao menu principal da Central e promover a branch.

## Regra de segurança

Esta branch não altera Firebase, Firestore rules, Authentication, Hosting ou dados. Ela também não executa consultas A-MES automaticamente até o agente local real ser conectado e validado na rede da fábrica.
