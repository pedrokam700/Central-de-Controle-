$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$python = Join-Path $root '.venv\Scripts\python.exe'
$agentDir = $PSScriptRoot
$agent = Join-Path $agentDir 'agent.py'
$logs = Join-Path $root 'logs'
$outLog = Join-Path $logs 'agent_stdout.log'
$errLog = Join-Path $logs 'agent_stderr.log'

New-Item -ItemType Directory -Force -Path $logs | Out-Null

if (-not (Test-Path $python)) {
    Write-Host "[ERRO] Python do .venv nao encontrado: $python"
    exit 1
}
if (-not (Test-Path $agent)) {
    Write-Host "[ERRO] agent.py nao encontrado: $agent"
    exit 1
}

Set-Content -Path $outLog -Value ("=== START " + (Get-Date -Format s) + " ===") -Encoding UTF8
Set-Content -Path $errLog -Value ("=== START " + (Get-Date -Format s) + " ===") -Encoding UTF8

try {
    $p = Start-Process `
        -FilePath $python `
        -ArgumentList @($agent) `
        -WorkingDirectory $agentDir `
        -WindowStyle Minimized `
        -RedirectStandardOutput $outLog `
        -RedirectStandardError $errLog `
        -PassThru

    Write-Host ("PID do agente: " + $p.Id)
    exit 0
}
catch {
    Write-Host ("[ERRO] " + $_.Exception.Message)
    Add-Content -Path $errLog -Value $_.Exception.ToString()
    exit 1
}
