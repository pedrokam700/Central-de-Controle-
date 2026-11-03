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

function Invoke-EnrolledCoordinatorCrash {
  $scope=[guid]::NewGuid().ToString('N')
  $enrolledBase=Join-Path $env:RUNNER_TEMP ('issue57-maintenance-ledger-'+$scope)
  $null=New-Item -ItemType Directory -Path $enrolledBase -ErrorAction Stop
  $marker=Join-Path $enrolledBase '.issue57_dual_lock_fixture_ONLY'
  [IO.File]::WriteAllText($marker,'ISSUE57_DISPOSABLE_NO_PRODUCTION')
  $fixtureRoot=Join-Path $enrolledBase 'fixture'
  $updateName='Global\CentralAMES.Issue57DualUpdateTest.'+$scope
  $bootstrapName='Global\CentralAMES.Issue57DualBootstrapTest.'+$scope
  # Observer handles exist before the coordinator's owner thread acquires the
  # pair, so actual OS abandonment can be proved after terminating its process.
  $update=[Threading.Mutex]::new($false,$updateName)
  $bootstrap=[Threading.Mutex]::new($false,$bootstrapName)
  $child=$null
  $previousTemp=$env:TEMP;$previousTmp=$env:TMP
  $previousRoot=$env:ISSUE57_DRAIN_FIXTURE_ROOT
  $previousUpdate=$env:ISSUE57_DRAIN_UPDATE_MUTEX
  $previousBootstrap=$env:ISSUE57_DRAIN_BOOTSTRAP_MUTEX
  try {
    $env:TEMP=$env:RUNNER_TEMP;$env:TMP=$env:RUNNER_TEMP
    $env:ISSUE57_DRAIN_FIXTURE_ROOT=$fixtureRoot
    $env:ISSUE57_DRAIN_UPDATE_MUTEX=$updateName
    $env:ISSUE57_DRAIN_BOOTSTRAP_MUTEX=$bootstrapName
    $start=[Diagnostics.ProcessStartInfo]::new()
    $start.FileName=(Get-Command python -ErrorAction Stop).Source
    $start.UseShellExecute=$false;$start.CreateNoWindow=$true
    $start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
    foreach($arg in @('-u',(Join-Path $PSScriptRoot 'agent-issue57-drain-protocol.test.py'),'--windows-enrollment-abandon-worker')){
      $null=$start.ArgumentList.Add($arg)
    }
    $child=[Diagnostics.Process]::Start($start)
    $stdoutTask=$child.StandardOutput.ReadToEndAsync()
    $stderrTask=$child.StandardError.ReadToEndAsync()
    $reportPath=Join-Path $enrolledBase 'enrollment-ready.json'
    $deadline=[DateTime]::UtcNow.AddSeconds(90)
    $report=$null
    while(-not $report -and -not $child.HasExited -and [DateTime]::UtcNow -lt $deadline){
      if(Test-Path -LiteralPath $reportPath -PathType Leaf){
        try{$report=[IO.File]::ReadAllText($reportPath)|ConvertFrom-Json}catch{$report=$null}
      }
      if(-not $report){Start-Sleep -Milliseconds 50}
    }
    if(-not $report -or $child.HasExited -or $report.update_authorized -ne $false -or
       @($report.participant_pids).Count -ne 2){throw 'enrolled_coordinator_not_ready_for_interruption'}
    $journalPath=Join-Path $fixtureRoot '.ames-update\transaction.json'
    $before=[IO.File]::ReadAllText($journalPath)
    $journal=$before|ConvertFrom-Json
    if($journal.phase -cne 'relaunchers_enrolled' -or $journal.transaction_id -cne $report.transaction_id -or
       $journal.update_authorized -ne $false -or @($journal.relauncher_receipt.participants).Count -ne 2){
      throw 'enrolled_crash_receipt_not_bound'
    }
    $births=@{}
    foreach($ownedPid in @($report.agent_pid)+@($report.participant_pids)){
      $proc=Get-CimInstance Win32_Process -Filter ("ProcessId = {0}" -f [int]$ownedPid) -ErrorAction Stop
      if(-not $proc -or [int]$proc.ParentProcessId -ne $child.Id -or -not $proc.CreationDate){throw 'enrolled_child_ownership_unverified'}
      $births[[int]$ownedPid]=([datetime]$proc.CreationDate).ToUniversalTime().Ticks
    }
    if($update.WaitOne(0)){$update.ReleaseMutex();throw 'enrolled_update_gate_not_held'}
    if($bootstrap.WaitOne(0)){$bootstrap.ReleaseMutex();throw 'enrolled_bootstrap_gate_not_held'}
    $child.Kill() # Exact disposable coordinator object, never a discovered PID.
    if(-not $child.WaitForExit(10000)){throw 'enrolled_coordinator_did_not_exit'}
    Assert-AbandonedMutexRecovery $update 'enrolled_update'
    Assert-AbandonedMutexRecovery $bootstrap 'enrolled_bootstrap'
    $deadline=[DateTime]::UtcNow.AddSeconds(15)
    do {
      $alive=0
      foreach($ownedPid in $births.Keys){
        $proc=Get-CimInstance Win32_Process -Filter ("ProcessId = {0}" -f $ownedPid) -ErrorAction Stop
        if($proc){
          if(([datetime]$proc.CreationDate).ToUniversalTime().Ticks -ne $births[$ownedPid]){throw 'enrolled_pid_reused_requires_recovery'}
          $alive++
        }
      }
      if($alive -gt 0){Start-Sleep -Milliseconds 100}
    }while($alive -gt 0 -and [DateTime]::UtcNow -lt $deadline)
    if($alive -ne 0){throw 'enrolled_channel_eof_not_fail_closed'}
    . (Join-Path $PSScriptRoot '..\tools\ames-workstation\ISSUE57_RELAUNCH_ENROLLMENT.ps1')
    if(-not (Test-Issue57RelaunchBlocked $fixtureRoot)){throw 'enrolled_crash_claim_not_blocking'}
    $probe=@(& python (Join-Path $PSScriptRoot 'agent-issue57-drain-protocol.test.py') --windows-enrollment-after-death)
    if($LASTEXITCODE -ne 0 -or $probe -notcontains 'Issue57 enrolled crash: coordinator killed, both mutexes abandoned, canonical relaunchers blocked by retained claim; production forbidden'){
      throw 'enrolled_post_crash_relaunch_not_blocked'
    }
    if([IO.File]::ReadAllText($journalPath) -cne $before){throw 'enrolled_crash_journal_changed'}
    Write-Output 'Issue57 enrolled crash: coordinator killed, both mutexes abandoned, canonical relaunchers blocked by retained claim; production forbidden'
  } finally {
    if($child){if(-not $child.HasExited){$child.Kill();$null=$child.WaitForExit(10000)};$child.Dispose()}
    $bootstrap.Dispose();$update.Dispose()
    $env:TEMP=$previousTemp;$env:TMP=$previousTmp
    $env:ISSUE57_DRAIN_FIXTURE_ROOT=$previousRoot
    $env:ISSUE57_DRAIN_UPDATE_MUTEX=$previousUpdate
    $env:ISSUE57_DRAIN_BOOTSTRAP_MUTEX=$previousBootstrap
    if((Test-Path -LiteralPath $marker -PathType Leaf) -and
       [IO.File]::ReadAllText($marker) -ceq 'ISSUE57_DISPOSABLE_NO_PRODUCTION' -and
       [IO.Path]::GetFileName($enrolledBase) -ceq ('issue57-maintenance-ledger-'+$scope)){
      Remove-Item -LiteralPath $enrolledBase -Recurse -Force
    }
  }
}

try {
  if([IO.File]::ReadAllText($magic) -ne 'ISSUE57_DISPOSABLE_NO_PRODUCTION'){
    throw 'fixture_magic_invalid'
  }
  Invoke-CrashFixture 'before_claim'
  Invoke-CrashFixture 'claim'
  Invoke-EnrolledCoordinatorCrash
  Write-Output 'Issue57 coordinator crash: both Global mutexes abandoned; incomplete claim persists and blocks recovery; production forbidden'
} finally {
  if((Test-Path -LiteralPath $magic -PathType Leaf) -and
     [IO.File]::ReadAllText($magic) -eq 'ISSUE57_DISPOSABLE_NO_PRODUCTION' -and
     [IO.Path]::GetFileName($base) -eq ('issue57-coordinator-crash-test-'+$id)) {
    Remove-Item -LiteralPath $base -Recurse -Force
  }
}
