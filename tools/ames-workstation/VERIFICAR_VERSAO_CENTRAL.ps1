param([string]$Root=$PSScriptRoot)
# Read-only identity gate. No port takeover, process stop, cache deletion,
# database read, credentials, network route or environment modification.
$ErrorActionPreference='Stop'

try {
  $Root=[IO.Path]::GetFullPath($Root).TrimEnd('\')
  $manifestPath=Join-Path $Root 'CANDIDATE_MANIFEST.json'
  if(-not(Test-Path -LiteralPath $manifestPath -PathType Leaf)){
    throw 'Manifesto da candidata ausente nesta pasta.'
  }
  $manifest=Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  $expected=[string]$manifest.sha
  if($expected -cnotmatch '^[0-9a-f]{40}$' -or $manifest.development -or -not $manifest.standalone_clean){
    throw 'Candidata sem identidade SHA valida e finalizada.'
  }
  $moduleName='frontend/Central-de-Controle-/ames/console-specialized-views.mjs'
  $moduleHash=$manifest.files.PSObject.Properties[$moduleName]
  if(-not $moduleHash){throw 'O manifesto nao inclui o modulo Rastreabilidade.'}

  # HTTP is requested by PowerShell, not by the browser/service worker.
  # A unique query parameter prevents intermediary HTTP caching.
  $base='http://127.0.0.1:8765'
  $release=Invoke-RestMethod -Uri ($base+'/release-build.json?verify='+$expected) -TimeoutSec 8 -Headers @{'Cache-Control'='no-cache'}
  $actual=[string]$release.sha
  if($actual -cne $expected){
    throw "VERSAO_DIVERGENTE: pacote $expected; servidor 8765 $actual. Nao coletar nem atualizar sobre esta instalacao."
  }
  $module=Invoke-WebRequest -Uri ($base+'/Central-de-Controle-/ames/console-specialized-views.mjs?verify='+$expected) -UseBasicParsing -TimeoutSec 8 -Headers @{'Cache-Control'='no-cache'}
  $bytes=$module.RawContentStream.ToArray()
  $sha256=[Security.Cryptography.SHA256]::Create()
  try{
    $servedHash=[BitConverter]::ToString($sha256.ComputeHash($bytes)).Replace('-','').ToLowerInvariant()
  }finally{$sha256.Dispose()}
  if($servedHash -cne ([string]$moduleHash.Value).ToLowerInvariant()){
    throw 'MODULO_DIVERGENTE: Rastreabilidade servida pela porta 8765 nao coincide com o pacote desta pasta.'
  }
  if(([string]$module.Content) -notmatch 'history_only'){
    throw 'Rastreabilidade servida nao contem a etapa Horarios antigos/3012.'
  }
  Write-Host ('VERSAO_CENTRAL=CONFIRMADA SHA='+$expected) -ForegroundColor Green
  Write-Host 'Servidor local e modulo Rastreabilidade coincidem com o ZIP.'
  Write-Host 'ATENCAO: navegador pode ainda estar mostrando cache antigo; nao foi verificada a identidade do banco de dados.' -ForegroundColor Yellow
  exit 0
}catch{
  Write-Host ('VERSAO_CENTRAL=BLOQUEADA: '+$_.Exception.Message) -ForegroundColor Red
  Write-Host 'Nao excluir cache, SQLite, token ou pasta antiga. Nao repetir coletas para contornar o problema.' -ForegroundColor Yellow
  exit 1
}
