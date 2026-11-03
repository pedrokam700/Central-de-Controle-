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
  # Encoded/dynamic launchers cannot be ruled out from a literal string
  # inventory. Never decode or output their payload: it could contain secrets.
  if($textValue -match '(?i)(?:^|[\s"''])-(?:enc(?:odedcommand)?|encodedarguments)(?:\s|$)' -or
     $textValue -match '(?i)\bpythonw?\.exe\s+-(?:c|m)\b' -or
     $textValue -match '(?i)\b(?:powershell|pwsh)(?:\.exe)?\s+[^\r\n]*?-(?:command|c)\s') {
    return 'opaque_supervisor_unverified'
  }
  return 'unrelated'
}

function Get-Issue57StartupSignal {
  param([Parameter(Mandatory=$true)][string]$ShortcutPath,
        [AllowNull()][string]$RegistrationName)

  # Called only for an EXISTING .lnk. Reading its COM target/arguments is
  # observation, not execution; saving the shortcut is forbidden.
  if([IO.Path]::GetExtension($ShortcutPath) -ine '.lnk') {
    $named=Get-Issue57GuardianSignal -RegistrationName $RegistrationName
    if($named -ne 'unrelated'){return $named}
    # A generically named Startup script can launch A-MES indirectly; do
    # not execute/read arbitrary contents to guess what it does.
    if([IO.Path]::GetExtension($ShortcutPath) -in @('.cmd','.bat','.ps1','.vbs','.js','.exe')){
      return 'startup_shortcut_unverified'
    }
    return 'unrelated'
  }
  try {
    $item=Get-Item -LiteralPath $ShortcutPath -Force -ErrorAction Stop
    if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){
      return 'startup_shortcut_unverified'
    }
    $shell=New-Object -ComObject WScript.Shell -ErrorAction Stop
    $shortcut=$shell.CreateShortcut($item.FullName)
    $target=[string]$shortcut.TargetPath
    $arguments=[string]$shortcut.Arguments
    if(-not $target) {return 'startup_shortcut_unverified'}
    $signal=Get-Issue57GuardianSignal -CommandText ($target+' '+$arguments) -RegistrationName $RegistrationName
    if($signal -ne 'unrelated'){return $signal}
    # An otherwise unrecognizable interpreter or script shortcut might invoke
    # the old guardian indirectly. Its body/arguments are never executed.
    if($target -match '(?i)(?:^|[\\/])(?:powershell|pwsh|cmd|wscript|cscript|pythonw?)(?:\.exe)?$' -or
       [IO.Path]::GetExtension($target) -in @('.cmd','.bat','.ps1','.vbs','.js')){
      return 'startup_shortcut_unverified'
    }
    return 'unrelated'
  }catch{
    # Broken/foreign/locked shortcuts are not evidence of a safe startup.
    return 'startup_shortcut_unverified'
  }
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
    @{signal='opaque_supervisor_unverified';reason='opaque_supervisor_command_unverified'},
    @{signal='named_registration_unverified';reason='named_registration_unverified'},
    @{signal='startup_shortcut_unverified';reason='startup_shortcut_unverified'}
  )){
    if($signals -contains $case.signal){$reasons.Add($case.reason)}
  }
  if(@($signals|Where-Object {$_ -notin @('guardian_script','agent_launcher','agent_entry','opaque_supervisor_unverified','named_registration_unverified','startup_shortcut_unverified')}).Count -gt 0){
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
