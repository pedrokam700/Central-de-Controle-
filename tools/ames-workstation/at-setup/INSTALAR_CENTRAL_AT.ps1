$ErrorActionPreference='Stop'
$Source=(Resolve-Path -LiteralPath $PSScriptRoot).Path
$Target=Join-Path $env:ProgramFiles 'CentralAT'
$Staging=$null

function Assert-Administrator {
 $user=[Security.Principal.WindowsIdentity]::GetCurrent()
 $principal=New-Object Security.Principal.WindowsPrincipal($user)
 return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
function Assert-SignedInstaller([string]$Path,[string]$Publisher){
 $signature=Get-AuthenticodeSignature -LiteralPath $Path
 if($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch $Publisher){
  throw ('Instalador oficial sem assinatura valida: '+[IO.Path]::GetFileName($Path))
 }
}

try {
 if(-not (Assert-Administrator)) {
  Write-Host '[AT] Solicitando autorizacao de administrador para instalar somente a Central AT.'
  $argumentLine='-NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $Source 'INSTALAR_CENTRAL_AT.ps1')+'"'
  $child=Start-Process -FilePath 'powershell.exe' -ArgumentList $argumentLine -Verb RunAs -Wait -PassThru
  if($child.ExitCode -ne 0){throw 'Instalacao com permissao administrativa nao concluida.'}
  exit 0
 }
 if(Test-Path -LiteralPath (Join-Path $Target 'AT_INSTALLADO.ok')) {
  Write-Host '[AT] Central AT ja instalada. Nenhum dado foi sobrescrito.'
  exit 0
 }
 if(Test-Path -LiteralPath $Target){throw 'Existe instalacao AT parcial ou antiga. Nao substituir sem procedimento de recuperacao.'}
 $manifestPath=Join-Path $Source 'AT_PACKAGE_MANIFEST.json'
 if(-not(Test-Path -LiteralPath $manifestPath)){throw 'Manifesto AT ausente. Extraia o ZIP inteiro no mesmo diretorio.'}
 $manifest=Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8|ConvertFrom-Json
 if($manifest.schema -ne 'central-at-offline-package-v1' -or $manifest.internet_needed_on_at_pc){throw 'Pacote AT nao certificado para uso offline.'}
 foreach($item in $manifest.files.PSObject.Properties){
  $name=$item.Name
  if([IO.Path]::IsPathRooted($name) -or $name -match '(^|[\\/])\.\.([\\/]|$)'){throw 'Caminho inseguro no manifesto.'}
  $file=Join-Path $Source $name
  if(-not(Test-Path -LiteralPath $file -PathType Leaf)){throw ('Arquivo ausente: '+$name)}
  if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ine $item.Value){throw ('Integridade incorreta: '+$name)}
 }
 $pythonInstaller=Join-Path $Source 'vendor\python\python-3.12.10-amd64.exe'
 $chromeInstaller=Join-Path $Source 'vendor\chrome\GoogleChromeStandaloneEnterprise64.msi'
 $wheelhouse=Join-Path $Source 'vendor\wheels'
 if(-not(Test-Path -LiteralPath $pythonInstaller) -or -not(Test-Path -LiteralPath $chromeInstaller) -or
    -not @(Get-ChildItem -LiteralPath $wheelhouse -Filter '*.whl' -File -ErrorAction SilentlyContinue).Count){
  throw 'Dependencias offline incompletas. Nenhum download sera feito neste PC.'
 }
 Assert-SignedInstaller $pythonInstaller 'Python Software Foundation'
 Assert-SignedInstaller $chromeInstaller 'Google LLC|Google Inc'
 $pythonCandidates=@('C:\Program Files\Python312\python.exe',
  (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe'))
 $Python=@($pythonCandidates|Where-Object{Test-Path -LiteralPath $_}|Select-Object -First 1)
 if(-not $Python){
  Write-Host '[AT] Instalando Python incluido no pendrive (offline)...'
  $installer=Start-Process -FilePath $pythonInstaller -ArgumentList '/quiet InstallAllUsers=1 PrependPath=0 Include_pip=1 Include_test=0' -Wait -PassThru
  if($installer.ExitCode -ne 0){throw ('Python retornou '+$installer.ExitCode)}
  $Python=@($pythonCandidates|Where-Object{Test-Path -LiteralPath $_}|Select-Object -First 1)
 }
 if(-not $Python){throw 'Python 3.12 nao encontrado apos instalacao.'}
 $Python=$Python[0]
 & $Python -c "import sys;assert sys.version_info[:2]==(3,12) and sys.maxsize>2**32"
 if($LASTEXITCODE -ne 0){throw 'Python instalado nao e 3.12 x64.'}
 $chrome=@('C:\Program Files\Google\Chrome\Application\chrome.exe',
  'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe')
 if(-not @($chrome|Where-Object{Test-Path -LiteralPath $_}).Count){
  Write-Host '[AT] Instalando Chrome Enterprise incluido no pendrive (offline)...'
  $chromeJob=Start-Process -FilePath 'msiexec.exe' -ArgumentList @('/i','"'+$chromeInstaller+'"','/qn','/norestart') -Wait -PassThru
  if($chromeJob.ExitCode -ne 0){throw ('Chrome retornou '+$chromeJob.ExitCode)}
 }
 if(-not @($chrome|Where-Object{Test-Path -LiteralPath $_}).Count){throw 'Google Chrome nao encontrado apos instalacao.'}
 # Assemble and validate in a new sibling first. An interrupted install must
 # never leave CentralAT looking like a completed workstation.
 $Staging=Join-Path $env:ProgramFiles ('CentralAT.__installing_'+[guid]::NewGuid().ToString('N'))
 Write-Host '[AT] Preparando instalacao AT isolada, sem modificar outra Central...'
 New-Item -ItemType Directory -Path $Staging -ErrorAction Stop|Out-Null
 foreach($folder in @('ames-agent','factory-engine','frontend','accounts')){
  Copy-Item -LiteralPath (Join-Path $Source $folder) -Destination $Staging -Recurse -Force
 }
 foreach($name in @('INICIAR_CENTRAL_AT.ps1','05_ABRIR_CHROME_AMES.bat','02_ABRIR_AT.bat','AT_PACKAGE_MANIFEST.json')){
  if($name -eq 'AT_PACKAGE_MANIFEST.json'){$origin=$manifestPath}else{$origin=Join-Path $Source $name}
  Copy-Item -LiteralPath $origin -Destination $Staging -Force
 }
 Copy-Item -LiteralPath (Join-Path $Staging 'ames-agent\config.example.json') -Destination (Join-Path $Staging 'ames-agent\config.json')
 $configPath=Join-Path $Staging 'ames-agent\config.json'
 $config=Get-Content -LiteralPath $configPath -Raw -Encoding UTF8|ConvertFrom-Json
 $config.allowed_origins=@()
 $config.host='127.0.0.1'
 $config.port=8765
 $config.auto_3028.ready=$false
 $config.auto_3022.ready=$false
 $config|ConvertTo-Json -Depth 32|Set-Content -LiteralPath $configPath -Encoding UTF8
 $data=Join-Path $Staging 'ames-agent\data'
 New-Item -ItemType Directory -Path $data -Force|Out-Null
 & icacls.exe $data /grant '*S-1-5-11:(OI)(CI)M' /T|Out-Null
 if($LASTEXITCODE -ne 0){throw 'Nao foi possivel configurar acesso ao banco local para o AT.'}
 & $Python -m venv (Join-Path $Staging '.venv')
 if($LASTEXITCODE -ne 0){throw 'Nao foi possivel criar ambiente Python AT.'}
 $Vpy=Join-Path $Staging '.venv\Scripts\python.exe'
 & $Vpy -m pip install --disable-pip-version-check --no-index --find-links $wheelhouse -r (Join-Path $Staging 'ames-agent\requirements.txt')
 if($LASTEXITCODE -ne 0){throw 'Wheelhouse Windows incompleta. Nenhum download foi tentado.'}
 & $Vpy -c 'import pandas,openpyxl,playwright,pyautogui,pyperclip;from zoneinfo import ZoneInfo;ZoneInfo("America/Sao_Paulo")'
 if($LASTEXITCODE -ne 0){throw 'Bibliotecas do motor A-MES ausentes.'}
 & $Vpy -c 'import sys;sys.path.insert(0,sys.argv[1]);import at_profiles,at_viewer_entry;at_profiles.AtProfiles(at_viewer_entry.USERS_FILE).list_public()' (Join-Path $Staging 'ames-agent')
 if($LASTEXITCODE -ne 0){throw 'Servidor AT e credenciais nao passaram no autoteste.'}
 'central-at-offline-v1'|Set-Content -LiteralPath (Join-Path $Staging 'AT_INSTALLADO.ok') -Encoding Ascii
 if(Test-Path -LiteralPath $Target){throw 'Outra instalacao AT apareceu durante a preparacao. Nada sera sobrescrito.'}
 Move-Item -LiteralPath $Staging -Destination $Target -ErrorAction Stop
 $Staging=$null
 Write-Host '[OK] Central AT instalada sem acessar a internet. O monitor/coletor nao foi habilitado.' -ForegroundColor Green
 Write-Host 'Para iniciar: abra 02_ABRIR_AT.bat na pasta CentralAT.'
 exit 0
}catch{
 Write-Host ('[AT ERRO] '+$_.Exception.Message) -ForegroundColor Red
 if($Staging -and (Test-Path -LiteralPath $Staging)){
  # Only our unique temporary directory, created during this invocation.
  try{Remove-Item -LiteralPath $Staging -Recurse -Force -ErrorAction Stop
   Write-Host '[AT] Preparacao incompleta removida. A instalacao pode ser repetida.'
  }catch{Write-Host '[AT] Restou uma pasta temporaria isolada; solicite a TI para conferir.'}
 }
 Write-Host 'O instalador parou. Banco e arquivos de outras Centrais nao foram modificados.'
 exit 1
}
