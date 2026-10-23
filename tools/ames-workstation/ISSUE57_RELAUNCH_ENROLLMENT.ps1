# Shared by the normal canonical guardian, direct launcher and their enrolled
# maintenance participants. Unknown/partial/inaccessible state always blocks.
function Test-Issue57RelaunchBlocked([string]$PackageRoot){
  $dir=Join-Path $PackageRoot '.ames-update'
  try{
    if(Test-Path -LiteralPath $dir -ErrorAction Stop){
      $entry=Get-Item -LiteralPath $dir -Force -ErrorAction Stop
      if(-not $entry.PSIsContainer -or ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint)){return $true}
      if(@(Get-ChildItem -LiteralPath $dir -Force -ErrorAction Stop).Count -gt 0){return $true}
    }
    return $false
  }catch{return $true}
}

# Private inherited stdin/stdout only. No listener, registration, credentials
# from the workstation, TTL release or fallback to normal startup on failure.
# Operational activation is deliberately rejected until external writers and
# installation registration are implemented. Both canonical entrypoints use
# this same participant; it does not run a second supervisor/updater.
function Invoke-Issue57RelaunchEnrollment {
  param([string]$InstallationRoot,[string]$JournalRoot,[string]$Role,[string]$MutexName)
  $ErrorActionPreference='Stop'
  if($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows' -or -not $env:RUNNER_TEMP){throw 'enrollment_not_operationally_enabled'}
  $journal=[IO.Path]::GetFullPath($JournalRoot)
  $installation=[IO.Path]::GetFullPath($InstallationRoot)
  $temporary=[IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd([char]92)+[char]92
  if(-not $journal.StartsWith($temporary,[StringComparison]::OrdinalIgnoreCase) -or
     [IO.Path]::GetFileName($journal) -cne 'fixture' -or
     [IO.Path]::GetFileName([IO.Path]::GetDirectoryName($journal)) -notmatch '^issue57-maintenance-ledger-[0-9a-f]{32}$' -or
     $installation -ine (Join-Path $journal 'persistent-clean') -or
     [IO.File]::ReadAllText((Join-Path $journal '.issue57_maintenance_fixture_ONLY')) -cne 'ISSUE57_TEST_ROOT_NOT_A_PRODUCTION_CLEAN'){
    throw 'enrollment_fixture_root_untrusted'
  }
  $kind='Update';if($Role -eq 'launcher'){$kind='Bootstrap'}elseif($Role -ne 'guardian'){throw 'enrollment_role_invalid'}
  if($MutexName -notmatch ('^Global\\CentralAMES\.Issue57Dual'+$kind+'Test\.[0-9a-f]{32}$')){throw 'enrollment_production_mutex_forbidden'}
  foreach($path in @($journal,$installation)){
    $item=Get-Item -LiteralPath $path -Force -ErrorAction Stop
    if(-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'enrollment_root_untrusted'}
  }
  function Read-EnrollmentFrame {
    $text=New-Object Text.StringBuilder
    while($true){
      $c=[Console]::In.Read()
      if($c -eq -1){if($text.Length -eq 0){return $null};throw 'enrollment_frame_incomplete'}
      if($c -eq 10){return $text.ToString()}
      if($text.Length -ge 4096 -or $c -eq 13){throw 'enrollment_frame_untrusted'}
      [void]$text.Append([char]$c)
    }
  }
  function Get-EnrollmentCanonical($body){
    $ordered=[ordered]@{}
    foreach($name in @($body.PSObject.Properties.Name | Sort-Object)){$ordered[$name]=$body.$name}
    return ($ordered|ConvertTo-Json -Compress -Depth 3)
  }
  function Get-EnrollmentMac([byte[]]$key,[string]$direction,[string]$payload){
    $hmac=New-Object Security.Cryptography.HMACSHA256
    try{
      $hmac.Key=$key
      return ([BitConverter]::ToString($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($direction+[char]0+$payload)))).Replace('-','').ToLowerInvariant()
    }finally{$hmac.Dispose()}
  }
  $helloText=Read-EnrollmentFrame
  if(-not $helloText){throw 'enrollment_bootstrap_missing'}
  $hello=$helloText|ConvertFrom-Json
  if((@($hello.PSObject.Properties.Name|Sort-Object) -join ',') -cne 'installation_sha256,key,root_sha256,transaction_id' -or
     $hello.key -cnotmatch '^[0-9a-f]{64}$' -or $hello.installation_sha256 -cnotmatch '^[0-9a-f]{64}$' -or
     $hello.root_sha256 -cnotmatch '^[0-9a-f]{64}$' -or $hello.transaction_id -cnotmatch '^[0-9a-f]{32}$'){
    throw 'enrollment_bootstrap_untrusted'
  }
  $key=New-Object byte[] 32
  for($i=0;$i -lt 32;$i++){$key[$i]=[Convert]::ToByte($hello.key.Substring($i*2,2),16)}
  $sequence=0
  try{
    while($true){
      $line=Read-EnrollmentFrame
      if($null -eq $line){return} # Exit enrollment; NEVER fall through into restart.
      $wire=$line|ConvertFrom-Json
      if((@($wire.PSObject.Properties.Name|Sort-Object) -join ',') -cne 'body,mac'){throw 'enrollment_envelope_invalid'}
      $request=$wire.body
      $canonical=Get-EnrollmentCanonical $request
      $expected=Get-EnrollmentMac $key 'relauncher-request' $canonical
      if($wire.mac -cnotmatch '^[0-9a-f]{64}$'){throw 'enrollment_mac_invalid'}
      $different=0;for($i=0;$i -lt 64;$i++){$different=$different -bor ([int][char]$wire.mac[$i] -bxor [int][char]$expected[$i])}
      if($different -ne 0 -or
         (@($request.PSObject.Properties.Name|Sort-Object) -join ',') -cne 'challenge,installation_sha256,operation,root_sha256,schema,sequence,transaction_id' -or
         $request.schema -cne 'ames-relauncher-enrollment-v1' -or $request.operation -cne 'attest' -or
         $request.transaction_id -cne $hello.transaction_id -or $request.installation_sha256 -cne $hello.installation_sha256 -or
         $request.root_sha256 -cne $hello.root_sha256 -or $request.challenge -cnotmatch '^[0-9a-f]{64}$' -or
         ($request.sequence -isnot [int] -and $request.sequence -isnot [long]) -or $request.sequence -ne ($sequence+1)){
        throw 'enrollment_request_untrusted'
      }
      if(-not (Test-Issue57RelaunchBlocked $journal)){throw 'enrollment_barrier_absent'}
      $dir=Join-Path $journal '.ames-update'
      $directory=Get-Item -LiteralPath $dir -Force -ErrorAction Stop
      if(-not $directory.PSIsContainer -or ($directory.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
         (@(Get-ChildItem -LiteralPath $dir -Force|Sort-Object Name|ForEach-Object{$_.Name}) -join ',') -cne 'claim.lock,transaction.json'){
        throw 'enrollment_claim_untrusted'
      }
      foreach($name in @('claim.lock','transaction.json')){
        $file=Get-Item -LiteralPath (Join-Path $dir $name) -Force -ErrorAction Stop
        if($file.PSIsContainer -or ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $file.Length -gt 4096){throw 'enrollment_claim_untrusted'}
        $claim=[IO.File]::ReadAllText($file.FullName)|ConvertFrom-Json
        if($claim.schema -cne 'ames-maintenance-transaction-test-v1' -or $claim.transaction_id -cne $hello.transaction_id -or
           $claim.installation_identity_sha256 -cne $hello.installation_sha256 -or $claim.update_authorized -ne $false){throw 'enrollment_claim_mismatch'}
      }
      # Observe the SAME held gate as the coordinator. Even after coordinator
      # death, the claim remains mandatory; abandoned/free mutex is not idle.
      $mutex=[System.Threading.Mutex]::OpenExisting($MutexName)
      $held=$false
      try{
        try{$held=$mutex.WaitOne(0)}catch [System.Threading.AbandonedMutexException]{$held=$true}
        $state='mutex_and_claim_blocked';if($held){$state='claim_blocks_after_mutex_release'}
      }finally{if($held){$mutex.ReleaseMutex()};$mutex.Dispose()}
      $sequence=$request.sequence
      $response=[ordered]@{}
      foreach($name in $request.PSObject.Properties.Name){$response[$name]=$request.$name}
      $response.barrier_state=$state;$response.pid=$PID;$response.role=$Role;$response.update_authorized=$false
      $body=[pscustomobject]$response
      $mac=Get-EnrollmentMac $key 'relauncher-response' (Get-EnrollmentCanonical $body)
      [Console]::Out.WriteLine((@{body=$body;mac=$mac}|ConvertTo-Json -Compress -Depth 3))
      [Console]::Out.Flush()
    }
  }finally{[Array]::Clear($key,0,$key.Length)}
}
