# Windows CI only. Extracts the read-only claim guard from the existing
# launcher, without invoking its bootstrap, touching a real mutex or agent.
$ErrorActionPreference='Stop'
if($env:GITHUB_ACTIONS -ne 'true' -or -not $env:RUNNER_TEMP -or
   -not (Test-Path -LiteralPath $env:RUNNER_TEMP -PathType Container)){
  throw 'github_windows_runner_fixture_only'
}
$id=[guid]::NewGuid().ToString('N')
$root=Join-Path $env:RUNNER_TEMP ('issue57-direct-launcher-test-'+$id)
$null=New-Item -ItemType Directory -Path $root -ErrorAction Stop
$magic=Join-Path $root '.issue57_direct_launcher_fixture_ONLY'
[IO.File]::WriteAllText($magic,'ISSUE57_DISPOSABLE_NO_PRODUCTION')
try {
  $source=Join-Path $PSScriptRoot '..\tools\ames-workstation\START_AGENT_CANONICAL.ps1'
  $tokens=$null;$errors=$null
  $ast=[Management.Automation.Language.Parser]::ParseFile((Resolve-Path -LiteralPath $source).Path,[ref]$tokens,[ref]$errors)
  if($errors.Count -ne 0){throw 'launcher_parse_failed'}
  $guards=@($ast.FindAll({param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and
    $node.Name -eq 'Assert-NoPendingUpdateClaim'
  },$true))
  if($guards.Count -ne 1){throw 'maintenance_guard_missing_or_ambiguous'}
  # Repo-owned function body only. None of the other launcher functions,
  # process handlers, startup loops or filesystem writes is executed here.
  . (Join-Path $PSScriptRoot '..\tools\ames-workstation\ISSUE57_RELAUNCH_ENROLLMENT.ps1')
  . ([ScriptBlock]::Create($guards[0].Extent.Text))

  Assert-NoPendingUpdateClaim $root # untouched root may launch
  $transaction=Join-Path $root '.ames-update'
  $null=New-Item -ItemType Directory -Path $transaction -ErrorAction Stop
  Assert-NoPendingUpdateClaim $root # empty well-formed directory is allowed

  function Assert-BlockedFixture([string]$Reason){
    try {Assert-NoPendingUpdateClaim $root}
    catch {
      if($_.Exception.Message -eq 'MAINTENANCE_TRANSACTION_PENDING_OR_UNVERIFIED'){return}
      throw 'fixture_guard_error_not_sanitized'
    }
    throw ('fixture_failed_open_'+$Reason)
  }

  [IO.File]::WriteAllText((Join-Path $transaction 'claim.lock'),'fake')
  Assert-BlockedFixture 'claim'
  Remove-Item -LiteralPath (Join-Path $transaction 'claim.lock') -Force
  [IO.File]::WriteAllText((Join-Path $transaction 'transaction.json'),'fake')
  Assert-BlockedFixture 'journal'
  Remove-Item -LiteralPath (Join-Path $transaction 'transaction.json') -Force
  [IO.File]::WriteAllText((Join-Path $transaction 'unknown.incomplete'),'fake')
  Assert-BlockedFixture 'unknown'
  Remove-Item -LiteralPath (Join-Path $transaction 'unknown.incomplete') -Force
  Remove-Item -LiteralPath $transaction -Force
  [IO.File]::WriteAllText($transaction,'not a directory')
  Assert-BlockedFixture 'not_directory'

  if([IO.File]::ReadAllText($magic) -ne 'ISSUE57_DISPOSABLE_NO_PRODUCTION'){
    throw 'fixture_magic_changed'
  }
  Write-Output 'Issue57 direct launcher claim: absent/empty allowed; claim, journal, unknown, invalid directory blocked before bootstrap'
} finally {
  if((Test-Path -LiteralPath $magic -PathType Leaf) -and
     ([IO.File]::ReadAllText($magic) -eq 'ISSUE57_DISPOSABLE_NO_PRODUCTION') -and
     ([IO.Path]::GetFileName($root) -eq ('issue57-direct-launcher-test-'+$id))){
    Remove-Item -LiteralPath $root -Recurse -Force
  }
}
