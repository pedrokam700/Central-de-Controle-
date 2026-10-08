@echo off
setlocal EnableExtensions
title Central A-MES - Rota temporaria V0.5.3

net session >nul 2>&1
if not "%errorlevel%"=="0" (
  echo Solicitando permissao de administrador...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

echo ============================================================
echo  CENTRAL A-MES - ROTA TEMPORARIA PARA O A-MES
echo ============================================================
echo.
echo Esta acao:
echo - NAO altera DNS, proxy ou gateway padrao;
echo - NAO muda a Internet da Ethernet;
echo - cria apenas uma rota /32 para 172.29.185.215;
echo - vale somente ate reiniciar o Windows ou remover a rota.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
"$ErrorActionPreference='Stop';" ^
"$target='172.29.185.215/32';" ^
"$cfg=Get-NetIPConfiguration | Where-Object { $_.InterfaceAlias -match 'Wi-Fi|Wireless' -and $_.IPv4Address.IPAddress -like '172.29.*' -and $_.IPv4DefaultGateway.NextHop -like '172.29.*' } | Select-Object -First 1;" ^
"if(-not $cfg){ throw 'Nao encontrei Wi-Fi OPPO com IP/gateway 172.29.x.x.' };" ^
"$ifIndex=$cfg.InterfaceIndex; $gw=$cfg.IPv4DefaultGateway.NextHop; $ip=$cfg.IPv4Address.IPAddress;" ^
"Write-Host ('Wi-Fi OPPO: ' + $cfg.InterfaceAlias + ' / IP ' + $ip + ' / GW ' + $gw + ' / ifIndex ' + $ifIndex);" ^
"Get-NetRoute -DestinationPrefix $target -ErrorAction SilentlyContinue | Remove-NetRoute -Confirm:$false -ErrorAction SilentlyContinue;" ^
"New-NetRoute -DestinationPrefix $target -InterfaceIndex $ifIndex -NextHop $gw -RouteMetric 1 -PolicyStore ActiveStore | Out-Null;" ^
"Write-Host 'Rota temporaria criada.';" ^
"Write-Host '';" ^
"Get-NetRoute -DestinationPrefix $target | Select-Object DestinationPrefix,InterfaceAlias,NextHop,RouteMetric,PolicyStore | Format-Table -AutoSize;" ^
"Write-Host '';" ^
"$c=New-Object System.Net.Sockets.TcpClient; try{$ar=$c.BeginConnect('172.29.185.215',80,$null,$null); if(-not $ar.AsyncWaitHandle.WaitOne(5000,$false)){throw 'TIMEOUT'}; $c.EndConnect($ar); Write-Host 'Teste TCP 80: OK'}catch{Write-Host ('Teste TCP 80: FALHOU - ' + $_.Exception.Message)}finally{$c.Close()}"

echo.
echo Se o teste estiver OK:
echo 1. Reconecte/mantenha o cabo Ethernet.
echo 2. Atualize http://172.29.185.215/asymes no navegador.
echo.
echo Para desfazer sem reiniciar, execute:
echo 13_REMOVER_ROTA_AMES_TEMPORARIA.bat
echo.
pause
