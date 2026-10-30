param(
  [Parameter(Mandatory=$true)][string]$Root,
  [switch]$MaintenanceEnrollment,
  [string]$MaintenanceRoot,
  [string]$FixtureMutex
)
# Per-user opt-in guardian. Never opens Chrome, logs into A-MES, collects data or installs updates.
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'ISSUE57_RELAUNCH_ENROLLMENT.ps1')
if($MaintenanceEnrollment){
  Invoke-Issue57RelaunchEnrollment -InstallationRoot $Root -JournalRoot $MaintenanceRoot -Role 'guardian' -MutexName $FixtureMutex
  exit 0
}
if($MaintenanceRoot -or $FixtureMutex){throw 'enrollment_arguments_without_enrollment'}

try { $root=(Resolve-Path -LiteralPath $Root).Path } catch { exit 1 }
$starter=Join-Path $root 'suporte\ames-workstation\START_AGENT_CANONICAL.ps1'
if(-not (Test-Path -LiteralPath $starter)){exit 2}
$mutex=$null
$locked=$false
try {
  # Global names coordinate new guardians across interactive Windows sessions.
  # If Global namespace/ACL access is denied, this guardian must NOT relaunch.
  $mutex=New-Object System.Threading.Mutex($false,'Global\CentralAMES.OperatorGuardian.8765')
  try{$locked=$mutex.WaitOne(0)}catch [System.Threading.AbandonedMutexException]{$locked=$true}
  if(-not $locked){exit 0} # A guardian is already active in this Windows session.
  $logs=Join-Path $root 'logs'
  New-Item -ItemType Directory -Path $logs -Force|Out-Null
  $file=Join-Path $logs 'agent_guardian.log'
  # A future updater must hold this mutex across its critical section and
  # persist the journal BEFORE the agent stops. The marker is intentionally
  # fail-closed: even a crash leaves guardian restart suppressed for recovery.
  # This guardian change alone does NOT make the old installed guardian safe.
  $maintenanceDir=Join-Path $root '.ames-update'
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
    $transactionMutex=$null
    $transactionLocked=$false
    try{
      # Hold this shared gate across the actual launcher call. A future updater
      # must take the SAME Global mutex BEFORE any journal or process operation.
      $transactionMutex=New-Object System.Threading.Mutex($false,'Global\CentralAMES.UpdateTransaction.8765')
      try{$transactionLocked=$transactionMutex.WaitOne(0)}catch [System.Threading.AbandonedMutexException]{$transactionLocked=$true}
      if(-not $transactionLocked){
        Record-State 'UPDATE_MUTEX_BUSY; guardian restart suppressed'
      }else{
        $maintenanceBlocked=Test-Issue57RelaunchBlocked $root
        if($maintenanceBlocked){
          Record-State 'UPDATE_DIR_NONEMPTY_OR_UNVERIFIED; guardian restart suppressed pending manual recovery'
        }else{
          $portActive=$false
          try{
            $ready=Invoke-RestMethod -Uri 'http://127.0.0.1:8765/api/v1/ready' -TimeoutSec 3
            if($ready){ Record-State 'PORT_ACTIVE; automatic takeover disabled';$portActive=$true }
          }catch{}
          # Bootstrap is unchanged; it must independently verify PID, package
          # root, mutex and unknown-port owner. A-MES login remains manual.
          if(-not $portActive){
            try{
              & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $starter -Root $root -StartupTimeoutSeconds 45 -MaxAttempts 2 *> $null
              if($LASTEXITCODE -eq 0){Record-State 'STARTED'}else{Record-State 'START_NOT_CONFIRMED'}
            }catch{Record-State 'START_EXCEPTION'}
          }
        }
      }
    }finally{
      if($transactionLocked -and $transactionMutex){$transactionMutex.ReleaseMutex()}
      if($transactionMutex){$transactionMutex.Dispose()}
    }
    Start-Sleep -Seconds 90
  }
}finally{
  if($locked -and $mutex){$mutex.ReleaseMutex()}
  if($mutex){$mutex.Dispose()}
}
