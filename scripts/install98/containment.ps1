$ErrorActionPreference='Stop'
if($env:GITHUB_ACTIONS -cne 'true' -or $env:RUNNER_OS -cne 'Windows'){throw 'DISPOSABLE_WINDOWS_ONLY'}
$lab=[IO.Path]::GetFullPath($env:INSTALL98_ROOT)
if((Split-Path $lab -Parent) -ine [IO.Path]::GetFullPath($env:RUNNER_TEMP) -or (Split-Path $lab -Leaf) -cne ('CENTRAL-INSTALL-LAB-'+$env:GITHUB_RUN_ID)){throw 'LAB_ROOT_UNVERIFIED'}
if((Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object LocalPort -eq 8765)){throw '8765_ALREADY_USED'}
Start-Service MpsSvc -ErrorAction Stop
$profiles=Get-NetFirewallProfile
if(@($profiles|Where-Object { -not $_.Enabled }).Count){Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled True}
if(@(Get-NetFirewallProfile|Where-Object { -not $_.Enabled }).Count){throw 'FIREWALL_NOT_ENABLED'}
$python=(Get-Command python).Source
$base=(& $python -B -c 'import sys;print(sys._base_executable)').Trim()
$programs=@($python,$base,($base -replace 'python.exe$','pythonw.exe'),(Get-Command pwsh).Source,
 "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe",
 'C:\Program Files\Google\Chrome\Application\chrome.exe','C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
 "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe","$lab\build-tools\Scripts\python.exe")
foreach($role in @('A','B')){
 $programs+="$lab\$role\.venv\Scripts\python.exe"
 $programs+="$lab\$role\.venv\Scripts\pythonw.exe"
 $programs+="$lab\$role\.venv\Lib\site-packages\playwright\driver\node.exe"
}
$group='CENTRAL98-'+$env:GITHUB_RUN_ID
# Block ALL outbound addresses for each audited executable. The positive native
# loopback probe below must independently prove Windows' loopback behavior.
# Never infer an exception from configuration alone or broaden egress to pass.
$remote='Any'
$count=0
foreach($program in @($programs|Sort-Object -Unique)){
 New-NetFirewallRule -DisplayName "$group-$count" -Group $group -Direction Outbound -Action Block -Program $program -RemoteAddress $remote -Profile Any -Enabled True | Out-Null
 $count++
}
$rules=@(Get-NetFirewallRule -Group $group)
if($rules.Count -ne $count -or @($rules|Where-Object {$_.Enabled -ne 'True' -or $_.Action -ne 'Block'}).Count){throw 'RULES_UNVERIFIED'}
# WFP failure auditing is a kernel denial witness, not a timeout-as-proof.
& auditpol.exe /set '/subcategory:{0CCE9226-69AE-11D9-BED3-505054503030}' /failure:enable
if($LASTEXITCODE -ne 0){throw 'WFP_AUDIT_UNAVAILABLE'}
& auditpol.exe /set '/subcategory:{0CCE9225-69AE-11D9-BED3-505054503030}' /failure:enable
if($LASTEXITCODE -ne 0){throw 'WFP_PACKET_AUDIT_UNAVAILABLE'}
$since=Get-Date
$probe=Join-Path $lab 'deny-probe.py'
@'
import json,os,socket,threading
s=socket.socket();s.bind(('127.0.0.1',0));s.listen()
c=socket.socket();c.settimeout(2);c.connect(s.getsockname());a,_=s.accept();a.close();c.close();s.close()
denied=socket.socket();denied.settimeout(2)
result=denied.connect_ex(('198.51.100.1',443));denied.close()
assert result!=0
print(json.dumps({'pid':os.getpid(),'loopback':True,'external_connect_result':result}))
'@ | Set-Content -LiteralPath $probe -Encoding utf8
$output=& $python -B $probe
if($LASTEXITCODE -ne 0){throw 'NETWORK_DENIAL_PROBE_FAILED'}
$proof=$output|ConvertFrom-Json
Write-Output ("NATIVE_PROBE "+($proof|ConvertTo-Json -Compress))
$matching=@()
for($attempt=0;$attempt -lt 20 -and $matching.Count -eq 0;$attempt++){
 $events=@(Get-WinEvent -FilterHashtable @{LogName='Security';Id=5157,5152;StartTime=$since.AddSeconds(-2)} -ErrorAction SilentlyContinue)
 $matching=@($events|Where-Object {
  $eventXml=[xml]$_.ToXml();$fields=@{};foreach($d in $eventXml.Event.EventData.Data){$fields[$d.Name]=[string]$d.'#text'}
  $fields['DestAddress'] -eq '198.51.100.1' -and [int64]$fields['ProcessID'] -eq [int64]$proof.pid
 })
 if($matching.Count -eq 0){Start-Sleep -Milliseconds 1000}
}
if($matching.Count -lt 1){throw 'KERNEL_DENIAL_NOT_PROVEN_NO_AGENT_MAY_START'}
@{schema='central98-windows-containment-v1';kernel_deny_proven=$true;loopback_proven=[bool]$proof.loopback;
 rules=$count;wfp_denials=$matching.Count;scope='PINNED_PYTHON_POWERSHELL_CHROME_PLAYWRIGHT_PROCESSES';physical='PENDING'}|
 ConvertTo-Json | Set-Content -LiteralPath (Join-Path $lab 'containment.json') -Encoding utf8
Write-Output "KERNEL_DENIAL_PROVEN rules=$count; LOOPBACK_PROVEN; no MES endpoint probed"
