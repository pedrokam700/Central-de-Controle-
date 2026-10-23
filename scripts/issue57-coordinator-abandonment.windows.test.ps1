# Issue #57 B2j: real Windows process crash *fixture*. Never runnable on a
# workstation: only GitHub-hosted Windows CI, random mutex names and temp roots.
# A coordinator that dies after creating claim.lock must leave a durable,
# fail-closed marker even though Windows releases both abandoned mutexes.
$ErrorActionPreference='Stop'
if($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows' -or
   -not $env:RUNNER_TEMP -or -not (Test-Path -LiteralPath $env:RUNNER_TEMP -PathType Container)) {
  throw 'github_windows_runner_fixture_only'
}

$id=[guid]::NewGuid().ToString('N')
$base=Join-Path $env:RUNNER_TEMP ('issue57-coordinator-crash-test-'+$id)
$null=New-Item -ItemType Directory -Path $base -ErrorAction Stop
$magic=Join-Path $base '.issue57_crash_fixture_ONLY'
[IO.File]::WriteAllText($magic,'ISSUE57_DISPOSABLE_NO_PRODUCTION')
$childFile=Join-Path $base 'fixture-child.ps1'
$childSource=@'
param([string]$UpdateName,[string]$BootstrapName,[string]$Root,[string]$Mode)
$ErrorActionPreference='Stop'
$update=[Threading.Mutex]::new($false,$UpdateName)
$bootstrap=[Threading.Mutex]::new($false,$BootstrapName)
$heldUpdate=$false;$heldBootstrap=$false
try {
  $heldUpdate=$update.WaitOne(8000)
  if(-not $heldUpdate){throw 'fixture_update_unavailable'}
  $heldBootstrap=$bootstrap.WaitOne(8000)
  if(-not $heldBootstrap){throw 'fixture_bootstrap_unavailable'}
  if($Mode -eq 'claim') {
    $ledger=Join-Path $Root '.ames-update'
    [IO.Directory]::CreateDirectory($ledger)|Out-Null
    $claim=Join-Path $ledger 'claim.lock'
    $bytes=[Text.Encoding]::UTF8.GetBytes('{"fixture_only":true,"update_authorized":false}')
    $stream=[IO.File]::Open($claim,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try {$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)} finally {$stream.Dispose()}
  } elseif($Mode -ne 'before_claim') {throw 'invalid_fixture_mode'}
  # Parent cannot kill the child until it KNOWS both mutexes are owned.
  [IO.File]::WriteAllText((Join-Path $Root 'child-ready'),$Mode)
  while($true){Start-Sleep -Seconds 1}
} finally {
  if($heldBootstrap){$bootstrap.ReleaseMutex()}
  if($heldUpdate){$update.ReleaseMutex()}
  $bootstrap.Dispose();$update.Dispose()
}
'@
[IO.File]::WriteAllText($childFile,$childSource)
$pwsh=(Get-Command pwsh -ErrorAction Stop).Source

function Assert-AbandonedMutexRecovery([Threading.Mutex]$Mutex,[string]$Stage) {
  $owned=$false;$abandoned=$false
  try {
    try {$owned=$Mutex.WaitOne(0)}
    catch [Threading.AbandonedMutexException] {$owned=$true;$abandoned=$true}
    if(-not $owned -or -not $abandoned){throw ('mutex_was_not_abandoned_'+$Stage)}
  } finally {
    if($owned){$Mutex.ReleaseMutex()}
  }
}

function Invoke-CrashFixture([string]$Mode) {
  if($Mode -notin @('before_claim','claim')){throw 'unexpected_fixture_phase'}
  $case=Join-Path $base $Mode
  $null=New-Item -ItemType Directory -Path $case -ErrorAction Stop
  $updateName='Global\CentralAMES.Issue57CrashUpdateTest.'+$id+'.'+$Mode
  $bootstrapName='Global\CentralAMES.Issue57CrashBootstrapTest.'+$id+'.'+$Mode
  if($updateName -eq 'Global\CentralAMES.UpdateTransaction.8765' -or
     $bootstrapName -eq 'Global\CentralAMES.CanonicalBootstrap.8765') {
    throw 'production_mutex_name_forbidden'
  }
  # Keep observer handles open BEFORE the child acquires both locks. Without
  # these handles, the named kernel mutex ceases to exist at process death;
  # creating a fresh mutex afterwards cannot report an abandoned owner.
  $updateHandle=[Threading.Mutex]::new($false,$updateName)
  $bootstrapHandle=[Threading.Mutex]::new($false,$bootstrapName)
  $child=$null
  try {
  $start=[Diagnostics.ProcessStartInfo]::new()
  $start.FileName=$pwsh
  $start.UseShellExecute=$false
  $start.CreateNoWindow=$true
  foreach($arg in @('-NoProfile','-NonInteractive','-File',$childFile,
                    '-UpdateName',$updateName,'-BootstrapName',$bootstrapName,
                    '-Root',$case,'-Mode',$Mode)) {
    $null=$start.ArgumentList.Add($arg)
  }
  $child=[Diagnostics.Process]::Start($start)
  if(-not $child){throw 'fixture_child_missing'}
  try {
    $ready=Join-Path $case 'child-ready'
    $deadline=[DateTime]::UtcNow.AddSeconds(15)
    $readyConfirmed=$false
    while(-not $readyConfirmed -and -not $child.HasExited -and
          [DateTime]::UtcNow -lt $deadline) {
      if(Test-Path -LiteralPath $ready -PathType Leaf){
        try {$readyConfirmed=([IO.File]::ReadAllText($ready) -eq $Mode)} catch [IO.IOException] {}
      }
      if($readyConfirmed){break}
      Start-Sleep -Milliseconds 50
    }
    if(-not $readyConfirmed -or $child.HasExited){
      throw 'fixture_child_never_acquired_both_mutexes'
    }
    if($updateHandle.WaitOne(0)){
      $updateHandle.ReleaseMutex()
      throw 'fixture_update_lock_not_owned_by_child'
    }
    if($bootstrapHandle.WaitOne(0)){
      $bootstrapHandle.ReleaseMutex()
      throw 'fixture_bootstrap_lock_not_owned_by_child'
    }
    # Kill ONLY our exact Process object in an isolated CI fixture, never PID
    # discovered on the workstation. This is the synthetic power-loss event.
    $child.Kill()
    if(-not $child.WaitForExit(10000)){throw 'fixture_child_did_not_exit'}
    Assert-AbandonedMutexRecovery $updateHandle ($Mode+'_update')
    Assert-AbandonedMutexRecovery $bootstrapHandle ($Mode+'_bootstrap')
    $ledger=Join-Path $case '.ames-update'
    if($Mode -eq 'claim') {
      $claim=Join-Path $ledger 'claim.lock'
      if(-not (Test-Path -LiteralPath $claim -PathType Leaf) -or
         (Test-Path -LiteralPath (Join-Path $ledger 'transaction.json')) -or
         [IO.File]::ReadAllText($claim) -ne '{"fixture_only":true,"update_authorized":false}') {
        throw 'incomplete_claim_not_preserved_after_crash'
      }
      # The new guardian, direct launcher and Python bootstrap all block on
      # a non-empty .ames-update, including a claim without a journal.
      if(@(Get-ChildItem -LiteralPath $ledger -Force).Count -eq 0) {
        throw 'crashed_transaction_not_blocked'
      }
    } else {
      # Before any persistent claim, no file swap or state transition occurred.
      if(Test-Path -LiteralPath $ledger){throw 'premature_transaction_marker'}
    }
  } finally {
    if($child){
      if(-not $child.HasExited){$child.Kill();$null=$child.WaitForExit(10000)}
      $child.Dispose()
    }
  }
  } finally {
    $bootstrapHandle.Dispose();$updateHandle.Dispose()
  }
}

try {
  if([IO.File]::ReadAllText($magic) -ne 'ISSUE57_DISPOSABLE_NO_PRODUCTION'){
    throw 'fixture_magic_invalid'
  }
  Invoke-CrashFixture 'before_claim'
  Invoke-CrashFixture 'claim'
  Write-Output 'Issue57 coordinator crash: both Global mutexes abandoned; incomplete claim persists and blocks recovery; production forbidden'
} finally {
  if((Test-Path -LiteralPath $magic -PathType Leaf) -and
     [IO.File]::ReadAllText($magic) -eq 'ISSUE57_DISPOSABLE_NO_PRODUCTION' -and
     [IO.Path]::GetFileName($base) -eq ('issue57-coordinator-crash-test-'+$id)) {
    Remove-Item -LiteralPath $base -Recurse -Force
  }
}
