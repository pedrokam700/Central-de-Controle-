# Temporary, read-only pairing fallback on an already-authorized factory PC.
# No files copied, no processes stopped, no SQLite/config/source_id changes.
# The browser consumes the capability from the URL fragment into sessionStorage.
$ErrorActionPreference = 'Stop'
try {
  $ready = Invoke-RestMethod -Uri 'http://127.0.0.1:8765/api/v1/ready' -TimeoutSec 5
  if (-not $ready.ok -or -not $ready.ready -or $ready.agent_build -ne 'CANONICAL-R11-BATCH' -or
      [int]$ready.pid -le 0) { throw 'Agente canonico nao comprovado' }
  $proc = Get-CimInstance Win32_Process -Filter ("ProcessId = " + [int]$ready.pid)
  if (-not $proc) { throw 'Processo local nao identificado' }
  $entry = [regex]::Match([string]$proc.CommandLine,
    '(?i)[A-Z]:\\[^"]*?\\ames-agent\\agent_hardened_entry\.py')
  if (-not $entry.Success) { throw 'Script canonico nao comprovado' }
  $agentDir = Split-Path -Path $entry.Value -Parent
  $file = Join-Path $agentDir 'data\local_agent_token'
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
    throw 'Token existente do agente nao localizado; nao sera criado outro' }
  $token = (Get-Content -LiteralPath $file -Raw -ErrorAction Stop).Trim()
  if ($token -cnotmatch '^[A-Za-z0-9_-]{32,}$') {
    throw 'Token local invalido; nenhum novo token sera criado' }
  # Hash fragment is not sent to Github Pages. Do not echo the URL or token.
  $dest = 'https://pedrokam700.github.io/Central-de-Controle-/#ames_agent_token=' +
          [uri]::EscapeDataString($token)
  $edge = @(
    (Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } | Select-Object -First 1
  if (-not $edge) { throw 'Microsoft Edge nao localizado; nenhuma URL privada foi aberta' }
  Start-Process -FilePath $edge -ArgumentList @('--new-tab', $dest) -ErrorAction Stop
  Clear-Variable token,dest -ErrorAction SilentlyContinue
  Write-Host 'OK: Central HTTPS aberta no Edge. Confira Agente local conectado.'
  Write-Host 'Nao compartilhe a barra de endereco ate o fragmento de autorizacao desaparecer.'
} catch {
  Clear-Variable token,dest -ErrorAction SilentlyContinue
  Write-Host 'NAO CONECTADO: nao foi possivel confirmar este posto. Nenhum arquivo ou processo foi modificado.'
}
