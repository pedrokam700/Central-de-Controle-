param(
  [Parameter(Mandatory=$true)][string]$PrivateBackup
)
# Issue #57 C2c: READ-ONLY ACL verification. Never interprets an ACL check as
# permission to stop the agent, install binaries or restore production data.
# The backup path is deliberately never included in output/error text.
$ErrorActionPreference='Stop'
try{
if(-not $IsWindows -and $PSVersionTable.PSEdition -eq 'Core'){
  throw 'windows_acl_required'
}
$item=Get-Item -LiteralPath $PrivateBackup -Force -ErrorAction Stop
if(-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){
  throw 'untrusted_backup_root'
}
$principal=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$allowed=@($principal,'S-1-5-18','S-1-5-32-544') # current user, SYSTEM, Administrators
$pending=New-Object 'System.Collections.Generic.Queue[string]'
$pending.Enqueue($item.FullName)
$count=0
$ownerAllowed=$false
while($pending.Count -gt 0){
  $current=$pending.Dequeue()
  $entry=Get-Item -LiteralPath $current -Force -ErrorAction Stop
  if($entry.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'backup_reparse_point'}
  $count++
  if($count -gt 10000){throw 'backup_acl_entry_limit'}
  $acl=Get-Acl -LiteralPath $current -ErrorAction Stop
  if($count -eq 1 -and -not $acl.AreAccessRulesProtected){throw 'backup_root_inherits_acl'}
  foreach($rule in @($acl.Access)){
    if($rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow){continue}
    try{
      $sid=$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
    }catch{throw 'unresolvable_backup_acl_principal'}
    if($sid -notin $allowed){throw 'backup_acl_has_untrusted_allow_principal'}
    if($count -eq 1 -and $sid -eq $principal){$ownerAllowed=$true}
  }
  if($entry.PSIsContainer){
    foreach($child in @(Get-ChildItem -LiteralPath $current -Force -ErrorAction Stop)){
      if($child.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'backup_reparse_point'}
      $pending.Enqueue($child.FullName)
    }
  }
}
if(-not $ownerAllowed){throw 'backup_acl_current_user_missing'}
[pscustomobject]@{
  schema='ames-issue57-private-backup-acl-v1'
  verified=$true
  entries_checked=$count
  physical_acl_attested=$false # ephemeral runner != user's workstation
  browser_outbox_attested=$false
  update_authorized=$false
}
}catch{
  # Cmdlet failures can otherwise echo the private filesystem location.
  # Intentionally disclose neither the input path nor Windows account names.
  throw 'backup_acl_verification_failed'
}
