@echo off
setlocal EnableExtensions
title Central V2 - Rota temporaria A-MES

net session >nul 2>&1
if not "%errorlevel%"=="0" (
  echo Solicitando permissao de administrador somente para a rota A-MES...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

echo ============================================================
echo  CENTRAL V2 - ROTA TEMPORARIA PARA O A-MES
echo ============================================================
echo - nao altera DNS, proxy ou gateway padrao;
echo - nao muda a Internet da Ethernet;
echo - cria somente 172.29.185.215/32 pela interface OPPO;
echo - usa ActiveStore: reiniciar o Windows remove a rota.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
"$ErrorActionPreference='Stop';" ^
"$target='172.29.185.215/32';" ^
"$cfg=Get-NetIPConfiguration | Where-Object { $_.IPv4Address.IPAddress -like '172.29.*' -and $_.IPv4DefaultGateway.NextHop -like '172.29.*' } | Select-Object -First 1;" ^
"if(-not $cfg){ throw 'Nao encontrei uma interface OPPO com IP/gateway 172.29.x.x. Conecte TAXXX_5G primeiro.' };" ^
"$ifIndex=$cfg.InterfaceIndex; $gw=$cfg.IPv4DefaultGateway.NextHop;" ^
"Get-NetRoute -DestinationPrefix $target -ErrorAction SilentlyContinue | Remove-NetRoute -Confirm:$false -ErrorAction SilentlyContinue;" ^
"New-NetRoute -DestinationPrefix $target -InterfaceIndex $ifIndex -NextHop $gw -RouteMetric 1 -PolicyStore ActiveStore | Out-Null;" ^
"Get-NetRoute -DestinationPrefix $target | Select-Object DestinationPrefix,InterfaceAlias,NextHop,RouteMetric,PolicyStore | Format-Table -AutoSize;" ^
"$c=New-Object System.Net.Sockets.TcpClient; try{$ar=$c.BeginConnect('172.29.185.215',80,$null,$null); if(-not $ar.AsyncWaitHandle.WaitOne(5000,$false)){throw 'TIMEOUT'}; $c.EndConnect($ar); Write-Host 'Teste TCP A-MES 80: OK'}catch{Write-Host ('Teste TCP A-MES 80: FALHOU - ' + $_.Exception.Message); exit 2}finally{$c.Close()}"

if errorlevel 1 exit /b %errorlevel%
echo [OK] Rota A-MES pronta.
exit /b 0
