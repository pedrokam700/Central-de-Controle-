# PR97 — entrega da candidata completa, sem instalação

18/11/2026, America/Sao_Paulo. PR97 DRAFT baseada exclusivamente na PR96
3a9e22f57d4cc8c6ee2336685273a0e4a9f628f3. Referência de último pacote TESTE:
EEDACC65 eedacc65445dea9967a92085777b878c1ee9c123, não release antiga 0.5.39.

## Autorização e limites

O usuário autorizou expressamente nesta missão gerar ZIP em ambiente isolado,
testar integridade/extração, verificar Windows passivamente e publicar artifact
GitHub Actions com acesso GitHub. Não autorizou instalar, executar launchers ou
updater operacional, MES, instalação/bancos/WAL reais, rede/guardian/Firebase,
merge/deploy/release. G0–G7 e homologação física continuam PENDENTES.

## Recuperação e mudança de empacotamento

Worktree96 estava limpa no SHA obrigatório. Criada worktree/branch própria
work/ames-complete-candidate-20261118, sem mover referências anteriores.
RED 83261440ca0a6f2cd3a1f195ad36d1a2c4670ec4 publicado antes do builder:
seis métodos, 17 falhas de asserção (subcasos), um controle positivo.
Contraprovas: paths absolutos/traversal/Windows/ADS/device/trailing, colisão case,
WAL/SHM/case de data, identidade ausente e instrução indevida de retorno 0.5.39.

Somente empacotamento, validação, documentação, CI e testes estáticos afetados.
Nenhum módulo produtivo ames/, script workstation, SW ou builder estático alterado.
Node mantém 876 métodos. Um teste estático de texto de pacote deixou de exigir
o retorno literal 0.5.39 e passa a exigir instruções atuais, STOP para dados novos
e não autorização de instalação; a prova de porta/guardian permanece intacta.
Checkers de preservação recebem allowlist exata e preview da branch desativado;
asserts anteriores e guards de regressão continuam ativos.

## C01/C02/C03 tratados

- C01: verificador independente lê TODOS membros reais, CRC, paths, tipos,
  duplicatas/case, SHA256, inventário exato, manifestos, fontes Git e cada membro
  transformado. Extração exclusiva em destino novo com hash integral depois.
  Arquivo EEDACC65 original ausente: compara modelo/fontes Git, não inventa
  equivalência de bytes ou CRC do ZIP histórico.
- C02: um CLEAN integrado completo, não mistura overlay legado ou candidate-files.
  Rota futura de troca preservada como fonte; não testada por execução. Updater
  legado não deve receber este formato. Nenhum check foi removido para declará-lo
  compatível. P08 passivo não integra retorno real ao launcher.
- C03: PACKAGE_IDENTITY identifica SHA/versão da candidata/componentes/limitações.
  LEIA_PRIMEIRO e INSTRUCOES_INSTALACAO_LIMPA usam procedimento futuro seguro,
  instalação não autorizada; notas antigas rotuladas históricas. Handoffs #86–96
  e consolidação acompanham evidence/current. Rótulos internos de versão legada
  não são apresentados como identidade suficiente da candidata.

Todos os 349 paths do modelo PR96 e 345 do EEDACC65 são exigidos no output;
novos metadados/documentos são adicionais. Fontes de agente/motor/frontend
preservadas, com transformações esperadas somente em app/index/SW, wrappers,
documentos e manifestos. Coletores 3028 conservam hashes congelados.

## Pipeline e evidências reais

Workflow separado .github/workflows/ames-complete-candidate.yml, só nesta branch.
Regressões continuam nas quatro workflows guardadas existentes. Gate consulta
somente API GitHub do próprio repositório, exige quatro SUCCESS do SHA exato e
interrompe se algum falhar. Não usa um GREEN do pai para liberar o pacote.

1. Seis contraprovas de source. Checkout limpo, Python/Node de build descartável.
2. Builder integrado autorizado grava ZIP exclusivo fora do repo, com metadata
   determinística. Não instala dependências do agente nem importa código embalado.
3. Verificação independente Linux e extração real, fontes/transformações/hashes,
   AST Python e imports JS, fechamento do suporte e identidade de componentes.
4. Treze testes do artefato em cópias descartáveis: positivo, destino existente,
   falta de helper, source adulterado/re-hash, SW antigo/re-hash, membro inesperado,
   traversal, case, symlink, chave JSON duplicada, falso install autorizado,
   SHA divergente e corrupção dos bytes comprimidos. Não basta auto-rehash.
5. Artifact INTERNO de transporte (retenção um dia) só depois da prova Linux.
   Windows baixa os MESMOS bytes, verifica digest, repete verificação/extração e
   negativos, faz parsing de TODOS PowerShell, sem executar qualquer script.
6. Somente após Windows PASS, publicação final da candidata com recibos Linux e
   Windows idênticos, inventário, SHA256SUMS e links das regressões. Artifact final
   tem retenção de sete dias, acesso conforme GitHub/repositório; sem release.

Artefato final se chama CENTRAL_AMES_CANDIDATA_<SHA> e contém o arquivo real
CENTRAL_AMES_CANDIDATA_<SHA>.zip e recibos. O download do GitHub Actions pode
usar um ZIP externo de transporte: extrair esse invólucro para obter a candidata.
SHA256SUMS.txt identifica o ZIP INTERNO, não o ZIP de transporte do serviço.

**SHA final, links de cinco CIs, artifact ID/URL, SHA256 do ZIP e contagem REAL**
são registrados no checkpoint final da discussão da PR97 depois do sucesso.
Não considerar este documento, sozinho, declaração antecipada de GREEN.
Build/verificação que falhe não publica a entrega final; transporte interno não
é o link de entrega. Os logs registram falhas intermediárias sem mascará-las.

## Regressões obrigatórias do SHA da entrega

876 Node, 27 invocações integradas Python e 109 testes do motor; 14 suites de
paginação/ciclos/brutos/transferência, R3/N4/R2 e fallback SN; cinco projeções P02,
cinco leitores P08, 51 P08 Linux/Windows, 50 P04 e nove negativas Windows2022/2025,
36 P02/30 LAB/27 D01D02 por SO e checkers de preservação. Nove Chromium incluem
nove telas PT/EN/temas, histórico/performance, SW multitab/restart/offline, timeline
#86, 3074 #87, horários #88, sync, pairing e conclusão 3028.

Os guards não foram removidos/desativados globalmente. A exceção autorizada é
o novo workflow de geração; testes anteriores continuam recusando builders/ZIP.
Suites legadas de outros builders continuam fora do gate de regressão, sem
afirmar que seus formatos sejam qualificados por esta candidata.

## Limitações e uso futuro

Pacote completo para DOWNLOAD/VERIFICAÇÃO, **NÃO AUTORIZADO PARA INSTALAÇÃO
OPERACIONAL**. Nenhum processo do pacote foi iniciado nesta missão. Windows
passivo não prova rede/guardian/Chrome/CDP/MES/auth/SQLite operacional/boot.
P04 GUI completa ainda bloqueada por seis wheels; P02 real/P04 real/P05/P07/
P08 real/G0–G7 PENDENTES. Ferramentas LAB são fontes independentes no Git e
não substituem um agente operacional nem um procedimento de instalação.

Próxima ação após receber o download: conferir o hash do ZIP e ler LEIA_PRIMEIRO.
Não executar os launchers. Planejar homologação isolada e supervisionada sob
autorização específica, preservando C0/A/B e dados atuais; R2 é STOP. Nunca
restaurar SQLite antigo sobre B ou iniciar A com histórico obsoleto como atual.
