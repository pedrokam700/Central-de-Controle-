# Central + A-MES Offline V0.5.1 — hotfix de fábrica

Data: 08/10/2026

## Problema corrigido
O autoteste V0.5 falhava em `[6/6] Interface e configuracao` com `SyntaxError: unterminated string literal`.

A causa era o uso de `%~dp0` dentro de uma raw string Python. Em batch, `%~dp0` termina com `\`; ao ser inserido como `r'...\'`, a barra final quebrava o literal Python.

## Correção
Os testes e rotinas locais passam a usar `Path.cwd()` depois de `cd /d "%~dp0"`, evitando injeção direta do caminho da pasta dentro do código Python.

Também foram endurecidos:
- inicialização SQLite do instalador;
- backup manual;
- autoteste local.

## Impacto
Não altera:
- dados A-MES;
- rede;
- lógica 3028/3074/2114/3022;
- schema funcional da análise.

A falha era somente do script de validação/local path handling.

## Próximo passo em fábrica
Após o autoteste ficar GREEN, executar `03_DIAGNOSTICO_REDE_AMES.bat` e validar:
1. rota para 172.29.185.215;
2. acesso TCP ao A-MES;
3. Chrome dedicado/CDP 9222;
4. agente localhost 8765.
