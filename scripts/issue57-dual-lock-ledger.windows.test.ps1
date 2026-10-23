# Disposable Windows CI fixture for Issue #57. NEVER uses the production
# UpdateTransaction/CanonicalBootstrap mutex names or an installed CLEAN root.
# Proves why a future coordinator must own BOTH locks in a fixed order and
# keep a persistent claim: neither a guardian nor a direct launcher may enter
# the protected interval, including after the volatile mutex is released.
$ErrorActionPreference='Stop'
if($env:GITHUB_ACTIONS -ne 'true' -or -not $env:RUNNER_TEMP -or
   -not (Test-Path -LiteralPath $env:RUNNER_TEMP -PathType Container)) {
  throw 'github_windows_runner_fixture_only'
}
$id=[guid]::NewGuid().ToString('N')
$updateName='Global\CentralAMES.Issue57DualUpdateTest.'+$id
$bootstrapName='Global\CentralAMES.Issue57DualBootstrapTest.'+$id
$base=Join-Path $env:RUNNER_TEMP ('issue57-maintenance-ledger-'+$id)
$null=New-Item -ItemType Directory -Path $base -ErrorAction Stop
$fixture=Join-Path $base '.issue57_dual_lock_fixture_ONLY'
[IO.File]::WriteAllText($fixture,'ISSUE57_DISPOSABLE_NO_PRODUCTION')
$drainRoot=Join-Path $base 'fixture'
$ledger=Join-Path $drainRoot '.ames-update'
$updateMutex=$null;$bootstrapMutex=$null
$updateHeld=$false;$bootstrapHeld=$false

function Invoke-IsolatedProbe([string]$MutexName) {
  # Only test-defined random mutex names are accepted. The child cannot
  # inspect another installation or update files; its result is one keyword.
  if($MutexName -notin @($updateName,$bootstrapName)){throw 'invalid_fixture_mutex'}
  $child=@'
$ErrorActionPreference='Stop'
$mutex=[System.Threading.Mutex]::new($false,$env:ISSUE57_TEST_MUTEX)
$held=$false
try {
  try {$held=$mutex.WaitOne(0)} catch [System.Threading.AbandonedMutexException] {$held=$true}
  if(-not $held) {'MUTEX_BLOCKED'}
  elseif(Test-Path -LiteralPath (Join-Path $env:ISSUE57_TEST_LEDGER 'claim.lock')) {'PERSISTENT_CLAIM_BLOCKED'}
  else {'NO_CLAIM_OBSERVED'}
} finally {
  if($held){$mutex.ReleaseMutex()}
  $mutex.Dispose()
}
'@
  $env:ISSUE57_TEST_MUTEX=$MutexName
  $env:ISSUE57_TEST_LEDGER=$ledger
  try {
    $output=@(& pwsh -NoProfile -NonInteractive -Command $child)
    if($LASTEXITCODE -ne 0 -or @($output).Count -ne 1){throw 'fixture_child_probe_failed'}
    return $output[0]
  } finally {
    Remove-Item Env:\ISSUE57_TEST_MUTEX -ErrorAction SilentlyContinue
    Remove-Item Env:\ISSUE57_TEST_LEDGER -ErrorAction SilentlyContinue
  }
}

try {
  if([IO.File]::ReadAllText($fixture) -ne 'ISSUE57_DISPOSABLE_NO_PRODUCTION') {throw 'fixture_magic_invalid'}
  # Lock order matches the required future coordinator contract:
  # guardian -> UpdateTransaction; direct launcher -> CanonicalBootstrap.
  # A coordinator must take UpdateTransaction THEN CanonicalBootstrap.
  $updateMutex=[System.Threading.Mutex]::new($false,$updateName)
  $bootstrapMutex=[System.Threading.Mutex]::new($false,$bootstrapName)
  $updateHeld=$updateMutex.WaitOne(0)
  if(-not $updateHeld){throw 'fixture_update_lock_failed'}
  $bootstrapHeld=$bootstrapMutex.WaitOne(0)
  if(-not $bootstrapHeld){throw 'fixture_bootstrap_lock_failed'}
  if((Invoke-IsolatedProbe $updateName) -ne 'MUTEX_BLOCKED') {throw 'guardian_bypassed_coordinator'}
  if((Invoke-IsolatedProbe $bootstrapName) -ne 'MUTEX_BLOCKED') {throw 'direct_launcher_bypassed_coordinator'}

  # The REAL fixture ledger claim and authenticated admission drain now run
  # under these same held mutexes, not in unrelated sequential tests. Python
  # opens the existing random mutexes from its spawned process and must find
  # BOTH occupied at startup and during each readiness observation.
  $previousFixtureTemp=$env:TEMP
  $previousFixtureTmp=$env:TMP
  $env:TEMP=$env:RUNNER_TEMP
  $env:TMP=$env:RUNNER_TEMP
  $env:ISSUE57_DRAIN_FIXTURE_ROOT=$drainRoot
  $env:ISSUE57_DRAIN_UPDATE_MUTEX=$updateName
  $env:ISSUE57_DRAIN_BOOTSTRAP_MUTEX=$bootstrapName
  try {
    $drain=@(& python ./scripts/agent-issue57-drain-protocol.test.py --windows-dual-lock-fixture)
    if($LASTEXITCODE -ne 0){throw 'authenticated_drain_fixture_failed'}
    if($drain -notcontains 'Issue57 authenticated drain: dual mutex + IPC + journal + disconnect fenced; production forbidden') {
      throw 'authenticated_drain_fixture_not_completed'
    }
    Write-Output 'Issue57 authenticated drain: dual mutex + IPC + journal + disconnect fenced; production forbidden'
  } finally {
    $env:TEMP=$previousFixtureTemp
    $env:TMP=$previousFixtureTmp
    Remove-Item Env:\ISSUE57_DRAIN_FIXTURE_ROOT -ErrorAction SilentlyContinue
    Remove-Item Env:\ISSUE57_DRAIN_UPDATE_MUTEX -ErrorAction SilentlyContinue
    Remove-Item Env:\ISSUE57_DRAIN_BOOTSTRAP_MUTEX -ErrorAction SilentlyContinue
  }
  $claim=Join-Path $ledger 'claim.lock'
  $journal=Get-Content -LiteralPath (Join-Path $ledger 'transaction.json') -Raw | ConvertFrom-Json
  if($journal.phase -ne 'recovery_required' -or $journal.update_authorized -ne $false) {
    throw 'authenticated_drain_journal_not_blocking'
  }

  $bootstrapMutex.ReleaseMutex();$bootstrapHeld=$false
  $updateMutex.ReleaseMutex();$updateHeld=$false
  if((Invoke-IsolatedProbe $updateName) -ne 'PERSISTENT_CLAIM_BLOCKED') {throw 'guardian_ignored_persistent_claim'}
  if((Invoke-IsolatedProbe $bootstrapName) -ne 'PERSISTENT_CLAIM_BLOCKED') {throw 'launcher_ignored_persistent_claim'}
  if(-not (Test-Path -LiteralPath $claim -PathType Leaf)){throw 'fixture_claim_not_persistent'}
  Write-Output 'Issue57 dual-lock ledger: guardian + direct launcher fenced, persistent claim blocks after release; production forbidden'
} finally {
  if($bootstrapHeld -and $bootstrapMutex){$bootstrapMutex.ReleaseMutex()}
  if($updateHeld -and $updateMutex){$updateMutex.ReleaseMutex()}
  if($bootstrapMutex){$bootstrapMutex.Dispose()}
  if($updateMutex){$updateMutex.Dispose()}
  # Cleanup is limited to an exact GUID-scoped disposable fixture with magic.
  if((Test-Path -LiteralPath $fixture -PathType Leaf) -and
     ([IO.File]::ReadAllText($fixture) -eq 'ISSUE57_DISPOSABLE_NO_PRODUCTION') -and
     ([IO.Path]::GetFileName($base) -eq ('issue57-maintenance-ledger-'+$id))) {
    Remove-Item -LiteralPath $base -Recurse -Force
  }
}
