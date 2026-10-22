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
