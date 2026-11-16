$ErrorActionPreference='Stop'
$Root=$PSScriptRoot
$Python=Join-Path $Root '.venv\Scripts\python.exe'
$Entry=Join-Path $Root 'ames-agent\at_viewer_entry.py'
$Data=Join-Path $Root 'ames-agent\data'
$Port=8765

try {
 if(-not(Test-Path -LiteralPath (Join-Path $Root 'AT_INSTALLADO.ok'))){throw 'Central AT nao instalada. Execute 01_INSTALAR_AT.bat do pendrive primeiro.'}
 if(-not(Test-Path -LiteralPath $Python) -or -not(Test-Path -LiteralPath $Entry)){throw 'Python ou servidor AT ausente; instalacao incompleta.'}
 $existing=@(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
 if($existing.Count){
  $expectedPython=[IO.Path]::GetFullPath($Python)
  $expectedEntry=[IO.Path]::GetFullPath($Entry)
  foreach($owner in @($existing|Select-Object -ExpandProperty OwningProcess -Unique)){
   $process=Get-CimInstance Win32_Process -Filter "ProcessId=$owner" -ErrorAction Stop
   $binary=[string]$process.ExecutablePath
   $command=[string]$process.CommandLine
   if(-not $process -or -not $binary.Equals($expectedPython,[StringComparison]::OrdinalIgnoreCase) -or
      $command.IndexOf($expectedEntry,[StringComparison]::OrdinalIgnoreCase) -lt 0){
    throw 'Porta 8765 pertence a outro processo ou identidade nao comprovada. Nao interromper nem reutilizar.'
   }
  }
  $valid=$false
  try {
   $probe=Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8765/api/v1/at/session' -TimeoutSec 2
   $body=$probe.Content|ConvertFrom-Json
   if($body.ok -eq $true -or $body.ok -eq $false){$valid=$true}
  }catch{
   $valid=$false
   if($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 401){$valid=$true}
  }
  if(-not $valid){throw 'Porta 8765 ocupada por outro sistema. Nao encerrar ou substituir processos existentes.'}
  Write-Host '[AT] Servidor local ja em execucao. Reutilizando sem interrupcao.'
 } else {
  New-Item -ItemType Directory -Path $Data -Force|Out-Null
  $out=Join-Path $Data 'at_stdout.log';$err=Join-Path $Data 'at_stderr.log'
  $process=Start-Process -FilePath $Python -WorkingDirectory $Root -ArgumentList ('-B "'+$Entry+'"') `
    -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err -PassThru
  $valid=$false
  for($i=0;$i -lt 25;$i++){
   Start-Sleep -Milliseconds 700
   $process.Refresh()
   if($process.HasExited){throw ('Servidor AT encerrou antes de abrir. Confira '+$err)}
   try {
    $resp=Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8765/api/v1/at/session' -TimeoutSec 1
    if($resp.StatusCode -eq 200){$valid=$true;break}
   }catch {
    if($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 401){$valid=$true;break}
   }
  }
  if(-not $valid){throw ('Servidor AT nao respondeu. Consulte '+$err)}
  Write-Host '[AT] Servidor restrito ativo somente no localhost.'
 }
 $chrome=Join-Path $Root '05_ABRIR_CHROME_AMES.bat'
 if(Test-Path -LiteralPath $chrome){
  & $chrome
  if($LASTEXITCODE -ne 0){Write-Warning 'Chrome A-MES indisponivel. Confira a rede OPPO e o login MES; o portal AT permanece local.'}
 }
 Start-Process 'http://127.0.0.1:8765/at/'
 Write-Host '[OK] Central AT iniciada. Somente Consulta por SN disponivel.' -ForegroundColor Green
 exit 0
}catch {
 Write-Host ('[AT ERRO] '+$_.Exception.Message) -ForegroundColor Red
 exit 1
}
