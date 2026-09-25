# V15.1.13.21

## CORA sidebar and authoritative family rename

- CORA conversation history has its own vertical scroll track; navigation and “Como me usar” remain outside it.
- Family rename is committed through the authenticated Firebase Admin backend and synchronizes all related Central collections.

## Revisão consolidada, consumo de IA e PDF

- Roteamento por complexidade: simples usa modelo econômico, tarefa normal usa modelo intermediário e investigação usa modelo forte configurável.
- Orçamentos opcionais por dia, mês e usuário reduzem o tier antes de bloquear. Os valores iniciam desativados para não limitar o uso ocasional.
- Métricas separam usuário, provedor, modelo e tier, além de tokens, custo e latência.
- Dual verification só é elegível para investigação complexa encadeada.
- Artefatos 8D, A3 e Ishikawa incluem PDF real, além de HTML, DOCX e PPTX.
- Corrigido o retorno do planejador de artefatos, atualização de cache PWA e CORS.
- Consulte `AUDITORIA_V15.1.13.20.md` para escopo, testes e pendências.

# Histórico V15.1.13.19

## Árvore de Reports de Produto e renomear família

- Família, código e pendência agora são elementos visuais distintos: o código nunca quebra no meio e a pendência ocupa a linha abaixo.
- Códigos legados estritamente numéricos de quatro caracteres ganham apresentação `CPH` (ex.: `2817` → `CPH2817`); códigos como `2859V` são preservados.
- `Todos os reports` permanece um único atalho, sem quebra por palavra.
- A hierarquia e a navegação permanecem `Família → código-base (quando houver variantes) → produto específico`.
- Renomear família usa batches do Firestore para atualizar produtos e registros relacionados de forma consistente.

## Versão e cache

- `package.json`, build da interface e cache do Service Worker identificados como `15.1.13.19`.
- Sem alteração de funcionalidades de IA ou backend.
