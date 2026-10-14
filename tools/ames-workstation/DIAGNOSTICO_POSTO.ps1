param([string]$Root='.')
$ErrorActionPreference='Continue'
$resolved=(Resolve-Path -LiteralPath $Root -ErrorAction SilentlyContinue)
$rootPath=if($resolved){$resolved.Path}else{$Root}
$tokenPath=Join-Path $rootPath 'ames-agent\data\local_agent_token'
$statePath=Join-Path $rootPath 'logs\agent_startup_state.json'
$headers=$null
$tokenStatus='ausente'
if(Test-Path -LiteralPath $tokenPath){
  try{
    $token=(Get-Content -LiteralPath $tokenPath -Raw -ErrorAction Stop).Trim()
    if($token.Length -ge 32){$headers=@{'X-Central-Agent-Token'=$token};$tokenStatus='presente/valido'}else{$tokenStatus='presente/invalido'}
  }catch{$tokenStatus='presente/ilegivel'}
}

function Show-Tail {
  param([string]$Path,[string]$Label)
  if(-not $Path){return}
  if(-not (Test-Path -LiteralPath $Path)){Write-Host ("${Label}: arquivo nao existe: $Path");return}
  $lines=@(Get-Content -LiteralPath $Path -Tail 40 -ErrorAction SilentlyContinue)
  Write-Host ("--- $Label ---")
  if($lines.Count){$lines|ForEach-Object{Write-Host $_}}else{Write-Host '(vazio)'}
}

Write-Host '=== CENTRAL V2 / A-MES - DIAGNOSTICO DO POSTO ==='
Write-Host ('Pasta: ' + $rootPath)
Write-Host ('Token local: ' + $tokenStatus + ' (valor nunca exibido)')
Write-Host ''

Write-Host '[1] Interfaces ativas'
Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object Status -eq 'Up' | Select-Object Name,InterfaceDescription,LinkSpeed | Format-Table -AutoSize

Write-Host '[2] IPv4 / Gateway'
Get-NetIPConfiguration -ErrorAction SilentlyContinue | Where-Object {$_.IPv4Address} | ForEach-Object {[pscustomobject]@{Interface=$_.InterfaceAlias;IPv4=($_.IPv4Address.IPAddress -join ',');Gateway=($_.IPv4DefaultGateway.NextHop -join ',')}} | Format-Table -AutoSize

Write-Host '[3] Rota efetiva para A-MES'
$r=Find-NetRoute -RemoteIPAddress 172.29.185.215 -ErrorAction SilentlyContinue
if($r){$r | Select-Object InterfaceAlias,NextHop,RouteMetric,InterfaceMetric | Format-List}else{Write-Host 'SEM ROTA'}

Write-Host '[4] TCP A-MES 172.29.185.215:80'
$c=New-Object Net.Sockets.TcpClient
try{$a=$c.BeginConnect('172.29.185.215',80,$null,$null);if(-not $a.AsyncWaitHandle.WaitOne(5000,$false)){throw 'TIMEOUT'};$c.EndConnect($a);Write-Host 'TCP A-MES: OK'}catch{Write-Host ('TCP A-MES: FALHOU - '+$_.Exception.Message)}finally{$c.Close()}

Write-Host '[5] Chrome/CDP 9222'
try{$v=Invoke-RestMethod 'http://127.0.0.1:9222/json/version' -TimeoutSec 2;Write-Host ('CDP: OK - '+$v.Browser);Invoke-RestMethod 'http://127.0.0.1:9222/json/list' -TimeoutSec 2 | Select-Object title,url,type | Format-Table -AutoSize}catch{Write-Host ('CDP: FALHOU - '+$_.Exception.Message)}

Write-Host '[6] Listener/processo do agente 8765'
$listeners=@(Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue)
if(-not $listeners.Count){Write-Host '8765: SEM LISTENER'}
foreach($processId in @($listeners.OwningProcess|Sort-Object -Unique)){
  $p=Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
  if($p){[pscustomobject]@{PID=$processId;Name=$p.Name;Executable=$p.ExecutablePath;CommandLine=$p.CommandLine}|Format-List}else{Write-Host ("PID $processId nao resolvido pelo CIM")}
}

Write-Host '[7] API publica /ready + /health'
try{$ready=Invoke-RestMethod 'http://127.0.0.1:8765/api/v1/ready' -TimeoutSec 3;$ready|ConvertTo-Json -Depth 6}catch{Write-Host ('READY: FALHOU - '+$_.Exception.Message)}
try{$health=Invoke-RestMethod 'http://127.0.0.1:8765/api/v1/health' -TimeoutSec 6;$health|ConvertTo-Json -Depth 8}catch{Write-Host ('HEALTH: FALHOU - '+$_.Exception.Message)}

Write-Host '[8] H1 protegido + capabilities'
if(-not $headers){
  Write-Host 'Nao foi possivel autenticar diagnosticos protegidos: token local ausente/invalido.'
}else{
  try{Invoke-RestMethod 'http://127.0.0.1:8765/api/v1/hardening/health' -Headers $headers -TimeoutSec 6 | ConvertTo-Json -Depth 8}catch{Write-Host ('HARDENING: FALHOU - '+$_.Exception.Message)}
  try{Invoke-RestMethod 'http://127.0.0.1:8765/api/v1/v2/capabilities' -Headers $headers -TimeoutSec 4 | ConvertTo-Json -Depth 8}catch{Write-Host ('CAPABILITIES: FALHOU - '+$_.Exception.Message)}
}

Write-Host '[9] Estado persistido do ultimo startup + logs'
if(Test-Path -LiteralPath $statePath){
  try{
    $state=Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    $state|ConvertTo-Json -Depth 5
    Show-Tail -Path ([string]$state.stderr) -Label 'stderr do ultimo startup'
    Show-Tail -Path ([string]$state.stdout) -Label 'stdout do ultimo startup'
  }catch{Write-Host ('STATE: FALHOU - '+$_.Exception.Message)}
}else{
  Write-Host 'agent_startup_state.json ainda nao existe.'
  $latest=Get-ChildItem -LiteralPath (Join-Path $rootPath 'logs') -Filter 'agent_*.log' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 4
  foreach($file in $latest){Show-Tail -Path $file.FullName -Label $file.Name}
}

Write-Host '[10] Central local servida pelo agente'
try{$r=Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8765/Central-de-Controle-/' -TimeoutSec 4;Write-Host ('Central local: HTTP '+$r.StatusCode)}catch{Write-Host ('Central local: FALHOU - '+$_.Exception.Message)}

Write-Host '[11] Segredos'
Write-Host 'Este diagnostico nao imprime senha A-MES, cookies, senha Wi-Fi, token local ou tokens Firebase.'
