# Execute the REAL rollback branch with REAL CIM/listener/canonical starter.
# Controlled fault point: B has already run and produced evidence; no mocks.
param([Parameter(Mandatory=$true)][string]$OldRoot,[Parameter(Mandatory=$true)][string]$CandidateRoot)
$ErrorActionPreference='Stop'
$lab=[IO.Path]::GetFullPath($env:INSTALL98_ROOT)
if($env:GITHUB_ACTIONS -cne 'true' -or $env:RUNNER_OS -cne 'Windows' -or
 (Split-Path $lab -Parent) -ine [IO.Path]::GetFullPath($env:RUNNER_TEMP)){throw 'DISPOSABLE_LAB_ONLY'}
foreach($root in @($OldRoot,$CandidateRoot)){if((Split-Path ([IO.Path]::GetFullPath($root)) -Parent) -ine $lab){throw 'ROOT_OUTSIDE_LAB'}}
$proof=Get-Content (Join-Path $lab 'containment.json') -Raw|ConvertFrom-Json
if($proof.kernel_deny_proven -ne $true){throw 'NO_CONTAINMENT'}
$source=Get-Content (Join-Path $CandidateRoot 'TROCAR_PARA_PR69_NOVA.ps1') -Raw
$prefixEnd=$source.IndexOf("`ntry {`n  `$manifest=")
$tailStart=$source.IndexOf("`nif(`$rollbackNeeded){")
if($prefixEnd -lt 0 -or $tailStart -lt 0){throw 'ROLLBACK_SOURCE_CONTRACT_CHANGED'}
# Definitions are untouched. Only state normally set by the failed update is
# supplied at the isolated fault boundary; the branch and all OS calls are real.
. ([scriptblock]::Create($source.Substring(0,$prefixEnd)))
$oldRoot=$OldRoot;$NewRoot=$CandidateRoot;$oldRun=$null
$stopped=$true;$committed=$false;$rollbackNeeded=$true;$failed=$true
$candidateMayHaveRun=$true
. ([scriptblock]::Create($source.Substring($tailStart)))
