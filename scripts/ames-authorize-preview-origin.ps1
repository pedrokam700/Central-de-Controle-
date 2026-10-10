param(
  [string]$Origin = 'https://central-cora-v2-git-v2-console-parity-r12-pedrokam700-6477.vercel.app',
  [string]$ConfigPath = ''
)

$ErrorActionPreference = 'Stop'
$ApprovedOrigins = @(
  'https://central-cora-v2.vercel.app',
  'https://central-cora-v2-git-v2-console-parity-r12-pedrokam700-6477.vercel.app'
)

# Fail closed: no wildcard and no arbitrary Vercel origin.
if ($ApprovedOrigins -notcontains $Origin) {
  throw "Origem recusada: $Origin"
}

$candidates = @()
if ($ConfigPath) { $candidates += $ConfigPath }
$candidates += @(
  (Join-Path $PSScriptRoot '..\ames\agent\config.json'),
  (Join-Path $PSScriptRoot '..\ames-agent\config.json'),
  (Join-Path (Get-Location) 'ames-agent\config.json'),
  (Join-Path (Get-Location) 'ames\agent\config.json')
)

$config = $null
foreach ($candidate in $candidates) {
  if ($candidate -and (Test-Path -LiteralPath $candidate)) {
    $config = (Resolve-Path -LiteralPath $candidate).Path
    break
  }
}
if (-not $config) {
  throw 'config.json do agente não encontrado. Informe -ConfigPath apontando para ames-agent\config.json.'
}

$raw = [IO.File]::ReadAllText($config, [Text.Encoding]::UTF8)
try { $obj = $raw | ConvertFrom-Json } catch { throw "config.json inválido: $($_.Exception.Message)" }

if (-not ($obj.PSObject.Properties.Name -contains 'allowed_origins')) {
  $obj | Add-Member -NotePropertyName allowed_origins -NotePropertyValue @()
}

$origins = @($obj.allowed_origins | ForEach-Object { [string]$_ } | Where-Object { $_ })
if ($origins -notcontains $Origin) { $origins += $Origin }
$obj.allowed_origins = @($origins | Select-Object -Unique)

$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$backup = "$config.preview_origin_$stamp.bak"
Copy-Item -LiteralPath $config -Destination $backup -Force

$json = $obj | ConvertTo-Json -Depth 32
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText($config, $json + [Environment]::NewLine, $utf8NoBom)

Write-Host '[OK] Origem da Central autorizada no agente local:' -ForegroundColor Green
Write-Host "     $Origin"
Write-Host '[OK] Backup preservado:'
Write-Host "     $backup"
Write-Host 'Reinicie o agente local para aplicar a configuração.'
