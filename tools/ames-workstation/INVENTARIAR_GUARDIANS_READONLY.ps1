# Issue #57: supplementary, read-only guardian/autostart inventory. It is NOT
# an updater, a quiescence lease, or evidence that every Windows session was
# inspected. The old factory guardian may ignore all future update markers.
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'ISSUE57_GUARDIAN_SIGNALS.ps1')
$observations=New-Object 'System.Collections.Generic.List[object]'
$checks=New-Object 'System.Collections.Generic.List[object]'
$unreadableSupervisorProcesses=0

function Add-InventoryCheck([string]$source,[bool]$complete) {
  $script:checks.Add([pscustomobject]@{source=$source;checked=$complete})
}
function Add-GuardianObservation([string]$source,[string]$signal,[int]$processId=0) {
  if($signal -eq 'unrelated'){return}
  $entry=[ordered]@{source=$source;signal=$signal}
  if($processId -gt 0){$entry.pid=$processId}
  $script:observations.Add([pscustomobject]$entry)
}

# Inspect metadata in memory only. NEVER serialize CommandLine, task arguments,
# service PathName, registry values, shortcuts, or error messages.
try {
  $items=@(Get-CimInstance Win32_Process -ErrorAction Stop)
  foreach($item in $items) {
    $name=[string]$item.Name
    if($name -notin @('powershell.exe','pwsh.exe','cmd.exe','wscript.exe','cscript.exe','python.exe','pythonw.exe')){continue}
    if(-not $item.CommandLine){$unreadableSupervisorProcesses++;continue}
    $signal=Get-Issue57GuardianSignal -CommandText ([string]$item.CommandLine)
    Add-GuardianObservation 'running_process' $signal ([int]$item.ProcessId)
  }
  Add-InventoryCheck 'running_processes' $true
}catch{Add-InventoryCheck 'running_processes' $false}

foreach($regSpec in @(
  @{path='Registry::HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run';source='hkcu_run'},
  @{path='Registry::HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\RunOnce';source='hkcu_runonce'},
  @{path='Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Run';source='hklm_run'},
  @{path='Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce';source='hklm_runonce'},
  @{path='Registry::HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Run';source='hklm_wow_run'}
)) {
  try {
    if(Test-Path -LiteralPath $regSpec.path){
      $values=Get-ItemProperty -LiteralPath $regSpec.path -ErrorAction Stop
      foreach($property in $values.PSObject.Properties){
        if($property.Name -like 'PS*'){continue}
        $signal=Get-Issue57GuardianSignal -CommandText ([string]$property.Value) -RegistrationName ([string]$property.Name)
        Add-GuardianObservation $regSpec.source $signal
      }
    }
    Add-InventoryCheck $regSpec.source $true
  }catch{Add-InventoryCheck $regSpec.source $false}
}

try {
  $tasks=@(Get-ScheduledTask -ErrorAction Stop)
  foreach($task in $tasks){
    $name=[string]$task.TaskName
    foreach($action in @($task.Actions)){
      $signal=Get-Issue57GuardianSignal -CommandText (([string]$action.Execute)+' '+([string]$action.Arguments)) -RegistrationName $name
      Add-GuardianObservation 'scheduled_task' $signal
    }
    if(-not $task.Actions){
      Add-GuardianObservation 'scheduled_task' (Get-Issue57GuardianSignal -RegistrationName $name)
    }
  }
  Add-InventoryCheck 'scheduled_tasks' $true
}catch{Add-InventoryCheck 'scheduled_tasks' $false}

try {
  $services=@(Get-CimInstance Win32_Service -ErrorAction Stop)
  foreach($service in $services){
    $signal=Get-Issue57GuardianSignal -CommandText ([string]$service.PathName) -RegistrationName ([string]$service.Name)
    Add-GuardianObservation 'windows_service' $signal
  }
  Add-InventoryCheck 'windows_services' $true
}catch{Add-InventoryCheck 'windows_services' $false}

foreach($startupSpec in @(
  @{path=[Environment]::GetFolderPath('Startup');source='startup_current_user'},
  @{path=[Environment]::GetFolderPath('CommonStartup');source='startup_common'}
)) {
  try {
    if($startupSpec.path -and (Test-Path -LiteralPath $startupSpec.path -PathType Container)){
      foreach($file in @(Get-ChildItem -LiteralPath $startupSpec.path -File -ErrorAction Stop)){
        # An arbitrary shortcut NAME cannot prove its target is unrelated.
        # Read only the already-existing .lnk metadata, NEVER its payload
        # as a command and NEVER serialize TargetPath or Arguments.
        $signal=Get-Issue57StartupSignal -ShortcutPath $file.FullName -RegistrationName ([string]$file.BaseName)
        if($signal -eq 'unrelated' -and $file.BaseName -match '(?i)(?:^|[^a-z0-9])(?:AMES|Central|Guardian)(?:[^a-z0-9]|$)'){
          $signal='startup_shortcut_unverified'
        }
        Add-GuardianObservation $startupSpec.source $signal
      }
    }
    Add-InventoryCheck $startupSpec.source $true
  }catch{Add-InventoryCheck $startupSpec.source $false}
}

$coordination=Get-Issue57CoordinationBlockers -Observations @($observations.ToArray()) -Checks @($checks.ToArray()) -UnreadableSupervisorProcesses $unreadableSupervisorProcesses

[pscustomobject]@{
  schema='ames-windows-guardian-inventory-v1'
  read_only=$true
  checks=@($checks.ToArray())
  observations=@($observations.ToArray())
  unreadable_supervisor_processes=$unreadableSupervisorProcesses
  coordination_blockers=$coordination.blockers
  direct_launcher_fenced=$false
  observed_sources_complete=(@($checks|Where-Object {-not $_.checked}).Count -eq 0 -and $unreadableSupervisorProcesses -eq 0)
  # Other accounts/sessions, legacy scripts, hidden launchers and unknown
  # Windows persistence paths remain outside this scanner's proof boundary.
  all_sessions_attested=$false
  installed_guardian_cooperation_attested=$false
  exclusive_maintenance_lease_held=$false
  updater_eligible=$false
  reason='read_only_observation_cannot_authorize_process_stop_or_update'
}|ConvertTo-Json -Depth 6
