# Read-only Windows regression for PR69 SSID, profile display names, and WLAN adapter identity.
# Imports only pure functions; never runs netsh, changes routes, or starts agents.
$ErrorActionPreference='Stop'
$source=Join-Path $PSScriptRoot '..\tools\ames-workstation\ensure_ames_route.ps1'
$tokens=$null;$parseErrors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path -LiteralPath $source).Path,[ref]$tokens,[ref]$parseErrors)
if($parseErrors -and $parseErrors.Count){throw "Route PowerShell syntax failed: $($parseErrors -join '; ')"}
foreach($name in @('Resolve-WlanGuidForSsid','Resolve-WifiInterfaceIndex')){
  $defs=@($ast.FindAll({
    param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name
  },$true))
  if($defs.Count -ne 1){throw "Pure WLAN helper missing/duplicated: $name"}
  . ([ScriptBlock]::Create($defs[0].Extent.Text))
}
$guid='075c3c9d-02d6-4435-b103-e2e1f1c9e69f'
$ethernetGuid='11111111-2222-4333-8444-555555555555'
$pt=@(
 'Ha 1 interface no sistema:',
 ' Nome : Wi-Fi',
 " GUID : $guid",
 ' Estado : Conectado',
 ' SSID : TAXXX_5G',
 ' AP BSSID : 1c:94:68:31:45:20',
 ' Perfil : TAXXX_5G'
)
$wlan=Resolve-WlanGuidForSsid $pt 'TAXXX_5G'
if($wlan -ne [guid]$guid){throw 'Exact SSID did not bind to its WLAN GUID'}
$adapters=@(
 [pscustomobject]@{InterfaceGuid=$ethernetGuid;Status='Up';ifIndex=20;Name='Ethernet 4'},
 [pscustomobject]@{InterfaceGuid=$guid;Status='Up';ifIndex=3;Name='Wi-Fi'}
)
$index=Resolve-WifiInterfaceIndex $adapters $wlan
if($index -ne 3){throw "Ethernet selected instead of WLAN: $index"}
# Windows network profile display name is deliberately TAXXX_5G 2.
# The resolver must not query that mutable display name.
$scriptText=Get-Content -LiteralPath $source -Raw
if($scriptText -match 'Get-NetConnectionProfile[\s\S]*?\.Name\s+-eq\s+\$Profile'){throw 'Fragile exact Windows network profile lookup returned'}
if($scriptText -notmatch 'WlanQueryInterface'){throw 'Location permission diagnostic missing'}
if($scriptText -notmatch 'Get-NetIPConfiguration -InterfaceIndex \$wifiIndex'){throw 'WLAN IPv4/gateway verification missing'}
if($scriptText -notmatch '\$Prefix="\$TargetIp/32"'){throw 'Only exact /32 route is allowed'}
$negative=@(
 @('Nome : Wi-Fi',"GUID : $guid",'SSID : OTHER_WIFI'),
 @('Nome : Wi-Fi','SSID : TAXXX_5G'),
 @('Nome : Wi-Fi',"GUID : $guid",'SSID : TAXXX_5G','Nome : Wi-Fi 2',"GUID : $ethernetGuid",'SSID : TAXXX_5G')
)
foreach($case in $negative){
  $rejected=$false
  try{$null=Resolve-WlanGuidForSsid $case 'TAXXX_5G'}catch{$rejected=$true}
  if(-not $rejected){throw 'Missing, unbound or ambiguous SSID was accepted'}
}
$rejected=$false
try{$null=Resolve-WifiInterfaceIndex @([pscustomobject]@{InterfaceGuid=$ethernetGuid;Status='Up';ifIndex=20}) ([guid]$guid)}catch{$rejected=$true}
if(-not $rejected){throw 'Unrelated Ethernet adapter was accepted'}
Write-Output 'PR69 WLAN GUID/profile-name mismatch and route safety: PASS'
