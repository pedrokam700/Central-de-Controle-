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

# Import only pure helpers from the real production script, not a mocked
# command-line parser. The previously mocked parser missed the registry bug.
$scriptText=Get-Content -LiteralPath $source -Raw
$interop=[regex]::Match($scriptText,"(?s)Add-Type -TypeDefinition @'\s*\r?\n(.*?)\r?\n'@")
if(-not $interop.Success){throw 'Native Windows argv parser definition missing'}
Add-Type -TypeDefinition $interop.Groups[1].Value
foreach($name in @('SplitArgv','ValueAfter','Full','EqualPath','RootFor','RelauncherType')){
  $definition=@($ast.FindAll({
    param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
      $node.Name -eq $name
  },$true))
  if($definition.Count -ne 1){throw "Helper $name missing or duplicated"}
  . ([ScriptBlock]::Create($definition[0].Extent.Text))
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

# Reproduce the real user's exact layout: a working legacy package in a deep
# Downloads path with spaces, the same root in HKCU Run and the TCP agent.
# Use an isolated temporary fixture; do not read the real registry or port.
$fixtureRoot=Join-Path $env:RUNNER_TEMP ('PR69 fixture '+[guid]::NewGuid().ToString('N'))
$legacyRoot=Join-Path (Join-Path $fixtureRoot 'CENTRAL_AMES_PR69_RASTREABILIDADE_FPY_ALERTAS_0E97170B_COMPLETA') 'CENTRAL_AMES_PR69_COMPLETA'
$watcher=Join-Path $legacyRoot 'suporte\ames-workstation\KEEP_AGENT_RUNNING.ps1'
$agent=Join-Path $legacyRoot 'ames-agent\agent_hardened_entry.py'
foreach($file in @($watcher,$agent,(Join-Path $legacyRoot '00_INICIAR_AQUI.bat'),(Join-Path $legacyRoot 'CANDIDATE_MANIFEST.json'))){
  New-Item -ItemType Directory -Path (Split-Path $file -Parent) -Force|Out-Null
  Set-Content -LiteralPath $file -Value 'read-only fixture'
}
$registration='powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+$watcher+'" -Root "'+$legacyRoot+'"'
$runTokens=SplitArgv $registration
$registryWatcher=ValueAfter $runTokens '-File'
$registryRoot=Full (ValueAfter $runTokens '-Root')
$watcherRoot=RootFor $registryWatcher 'ames-workstation'
$activeAgentRoot=RootFor $agent 'ames-agent'
if(-not $registryRoot -or -not $watcherRoot -or -not $activeAgentRoot -or
   -not(EqualPath $registryRoot $watcherRoot) -or -not(EqualPath $registryRoot $activeAgentRoot)){
  throw "PR69 false registry mismatch: argc=$($runTokens.Count); watcher=$registryWatcher; registryRoot=$registryRoot; watcherRoot=$watcherRoot; activeAgentRoot=$activeAgentRoot"
}
Write-Output ('PR69 Windows switcher syntax and '+$cases.Count+' classification cases: PASS')
Write-Output 'PR69 Windows autostart and active agent same-root regression: PASS'
