@echo off
setlocal EnableExtensions
title Central V2 - Garantir rota persistente A-MES

set "TARGET=172.29.185.215/32"

rem Primeiro verifica sem elevacao. Se a rota ativa + persistente ja estiverem
rem corretas para a interface OPPO atual, nao abre UAC e nao altera nada.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
"$target='%TARGET%';" ^
"$cfg=Get-NetIPConfiguration | Where-Object { $_.IPv4Address.IPAddress -like '172.29.*' -and $_.IPv4DefaultGateway.NextHop -like '172.29.*' } | Select-Object -First 1;" ^
"if(-not $cfg){exit 3};" ^
"$ifIndex=$cfg.InterfaceIndex;$gw=$cfg.IPv4DefaultGateway.NextHop;" ^
"$a=Get-NetRoute -DestinationPrefix $target -PolicyStore ActiveStore -ErrorAction SilentlyContinue | Where-Object { $_.InterfaceIndex -eq $ifIndex -and $_.NextHop -eq $gw } | Select-Object -First 1;" ^
"$p=Get-NetRoute -DestinationPrefix $target -PolicyStore PersistentStore -ErrorAction SilentlyContinue | Where-Object { $_.InterfaceIndex -eq $ifIndex -and $_.NextHop -eq $gw } | Select-Object -First 1;" ^
"if($a -and $p){exit 0};exit 2" >nul 2>nul
set "CHECK_RC=%errorlevel%"
if "%CHECK_RC%"=="0" (
  echo [OK] Rota A-MES ativa e persistente ja esta correta.
  exit /b 0
)
if "%CHECK_RC%"=="3" (
  echo [ERRO] Nao encontrei interface OPPO com IP/gateway 172.29.x.x.
  echo        Conecte o TAXXX_5G e tente novamente.
  exit /b 3
)

rem Reparar/criar rota exige administrador. O processo elevado e aguardado;
rem assim o launcher nunca continua enquanto a rota ainda esta sendo criada.
net session >nul 2>&1
if not "%errorlevel%"=="0" (
  echo Solicitando administrador uma unica vez para tornar a rota A-MES persistente...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$p=Start-Process -FilePath '%~f0' -ArgumentList '/elevated' -Verb RunAs -Wait -PassThru; exit $p.ExitCode"
  exit /b %errorlevel%
)

:elevated
echo ============================================================
echo  CENTRAL V2 - ROTA PERSISTENTE E AUTO-REPARAVEL A-MES
echo ============================================================
echo - nao altera DNS, proxy ou gateway padrao;
echo - nao muda a Internet da Ethernet;
echo - cria somente 172.29.185.215/32 pela interface OPPO;
echo - persiste apos reiniciar o Windows;
echo - o launcher revalida e repara se interface/gateway mudarem.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
"$ErrorActionPreference='Stop';" ^
"$target='%TARGET%';" ^
"$cfg=Get-NetIPConfiguration | Where-Object { $_.IPv4Address.IPAddress -like '172.29.*' -and $_.IPv4DefaultGateway.NextHop -like '172.29.*' } | Select-Object -First 1;" ^
"if(-not $cfg){ throw 'Nao encontrei uma interface OPPO com IP/gateway 172.29.x.x. Conecte TAXXX_5G primeiro.' };" ^
"$ifIndex=$cfg.InterfaceIndex;$gw=$cfg.IPv4DefaultGateway.NextHop;" ^
"foreach($store in @('ActiveStore','PersistentStore')){Get-NetRoute -DestinationPrefix $target -PolicyStore $store -ErrorAction SilentlyContinue | Remove-NetRoute -Confirm:$false -ErrorAction SilentlyContinue};" ^
"New-NetRoute -DestinationPrefix $target -InterfaceIndex $ifIndex -NextHop $gw -RouteMetric 1 | Out-Null;" ^
"$active=Get-NetRoute -DestinationPrefix $target -PolicyStore ActiveStore -ErrorAction Stop | Where-Object { $_.InterfaceIndex -eq $ifIndex -and $_.NextHop -eq $gw } | Select-Object -First 1;" ^
"$persistent=Get-NetRoute -DestinationPrefix $target -PolicyStore PersistentStore -ErrorAction Stop | Where-Object { $_.InterfaceIndex -eq $ifIndex -and $_.NextHop -eq $gw } | Select-Object -First 1;" ^
"if(-not $active -or -not $persistent){throw 'A rota nao ficou presente nos stores ativo e persistente.'};" ^
"Write-Host 'ActiveStore:'; $active | Select-Object DestinationPrefix,InterfaceAlias,NextHop,RouteMetric,PolicyStore | Format-Table -AutoSize;" ^
"Write-Host 'PersistentStore:'; $persistent | Select-Object DestinationPrefix,InterfaceAlias,NextHop,RouteMetric,PolicyStore | Format-Table -AutoSize;" ^
"$c=New-Object System.Net.Sockets.TcpClient;try{$ar=$c.BeginConnect('172.29.185.215',80,$null,$null);if(-not $ar.AsyncWaitHandle.WaitOne(5000,$false)){throw 'TIMEOUT'};$c.EndConnect($ar);Write-Host 'Teste TCP A-MES 80: OK'}catch{Write-Host ('Teste TCP A-MES 80: FALHOU - '+$_.Exception.Message);exit 2}finally{$c.Close()}"

if errorlevel 1 exit /b %errorlevel%
echo [OK] Rota A-MES persistente pronta.
exit /b 0
