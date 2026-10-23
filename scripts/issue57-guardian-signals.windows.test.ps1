$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '..\tools\ames-workstation\ISSUE57_GUARDIAN_SIGNALS.ps1')
$cases=@(
  @{cmd='powershell -File "C:\Users\Test\Downloads\AMES_Central_CLEAN_old\suporte\ames-workstation\KEEP_AGENT_RUNNING.ps1" -Root "C:\Users\Test\Downloads"';name='';want='guardian_script'},
  @{cmd='powershell -File C:\temp\START_AGENT_CANONICAL.ps1';name='';want='agent_launcher'},
  @{cmd='python C:\temp\ames-agent\agent_hardened_entry.py --port 8765';name='';want='agent_entry'},
  @{cmd='powershell.exe -WindowStyle Hidden';name='CentralAMESOperatorAgent';want='named_registration_unverified'},
  @{cmd='powershell.exe -NoProfile -EncodedCommand SQBFAFgA';name='Routine normal';want='opaque_supervisor_unverified'},
  @{cmd='python.exe -c "import os; os.system(\"hello\")"';name='';want='opaque_supervisor_unverified'},
  @{cmd='"C:\Program Files\Unrelated\start.exe"';name='Unrelated Service';want='unrelated'},
  @{cmd='';name='';want='unrelated'}
)
foreach($case in $cases){
  $actual=Get-Issue57GuardianSignal -CommandText $case.cmd -RegistrationName $case.name
  if($actual -cne $case.want){throw "Guardian fixture classification mismatch: expected $($case.want) got $actual"}
}
$opaque=Get-Issue57CoordinationBlockers -Observations @([pscustomobject]@{signal='opaque_supervisor_unverified'})
if($opaque.update_authorized -or 'opaque_supervisor_command_unverified' -notin $opaque.blockers){
  throw 'Opaque guardian launcher must be a blocker'
}
if($env:GITHUB_ACTIONS -eq 'true' -and $env:RUNNER_OS -eq 'Windows'){
  if(-not $env:RUNNER_TEMP){throw 'missing_runner_temp'}
  $id=[guid]::NewGuid().ToString('N')
  $fixture=Join-Path $env:RUNNER_TEMP ('issue57-startup-link-test-'+$id)
  $null=New-Item -ItemType Directory -Path $fixture -ErrorAction Stop
  try {
    $shell=New-Object -ComObject WScript.Shell
    $powershellExe=(Get-Command pwsh.exe -ErrorAction Stop).Source
    $link=Join-Path $fixture 'Daily-Handoff.lnk'
    $shortcut=$shell.CreateShortcut($link)
    $shortcut.TargetPath=$powershellExe
    $shortcut.Arguments='-NoProfile -File C:\Factory\KEEP_AGENT_RUNNING.ps1'
    $shortcut.Save()
    if((Get-Issue57StartupSignal -ShortcutPath $link -RegistrationName 'Daily-Handoff') -cne 'guardian_script'){
      throw 'Generic name masked guardian startup target'
    }
    $shortcut=$shell.CreateShortcut($link)
    $shortcut.Arguments='-NoProfile -EncodedCommand SQBFAFgA'
    $shortcut.Save()
    if((Get-Issue57StartupSignal -ShortcutPath $link -RegistrationName 'Daily-Handoff') -cne 'opaque_supervisor_unverified'){
      throw 'Encoded startup shortcut was considered safe'
    }
    $shortcut=$shell.CreateShortcut($link)
    $shortcut.Arguments='-NoProfile -File C:\Unlisted\daily.ps1'
    $shortcut.Save()
    if((Get-Issue57StartupSignal -ShortcutPath $link -RegistrationName 'Daily-Handoff') -cne 'startup_shortcut_unverified'){
      throw 'Unknown interpreter startup shortcut was considered safe'
    }
    $broken=Join-Path $fixture 'Daily-Unknown.lnk'
    [IO.File]::WriteAllText($broken,'not a valid windows shortcut')
    if((Get-Issue57StartupSignal -ShortcutPath $broken -RegistrationName 'Daily-Unknown') -cne 'startup_shortcut_unverified'){
      throw 'Broken startup shortcut was considered safe'
    }
    if((Get-Issue57StartupSignal -ShortcutPath (Join-Path $fixture 'Routine.cmd') -RegistrationName 'Routine') -cne 'startup_shortcut_unverified'){
      throw 'Uninspected startup script was considered safe'
    }
  }finally {
    # Only the unique synthetic runner fixture is removable.
    if((Split-Path -Leaf $fixture) -eq ('issue57-startup-link-test-'+$id)){
      Remove-Item -LiteralPath $fixture -Recurse -Force -ErrorAction Stop
    }
  }
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
$inventoryJson=$inventory|ConvertTo-Json -Depth 8 -Compress
$validated=@($inventoryJson | python -c 'import json,sys;sys.path.insert(0,"tools/ames-workstation");from issue57_drain_coordinator import inspect_readonly_guardian_inventory;review=inspect_readonly_guardian_inventory(json.load(sys.stdin));assert review["update_authorized"] is False;print("Issue57 scanner to Python review: read-only and update blocked")')
if($LASTEXITCODE -ne 0 -or $validated -notcontains 'Issue57 scanner to Python review: read-only and update blocked'){
  throw 'Windows scanner output did not satisfy Python registration-review contract'
}
Write-Output "Issue57 guardian fixtures ($($cases.Count)) and Windows runner scanner: GREEN (no update authorized)"
