# Central + A-MES Offline V0.5.8 — fábrica consolidada

Build de consolidação após validação em fábrica em 08/10/2026.

## Rede validada
- Ethernet permanece para a rede/Internet normal.
- Wi-Fi OPPO `TAXXX_5G` fornece acesso ao A-MES.
- O notebook recebeu IPv4 `172.29.x.x` no Wi-Fi OPPO.
- Com Ethernet + Wi-Fi simultâneos, o Windows escolhia a Ethernet para `172.29.185.215`; foi validada uma rota temporária `/32` somente para o host A-MES via gateway do Wi-Fi OPPO.
- A rota usa `ActiveStore`: não é persistente, não altera DNS, proxy ou gateway padrão e desaparece ao reiniciar o Windows.

## Chrome dedicado
- Google Chrome com perfil próprio em `%LOCALAPPDATA%\CentralAMES\ChromeProfile`.
- CDP em `127.0.0.1:9222`.
- URL operacional confirmada: `http://172.29.185.215/asymes`.
- O perfil do A-MES é separado do navegador pessoal e pode permanecer minimizado.

## Agente local
- Serviço local em `127.0.0.1:8765`.
- V0.5.8 adiciona `agent_bootstrap.pyw` com stdout/stderr persistentes em `logs/` para impedir falhas silenciosas de janela fechando.
- O launcher só abre a UI depois que `/api/v1/health` responde.
- O autoteste passa a iniciar o agente de verdade em uma porta isolada e validar `/api/v1/health` e a UI, em vez de apenas compilar os módulos.

## Entrada diária
- `00_INICIAR_AQUI.bat` é a entrada normal.
- `01_INSTALAR_UMA_VEZ.bat` prepara Python 3.12/venv/dependências/banco e executa o self-test real do agente.
- `12_APLICAR_ROTA_AMES_TEMPORARIA.bat` é usado após reboot quando Ethernet + OPPO estão simultâneos e o host A-MES não está acessível.

## Estado funcional preservado
- Motor V0.16 continua como motor MES validado para 3028 -> 3074 -> 2114.
- SQLite local segue como fonte operacional; Excel é exportação.
- FPY/Top 3 e análises continuam separados por linha.
- Snapshots preservam evolução do dia, N -> Y e desaparecimento de falhas sem reescrever o histórico.
- CORA usa índice regenerável derivado do SQLite, sem duplicar o banco.

## Ainda requer validação real no A-MES
1. Seletores e download automático do Detailed Report Of FPY na 3028.
2. Store/grid e timeline real da 3022, incluindo montagem e AT.
3. Execução longa minimizada.
4. Paralelismo controlado após medição de estabilidade.
