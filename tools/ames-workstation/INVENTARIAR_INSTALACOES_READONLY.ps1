param(
  [string[]]$SearchRoots=@((Join-Path $env:USERPROFILE 'Downloads'),(Join-Path $env:USERPROFILE 'Desktop'))
)
# Issue #57 / B1: read-only inventory, never an installer or a process manager.
# No token/config/SQLite contents, arguments, passwords or source_id are emitted.
$ErrorActionPreference='Stop'
$schema='ames-windows-inventory-v1'
$folders=New-Object System.Collections.Generic.List[string]
foreach($searchRoot in $SearchRoots){
  if(-not $searchRoot -or -not(Test-Path -LiteralPath $searchRoot -PathType Container)){continue}
  $resolved=(Resolve-Path -LiteralPath $searchRoot).Path
  if((Split-Path -Leaf $resolved) -like 'AMES_Central_CLEAN_*'){$folders.Add($resolved)}
  Get-ChildItem -LiteralPath $resolved -Directory -Filter 'AMES_Central_CLEAN_*' -ErrorAction Stop |
    ForEach-Object {$folders.Add($_.FullName)}
}
$roots=@($folders|Sort-Object -Unique)
$processes=@(Get-CimInstance Win32_Process -ErrorAction Stop|Where-Object {$_.Name -in @('python.exe','pythonw.exe')})
$listeners=@()
$portChecked=$false
try{
  $listeners=@(Get-NetTCPConnection -State Listen -LocalPort 8765 -ErrorAction Stop|
    Select-Object -ExpandProperty OwningProcess -Unique)
  $portChecked=$true
}catch{
  # A denied or unavailable port inspection is UNKNOWN, never idle.
}

function Get-Entrypoint([string]$commandLine){
  if(-not $commandLine){return $null}
  # Strict absolute Windows path for the canonical Python entrypoint. Other
  # process arguments stay private and are not copied into the output.
  $pattern='(?i)(?:^|\s)(?:"(?<quoted>[A-Z]:\\[^"\r\n]+\\ames-agent\\agent_hardened_entry\.py)"|(?<bare>[A-Z]:\\[^\s"\r\n]+\\ames-agent\\agent_hardened_entry\.py))(?:\s|$)'
  $match=[regex]::Match($commandLine,$pattern)
  if(-not $match.Success){return $null}
  $path=$match.Groups['quoted'].Value
  if(-not $path){$path=$match.Groups['bare'].Value}
  try{return [IO.Path]::GetFullPath($path)}catch{return $null}
}

$agents=@($processes|ForEach-Object {
  $entry=Get-Entrypoint ([string]$_.CommandLine)
  if($entry){[pscustomobject]@{pid=[int]$_.ProcessId;entry=$entry}}
})
$candidates=@(foreach($root in $roots){
  $agent=Join-Path $root 'ames-agent\agent_hardened_entry.py'
  $data=Join-Path $root 'ames-agent\data'
  $owners=@($agents|Where-Object {$_.entry -ieq $agent}|Select-Object -ExpandProperty pid)
  [pscustomobject]@{
    root=$root
    canonical_entry_exists=(Test-Path -LiteralPath $agent -PathType Leaf)
    sqlite_exists=(Test-Path -LiteralPath (Join-Path $data 'ames_local.sqlite3') -PathType Leaf)
    config_exists=(Test-Path -LiteralPath (Join-Path $root 'ames-agent\config.json') -PathType Leaf)
    token_exists=(Test-Path -LiteralPath (Join-Path $data 'local_agent_token') -PathType Leaf)
    matching_agent_pids=@($owners)
    listener_owner_matches=($portChecked -and $listeners.Count -eq 1 -and $owners.Count -eq 1 -and [int]$listeners[0] -eq [int]$owners[0])
  }
})
$knownPids=@($agents|Select-Object -ExpandProperty pid)
$matchedPids=@($candidates|ForEach-Object {$_.matching_agent_pids}|Select-Object -Unique)
$unknownListeners=@($listeners|Where-Object {$_ -notin $knownPids})
[pscustomobject]@{
  schema=$schema
  read_only=$true
  candidates=$candidates
  port_8765_verified=$portChecked
  listener_pids=@($listeners)
  unmatched_listener_pids=@($unknownListeners)
  canonical_agents_outside_scan=@($agents|Where-Object {$_.pid -notin $matchedPids}|Select-Object -ExpandProperty pid)
  updater_eligible=$false
  reason='inventory_only_no_idle_or_backup_proof'
}|ConvertTo-Json -Depth 6
