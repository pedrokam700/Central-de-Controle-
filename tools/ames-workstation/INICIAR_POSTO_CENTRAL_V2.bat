@echo off
setlocal EnableExtensions
cd /d "%~dp0"
rem Quando empacotado este arquivo fica na raiz do candidato.
set "ROOT=%~dp0"
if exist "%ROOT%..\..\ames-agent\agent.py" set "ROOT=%ROOT%..\..\"
for %%I in ("%ROOT%.") do set "ROOT=%%~fI\"

set "CENTRAL="
set "EXPECTED_FRONTEND_SHA="
set "AGENT_TOKEN="
if /I "%~1"=="/prod" (
  set "CENTRAL=https://central-cora-v2.vercel.app/Central-de-Controle-/"
) else if exist "%ROOT%FRONTEND_GATE.json" (
  for /f "usebackq delims=" %%S in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$g=ConvertFrom-Json (Get-Content -Raw (Join-Path $env:ROOT 'FRONTEND_GATE.json'));Write-Output ([string]$g.expected_sha)"`) do set "EXPECTED_FRONTEND_SHA=%%S"
  for /f "usebackq delims=" %%U in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop';$gate=ConvertFrom-Json (Get-Content -Raw (Join-Path $env:ROOT 'FRONTEND_GATE.json'));$state=Join-Path $env:ROOT 'FRONTEND_GATE_STATE.json';foreach($candidate in @($gate.preview_urls)){try{$base=([string]$candidate).TrimEnd('/');$probe=$base+'/release-build.json?gate='+[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();$r=Invoke-RestMethod $probe -TimeoutSec 8;if([string]$r.sha -eq [string]$gate.expected_sha){$j=ConvertTo-Json @{expected_sha=[string]$gate.expected_sha;url=$base;validated_at=(Get-Date).ToUniversalTime().ToString('o')} -Compress;Set-Content -Path $state -Value $j -Encoding UTF8;Write-Output ($base+'/Central-de-Controle-/');exit 0}}catch{}};if(Test-Path $state){try{$s=ConvertFrom-Json (Get-Content -Raw $state);$u=([string]$s.url).TrimEnd('/');if([string]$s.expected_sha -eq [string]$gate.expected_sha -and @($gate.preview_urls) -contains $u){Write-Output ($u+'/Central-de-Controle-/');exit 0}}catch{}};exit 3"`) do set "CENTRAL=%%U"
  if not defined CENTRAL (
    rem Only explicit, SHA-pinned local fallback may replace an unavailable exact preview.
    rem Check both local release marker and manifest-owned HTML hashes before boot.
    for /f "usebackq delims=" %%L in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop';try{$g=Get-Content (Join-Path $env:ROOT 'FRONTEND_GATE.json') -Raw|ConvertFrom-Json;if($g.allow_local_fallback -ne $true){exit 3};$m=Get-Content (Join-Path $env:ROOT 'LOCAL_BUNDLE_MANIFEST.json') -Raw|ConvertFrom-Json;$v=Get-Content (Join-Path $env:ROOT 'frontend\release-build.json') -Raw|ConvertFrom-Json;if($g.expected_sha -ne $m.sha -or $g.expected_sha -ne $v.sha){exit 3};foreach($n in @('frontend/release-build.json','frontend/Central-de-Controle-/index.html')){$e=$m.files.PSObject.Properties[$n];if(-not $e){exit 3};$hash=(Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $env:ROOT $n)).Hash.ToLowerInvariant();if($hash -ne ([string]$e.Value).ToLowerInvariant()){exit 3}};Write-Output 'http://127.0.0.1:8765/Central-de-Controle-/'}catch{exit 3}"`) do set "CENTRAL=%%L"
    if defined CENTRAL echo [INFO] Central local integrada autorizada por SHA e hashes do manifesto.
  )
  if not defined CENTRAL (
    echo [ERRO] Nenhum preview com o SHA exato %EXPECTED_FRONTEND_SHA% esta acessivel e nao existe preview previamente validado neste posto.
    echo        Conecte a internet normal e tente novamente. A coleta nao sera iniciada em frontend diferente do pacote.
    goto :fail
  )
) else (
  rem Candidatos antigos sem manifesto de gate mantem o preview historico; o
  rem bundle R12 atual sempre inclui FRONTEND_GATE.json e usa verificacao exata.
  set "CENTRAL=https://central-cora-v2-git-v2-console-parity-r12-pedrokam700-6477.vercel.app/Central-de-Controle-/"
)

echo ============================================================
echo   CENTRAL V2 + A-MES - INICIAR POSTO
echo ============================================================
echo Arquitetura: Central web ^+ um agente local ^+ um Chrome/CDP.
echo Nenhuma senha A-MES/Wi-Fi e armazenada por este launcher.
if defined EXPECTED_FRONTEND_SHA echo Frontend exigido: %EXPECTED_FRONTEND_SHA%
echo Central selecionada: %CENTRAL%
echo.

if not exist "%ROOT%.venv\Scripts\python.exe" (
  if exist "%ROOT%01_INSTALAR_UMA_VEZ.bat" (
    echo [1/7] Primeiro uso: instalando ambiente local uma unica vez...
    call "%ROOT%01_INSTALAR_UMA_VEZ.bat" /auto
    if errorlevel 1 goto :fail
  ) else (
    echo [ERRO] .venv ausente e instalador 01_INSTALAR_UMA_VEZ.bat nao encontrado.
    goto :fail
  )
) else (
  echo [1/7] Ambiente local encontrado.
)

rem R11 provou que python.exe existente nao significa ambiente completo. Uma
rem instalacao interrompida pode deixar o .venv sem Playwright/openpyxl/etc.
echo [2/7] Validando dependencias criticas do motor...
call :depscheck
if errorlevel 1 (
  echo       Ambiente incompleto detectado. Reparando automaticamente...
  if exist "%ROOT%09_REPARAR_DEPENDENCIAS.bat" (
    call "%ROOT%09_REPARAR_DEPENDENCIAS.bat" /auto
  ) else (
    rem O bundle de migracao deve conseguir recuperar um posto mesmo que a R12
    rem antiga nao possua o reparador separado. Mantemos o mesmo reparo da R11
    rem embutido como fallback para nunca repetir o venv-existe/Playwright-ausente.
    call :depsrepair
  )
  if errorlevel 1 goto :fail
  call :depscheck
  if errorlevel 1 goto :fail
  echo       pandas/openpyxl/playwright/pyautogui/pyperclip: OK apos reparo
) else (
  echo       pandas/openpyxl/playwright/pyautogui/pyperclip: OK
)

if not exist "%ROOT%ames-agent\config.json" if exist "%ROOT%ames-agent\config.example.json" copy /Y "%ROOT%ames-agent\config.example.json" "%ROOT%ames-agent\config.json" >nul

echo [3/7] Verificando redes e garantindo rota persistente A-MES...
call :probe
if errorlevel 1 (
  netsh wlan show profiles 2>nul | findstr /I /C:"TAXXX_5G" >nul 2>nul
  if not errorlevel 1 (
    echo       Tentando reconectar o perfil TAXXX_5G ja salvo no Windows...
    netsh wlan connect name="TAXXX_5G" >nul 2>nul
    timeout /t 5 /nobreak >nul
  )
)
rem Mesmo que o A-MES ja responda, garantimos a rota persistente. Isso migra
rem automaticamente postos antigos que ainda tinham apenas ActiveStore.
if exist "%ROOT%suporte\ames-workstation\ROTA_AMES_APLICAR.bat" (
  call "%ROOT%suporte\ames-workstation\ROTA_AMES_APLICAR.bat"
  if errorlevel 1 goto :fail
) else if exist "%ROOT%12_APLICAR_ROTA_AMES_TEMPORARIA.bat" (
  rem Fallback apenas para instalacoes antigas ainda nao migradas.
  call "%ROOT%12_APLICAR_ROTA_AMES_TEMPORARIA.bat"
  if errorlevel 1 goto :fail
) else (
  call :probe
  if errorlevel 1 (
    echo [ERRO] A-MES indisponivel e ferramenta de rota ausente.
    goto :fail
  )
)
call :probe
if errorlevel 1 (
  echo [ERRO] A rota foi verificada, mas 172.29.185.215:80 continua inacessivel.
  goto :fail
)
echo       Ethernet + TAXXX_5G: rota A-MES ativa/persistente e acesso OK.

echo [4/7] Iniciando/verificando agente canonico...
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%suporte\ames-workstation\START_AGENT_CANONICAL.ps1" -Root "%ROOT%"
if errorlevel 1 goto :fail
for /f "usebackq delims=" %%T in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$p=Join-Path $env:ROOT 'ames-agent\data\local_agent_token';if(Test-Path $p){$t=(Get-Content -Raw $p).Trim();if($t.Length -ge 32){Write-Output $t;exit 0}};exit 3"`) do set "AGENT_TOKEN=%%T"
if not defined AGENT_TOKEN (
  echo [ERRO] Token local do agente nao foi criado. O posto nao sera aberto sem pareamento.
  goto :fail
)

echo [5/7] Abrindo Chrome dedicado A-MES pelo mesmo agente...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try{$headers=@{'X-Central-Agent-Token'=$env:AGENT_TOKEN};$r=Invoke-RestMethod 'http://127.0.0.1:8765/api/v1/chrome/start' -Method Post -Headers $headers -ContentType 'application/json' -Body '{}' -TimeoutSec 12;if(-not $r.ok){exit 1};exit 0}catch{Write-Host $_.Exception.Message;exit 1}"
if errorlevel 1 goto :fail

echo [6/7] Preflight local...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try{$headers=@{'X-Central-Agent-Token'=$env:AGENT_TOKEN};$h=Invoke-RestMethod 'http://127.0.0.1:8765/api/v1/health' -TimeoutSec 3;$hh=Invoke-RestMethod 'http://127.0.0.1:8765/api/v1/hardening/health' -Headers $headers -TimeoutSec 3;Write-Host ('Agente: '+$h.candidate_version+' / Build='+$h.agent_build+' / A-MES='+$h.ames_reachable+' / CDP='+$h.chrome_cdp_reachable+' / 3022='+$h.auto_3022_ready+' / Security='+$hh.local_security.mode);if(-not $h.ok -or -not $hh.ok -or [string]$hh.local_security.mode -ne 'workstation-token-v1'){exit 1}}catch{Write-Host $_.Exception.Message;exit 1}"
if errorlevel 1 goto :fail

echo [7/7] Abrindo a UNICA Central com pareamento local...
start "" "%CENTRAL%#ames_agent_token=%AGENT_TOKEN%"
echo.
echo [OK] Posto iniciado.
echo - Central: %CENTRAL%
if defined EXPECTED_FRONTEND_SHA echo - Frontend esperado: %EXPECTED_FRONTEND_SHA%
echo - Agente local: http://127.0.0.1:8765
echo - Pareamento local: workstation-token-v1
echo - Chrome A-MES: perfil dedicado / CDP 9222
echo - Rota A-MES: persistente e revalidada automaticamente pelo launcher.
echo - O login do A-MES continua manual.
echo - Se a internet externa cair depois de um preview validado/cache valido,
echo   o launcher reutiliza somente a mesma origem/SHA; a coleta local continua
echo   e o Firebase sincroniza ao voltar.
exit /b 0

:depscheck
"%ROOT%.venv\Scripts\python.exe" -c "import pandas,openpyxl,playwright,pyautogui,pyperclip; from playwright.sync_api import sync_playwright" >nul 2>nul
exit /b %errorlevel%

:depsrepair
"%ROOT%.venv\Scripts\python.exe" -m ensurepip --upgrade >nul 2>nul
"%ROOT%.venv\Scripts\python.exe" -m pip install --disable-pip-version-check --upgrade pip
if errorlevel 1 exit /b 1
"%ROOT%.venv\Scripts\python.exe" -m pip install --disable-pip-version-check "pandas>=2.2" "openpyxl>=3.1" "playwright>=1.55" "pyautogui>=0.9.54" "pyperclip>=1.9"
if errorlevel 1 exit /b 1
exit /b 0

:probe
powershell -NoProfile -ExecutionPolicy Bypass -Command "$c=New-Object Net.Sockets.TcpClient;try{$a=$c.BeginConnect('172.29.185.215',80,$null,$null);if(-not $a.AsyncWaitHandle.WaitOne(2500,$false)){exit 1};$c.EndConnect($a);exit 0}catch{exit 1}finally{$c.Close()}" >nul 2>nul
exit /b %errorlevel%

:fail
echo.
echo [ERRO] O posto NAO ficou pronto. Nao inicie coleta ate corrigir a etapa acima.
if exist "%ROOT%suporte\ames-workstation\DIAGNOSTICO_POSTO.ps1" powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%suporte\ames-workstation\DIAGNOSTICO_POSTO.ps1" -Root "%ROOT%"
pause
exit /b 1
