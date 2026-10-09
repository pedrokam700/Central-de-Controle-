# Patch FIFO para V0.5.23 — candidato, NÃO GREEN

Base funcional: ZIP V0.5.23 do manifesto; baseline fabril V0.5.20 (3028/3074/2114).
Os dois coletores 3028 são os bytes originais. Não há nova sessão nem novo agente.

## Instalação no posto

1. Pare o monitor e aguarde as coletas atuais terminarem. Encerre o agente.
2. Faça uma cópia de segurança da instalação inteira, incluindo config.json e data/.
3. Na instalação V0.5.23 existente, substitua **somente** ames-agent/agent.py e
   ames-agent/engine_bridge.py; adicione ames-agent/mes_scheduler.py desta versão.
   Não sobrescreva config.json, data/, motor, coletores, perfil Chrome ou helpers.
4. No config.json local, acrescente a **origem exata** da Central (esquema, domínio
   e porta, sem caminho) à lista allowed_origins. Preserve as outras entradas.
   Sem wildcard, proxy ou senha. Reinicie pelo 00_INICIAR_AQUI.bat original.
5. Na Central autenticada, Console MES → Coleta e agente deste computador →
   Conectar agente local. Health deve informar policy `fifo-monitor-skip-v1`.
   A permissão de rede local do navegador pode ser necessária.

O ZIP candidato completo também serve para uma instalação **nova em outra pasta**.
Não extraia por cima de uma instalação com dados. Use o migration helper original
quando necessário, com backup, sem iniciar dois agentes contra o mesmo CDP.
O manifesto continua apontando para o ZIP original, que não inclui este patch.

## Limites e validação

- FIFO por seção de acesso ao MES; transformação, SQLite e Excel ficam fora.
  O corpo do coletor 3028 congelado conserva a seção interna e os waits originais.
- Consultas 3074/2114, navegação/CDP, SN, refresh de reparo e Chrome/start usam
  o mesmo gate. Importação de relatório usa os flows originais em processo para
  não escapar pelo CLI filho. O subprocesso de **Excel** continua sem gate.
- Monitor ocupado é descartado antes de criar job/thread; não acumula fila.
- Cancelamento cooperativo: espera a consulta indivisível atual retornar;
  não fecha Chrome nem interrompe DOM no meio. Não desfaz dados já coletados.
- API de leitura sem revisão/cursor: snapshot fixado, cobertura sempre parcial;
  histórico pode ter linha derivada por primeiro contexto. Não inferir mesmo CPH.
- Sem testes físicos de rede/CDP/MES ou benchmark. Nenhum adaptador 3022 novo.
- Interface isolada, bootstrap, Wi-Fi, migration helper e Excel original intactos.
  Nunca use a interface isolada de **outro agente/processo** para burlar o gate.

Testes: `python scripts/agent-scheduler.test.py` na raiz do repositório.
Pacote: `python scripts/build-agent-candidate.py ORIGINAL.zip NOVO_CANDIDATO.zip`.
O builder verifica a origem e os hashes 3028 e recusa sobrescrever arquivos.
