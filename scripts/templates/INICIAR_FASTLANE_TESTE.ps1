$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root
$Logs = Join-Path $Root 'logs'
New-Item -ItemType Directory -Force -Path $Logs | Out-Null
$Log = Join-Path $Logs ("iniciar_fastlane_" + (Get-Date -Format 'yyyyMMdd_HHmmss') + ".txt")

function L([string]$Text, [ConsoleColor]$Color = [ConsoleColor]::Gray) {
    Write-Host $Text -ForegroundColor $Color
    Add-Content -LiteralPath $Log -Value ((Get-Date -Format 'HH:mm:ss') + ' ' + $Text) -Encoding UTF8
}

function F([string]$Message) {
    L ('[ERRO] ' + $Message) Red
    L ('Log: ' + $Log) Yellow
    Read-Host 'Pressione ENTER para fechar'
    exit 1
}

function Show-AgentTail {
    $stderr = Join-Path $Root 'logs\agent_fastlane_stderr.log'
    $stdout = Join-Path $Root 'logs\agent_fastlane_stdout.log'
    if (Test-Path $stderr) { Get-Content -LiteralPath $stderr -Tail 80 | ForEach-Object { L $_ Yellow } }
    if (Test-Path $stdout) { Get-Content -LiteralPath $stdout -Tail 80 | ForEach-Object { L $_ Yellow } }
}

function Test-Ames {
    try {
        $c = New-Object Net.Sockets.TcpClient
        try {
            $a = $c.BeginConnect('172.29.185.215', 80, $null, $null)
            if (-not $a.AsyncWaitHandle.WaitOne(2500, $false)) { return $false }
            $c.EndConnect($a)
            return $true
        } finally {
            $c.Close()
        }
    } catch {
        return $false
    }
}

function Show-RouteTail {
    try {
        $latest = Get-ChildItem -LiteralPath $Logs -Filter 'rota_ames_persistente_*.txt' -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($latest) {
            L ('--- diagnostico rota: ' + $latest.FullName) Yellow
            Get-Content -LiteralPath $latest.FullName -Tail 40 | ForEach-Object { L $_ Yellow }
        }
    } catch {}
}

try {
    L '============================================================' Cyan
    L ' CENTRAL A-MES FASTLANE · REDE + 3012' Cyan
    L ' CLEAN V3 preservada como baseline; este e o clone de teste.' Cyan
    L '============================================================' Cyan

    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort 8765 -ErrorAction SilentlyContinue)
    foreach ($x in $listeners) {
        try { Stop-Process -Id $x.OwningProcess -Force -ErrorAction Stop } catch {}
    }
    Start-Sleep -Milliseconds 600

    $Python = Join-Path $Root '.venv\Scripts\python.exe'
    if (-not (Test-Path $Python)) {
        L '[1/7] Criando ambiente local...' Yellow
        & (Join-Path $Root '01_INSTALAR_UMA_VEZ.bat') '/auto'
        if ($LASTEXITCODE -ne 0) { F 'Instalacao do ambiente falhou.' }
    }
    if (-not (Test-Path $Python)) { F '.venv nao foi criado.' }

    & $Python -c "import pandas,openpyxl,playwright,pyautogui,pyperclip" *> $null
    if ($LASTEXITCODE -ne 0) {
        L '[2/7] Reparando dependencias...' Yellow
        & (Join-Path $Root '09_REPARAR_DEPENDENCIAS.bat') '/auto'
        if ($LASTEXITCODE -ne 0) { F 'Dependencias nao ficaram prontas.' }
    }

    L '[3/7] Garantindo TAXXX_5G / rota A-MES...'
    if (-not (Test-Ames)) {
        L '      A-MES ainda inacessivel; tentando reconectar TAXXX_5G...' Yellow
        netsh wlan connect name='TAXXX_5G' | Out-Null
        Start-Sleep -Seconds 5
    }

    if (-not (Test-Ames)) {
        $route = Join-Path $Root 'network\ensure_ames_route.ps1'
        if (-not (Test-Path $route)) { F ('Script de rota ausente: ' + $route) }

        $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
        $principal = New-Object Security.Principal.WindowsPrincipal($identity)
        $admin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

        if ($admin) {
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $route
            $routeRc = $LASTEXITCODE
        } else {
            L '      Solicitando administrador somente para a rota /32 do A-MES...' Yellow
            $arg = "-NoProfile -ExecutionPolicy Bypass -File `"$route`""
            $rp = Start-Process -FilePath 'powershell.exe' -ArgumentList $arg -Verb RunAs -Wait -PassThru
            $routeRc = $rp.ExitCode
        }

        if ($routeRc -ne 0) {
            Show-RouteTail
            F ('Rota A-MES nao aplicada. Codigo ' + $routeRc)
        }
        Start-Sleep -Seconds 2
    } else {
        L '      A-MES ja alcancavel; rota existente preservada.' Green
    }

    if (-not (Test-Ames)) {
        Show-RouteTail
        F '172.29.185.215 continua inacessivel.'
    }
    L '      Rede A-MES OK.' Green

    L '[4/7] Abrindo Chrome A-MES...'
    & (Join-Path $Root '05_ABRIR_CHROME_AMES.bat')
    if ($LASTEXITCODE -ne 0) { F 'Chrome/CDP nao abriu.' }

    L '[5/7] Preparando origem do preview e agente endurecido...'
    $cfgPath = Join-Path $Root 'ames-agent\config.json'
    $cfgExample = Join-Path $Root 'ames-agent\config.example.json'
    if (Test-Path $cfgPath) {
        $cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json
    } else {
        $cfg = Get-Content $cfgExample -Raw | ConvertFrom-Json
    }

    if (-not $cfg.allowed_origins) {
        $cfg | Add-Member -NotePropertyName allowed_origins -NotePropertyValue @() -Force
    }
    if (-not ($cfg.allowed_origins -contains '__ORIGIN__')) {
        $cfg.allowed_origins = @($cfg.allowed_origins) + @('__ORIGIN__')
    }
    $cfg | Add-Member -NotePropertyName ames_wifi_profile -NotePropertyValue 'TAXXX_5G' -Force
    $cfg | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $cfgPath -Encoding UTF8

    $Bootstrap = Join-Path $Root 'ames-agent\agent_fastlane_bootstrap.pyw'
    if (-not (Test-Path $Bootstrap)) { F ('Bootstrap fastlane ausente: ' + $Bootstrap) }
    $PythonW = Join-Path $Root '.venv\Scripts\pythonw.exe'
    if (-not (Test-Path $PythonW)) { $PythonW = $Python }
    $AgentProcess = Start-Process -FilePath $PythonW -ArgumentList @("`"$Bootstrap`"") -WorkingDirectory $Root -PassThru

    L '[6/7] Aguardando agente CANONICAL-R11-BATCH...'
    $ready = $null
    $readyUnauthorized = $false
    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Seconds 1
        if ($AgentProcess.HasExited) { break }
        try {
            $r = Invoke-RestMethod 'http://127.0.0.1:8765/api/v1/ready' -TimeoutSec 3
            if ($r.ok -and $r.ready -and [string]$r.agent_build -eq 'CANONICAL-R11-BATCH') {
                $ready = $r
                break
            }
        } catch {
            $status = $null
            try { $status = [int]$_.Exception.Response.StatusCode } catch {}
            if ($status -eq 401) {
                $readyUnauthorized = $true
                break
            }
        }
    }

    if (-not $ready) {
        Show-AgentTail
        if ($readyUnauthorized) {
            F 'Contrato de readiness negado pelo hardening (HTTP 401). Pacote inconsistente; nao continuar.'
        }
        if ($AgentProcess.HasExited) {
            F ('Agente encerrou antes do readiness. ExitCode=' + $AgentProcess.ExitCode)
        }
        F 'Agente fastlane nao respondeu ao readiness leve.'
    }

    L ('      Agente pronto | PID=' + $ready.pid + ' | build=' + $ready.agent_build) Green

    $health = $null
    try {
        $health = Invoke-RestMethod 'http://127.0.0.1:8765/api/v1/health' -TimeoutSec 20
    } catch {
        L ('[AVISO] Agente pronto, mas diagnostico /health demorou: ' + $_.Exception.Message) Yellow
    }
    if ($health) {
        L ('      Diagnostico | A-MES=' + $health.ames_reachable + ' | CDP=' + $health.chrome_cdp_reachable) Green
    }

    $tokenPath = Join-Path $Root 'ames-agent\data\local_agent_token'
    for ($i = 0; $i -lt 10 -and -not (Test-Path $tokenPath); $i++) {
        Start-Sleep -Milliseconds 300
    }
    if (-not (Test-Path $tokenPath)) { F 'Token local do agente nao foi criado.' }

    $token = (Get-Content $tokenPath -Raw).Trim()
    $url = '__PREVIEW__#ames_agent_token=' + [uri]::EscapeDataString($token)

    L '[7/7] Abrindo Central fastlane...'
    Start-Process $url
    L ''
    L '[OK] FASTLANE PRONTA PARA TESTE' Green
    L '3012, guardian de rede e Shift 2114 ainda exigem validacao fisica.' Yellow
    L ('Log: ' + $Log)
    exit 0
} catch {
    F $_.Exception.Message
}
