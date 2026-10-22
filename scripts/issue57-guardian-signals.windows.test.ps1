$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '..\tools\ames-workstation\ISSUE57_GUARDIAN_SIGNALS.ps1')
$cases=@(
  @{cmd='powershell -File "C:\Users\Test\Downloads\AMES_Central_CLEAN_old\suporte\ames-workstation\KEEP_AGENT_RUNNING.ps1" -Root "C:\Users\Test\Downloads"';name='';want='guardian_script'},
  @{cmd='powershell -File C:\temp\START_AGENT_CANONICAL.ps1';name='';want='agent_launcher'},
  @{cmd='python C:\temp\ames-agent\agent_hardened_entry.py --port 8765';name='';want='agent_entry'},
  @{cmd='powershell.exe -WindowStyle Hidden';name='CentralAMESOperatorAgent';want='named_registration_unverified'},
  @{cmd='"C:\Program Files\Unrelated\start.exe"';name='Unrelated Service';want='unrelated'},
  @{cmd='';name='';want='unrelated'}
)
foreach($case in $cases){
  $actual=Get-Issue57GuardianSignal -CommandText $case.cmd -RegistrationName $case.name
  if($actual -cne $case.want){throw "Guardian fixture classification mismatch: expected $($case.want) got $actual"}
}
$direct=Get-Issue57CoordinationBlockers -Observations @([pscustomobject]@{signal='agent_launcher';source='scheduled_task'}) -Checks @([pscustomobject]@{checked=$true})
if($direct.schema -ne 'ames-issue57-coordination-blockers-v1' -or $direct.update_authorized -or $direct.direct_launcher_fenced){throw 'Direct launcher must never authorize a transaction'}
foreach($required in @('direct_launcher_not_fenced','direct_launcher_registration_or_process_observed','installed_guardian_cooperation_not_attested')){
  if($required -notin $direct.blockers){throw "Missing launcher blocker: $required"}
}
$empty=Get-Issue57CoordinationBlockers -Observations @() -Checks @([pscustomobject]@{checked=$true})
if($empty.update_authorized -or 'other_windows_sessions_not_attested' -notin $empty.blockers){throw 'Empty observation is not a global exclusive lease'}
$unknown=Get-Issue57CoordinationBlockers -Observations @([pscustomobject]@{signal='unexpected'}) -Checks @([pscustomobject]@{checked=$false}) -UnreadableSupervisorProcesses 2
foreach($required in @('unclassified_supervisor_observation','inventory_source_incomplete','supervisor_commandline_unreadable')){
  if($required -notin $unknown.blockers){throw "Missing unknown blocker: $required"}
}
$inventory=& (Join-Path $PSScriptRoot '..\tools\ames-workstation\INVENTARIAR_GUARDIANS_READONLY.ps1') | ConvertFrom-Json
if($inventory.schema -ne 'ames-windows-guardian-inventory-v1'){throw 'Unexpected inventory schema'}
if(-not $inventory.read_only){throw 'Scanner must be read-only'}
foreach($key in @('updater_eligible','all_sessions_attested','installed_guardian_cooperation_attested','exclusive_maintenance_lease_held')){
  if($inventory.$key -ne $false){throw "Scanner must fail closed: $key"}
}
if(@($inventory.checks).Count -lt 5){throw 'Insufficient read-only inventory coverage'}
if($inventory.direct_launcher_fenced -ne $false -or @($inventory.coordination_blockers).Count -lt 3){throw 'Live runner inventory must remain blocked'}
Write-Output "Issue57 guardian fixtures ($($cases.Count)) and Windows runner scanner: GREEN (no update authorized)"
