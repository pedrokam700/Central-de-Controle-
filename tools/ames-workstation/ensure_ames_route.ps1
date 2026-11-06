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

# The earlier factory bundles resolved the A-MES /32 by a live 172.29.x.x
# IP/gateway. Keep that working recovery path when Windows refuses to expose
# the SSID, but only for ONE active wireless adapter, never an Ethernet alias
# or a disconnected adapter retaining DHCP properties from an earlier lease.
function Resolve-CorporateWifiByAddress([object[]]$adapters,[object[]]$ipconfigs) {
  $eligible=@()
  foreach($cfg in $ipconfigs) {
    if(-not $cfg -or -not $cfg.IPv4Address -or -not $cfg.IPv4DefaultGateway){continue}
    $addresses=@($cfg.IPv4Address | ForEach-Object {$_.IPAddress})
    $gateways=@($cfg.IPv4DefaultGateway | ForEach-Object {$_.NextHop})
    $mesAddresses=@($addresses|Where-Object {$_ -like '172.29.*'})
    $mesGateways=@($gateways|Where-Object {$_ -like '172.29.*'})
    if($mesAddresses.Count -eq 0 -or $mesGateways.Count -eq 0){continue}
    $found=@($adapters | Where-Object {$_.Status -eq 'Up' -and [int]$_.ifIndex -eq [int]$cfg.InterfaceIndex})
    if($found.Count -ne 1){continue}
    $a=$found[0]
    $hint=([string]$a.Name+' '+[string]$a.InterfaceDescription+' '+[string]$a.NdisPhysicalMedium)
    if($hint -notmatch '(?i)wi-?fi|wlan|wireless|802[.]?11|native802|sem fio'){continue}
    $eligible+= [pscustomobject]@{Index=[int]$cfg.InterfaceIndex;Gateway=[string]$mesGateways[0];InterfaceAlias=[string]$cfg.InterfaceAlias}
  }
  if($eligible.Count -ne 1){throw "Rede A-MES: esperada uma unica interface Wi-Fi ATIVA com IPv4/gateway 172.29.x.x; encontradas $($eligible.Count). Rota nao alterada."}
  return $eligible[0]
}

try {
  Write-Host '=== REDE A-MES: Wi-Fi TAXXX_5G + rota persistente /32 ==='
  $wifi=@(netsh wlan show interfaces 2>&1)
  $confirmed=@($wifi | Where-Object { $_ -match '^\s*SSID\s*:\s*TAXXX_5G\s*$' })
  if(-not $confirmed.Count){
    # A workstation connected to another SSID must not be silently switched.
    $alreadyOnOther=@($wifi | Where-Object { $_ -match '^\s*SSID\s*:\s*\S+' })
    if($alreadyOnOther.Count){throw 'Wi-Fi ligado a outro SSID. Conexao nao alterada; selecione a rede corporativa autorizada.'}
    Write-Host 'TAXXX_5G nao identificado. Tentando perfil ja salvo no Windows...'
    & netsh wlan connect name=$Profile | Out-Null
    if($LASTEXITCODE -eq 0){
      # Association + DHCP can take more than four seconds on factory notebooks.
      # Never invent a saved Wi-Fi password or bypass an enterprise profile.
      for($attempt=0;$attempt -lt 8;$attempt++){
        Start-Sleep -Seconds 2
        $wifi=@(netsh wlan show interfaces 2>&1)
        $confirmed=@($wifi | Where-Object { $_ -match '^\s*SSID\s*:\s*TAXXX_5G\s*$' })
        if($confirmed.Count){break}
      }
    } else {
      Write-Host 'Perfil TAXXX_5G nao conectou automaticamente. Validando se existe interface corporativa ativa...' -ForegroundColor Yellow
    }
  }
  if(($wifi -join "`n") -match 'WlanQueryInterface'){
    Write-Host 'WlanQueryInterface nao expôs SSID; somente IP/gateway de WLAN ATIVA e unica poderao habilitar a rota.' -ForegroundColor Yellow
  }
  $adapters=@(Get-NetAdapter -ErrorAction Stop)
  if($confirmed.Count){
    # Primary strict path: actual SSID -> WLAN GUID -> active interface.
    $wlanGuid=Resolve-WlanGuidForSsid $wifi $Profile
    $wifiIndex=Resolve-WifiInterfaceIndex @(Get-NetAdapter -ErrorAction Stop) $wlanGuid
    Write-Host 'Interface WLAN confirmada pelo SSID e GUID.'
  } else {
    $otherSsid=@($wifi | Where-Object { $_ -match '^\s*SSID\s*:\s*(\S.+?)\s*$' })
    if($otherSsid.Count){throw 'O Wi-Fi esta conectado a outro SSID. TAXXX_5G nao identificado; rota nao alterada.'}
    $candidate=Resolve-CorporateWifiByAddress $adapters @(Get-NetIPConfiguration -ErrorAction Stop)
    $wifiIndex=$candidate.Index
    Write-Host 'SSID nao exposto pelo Windows; interface Wi-Fi ativa e gateway 172.29.x.x unicos comprovados.' -ForegroundColor Yellow
  }
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
  if(-not $confirmed.Count -and $candidate.Gateway -ne $gateway){throw 'Gateway da interface mudou durante validacao; rota nao alterada.'}
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
