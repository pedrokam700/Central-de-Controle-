param([switch]$Elevated)
# Only the exact A-MES host route is managed. Never changes default gateway,
# DNS, proxy, Wi-Fi credentials or any other network route.
$ErrorActionPreference='Stop'
$TargetIp='172.29.185.215'
$Prefix="$TargetIp/32"
$Mask='255.255.255.255'
$Profile='TAXXX_5G'
$Root=Split-Path -Parent $PSScriptRoot
$Logs=Join-Path $Root 'logs'
New-Item -ItemType Directory -Force -Path $Logs | Out-Null
$Log=Join-Path $Logs ("rota_ames_persistente_"+(Get-Date -Format 'yyyyMMdd_HHmmss')+'.txt')
Start-Transcript -Path $Log -Force | Out-Null

function Test-Admin {
  $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
  $principal=New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
function Confirm-Route([int]$index,[string]$gateway) {
  $active=@(Get-NetRoute -DestinationPrefix $Prefix -PolicyStore ActiveStore -ErrorAction SilentlyContinue |
    Where-Object { $_.InterfaceIndex -eq $index -and $_.NextHop -eq $gateway })
  $saved=@(Get-NetRoute -DestinationPrefix $Prefix -PolicyStore PersistentStore -ErrorAction SilentlyContinue |
    Where-Object { $_.InterfaceIndex -eq $index -and $_.NextHop -eq $gateway })
  return ($active.Count -gt 0 -and $saved.Count -gt 0)
}
function Test-AmesTcp {
  $client=New-Object System.Net.Sockets.TcpClient
  try {
    $connection=$client.BeginConnect($TargetIp,80,$null,$null)
    if(-not $connection.AsyncWaitHandle.WaitOne(6000,$false)){throw 'TIMEOUT TCP 80'}
    $client.EndConnect($connection)
  } finally { $client.Close() }
}


# WLAN GUID is the stable adapter identity. Network profile display names
# may be "TAXXX_5G 2" or "Rede 5" even when SSID is exactly TAXXX_5G.
function Resolve-WlanGuidForSsid([string[]]$lines,[string]$ssid) {
  $currentGuid=$null
  $found=@()
  foreach($line in $lines) {
    if($line -match '^\s*(?:Nome|Name)\s*:'){$currentGuid=$null;continue}
    if($line -match '^\s*GUID\s*:\s*\{?\s*([0-9A-Fa-f-]{36})\s*\}?\s*$') {
      $currentGuid=[guid]$Matches[1]
      continue
    }
    if($line -match '^\s*SSID\s*:\s*(.+?)\s*$' -and $Matches[1].Trim() -ceq $ssid) {
      if(-not $currentGuid){throw "SSID $ssid sem GUID WLAN. Nenhuma rota alterada."}
      $found+= $currentGuid
    }
  }
  $unique=@($found|Select-Object -Unique)
  if($unique.Count -ne 1){throw "SSID $ssid sem interface WLAN unica ($($unique.Count)). Nenhuma rota alterada."}
  return [guid]$unique[0]
}
function Resolve-WifiInterfaceIndex([object[]]$adapters,[guid]$wlanGuid) {
  $matched=@($adapters|Where-Object {
    $_.InterfaceGuid -and $_.Status -eq 'Up' -and ([guid]$_.InterfaceGuid -eq $wlanGuid)
  })
  if($matched.Count -ne 1){throw "WLAN nao corresponde a adaptador ativo unico ($($matched.Count)). Nenhuma rota alterada."}
  return [int]$matched[0].ifIndex
}

try {
  Write-Host '=== REDE A-MES: Wi-Fi TAXXX_5G + rota persistente /32 ==='
  $wifi=@(netsh wlan show interfaces 2>&1)
  if(($wifi -join "`n") -match 'WlanQueryInterface'){
    throw 'Consulta WLAN negada pelo Windows. Verifique a permissao Localizacao ou procure a TI. Nenhuma rota alterada.'
  }
  if(-not ($wifi | Where-Object { $_ -match '^\s*SSID\s*:\s*TAXXX_5G\s*$' })){
    Write-Host 'TAXXX_5G nao identificado. Tentando perfil ja salvo no Windows...'
    & netsh wlan connect name=$Profile | Out-Null
    Start-Sleep -Seconds 4
    $wifi=@(netsh wlan show interfaces 2>&1)
  }
  if(($wifi -join "`n") -match 'WlanQueryInterface'){
    throw 'Consulta WLAN negada pelo Windows. Verifique a permissao Localizacao ou procure a TI. Nenhuma rota alterada.'
  }
  if(-not ($wifi | Where-Object { $_ -match '^\s*SSID\s*:\s*TAXXX_5G\s*$' })){
    throw 'TAXXX_5G nao identificado pelo Windows. Conecte pelo Windows com credenciais da TI. Nenhuma senha e distribuida neste pacote.'
  }
  # Prove the SSID and map its WLAN GUID to an active adapter, never to an
  # arbitrary Windows profile display name or an unrelated Ethernet interface.
  $wlanGuid=Resolve-WlanGuidForSsid $wifi $Profile
  $wifiIndex=Resolve-WifiInterfaceIndex @(Get-NetAdapter -ErrorAction Stop) $wlanGuid
  $interfaces=@(Get-NetIPConfiguration -InterfaceIndex $wifiIndex | Where-Object {
    $_.IPv4Address.IPAddress -like '172.29.*' -and $_.IPv4DefaultGateway.NextHop -like '172.29.*'
  })
  if($interfaces.Count -ne 1){
    throw "Esperada uma interface A-MES 172.29.x.x com gateway; encontradas $($interfaces.Count). Nenhuma rota alterada."
  }
  $cfg=$interfaces[0]
  $index=[int]$cfg.InterfaceIndex
  $gateway=[string]$cfg.IPv4DefaultGateway.NextHop
  Write-Host "Rede: $($cfg.InterfaceAlias), IfIndex $index, gateway $gateway"
  if(-not (Confirm-Route $index $gateway)){
    if(-not (Test-Admin)){
      if($Elevated){throw 'A elevacao de administrador nao foi concedida.'}
      Write-Host 'Solicitando administrador apenas para a rota 172.29.185.215/32...'
      $scriptPath=$MyInvocation.MyCommand.Path
      $arguments='-NoProfile -ExecutionPolicy Bypass -File "'+$scriptPath+'" -Elevated'
      $child=Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -Verb RunAs -Wait -PassThru
      if($child.ExitCode -ne 0){throw "Configuracao elevada falhou: codigo $($child.ExitCode)."}
    } else {
      # Only after proving SSID/IP/gateway; never delete broad/default routes.
      $existing=@(Get-NetRoute -DestinationPrefix $Prefix -ErrorAction SilentlyContinue)
      if($existing.Count -gt 0){ & route.exe delete $TargetIp mask $Mask *> $null }
      & route.exe -p add $TargetIp mask $Mask $gateway metric 1 if $index | Out-Host
      if($LASTEXITCODE -ne 0){throw "Nao foi possivel criar rota /32: codigo $LASTEXITCODE"}
    }
  }
  if(-not (Confirm-Route $index $gateway)){
    throw 'Rota /32 nao comprovada nos estados ativo e persistente. Coleta bloqueada.'
  }
  Test-AmesTcp
  Write-Host '[OK] Rede A-MES confirmada. Gateway padrao/Ethernet nao alterados.' -ForegroundColor Green
  exit 0
} catch {
  Write-Host ('[ERRO] '+$_.Exception.Message) -ForegroundColor Red
  Write-Host ('Log: '+$Log) -ForegroundColor Yellow
  exit 2
} finally {
  try{Stop-Transcript | Out-Null}catch{}
}
