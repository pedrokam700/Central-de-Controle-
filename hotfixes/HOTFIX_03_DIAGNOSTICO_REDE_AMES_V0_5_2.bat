@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Central A-MES - Diagnostico V0.5.2
color 0F

if not exist "logs" mkdir "logs" >nul 2>nul

for /f "delims=" %%T in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "TS=%%T"
set "LOG=%~dp0logs\diagnostico_rede_%TS%.txt"

echo ============================================================
echo   DIAGNOSTICO CENTRAL / REDE OPPO / A-MES - V0.5.2
echo ============================================================
echo.
echo O resultado tambem sera salvo em:
echo %LOG%
echo.

call :DIAG > "%LOG%" 2>&1

type "%LOG%"

echo.
echo ============================================================
echo [FIM] Diagnostico concluido.
echo Log salvo em:
echo %LOG%
echo ============================================================
echo.
echo Esta janela vai permanecer aberta ate voce pressionar uma tecla.
pause
exit /b 0

:DIAG
echo [1] Adaptadores ativos
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='SilentlyContinue'; Get-NetAdapter | Where-Object Status -eq 'Up' | Select-Object Name,InterfaceDescription,LinkSpeed | Format-Table -AutoSize"
echo.

echo [2] Rota escolhida pelo Windows para 172.29.185.215
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='SilentlyContinue'; $r=Find-NetRoute -RemoteIPAddress 172.29.185.215; if($r){$r | Select-Object InterfaceAlias,NextHop,RouteMetric,InterfaceMetric | Format-List}else{Write-Host 'SEM ROTA'}"
echo.

echo [3] Teste TCP A-MES 172.29.185.215:80
powershell -NoProfile -ExecutionPolicy Bypass -Command "$hostName='172.29.185.215';$port=80;$timeout=5000;$c=New-Object System.Net.Sockets.TcpClient; try{$ar=$c.BeginConnect($hostName,$port,$null,$null); if(-not $ar.AsyncWaitHandle.WaitOne($timeout,$false)){throw 'TIMEOUT'}; $c.EndConnect($ar); Write-Host 'TCP 80: TRUE'}catch{Write-Host ('TCP 80: FALSE - ' + $_.Exception.Message)}finally{$c.Close()}"
echo.

echo [4] Teste HTTP A-MES
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; try{$r=Invoke-WebRequest -UseBasicParsing 'http://172.29.185.215/' -TimeoutSec 5; Write-Host ('HTTP: RESPOSTA ' + [int]$r.StatusCode)}catch{if($_.Exception.Response){try{Write-Host ('HTTP: RESPOSTA ' + [int]$_.Exception.Response.StatusCode.value__)}catch{Write-Host 'HTTP: RESPOSTA DO SERVIDOR'}}else{Write-Host ('HTTP: SEM RESPOSTA - ' + $_.Exception.Message)}}"
echo.

echo [5] Chrome de automacao / CDP 9222
powershell -NoProfile -ExecutionPolicy Bypass -Command "try{$x=Invoke-RestMethod 'http://127.0.0.1:9222/json/version' -TimeoutSec 2; Write-Host ('CDP: OK - ' + $x.Browser)}catch{Write-Host 'CDP: NAO CONECTADO (normal antes de abrir a Central A-MES)'}"
echo.

echo [6] Agente local 8765
powershell -NoProfile -ExecutionPolicy Bypass -Command "try{$x=Invoke-RestMethod 'http://127.0.0.1:8765/api/v1/health' -TimeoutSec 2; Write-Host 'AGENTE: OK'; $x | ConvertTo-Json -Depth 4}catch{Write-Host 'AGENTE: NAO CONECTADO (normal antes de abrir a Central A-MES)'}"
echo.

echo [7] Resumo de rota IPv4
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='SilentlyContinue'; Get-NetIPConfiguration | Where-Object {$_.IPv4Address} | ForEach-Object { [pscustomobject]@{Interface=$_.InterfaceAlias;IPv4=($_.IPv4Address.IPAddress -join ',');Gateway=($_.IPv4DefaultGateway.NextHop -join ',');DNS=($_.DNSServer.ServerAddresses -join ',')} } | Format-Table -AutoSize"
echo.

echo IMPORTANTE:
echo - Este diagnostico NAO altera rota, proxy, DNS ou configuracoes de rede.
echo - O Chrome dedicado separa sessao/perfil do A-MES, mas a rota de rede e do Windows.
echo - CDP 9222 e agente 8765 podem aparecer desconectados antes do 02_ABRIR_CENTRAL_AMES.bat.
echo.
exit /b 0
