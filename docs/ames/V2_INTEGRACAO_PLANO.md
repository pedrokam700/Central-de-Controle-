# Central de Trabalho V2 — integração A-MES

A V2 deixa de tratar a Central online e o coletor A-MES como produtos separados.

## Princípios
- A Central continua sendo a interface principal do usuário.
- Na fábrica, a Central detecta `127.0.0.1:8765` e usa dados A-MES locais em tempo real.
- Fora da rede OPPO, a mesma Central usa apenas snapshots sanitizados sincronizados no Firebase.
- A coleta A-MES permanece local-first, serial e independente de cloud.
- Senha, cookie, sessão, CDP, senha Wi-Fi e acesso TAXXX_5G nunca são enviados ao Firebase.
- Dados A-MES alimentam Dashboard, produto/CPH, Central do Dia, recorrência e CORA.
- `aiKnowledge` é o barramento inicial para snapshots A-MES porque a Central e a CORA já o consomem e as regras existentes já suportam usuários ativos.
- Linhas nunca são somadas para KPI operacional.
- Correlação é evidência; não prova causa automaticamente.

## Preview implantado

URL: `https://central-cora-v2.vercel.app/`

Project: `central-cora-v2`
Deployment: `dpl_5vGxUBs99S51aUUf8p8eSwTzL1bg` — READY.

O preview usa uma estratégia de migração: mantém a experiência da Central original e injeta a camada V2. Depois de validar o comportamento real, o módulo deve ser absorvido nativamente pelo código canônico da Central, eliminando a necessidade da camada de migração/proxy.

## Primeiro corte implementado
1. A-MES integrado no mesmo fluxo visual da Central;
2. detecção automática do agente local;
3. sincronização de snapshot por linha para Firebase quando autenticado;
4. leitura remota do último snapshot sincronizado;
5. painel A-MES global com operação/reuso/recorrência;
6. enriquecimento do Dashboard;
7. enriquecimento de produto/CPH;
8. enriquecimento da Central do Dia;
9. snapshots A-MES entram em `aiKnowledge` com `status=validado_sistema`, permitindo uso contextual pela CORA;
10. sem comando remoto do MES.

## Pacote local correspondente

V0.5.23: `AMES_Central_Offline_V0_5_23_CONSOLIDADA_FABRICA.zip`
SHA-256: `1c0e7a37af4fb4b0b08b377d7c17c6895be5891e27c2ba9d37a9cc8cb6708167`.

O bootstrap prefere abrir a Central V2 quando ela estiver disponível e usa a interface local como contingência.

## Depois do gate

Após a integração V2 ser validada em fábrica e remotamente:
- absorver a camada V2 no shell canônico da Central;
- transformar evidências A-MES em links/ações dentro de Reports e Falhas sem criação automática indevida;
- adicionar 3022/timeline de processo;
- alimentar Radar de recorrência com PCBA/material/processo;
- permitir que CORA cite claramente a origem A-MES e o snapshot usado;
- criar dashboards históricos por linha/CPH/falha/reuso/processo, sempre com drill-down até a evidência.

**V2 preview e V0.5.23 ainda NÃO estão GREEN.**
