# GitHub-hosted ephemeral Windows runner only. This never opens the factory
# agent, touches a user mutex, registers startup or modifies production files.
$ErrorActionPreference='Stop'
$name='Global\CentralAMES.Issue57Test.'+([guid]::NewGuid().ToString('N'))
$mutex=[System.Threading.Mutex]::new($false,$name)
$acquired=$false
try {
  $acquired=$mutex.WaitOne(0)
  if(-not $acquired){throw 'Unable to acquire isolated fixture mutex'}
  $childCode='$mutex=[System.Threading.Mutex]::new($false,"'+$name+'");try{if($mutex.WaitOne(0)){"ACQUIRED";$mutex.ReleaseMutex()}else{"BLOCKED"}}finally{$mutex.Dispose()}'
  $child=@(& pwsh -NoProfile -NonInteractive -Command $childCode)
  if($LASTEXITCODE -ne 0 -or @($child).Count -ne 1 -or $child[0] -ne 'BLOCKED'){
    throw 'Second Windows process bypassed active Global fixture mutex'
  }
  $mutex.ReleaseMutex()
  $acquired=$false
  $retry=@(& pwsh -NoProfile -NonInteractive -Command $childCode)
  if($LASTEXITCODE -ne 0 -or @($retry).Count -ne 1 -or $retry[0] -ne 'ACQUIRED'){
    throw 'Fixture mutex did not become available after release'
  }
}finally{
  if($acquired){$mutex.ReleaseMutex()}
  $mutex.Dispose()
}
Write-Output 'Issue57 Global mutex: blocked concurrently and released across two Windows processes'
