# Standalone Windows PowerShell 5.1. No agent import, HTTP, SQLite or profile open.
# Output is PRIVATE: installation paths and process metadata belong to the owner.
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2

function Assert-CentralLocalRegularPath([string]$Path){
  $full=[IO.Path]::GetFullPath($Path)
  if($full -notmatch '^[A-Za-z]:\\'){throw 'STOP_NONLOCAL_PATH'}
  $drive=[IO.DriveInfo]::new([IO.Path]::GetPathRoot($full))
  if($drive.DriveType -notin @([IO.DriveType]::Fixed,[IO.DriveType]::Removable)){throw 'STOP_NONLOCAL_DRIVE'}
  $current=$full
  while($current){
    $item=Get-Item -LiteralPath $current -Force -ErrorAction Stop
    if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'STOP_LINK_OR_JUNCTION'}
    $parent=[IO.Path]::GetDirectoryName($current.TrimEnd('\'))
    if(-not $parent -or $parent -eq $current){break}
    $current=$parent
  }
  return $full
}

function Resolve-CentralPortOwner($Listeners,$Process){
  $rows=@($Listeners)
  if(-not $rows.Count){throw 'STOP_NO_LISTENER'}
  $owners=@($rows|ForEach-Object {[int]$_.OwningProcess}|Sort-Object -Unique)
  if($owners.Count -ne 1 -or $owners[0] -le 0){throw 'STOP_AMBIGUOUS_OWNER'}
  if(@($rows|Where-Object {[string]$_.LocalAddress -notin @('127.0.0.1','::1')}).Count){throw 'STOP_NON_LOOPBACK_BIND'}
  if(-not $Process -or [int]$Process.ProcessId -ne $owners[0] -or -not $Process.CreationDate -or -not $Process.ExecutablePath -or -not $Process.CommandLine){throw 'STOP_PROCESS_METADATA_UNAVAILABLE'}
  if([IO.Path]::GetFileName([string]$Process.ExecutablePath) -notmatch '^pythonw?\.exe$'){throw 'STOP_UNRECOGNIZED_INTERPRETER'}
  # Deliberately accept ONLY the observed canonical python -u <absolute entry>.
  # No substring lookup, directory search, native compilation or shell execution.
  $pattern='^(?:"(?<exe>[^"\r\n]+)"|(?<exe>[^\s"]+))\s+-u\s+(?:"(?<entry>[^"\r\n]+)"|(?<entry>[^\s"]+))\s*$'
  $match=[regex]::Match([string]$Process.CommandLine,$pattern,[Text.RegularExpressions.RegexOptions]::IgnoreCase)
  if(-not $match.Success){throw 'STOP_UNSUPPORTED_COMMAND_SHAPE'}
  $exe=[IO.Path]::GetFullPath($match.Groups['exe'].Value)
  if(-not $exe.Equals([IO.Path]::GetFullPath([string]$Process.ExecutablePath),[StringComparison]::OrdinalIgnoreCase)){throw 'STOP_EXECUTABLE_MISMATCH'}
  if($match.Groups['entry'].Value -notmatch '^[A-Za-z]:\\'){throw 'STOP_UNRECOGNIZED_ENTRYPOINT'}
  $entry=[IO.Path]::GetFullPath($match.Groups['entry'].Value)
  if($entry -notmatch '^[A-Za-z]:\\' -or [IO.Path]::GetFileName($entry) -cne 'agent_hardened_entry.py' -or [IO.Path]::GetFileName([IO.Path]::GetDirectoryName($entry)) -ine 'ames-agent'){throw 'STOP_UNRECOGNIZED_ENTRYPOINT'}
  return [pscustomobject]@{root=[IO.Path]::GetDirectoryName([IO.Path]::GetDirectoryName($entry));entry=$entry;executable=$exe;pid=$owners[0];created=([datetime]$Process.CreationDate).ToUniversalTime().ToString('o');command=[string]$Process.CommandLine}
}

function Read-CentralInstallationMetadata($Identity){
  $root=Assert-CentralLocalRegularPath $Identity.root
  $entry=Assert-CentralLocalRegularPath $Identity.entry
  if((Get-Item -LiteralPath $entry).PSIsContainer){throw 'STOP_ENTRYPOINT_NOT_FILE'}
  $items=[ordered]@{}
  foreach($name in @('ames-agent\config.json','ames-agent\data\local_agent_token','ames-agent\data\ames_local.sqlite3','ames-agent\data\ames_local.sqlite3-wal','ames-agent\data\ames_local.sqlite3-shm','ames-agent\data\ames_local.sqlite3-journal')){
    $path=Join-Path $root $name
    if(Test-Path -LiteralPath $path){
      $null=Assert-CentralLocalRegularPath $path
      $item=Get-Item -LiteralPath $path -Force
      if($item.PSIsContainer){throw 'STOP_CRITICAL_PATH_NOT_FILE'}
      # Metadata only. NEVER hash/read/parse the DB, WAL, config or local token.
      $items[$name]=@{present=$true;bytes=$item.Length;last_write_utc=$item.LastWriteTimeUtc.ToString('o')}
    }else{$items[$name]=@{present=$false;bytes=$null;last_write_utc=$null}}
  }
  foreach($name in @('ames-agent\config.json','ames-agent\data\local_agent_token','ames-agent\data\ames_local.sqlite3')){
    if(-not $items[$name].present){throw 'STOP_CRITICAL_STATE_MISSING'}
  }
  $sha=$null;$manifestState='ABSENT';$manifest=Join-Path $root 'CANDIDATE_MANIFEST.json'
  if(Test-Path -LiteralPath $manifest){
    $null=Assert-CentralLocalRegularPath $manifest
    if((Get-Item -LiteralPath $manifest).Length -gt 1048576){throw 'STOP_MANIFEST_OVERSIZED'}
    $value=Get-Content -LiteralPath $manifest -Raw -Encoding UTF8|ConvertFrom-Json
    if(-not $value.PSObject.Properties['sha'] -or [string]$value.sha -notcmatch '^[a-f0-9]{40}$'){throw 'STOP_MANIFEST_IDENTITY_INVALID'}
    $sha=[string]$value.sha;$manifestState='CLAIM_ONLY_NOT_FULL_CODE_VERIFICATION'
  }
  $expected=@{
    'START_AGENT_CANONICAL.ps1'='56db5762c44525c5c7238d37aa24785b6b5a13792f5bc1b1f50830a8e25c71e4'
    'KEEP_AGENT_RUNNING.ps1'='af9234f9e044e84dda95b7e3a31790989badb7c68c092a13484f10b1bb856627'
    'ISSUE57_RELAUNCH_ENROLLMENT.ps1'='f16cfaf34125a26052635b6d0c422cb11a192e5d5c51b9f225a29a2a9093be00'
  }
  $contract=@();foreach($name in @($expected.Keys|Sort-Object)){
    $path=Join-Path $root ('suporte\ames-workstation\'+$name);$known=$false
    if(Test-Path -LiteralPath $path){$null=Assert-CentralLocalRegularPath $path;$known=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ceq $expected[$name]}
    $contract+=@{file=$name;matches_EEDACC65_and_PR98_contract=$known}
  }
  return @{root=$root;entrypoint=$entry;entrypoint_sha256=(Get-FileHash -LiteralPath $entry -Algorithm SHA256).Hash.ToLowerInvariant();state_files=$items;manifest_sha_claim=$sha;manifest_state=$manifestState;retirement_contract=$contract;update_journal_present=(Test-Path -LiteralPath (Join-Path $root '.ames-update'));switch_journal_present=(Test-Path -LiteralPath (Join-Path $root '.ames-switch'))}
}

function Invoke-CentralReadOnlyIdentification {
  if([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT){throw 'STOP_WINDOWS_REQUIRED'}
  foreach($name in @('Get-NetTCPConnection','Get-CimInstance','Get-FileHash')){if(-not(Get-Command $name -ErrorAction SilentlyContinue)){throw 'STOP_REQUIRED_CMDLET_UNAVAILABLE'}}
  $rows=@(Get-NetTCPConnection -State Listen -ErrorAction Stop|Where-Object {$_.LocalPort -eq 8765})
  if(-not $rows.Count){throw 'STOP_NO_LISTENER'}
  $owners=@($rows|ForEach-Object {[int]$_.OwningProcess}|Sort-Object -Unique)
  if($owners.Count -ne 1){throw 'STOP_AMBIGUOUS_OWNER'}
  $process=Get-CimInstance Win32_Process -Filter ("ProcessId = {0}" -f $owners[0]) -ErrorAction Stop
  $identity=Resolve-CentralPortOwner $rows $process
  $metadata=Read-CentralInstallationMetadata $identity
  $os=Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
  # Recheck the OS owner/birth/argv and entry bytes. This is an observation,
  # not a lease, process authorization or proof of all users/guardians.
  $againRows=@(Get-NetTCPConnection -State Listen -ErrorAction Stop|Where-Object {$_.LocalPort -eq 8765})
  $againProcess=Get-CimInstance Win32_Process -Filter ("ProcessId = {0}" -f $identity.pid) -ErrorAction Stop
  $again=Resolve-CentralPortOwner $againRows $againProcess
  if($again.pid -ne $identity.pid -or $again.created -cne $identity.created -or $again.command -cne $identity.command -or $again.executable -cne $identity.executable -or (Get-FileHash -LiteralPath $identity.entry -Algorithm SHA256).Hash.ToLowerInvariant() -cne $metadata.entrypoint_sha256){throw 'STOP_OWNER_CHANGED_DURING_OBSERVATION'}
  return [ordered]@{schema='central98-port-owner-readonly-v1';status='IDENTIFIED';observation_only=$true;port=8765;pid=$identity.pid;process_created_utc=$identity.created;windows=@{caption=$os.Caption;version=$os.Version;build=$os.BuildNumber;os_64_bit=[Environment]::Is64BitOperatingSystem;powershell=$PSVersionTable.PSVersion.ToString()};installation=$metadata;database_opened=$false;http_requests=$false;profiles_opened=$false;all_sessions_attested=$false;maintenance_lease=$false;operational_update_authorized=$false;physical='PENDING'}
}

if($MyInvocation.InvocationName -ne '.'){
  try{Invoke-CentralReadOnlyIdentification|ConvertTo-Json -Depth 9;exit 0}
  catch{
    $reason=[string]$_.Exception.Message
    if($reason -notmatch '^STOP_[A-Z_]+$'){$reason='STOP_OBSERVATION_FAILED'}
    [ordered]@{schema='central98-port-owner-readonly-v1';status='STOP';reason=$reason;installation=$null;database_opened=$false;http_requests=$false;profiles_opened=$false;maintenance_lease=$false;operational_update_authorized=$false;physical='PENDING'}|ConvertTo-Json -Depth 4
    exit 2
  }
}
