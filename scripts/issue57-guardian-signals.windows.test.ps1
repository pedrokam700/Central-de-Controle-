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
$inventory=& (Join-Path $PSScriptRoot '..\tools\ames-workstation\INVENTARIAR_GUARDIANS_READONLY.ps1') | ConvertFrom-Json
if($inventory.schema -ne 'ames-windows-guardian-inventory-v1'){throw 'Unexpected inventory schema'}
if(-not $inventory.read_only){throw 'Scanner must be read-only'}
foreach($key in @('updater_eligible','all_sessions_attested','installed_guardian_cooperation_attested','exclusive_maintenance_lease_held')){
  if($inventory.$key -ne $false){throw "Scanner must fail closed: $key"}
}
if(@($inventory.checks).Count -lt 5){throw 'Insufficient read-only inventory coverage'}
Write-Output "Issue57 guardian fixtures ($($cases.Count)) and Windows runner scanner: GREEN (no update authorized)"
