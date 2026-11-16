$ErrorActionPreference='Stop'
$Root=Split-Path -Parent $PSScriptRoot
$Vendor=Join-Path $Root 'vendor-at'
$PythonDir=Join-Path $Vendor 'python';$ChromeDir=Join-Path $Vendor 'chrome';$Wheels=Join-Path $Vendor 'wheels'

function Assert-OfficialSignature([string]$Path,[string]$Publisher) {
 $signature=Get-AuthenticodeSignature -LiteralPath $Path
 if($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch $Publisher) {
  throw ('Assinatura digital nao comprovada: '+$Path+' · '+$signature.Status)
 }
}

function Download-Official([string]$Uri,[string]$Destination,[string]$Publisher) {
 if(-not(Test-Path -LiteralPath $Destination)){
  Write-Host ('[AT] Baixando do fornecedor oficial: '+$Uri)
  $temporary=[IO.Path]::ChangeExtension($Destination,$null)+'.download'+[IO.Path]::GetExtension($Destination)
  if(Test-Path -LiteralPath $temporary){Remove-Item -LiteralPath $temporary -Force}
  Invoke-WebRequest -Uri $Uri -OutFile $temporary -UseBasicParsing -TimeoutSec 600
  Assert-OfficialSignature $temporary $Publisher
  Move-Item -LiteralPath $temporary -Destination $Destination
 }
 Assert-OfficialSignature $Destination $Publisher
}

try {
 Write-Host '=== PREPARACAO UNICA DO PACOTE AT - APENAS NO PC ADMINISTRADOR ==='
 Write-Host 'Requer internet neste computador; o PC do AT NUNCA precisara de internet externa.'
 New-Item -ItemType Directory -Force -Path $PythonDir,$ChromeDir,$Wheels|Out-Null
 Download-Official 'https://www.python.org/ftp/python/3.12.10/python-3.12.10-amd64.exe' `
  (Join-Path $PythonDir 'python-3.12.10-amd64.exe') 'Python Software Foundation'
 Download-Official 'https://dl.google.com/dl/chrome/install/googlechromestandaloneenterprise64.msi' `
  (Join-Path $ChromeDir 'GoogleChromeStandaloneEnterprise64.msi') 'Google LLC|Google Inc'
 $Python=Join-Path $Root '.venv\Scripts\python.exe'
 if(-not(Test-Path -LiteralPath $Python)) {
  $search=@('C:\Program Files\Python312\python.exe',(Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe'))
  $Python=@($search|Where-Object{Test-Path -LiteralPath $_}|Select-Object -First 1)
  if($Python){$Python=$Python[0]}
 }
 if(-not $Python -or -not(Test-Path -LiteralPath $Python)) {
  throw 'Python 3.12 nao encontrado neste PC. Abra a Central local instalada ou instale o Python 3.12 oficial neste PC administrador.'
 }
 & $Python -c "import sys,platform;assert sys.version_info[:2]==(3,12) and platform.system()=='Windows' and platform.architecture()[0]=='64bit'"
 if($LASTEXITCODE -ne 0){throw 'Preparacao de bibliotecas deve rodar em Python 3.12 Windows x64 no PC administrador.'}
 $Requirements=Join-Path $Root 'ames-agent\requirements.txt'
 if(-not(Test-Path -LiteralPath $Requirements)){throw 'requirements.txt ausente; Central local precisa ser atualizada antes.'}
 Write-Host '[AT] Preparando bibliotecas completas de Windows para uso sem rede...'
 & $Python -m pip wheel --wheel-dir $Wheels -r $Requirements
 if($LASTEXITCODE -ne 0){throw 'Nao foi possivel preparar todas as dependencias. Confira o acesso a PyPI neste PC.'}
 & $Python -m pip install --dry-run --ignore-installed --no-index --find-links $Wheels -r $Requirements
 if($LASTEXITCODE -ne 0){throw 'Verificacao sem internet falhou: faltam bibliotecas no pendrive.'}
 $files=@{}
 $installers=@((Join-Path $PythonDir 'python-3.12.10-amd64.exe'),(Join-Path $ChromeDir 'GoogleChromeStandaloneEnterprise64.msi'))
 $wheelFiles=@(Get-ChildItem -LiteralPath $Wheels -Filter '*.whl' -File|Select-Object -ExpandProperty FullName)
 foreach($path in @($installers+$wheelFiles)){
  $relative=$path.Substring($Vendor.Length+1).Replace('\','/')
  $files[$relative]=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
 }
 if(@($files.Keys|Where-Object{$_ -like 'wheels/*'}).Count -lt 1){throw 'Nenhuma biblioteca wheel foi preparada.'}
 $stamp=@{schema='central-at-vendor-preflight-v1';platform='Windows';arch='amd64';python_version='3.12';
   requirements_sha256=(Get-FileHash -LiteralPath $Requirements -Algorithm SHA256).Hash.ToLowerInvariant();
   prepared_at_utc=[DateTime]::UtcNow.ToString('o');files=$files}
 $stamp|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $Vendor 'PREPARACAO_AT_OK.json') -Encoding UTF8
 Write-Host '[OK] Python, Chrome e bibliotecas preparados no PC administrador.' -ForegroundColor Green
 Write-Host 'Agora volte a Central: Usuarios AT > Gerar instalador AT offline para pendrive.'
 exit 0
}catch {
 Write-Host ('[AT ERRO] '+$_.Exception.Message) -ForegroundColor Red
 Write-Host 'Nenhum arquivo foi preparado no PC do tecnico; nao leve pacote parcial.'
 exit 1
}
