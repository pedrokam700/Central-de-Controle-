param(
  [Parameter(Mandatory=$true)][string]$Root
)
# Per-user opt-in guardian. Never opens Chrome, logs into A-MES, collects data or installs updates.
$ErrorActionPreference='Stop'
try { $root=(Resolve-Path -LiteralPath $Root).Path } catch { exit 1 }
$starter=Join-Path $root 'suporte\ames-workstation\START_AGENT_CANONICAL.ps1'
if(-not (Test-Path -LiteralPath $starter)){exit 2}
$mutex=$null
$locked=$false
try {
  $mutex=New-Object System.Threading.Mutex($false,'Local\CentralAMES.OperatorGuardian')
  try{$locked=$mutex.WaitOne(0)}catch [System.Threading.AbandonedMutexException]{$locked=$true}
  if(-not $locked){exit 0} # A guardian is already active in this Windows session.
  $logs=Join-Path $root 'logs'
  New-Item -ItemType Directory -Path $logs -Force|Out-Null
  $file=Join-Path $logs 'agent_guardian.log'
  $last=''
  function Record-State([string]$message){
    if($message -eq $script:last){return}
    $script:last=$message
    if((Test-Path -LiteralPath $file) -and (Get-Item -LiteralPath $file).Length -gt 262144){
      Move-Item -LiteralPath $file -Destination ($file+'.previous') -Force
    }
    Add-Content -LiteralPath $file -Value ((Get-Date).ToUniversalTime().ToString('o')+' '+$message) -Encoding UTF8
  }
  while($true){
    try{
      $ready=Invoke-RestMethod -Uri 'http://127.0.0.1:8765/api/v1/ready' -TimeoutSec 3
      if($ready){ Record-State 'PORT_ACTIVE; automatic takeover disabled';Start-Sleep -Seconds 75;continue }
    }catch{}
    # Startup script performs strict PID, package-root, mutex and unknown-port validation.
    # It never kills an unrecognized process. A-MES authentication stays manual.
    try{
      & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $starter -Root $root -StartupTimeoutSeconds 45 -MaxAttempts 2 *> $null
      if($LASTEXITCODE -eq 0){Record-State 'STARTED'}else{Record-State 'START_NOT_CONFIRMED'}
    }catch{Record-State 'START_EXCEPTION'}
    Start-Sleep -Seconds 90
  }
}finally{
  if($locked -and $mutex){$mutex.ReleaseMutex()}
  if($mutex){$mutex.Dispose()}
}
