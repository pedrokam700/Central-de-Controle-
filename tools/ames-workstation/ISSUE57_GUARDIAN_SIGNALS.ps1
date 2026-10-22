# Pure classification of Windows supervisor registrations. Never emit input text:
# command lines and registry values can contain secrets unrelated to A-MES.
function Get-Issue57GuardianSignal {
  param([AllowNull()][string]$CommandText, [AllowNull()][string]$RegistrationName)

  $textValue=[string]$CommandText
  $nameValue=[string]$RegistrationName
  if($textValue -match '(?i)\bKEEP_AGENT_RUNNING\.ps1\b') { return 'guardian_script' }
  if($textValue -match '(?i)\b(?:START_AGENT_CANONICAL|START_LOCAL_CANDIDATE|INICIAR_POSTO_LIMPO|INICIAR_POSTO_CENTRAL_V2|INICIAR_FASTLANE_TESTE)\.(?:ps1|bat|cmd)\b') { return 'agent_launcher' }
  if($textValue -match '(?i)\bagent_hardened_entry\.py\b') { return 'agent_entry' }
  if($nameValue -match '(?i)\b(?:CentralAMESOperatorAgent|CentralAMES|Central.A.MES|A.MES.OperatorGuardian)\b') { return 'named_registration_unverified' }
  return 'unrelated'
}

# Pure synthesis of untrusted, READ-ONLY observations. This deliberately does
# not grant a lease, even when every enumerated source happens to be empty.
# The installed guardian and direct launcher have NOT joined a common fence.
function Get-Issue57CoordinationBlockers {
  param(
    [object[]]$Observations=@(),
    [object[]]$Checks=@(),
    [int]$UnreadableSupervisorProcesses=0
  )
  if($UnreadableSupervisorProcesses -lt 0){throw 'Invalid supervisor count'}
  $reasons=New-Object 'System.Collections.Generic.List[string]'
  $reasons.Add('installed_guardian_cooperation_not_attested')
  $reasons.Add('direct_launcher_not_fenced')
  $reasons.Add('other_windows_sessions_not_attested')
  if($UnreadableSupervisorProcesses -gt 0){$reasons.Add('supervisor_commandline_unreadable')}
  if(@($Checks|Where-Object {$null -eq $_ -or $_.checked -cne $true}).Count -gt 0){
    $reasons.Add('inventory_source_incomplete')
  }
  $signals=@($Observations|ForEach-Object {
    if($null -eq $_){'unverified'}else{[string]$_.signal}
  })
  foreach($case in @(
    @{signal='guardian_script';reason='guardian_registration_or_process_observed'},
    @{signal='agent_launcher';reason='direct_launcher_registration_or_process_observed'},
    @{signal='agent_entry';reason='agent_process_observed_requires_idle_proof'},
    @{signal='named_registration_unverified';reason='named_registration_unverified'},
    @{signal='startup_shortcut_unverified';reason='startup_shortcut_unverified'}
  )){
    if($signals -contains $case.signal){$reasons.Add($case.reason)}
  }
  if(@($signals|Where-Object {$_ -notin @('guardian_script','agent_launcher','agent_entry','named_registration_unverified','startup_shortcut_unverified')}).Count -gt 0){
    $reasons.Add('unclassified_supervisor_observation')
  }
  return [pscustomobject]@{
    schema='ames-issue57-coordination-blockers-v1'
    blockers=@($reasons.ToArray())
    direct_launcher_fenced=$false
    installed_guardian_cooperation_attested=$false
    all_sessions_attested=$false
    exclusive_maintenance_lease_held=$false
    update_authorized=$false
  }
}
