# Central A-MES — __CANDIDATE_VERSION__

SHA completo: __CANDIDATE_SHA__

**NÃO AUTORIZADO PARA INSTALAÇÃO OPERACIONAL.**
Instalação operacional exige autorização específica e verificação supervisionada.
Este documento não autoriza alterações no computador da fábrica. Exigir o recibo
externo QUALIFICACAO_LAB.json: somente a entrega final depois desse gate tem
ensaio Windows sintético aprovado no mesmo SHA e nos mesmos bytes. ZIP de fonte,
artefato intermediário ou log parcial não constitui qualificação.

Esta Central completa preserva a linhagem EEDACC65 → PR98. A antiga release
0.5.39 não identifica o último pacote de teste recebido. Referência Git EEDACC65:
eedacc65445dea9967a92085777b878c1ee9c123. O ZIP histórico original não estava
disponível; não foi comprovada igualdade de seus bytes/CRC.

## Antes da atualização futura

1. Guardar download original, SHA256SUMS.txt e recibos. Conferir SHA256 do ZIP,
   SHA da candidata, PACKAGE_IDENTITY e CANDIDATE_MANIFEST. Hash comprova
   integridade, não assinatura ou homologação física. O ZIP da #97 não contém
   as correções da #98.
2. Identificar por leitura a pasta A realmente ativa, versão/SHA, agente,
   guardian, HKCU Run e dono de 8765. Não inferir a raiz pelo nome do ZIP,
   nem escolher 0.5.39 como retorno padrão. Inventariar linhas, source_id, snapshots,
   revisões, períodos, históricos, arquivos externos/configurações/identidades.
   Resolver jobs, outbox e sincronização pendentes antes da janela supervisionada.
3. Exigir G0–G7 aplicáveis e autorização específica. Confirmar Python 3.12 x64
   genuíno com venv/pip e Chrome x64. O ensaio usa Python 3.12.10, Windows Server
   2025 e Chrome do runner; não prova o computador original. Este ZIP não inclui
   instaladores de Python/Chrome. Não baixar ou autorreparar software operacional
   sem autorização.
4. Preparar backup PRIVADO fiel de A/C0, consistente para SQLite/WAL e arquivos
   externos, sob exclusividade, com hashes, integridade e restauração ensaiada
   em destino novo. Cópia desidentificada LAB não é backup de recuperação. Não
   copiar apenas SQLite de banco ativo ignorando WAL.

## Troca supervisionada — somente após autorização

5. Extrair em pasta B NOVA e vazia, fora de A/C0. Não sobrepor arquivos, copiar
   .venv antigo ou usar update_candidate.py com este ZIP CLEAN: são formatos
   diferentes. A entrega final inclui 21 wheels genuínos em vendor/wheels e
   RUNTIME_DEPENDENCIES.json com origem/hashes, além de Firebase 10.8.0/SheetJS
   0.20.3 locais e suas licenças. Os seis wheels sem distribuição oficial foram
   construídos de fontes oficiais fixas, offline no runner Windows descartável.
6. Executar uma única vez **01_TROCAR.bat da pasta B**, na janela acompanhada.
   O caminho normal mantém diálogo humano e gate de rede A-MES, identifica A,
   prepara dependências, verifica backup/transferência, preserva identidade,
   escolhe motor B e inicia por START_LOCAL_CANDIDATE. Após a barreira persistente
   de intenção, A é marcada como retirada. Não iniciar A manualmente depois disso.
   Não escolher /lab na fábrica: exige CI Windows sintética, raiz autorizada e
   prova WFP. /local omite preparação MES/Chrome para consulta local; não isola
   rede nem prova MES.
7. Se aparecer BLOCKED, STOP ou journal pendente, parar. Preservar A/B/C0, backup,
   logs e journals. Não apagar marcadores, limpar IndexedDB, alterar hashes ou
   repetir a troca para forçar aceitação. B pode ter produzido dados novos antes
   da confirmação final. Não reabrir A apresentando histórico antigo como atual.

## Verificações depois da troca

8. Confirmar um único agente/guardian e dono de 8765, raiz/motor B, versões dos
   componentes, manifestos, release-build e revisão do worker. Não limpar sessão
   ou cache para contornar conflito de versões.
9. Conferir integridade SQLite, contagens e identidades inventariadas: registros
   antigos/novos, origem, linhas, períodos, snapshots/revisões, PCBAs/componentes,
   nomes/papéis/comentários, Hist Seq, Y/N, falhas independentes, classificação
   3074 e horários produtivos 3022. Ausência continua desconhecida, nunca zero,
   uso ou horário inventado. Abrir as nove telas e o período histórico original;
   testar reinício/recuperação parcial sem disparar coleta não autorizada.
10. A prova offline do navegador usa sessão anterior SINTÉTICA preparada por
    SDK/emuladores oficiais, backend encerrado antes da candidata. Perfis, JWTs,
    usuários, emuladores e bancos da fixture NÃO são entregues. Perfil vazio
    mantém login legítimo. Sessão Cloud real, permissões e possível mudança de
    origem HTTPS/localhost precisam de verificação específica; não copiar Auth
    manualmente ou simular credenciais.
11. Rede fabril, Chrome/MES e coleta física só serão testados em etapa específica
    autorizada. A recusa do diagnóstico de rede para host sintético é preservada
    no LAB; não equivale a rede operacional validada.

## Interrupção e retorno seguro

R0: antes de possível execução de B, preservar estados; manifesto inválido não
exige restaurar dados nem reiniciar A já ativa. R1: retorno de código exige dados
ATUAIS preservados, compatibilidade demonstrada e destino novo, sob recuperação
supervisionada. R2 com dados novos/estado desconhecido: B pode ter executado —
**STOP**. Nunca restaurar SQLite antigo sobre dados novos, mesclar bancos
automaticamente ou reabrir A com histórico desatualizado. Journals e retirada de
A são barreiras conservadoras, não transação atômica do Windows. Preservar as
provas quando a recuperação automática não puder ser demonstrada.

Recibos externos registram o que passou no Windows sintético. Handoffs estão em
evidence/current/. P02 real, P04 real/completa, P05, P07, P08 real e G0–G7 físicos
permanecem PENDENTES. Nenhum ensaio autoriza instalar na fábrica, acessar MES ou
Firebase reais, fazer merge, deploy ou release operacional.
