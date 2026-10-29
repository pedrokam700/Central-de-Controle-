# Read-only Windows regression tests. Do not execute the switcher transaction.
$ErrorActionPreference='Stop'
$source=Join-Path $PSScriptRoot '..\tools\ames-workstation\TROCAR_PARA_PR69_NOVA.ps1'
$tokens=$null
$errorsFound=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path -LiteralPath $source).Path,[ref]$tokens,[ref]$errorsFound)
if($errorsFound -and $errorsFound.Count -gt 0){
  foreach($errorFound in $errorsFound){Write-Error "Switch PowerShell syntax: $errorFound"}
  exit 1
}

# Exercise only the pure launcher detection function, with fictional PIDs and
# paths. This does not list, inspect or terminate any actual Windows process.
$definition=@($ast.FindAll({
  param($node)
  $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
    $node.Name -eq 'RelauncherType'
},$true))
if($definition.Count -ne 1){throw 'RelauncherType definition missing or duplicated'}
. ([ScriptBlock]::Create($definition[0].Extent.Text))
function Args($line){return @(([string]$line) -split '\s+')}
function After($items,[string]$flag){
  for($i=0;$i -lt $items.Count-1;$i++){
    if($items[$i] -ieq $flag){return $items[$i+1]}
  }
  return $null
}

$cases=@(
  @{name='canonical real -File';exe='powershell.exe';line='powershell.exe -NoProfile -File C:\old\suporte\ames-workstation\START_AGENT_CANONICAL.ps1 -Root C:\old';want='launcher'},
  @{name='guardian real -File';exe='pwsh.exe';line='pwsh.exe -File C:\old\suporte\ames-workstation\KEEP_AGENT_RUNNING.ps1 -Root C:\old';want='guardian'},
  @{name='candidate startup real -File';exe='powershell.exe';line='powershell.exe -File C:\old\START_LOCAL_CANDIDATE.ps1';want='launcher'},
  @{name='unrelated commands containing launcher text';exe='powershell.exe';line='powershell.exe -Command Write-Host START_AGENT_CANONICAL.ps1';want=$null},
  @{name='unrelated PowerShell file';exe='powershell.exe';line='powershell.exe -File C:\old\DIAGNOSTICO_POSTO.ps1';want=$null},
  @{name='non PowerShell process';exe='cmd.exe';line='cmd.exe /c START_AGENT_CANONICAL.ps1';want=$null}
)
foreach($case in $cases){
  $process=[pscustomobject]@{
    ExecutablePath="C:\Windows\System32\$($case.exe)"
    CommandLine=$case.line
  }
  $actual=RelauncherType $process
  if($actual -cne $case.want){throw "Launcher classification failed: $($case.name); expected=$($case.want); actual=$actual"}
}
Write-Output ('PR69 Windows switcher syntax and '+$cases.Count+' classification cases: PASS')
