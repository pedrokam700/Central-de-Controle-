param([string]$Root='.')
$ErrorActionPreference='Continue'
Write-Host '=== CENTRAL V2 / A-MES - DIAGNOSTICO DO POSTO ==='
Write-Host ('Pasta: ' + (Resolve-Path $Root -ErrorAction SilentlyContinue))
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
Write-Host '[6] Agente 8765'
try{$h=Invoke-RestMethod 'http://127.0.0.1:8765/api/v1/health' -TimeoutSec 2;$h | ConvertTo-Json -Depth 8}catch{Write-Host ('AGENTE: FALHOU - '+$_.Exception.Message)}
Write-Host '[7] Capabilities V2'
try{Invoke-RestMethod 'http://127.0.0.1:8765/api/v1/v2/capabilities' -TimeoutSec 2 | ConvertTo-Json -Depth 8}catch{Write-Host ('CAPABILITIES: FALHOU - '+$_.Exception.Message)}
Write-Host '[8] Internet / Central'
try{$r=Invoke-WebRequest -UseBasicParsing 'https://central-cora-v2.vercel.app/Central-de-Controle-/' -TimeoutSec 6;Write-Host ('Central online: HTTP '+$r.StatusCode)}catch{Write-Host 'Central online indisponivel. Isto NAO impede o agente/A-MES local se o shell ja estiver cacheado.'}
Write-Host '[9] Segredos'
Write-Host 'Este diagnostico nao le nem imprime senha A-MES, cookies, senha Wi-Fi ou tokens Firebase.'
