# Entrada LAB sintética — contrato e operação restrita

Base #92 db3cb5b58c99bcf86c44b671280cb42f7dd31d4c.
Esta entrada está no código fonte; não foi empacotada, instalada ou distribuída.
Não executar launchers Windows produtivos, /prepare, engine ou guardian.

## Escopo

ames/agent/lab_entry.py é um kernel sintético stdlib, protocolo fechado por
stdin/stdout. Não é o agente HTTP, shell Central ou clone da instalação 0.5.39.
Não tem porta 8765/9222, navegador, engine, login, token, coletor, scheduler,
monitor ou guardian. Não aceita dados reais, fixtures externas, SQL, Python,
scripts, caminhos de configuração ou comandos de recuperação.

Serve para comprovar isolamento local, ciclo de vida e persistência sintética
antes de uma futura estratégia de homologação completa. Os contratos existentes
#86–92 continuam nas suítes originais. Harness das nove telas é prova separada;
não é iniciado por esta entrada. Shell frio/SDK/auth offline (P05) continua pendente.

## Pré-condições obrigatórias

1. Somente ambiente descartável sintético expressamente autorizado, CPython >=3.11
   confiável, stdlib previamente disponível. Não instalar/reparar dependências.
2. Raiz local ABSOLUTA, existente, vazia, nome AMES-LAB-*, sem symlink/junction/
   reparse/hardlink, com todos ancestrais verificáveis. Não usar share UNC,
   caminho de dispositivo, instalação original ou pasta com configurações existentes.
3. Conta/VM isolada e diretório sob controle exclusivo. Política Python não
   substitui sandbox de kernel, ACL/mounts, contenção de rede ou escritor adversário.
   Não há suporte a código hostil. No futuro Windows, contenção externa deverá
   ser atestada; nenhum gate físico é aprovado por estes testes.
4. Novo processo com ambiente explícito mínimo. Harness utiliza somente PATH,
   SYSTEMROOT, WINDIR, TEMP, TMP, LANG, LC_ALL. Não modificar env persistente do
   posto para fazer o teste passar. Herança AMES_/MES_/CENTRAL_/CHROME_/FIREBASE_/
   GOOGLE_APPLICATION_CREDENTIALS não vazia causa recusa. -I -S ignora site e
   PYTHONPATH; -B impede escrita de bytecode na árvore de fontes.
5. .ames-update inexistente ou vazio nos ancestrais LAB/pacote de código.
   Qualquer claim/journal/arquivo inesperado ou leitura impossível bloqueia antes
   de persistir. Nunca apagar journal para contornar a recusa.

## Invocação (somente exemplo documental, não execução de homologação)

Em diretório LAB vazio previamente autorizado, com ambiente sintético:

    python -I -S -B <fonte-confiável>/ames/agent/lab_entry.py --lab-root <absoluto>/AMES-LAB-TESTE --initialize-synthetic

Os placeholders exigem substituição explícita por diretórios sintéticos. Não
usar caminho de instalação existente. Após inicializar, reinício omite
--initialize-synthetic. Flags ausentes ou inicialização repetida são recusadas.

Entrada JSON de uma linha, única chave command:

- {"command":"status"}: contagem LAB e SHA256 ordenado completo dos registros.
- {"command":"append_fixture"}: acrescenta UMA fixture interna conhecida, com
  PCBA/linha/snapshot LAB, revisão sequencial e origem SYNTHETIC_INTERNAL_FIXTURE.
  Uso físico e horário produtivo permanecem null: não há evidência real.
- {"command":"shutdown"} ou EOF: fecha SQLite e remove SOMENTE claim da sessão
  concluída. Mensagem de prontidão identifica SYNTHETIC_LAB_ONLY, não agent ready.

Saída é JSON sem caminhos/credenciais/ambiente. Não existe comando de coleta,
recuperação de job, importação, edição de config, acesso à Internet, SQL ou código.

## Persistência e falha fechada

Somente lab.json, lab.sqlite3 e session.claim são arquivos de aplicação. SQLite
pode criar seu journal DELETE dentro da MESMA raiz; sem WAL compartilhado.
Manifesto tem esquema exato e tipos JSON exatos, ID novo LAB-* e capacidades
desativadas. Banco possui apenas lab_meta/lab_evidence; leitura de validação
prévia RO+immutable exige ausência de WAL/SHM/journal e esquema/conteúdo sintético
conhecido. Esse uso NÃO é receita para abrir banco operacional/WAL com immutable.

Importação de código termina antes da guarda. Auditoria Python nega sockets/DNS/
bind, processos, shell, registro, imports posteriores, ctypes/extensões, acesso
a SQLite externo, leitura/escrita Python externa e mutações de diretório. SQLite
nativo não emite todos os eventos open: há caminho fixo, inventário sem links,
SQL fechado, temp_store=MEMORY, extensões/ATTACH/PRAGMAs externos negados.
Não oferecer endpoint ou plugin que execute código arbitrário sobre essa guarda.

Claim criado exclusivamente antes da escrita de geração. Falha, interrupção,
I/O incompleta, comando inválido ou claim anterior => LAB_REFUSED; dados e claim
preservados. Nenhuma recuperação automática, limpeza de WAL ou retomada de job.
PID registrado não é lease operacional. Não declarar atomicidade multifile ou
garantias de power-loss; compensação D01/D02 permanece no updater separado.

Após falha, interromper a sequência. Preservar toda geração sintética e metadados;
não remover claim nem sobrescrever banco para elevar cobertura. Recuperação
supervisionada exige comprovar fim do dono, ausência de writers, integridade,
estado do journal e evidência nova. Sem prova, manter geração bloqueada e iniciar
outra raiz NOVA. Testes fazem limpeza supervisionada apenas de fixtures próprias
após encerramento confirmado; isso não autoriza limpeza na fábrica.

## Validação

    python -B scripts/agent-lab-isolation.test.py -v
    python -B scripts/agent-lab-preservation-static.test.py -v

A suíte roda processos filhos -I -S -B, usa somente temporários, compara sentinels,
hashes e contagens, testa interrupção/concorrência/falhas antes do OS, prova hook
ativo e que fontes produtivas inteiras continuam idênticas à base #92.

CI LAB é independente da suíte ampliada sem instalação: ausência de openpyxl ou
Playwright deve continuar explícita, sem pip/npm de fallback, stubs ou testes
ocultos. Não converter falta de ambiente em GREEN de integração.

P01/P03/P06: tratados para esta entrada sintética. P02/P04/P05/P07/P08: PENDENTES.
G0–G7 e homologação física PENDENTES. Sem ensaio Windows real, MES, fábrica,
builders, ZIP, instalação, release, deploy ou merge.
