from __future__ import annotations

import hashlib
import shutil
import sys
import zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"dist"/"ames-fastlane-test"
PAYLOAD=OUT/"payload"/"ames-agent"

AGENT_FILES=[
    "agent.py","agent_entry.py","agent_hardened_entry.py","agent_3012_patch.py",
    "ames_3028.py","ames_3028_live.py","ames_3012_live.py","canonical.py","engine_bridge.py",
    "hardening.py","local_security.py","local_sn.py","mes_scheduler.py","network_watch.py",
    "operational_calendar.py","preflight.py","process_r11.py","process_timeline.py","repair_3012.py","store.py",
    "requirements.txt","config.example.json",
]
FROZEN={
    "ames_3028.py":"829da91ba7b685f4594bae2aad737f1eea64d7b1eaa8073e8bb263748fbe1ca1",
    "ames_3028_live.py":"b512d42ad39fad326252264ce57f98f3731db5161ab8625cf5b244dffffad0e2",
}
PREVIEW="https://central-cora-v2-git-ui-ames-fastlane-sn-2ae6e4-pedrokam700-6477.vercel.app/central-de-Controle/"
ORIGIN="https://central-cora-v2-git-ui-ames-fastlane-sn-2ae6e4-pedrokam700-6477.vercel.app"

if OUT.exists(): shutil.rmtree(OUT)
PAYLOAD.mkdir(parents=True)
for name in AGENT_FILES:
    src=ROOT/"ames"/"agent"/name
    if not src.is_file(): raise SystemExit(f"missing {src}")
    shutil.copy2(src,PAYLOAD/name)
for name,want in FROZEN.items():
    got=hashlib.sha256((PAYLOAD/name).read_bytes()).hexdigest()
    if got!=want: raise SystemExit(f"frozen 3028 mismatch {name}: {got}")

(OUT/"payload"/"agent_fastlane_bootstrap.pyw").write_text(r'''from __future__ import annotations
import os,runpy,sys,traceback
from datetime import datetime
from pathlib import Path
BASE=Path(__file__).resolve().parent
ROOT=BASE.parent
LOGS=ROOT/'logs';LOGS.mkdir(parents=True,exist_ok=True)
sys.stdout=open(LOGS/'agent_fastlane_stdout.log','a',encoding='utf-8',buffering=1)
sys.stderr=open(LOGS/'agent_fastlane_stderr.log','a',encoding='utf-8',buffering=1)
print('\n=== FASTLANE AGENT',datetime.now().isoformat(timespec='seconds'),'===')
os.chdir(BASE)
if str(BASE) not in sys.path:sys.path.insert(0,str(BASE))
try:runpy.run_path(str(BASE/'agent_hardened_entry.py'),run_name='__main__')
except BaseException:traceback.print_exc();raise
''',encoding='utf-8')

launcher=f'''$ErrorActionPreference='Stop'
$Root=Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root
$Logs=Join-Path $Root 'logs';New-Item -ItemType Directory -Force -Path $Logs|Out-Null
$Log=Join-Path $Logs ("iniciar_fastlane_"+(Get-Date -Format 'yyyyMMdd_HHmmss')+".txt")
function L([string]$t,[ConsoleColor]$c=[ConsoleColor]::Gray){{Write-Host $t -ForegroundColor $c;Add-Content -LiteralPath $Log -Value ((Get-Date -Format 'HH:mm:ss')+' '+$t) -Encoding UTF8}}
function F([string]$m){{L ('[ERRO] '+$m) Red;L ('Log: '+$Log) Yellow;Read-Host 'Pressione ENTER para fechar';exit 1}}
function Test-Ames{{try{{$c=New-Object Net.Sockets.TcpClient;try{{$a=$c.BeginConnect('172.29.185.215',80,$null,$null);if(-not $a.AsyncWaitHandle.WaitOne(2500,$false)){{return $false}};$c.EndConnect($a);return $true}}finally{{$c.Close()}}}}catch{{return $false}}}}
try{{
 L '============================================================' Cyan;L ' CENTRAL A-MES FASTLANE · REDE + 3012' Cyan;L ' CLEAN V3 preservada como baseline; este e o clone de teste.' Cyan;L '============================================================' Cyan
 $listeners=@(Get-NetTCPConnection -State Listen -LocalPort 8765 -ErrorAction SilentlyContinue);foreach($x in $listeners){{try{{Stop-Process -Id $x.OwningProcess -Force -ErrorAction Stop}}catch{{}}}};Start-Sleep -Milliseconds 600
 $Python=Join-Path $Root '.venv\Scripts\python.exe'
 if(-not (Test-Path $Python)){{L '[1/7] Criando ambiente local...' Yellow;& (Join-Path $Root '01_INSTALAR_UMA_VEZ.bat') '/auto';if($LASTEXITCODE -ne 0){{F 'Instalacao do ambiente falhou.'}}}}
 & $Python -c "import pandas,openpyxl,playwright,pyautogui,pyperclip" *> $null
 if($LASTEXITCODE -ne 0){{L '[2/7] Reparando dependencias...' Yellow;& (Join-Path $Root '09_REPARAR_DEPENDENCIAS.bat') '/auto';if($LASTEXITCODE -ne 0){{F 'Dependencias nao ficaram prontas.'}}}}
 L '[3/7] Garantindo TAXXX_5G / rota A-MES...'
 if(-not (Test-Ames)){{netsh wlan connect name='TAXXX_5G'|Out-Null;Start-Sleep -Seconds 4}}
 $route=Join-Path $Root 'network\ensure_ames_route.ps1';if(Test-Path $route){{
   $id=[Security.Principal.WindowsIdentity]::GetCurrent();$p=New-Object Security.Principal.WindowsPrincipal($id);$admin=$p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
   if($admin){{& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $route}}else{{$arg="-NoProfile -ExecutionPolicy Bypass -File ```"$route```"";$rp=Start-Process powershell.exe -ArgumentList $arg -Verb RunAs -Wait -PassThru;if($rp.ExitCode -ne 0){{F 'Rota A-MES nao aplicada.'}}}}
 }}
 if(-not (Test-Ames)){{F '172.29.185.215 continua inacessivel.'}}
 L '[4/7] Abrindo Chrome A-MES...';& (Join-Path $Root '05_ABRIR_CHROME_AMES.bat');if($LASTEXITCODE -ne 0){{F 'Chrome/CDP nao abriu.'}}
 L '[5/7] Preparando origem do preview e agente endurecido...'
 $cfgPath=Join-Path $Root 'ames-agent\config.json';$cfgExample=Join-Path $Root 'ames-agent\config.example.json';if(Test-Path $cfgPath){{$cfg=Get-Content $cfgPath -Raw|ConvertFrom-Json}}else{{$cfg=Get-Content $cfgExample -Raw|ConvertFrom-Json}}
 if(-not $cfg.allowed_origins){{$cfg|Add-Member -NotePropertyName allowed_origins -NotePropertyValue @()}}
 if(-not ($cfg.allowed_origins -contains '{ORIGIN}')){{$cfg.allowed_origins=@($cfg.allowed_origins)+@('{ORIGIN}')}}
 $cfg.ames_wifi_profile='TAXXX_5G';$cfg|ConvertTo-Json -Depth 20|Set-Content -LiteralPath $cfgPath -Encoding UTF8
 $Bootstrap=Join-Path $Root 'ames-agent\agent_fastlane_bootstrap.pyw';if(-not(Test-Path $Bootstrap)){{F 'Bootstrap fastlane ausente.'}}
 $PythonW=Join-Path $Root '.venv\Scripts\pythonw.exe';if(-not(Test-Path $PythonW)){{$PythonW=$Python}}
 Start-Process -FilePath $PythonW -ArgumentList @("```"$Bootstrap```"") -WorkingDirectory $Root|Out-Null
 L '[6/7] Aguardando agente CANONICAL-R11-BATCH...'
 $health=$null;for($i=0;$i -lt 45;$i++){{Start-Sleep -Seconds 1;try{{$h=Invoke-RestMethod 'http://127.0.0.1:8765/api/v1/health' -TimeoutSec 2;if($h.ok -and [string]$h.agent_build -eq 'CANONICAL-R11-BATCH'){{$health=$h;break}}}}catch{{}}}}
 if(-not $health){{if(Test-Path (Join-Path $Root 'logs\agent_fastlane_stderr.log')){{Get-Content (Join-Path $Root 'logs\agent_fastlane_stderr.log') -Tail 80|%{{L $_ Yellow}}}};F 'Agente fastlane nao respondeu.'}}
 L ('      Agente OK | A-MES='+$health.ames_reachable+' | CDP='+$health.chrome_cdp_reachable) Green
 $tokenPath=Join-Path $Root 'ames-agent\data\local_agent_token';for($i=0;$i -lt 10 -and -not(Test-Path $tokenPath);$i++){{Start-Sleep -Milliseconds 300}}
 if(-not(Test-Path $tokenPath)){{F 'Token local do agente nao foi criado.'}}
 $token=(Get-Content $tokenPath -Raw).Trim();$url='{PREVIEW}#ames_agent_token='+[uri]::EscapeDataString($token)
 L '[7/7] Abrindo Central fastlane...';Start-Process $url
 L '';L '[OK] FASTLANE PRONTA PARA TESTE' Green;L '3012 e guardian de rede ainda exigem validacao fisica.' Yellow;L ('Log: '+$Log)
 exit 0
}}catch{{F $_.Exception.Message}}
'''
(OUT/"payload"/"INICIAR_FASTLANE_TESTE.ps1").write_text(launcher,encoding='utf-8-sig')
(OUT/"payload"/"INICIAR_FASTLANE_TESTE.bat").write_text('@echo off\r\nsetlocal\r\ncd /d "%~dp0"\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0INICIAR_FASTLANE_TESTE.ps1"\r\nif errorlevel 1 pause\r\n',encoding='utf-8')

updater=r'''$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
$Here=Split-Path -Parent $MyInvocation.MyCommand.Path
function Fail([string]$m){Write-Host ('[ERRO] '+$m) -ForegroundColor Red;Read-Host 'Pressione ENTER para fechar';exit 1}
try{
 Write-Host 'CENTRAL + A-MES FASTLANE · CRIAR COPIA DE TESTE' -ForegroundColor Cyan
 Write-Host 'Selecione a pasta CLEAN V3 que ja funciona. Ela NAO sera alterada.'
 $dlg=New-Object System.Windows.Forms.FolderBrowserDialog;$dlg.Description='Selecione CENTRAL_AMES_FACTORY_CLEAN_V3';$dlg.ShowNewFolderButton=$false
 if($dlg.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK){Fail 'Cancelado.'}
 $src=$dlg.SelectedPath
 foreach($need in @('VERSAO_CLEAN.txt','INICIAR_POSTO_LIMPO.ps1','ames-agent\ames_3028.py','ames-agent\ames_3028_live.py','AMES_Automacao_V0_16_PADRAO_VALIDADO\ames\tela_3022.py')){if(-not(Test-Path (Join-Path $src $need))){Fail ('A pasta escolhida nao parece ser a CLEAN V3. Falta: '+$need)}}
 $h1=(Get-FileHash (Join-Path $src 'ames-agent\ames_3028.py') -Algorithm SHA256).Hash.ToLower();$h2=(Get-FileHash (Join-Path $src 'ames-agent\ames_3028_live.py') -Algorithm SHA256).Hash.ToLower()
 if($h1 -ne '829da91ba7b685f4594bae2aad737f1eea64d7b1eaa8073e8bb263748fbe1ca1' -or $h2 -ne 'b512d42ad39fad326252264ce57f98f3731db5161ab8625cf5b244dffffad0e2'){Fail 'Hashes 3028 da origem nao conferem. Nao vou aplicar.'}
 $parent=Split-Path -Parent $src;$target=Join-Path $parent ('CENTRAL_AMES_FASTLANE_3012_TESTE_'+(Get-Date -Format 'yyyyMMdd_HHmm'))
 Write-Host ('Criando copia independente: '+$target) -ForegroundColor Yellow
 New-Item -ItemType Directory -Force -Path $target|Out-Null
 $null=& robocopy $src $target /E /COPY:DAT /R:1 /W:1 /XD .venv logs __pycache__ candidate-backups /XF *.pyc
 if($LASTEXITCODE -ge 8){Fail ('Falha ao copiar CLEAN V3. Robocopy='+$LASTEXITCODE)}
 $agent=Join-Path $target 'ames-agent';$payloadAgent=Join-Path $Here 'payload\ames-agent'
 Copy-Item -LiteralPath (Join-Path $payloadAgent '*') -Destination $agent -Force -Recurse
 Copy-Item -LiteralPath (Join-Path $Here 'payload\agent_fastlane_bootstrap.pyw') -Destination (Join-Path $agent 'agent_fastlane_bootstrap.pyw') -Force
 Copy-Item -LiteralPath (Join-Path $Here 'payload\INICIAR_FASTLANE_TESTE.ps1') -Destination (Join-Path $target 'INICIAR_FASTLANE_TESTE.ps1') -Force
 Copy-Item -LiteralPath (Join-Path $Here 'payload\INICIAR_FASTLANE_TESTE.bat') -Destination (Join-Path $target 'INICIAR_FASTLANE_TESTE.bat') -Force
 Set-Content -LiteralPath (Join-Path $target 'FASTLANE_HEAD.txt') -Value 'HEAD __HEAD__`r`nPR #26`r`n3012 + network guardian + SN offline' -Encoding UTF8
 Write-Host '';Write-Host '[OK] COPIA FASTLANE CRIADA' -ForegroundColor Green;Write-Host $target -ForegroundColor Cyan
 Write-Host 'A CLEAN V3 selecionada permaneceu intacta.' -ForegroundColor Green
 Write-Host 'Agora abra a NOVA pasta e execute INICIAR_FASTLANE_TESTE.bat.' -ForegroundColor Yellow
 Read-Host 'Pressione ENTER para fechar'
}catch{Fail $_.Exception.Message}
'''.replace('__HEAD__',sys.argv[1] if len(sys.argv)>1 else 'FASTLANE_HEAD')
(OUT/"APLICAR_FASTLANE_TESTE.ps1").write_text(updater,encoding='utf-8-sig')
(OUT/"00_CRIAR_COPIA_FASTLANE_TESTE.bat").write_text('@echo off\r\ncd /d "%~dp0"\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0APLICAR_FASTLANE_TESTE.ps1"\r\n',encoding='utf-8')
(OUT/"LEIA_PRIMEIRO.txt").write_text(f'''A-MES FASTLANE · PR #26\n\n1. Execute 00_CRIAR_COPIA_FASTLANE_TESTE.bat.\n2. Selecione a CLEAN V3 que ja funciona.\n3. O atualizador cria uma COPIA NOVA e nao altera a origem.\n4. Abra a nova pasta CENTRAL_AMES_FASTLANE_3012_TESTE_...\n5. Execute INICIAR_FASTLANE_TESTE.bat.\n\nObjetivos do teste:\n- guardian TAXXX_5G / rota 172.29.185.215/32;\n- Consulta por SN local/offline;\n- 3012 direta pela grid ExtJS + Repair Comment/User/Time/Code;\n- Dashboard de reuso enriquecido no preview.\n\n3012, rede e Shift 2114 continuam gates fisicos ate prova real.\nPreview: {PREVIEW}\n''',encoding='utf-8')
zip_path=ROOT/"dist"/(f"CENTRAL_AMES_FASTLANE_3012_TESTE_{sys.argv[1][:8] if len(sys.argv)>1 else 'HEAD'}.zip")
zip_path.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(zip_path,'w',zipfile.ZIP_DEFLATED) as z:
    for p in sorted(OUT.rglob('*')):
        if p.is_file():z.write(p,p.relative_to(OUT.parent))
print(zip_path)
