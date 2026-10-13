$ErrorActionPreference = 'Stop'
$TargetIp = '172.29.185.215'
$Mask = '255.255.255.255'
$TargetPrefix = "$TargetIp/32"
$Root = Split-Path -Parent $PSScriptRoot
$Logs = Join-Path $Root 'logs'
New-Item -ItemType Directory -Force -Path $Logs | Out-Null
$Log = Join-Path $Logs ("rota_ames_persistente_" + (Get-Date -Format 'yyyyMMdd_HHmmss') + '.txt')
Start-Transcript -Path $Log -Force | Out-Null
try {
    Write-Host '=== CENTRAL A-MES / ROTA PERSISTENTE OPPO ==='
    $cfg = Get-NetIPConfiguration | Where-Object {
        $_.IPv4Address.IPAddress -like '172.29.*' -and
        $_.IPv4DefaultGateway.NextHop -like '172.29.*'
    } | Select-Object -First 1
    if (-not $cfg) {
        throw 'Rede OPPO/TAXXX_5G nao encontrada com IPv4 e gateway 172.29.x.x. Conecte o Wi-Fi A-MES.'
    }

    $ifIndex = [int]$cfg.InterfaceIndex
    $alias = [string]$cfg.InterfaceAlias
    $ip = [string]$cfg.IPv4Address.IPAddress
    $gw = [string]$cfg.IPv4DefaultGateway.NextHop
    Write-Host "Interface OPPO: $alias | IP $ip | Gateway $gw | IfIndex $ifIndex"

    # Remove somente a rota host /32 do A-MES. Nao altera gateway padrao, DNS ou proxy.
    & route.exe delete $TargetIp mask $Mask *> $null

    # route -p cria a rota persistente e a torna ativa imediatamente.
    & route.exe -p add $TargetIp mask $Mask $gw metric 1 if $ifIndex | Out-Host
    if ($LASTEXITCODE -ne 0) {
        throw "route.exe -p add falhou com codigo $LASTEXITCODE"
    }

    Start-Sleep -Milliseconds 500
    $active = Get-NetRoute -DestinationPrefix $TargetPrefix -PolicyStore ActiveStore -ErrorAction SilentlyContinue |
        Where-Object { $_.InterfaceIndex -eq $ifIndex -and $_.NextHop -eq $gw } |
        Sort-Object RouteMetric | Select-Object -First 1
    $persistent = Get-NetRoute -DestinationPrefix $TargetPrefix -PolicyStore PersistentStore -ErrorAction SilentlyContinue |
        Where-Object { $_.InterfaceIndex -eq $ifIndex -and $_.NextHop -eq $gw } |
        Sort-Object RouteMetric | Select-Object -First 1

    if (-not $active) { throw 'A rota /32 nao ficou ativa na interface OPPO esperada.' }
    if (-not $persistent) { throw 'A rota /32 nao ficou registrada como persistente.' }

    Write-Host 'ActiveStore:'
    $active | Select-Object DestinationPrefix,InterfaceAlias,NextHop,RouteMetric,PolicyStore | Format-Table -AutoSize
    Write-Host 'PersistentStore:'
    $persistent | Select-Object DestinationPrefix,InterfaceAlias,NextHop,RouteMetric,PolicyStore | Format-Table -AutoSize

    $c = New-Object System.Net.Sockets.TcpClient
    try {
        $ar = $c.BeginConnect($TargetIp,80,$null,$null)
        if(-not $ar.AsyncWaitHandle.WaitOne(6000,$false)){ throw 'TIMEOUT TCP 80' }
        $c.EndConnect($ar)
        Write-Host 'TCP A-MES 80: OK'
    } finally { $c.Close() }

    Write-Host '[OK] Rota A-MES persistente ativa. Ethernet permanece como rota normal da Internet.'
    exit 0
} catch {
    Write-Host ('[ERRO] ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host ('Log: ' + $Log) -ForegroundColor Yellow
    exit 2
} finally {
    try { Stop-Transcript | Out-Null } catch {}
}
