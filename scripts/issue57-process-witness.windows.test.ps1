# Run only in isolated Windows GitHub CI. Read-only OS attestation against an
# ephemeral Python child on a random loopback port, never the factory's 8765.
$ErrorActionPreference='Stop'
if($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows' -or -not $env:RUNNER_TEMP){
  throw 'windows_ci_fixture_only'
}
$fixture=(Resolve-Path -LiteralPath './scripts/issue57_process_witness_fixture.py').Path
$witness=(Resolve-Path -LiteralPath './tools/ames-workstation/ISSUE57_PROCESS_WITNESS_READONLY.ps1').Path
$other=(Resolve-Path -LiteralPath './scripts/agent-issue57-drain-protocol.test.py').Path
$start=[Diagnostics.ProcessStartInfo]::new()
$start.FileName='python'
$start.Arguments='"'+$fixture+'"'
$start.UseShellExecute=$false
$start.RedirectStandardOutput=$true
$start.RedirectStandardError=$true
$start.CreateNoWindow=$true
$child=[Diagnostics.Process]::Start($start)
if(-not $child){throw 'ephemeral_listener_start_failed'}
try{
  $line=$child.StandardOutput.ReadLineAsync()
  if(-not $line.Wait(10000)){throw 'ephemeral_listener_timeout'}
  [int]$port=0
  if(-not [int]::TryParse($line.Result,[ref]$port) -or $port -le 1024 -or $port -eq 8765){
    throw 'ephemeral_port_invalid'
  }
  $first=@(& $witness -TargetPid $child.Id -ExpectedScript $fixture -Port $port -FixtureOnly | ConvertFrom-Json)
  if($first.Count -ne 1 -or $first[0].process_identity_observed -ne $true -or
     $first[0].endpoint_owner_pid -ne $child.Id -or $first[0].update_authorized -ne $false -or
     $first[0].guardian_attested -ne $false -or $first[0].start_marker -notmatch '^[0-9a-f]{64}$'){
    throw 'independent_process_witness_positive_failed'
  }
  $second=@(& $witness -TargetPid $child.Id -ExpectedScript $fixture -Port $port -FixtureOnly | ConvertFrom-Json)
  if($first[0].start_marker -ne $second[0].start_marker){throw 'process_creation_marker_unstable'}
  $wrongScript=@(& $witness -TargetPid $child.Id -ExpectedScript $other -Port $port -FixtureOnly | ConvertFrom-Json)
  if($wrongScript[0].process_identity_observed -ne $false -or $wrongScript[0].update_authorized -ne $false){
    throw 'wrong_script_accepted'
  }
  $wrongPid=@(& $witness -TargetPid $PID -ExpectedScript $fixture -Port $port -FixtureOnly | ConvertFrom-Json)
  if($wrongPid[0].process_identity_observed -ne $false){throw 'wrong_pid_accepted'}
  $wrongPort=@(& $witness -TargetPid $child.Id -ExpectedScript $fixture -Port 8765 -FixtureOnly | ConvertFrom-Json)
  if($wrongPort[0].process_identity_observed -ne $false){throw 'wrong_port_accepted'}
  # An argument later in the command line must not disguise "python -c" as
  # execution of the approved file. This child also owns a real TCP listener.
  $evalStart=[Diagnostics.ProcessStartInfo]::new()
  $evalStart.FileName='python'
  $evalStart.ArgumentList.Add('-c')
  $evalStart.ArgumentList.Add("import socket,time;s=socket.socket();s.bind(('127.0.0.1',0));s.listen(1);print(s.getsockname()[1],flush=True);time.sleep(20)")
  $evalStart.ArgumentList.Add($fixture)
  $evalStart.UseShellExecute=$false
  $evalStart.RedirectStandardOutput=$true
  $evalStart.CreateNoWindow=$true
  $evalChild=[Diagnostics.Process]::Start($evalStart)
  if(-not $evalChild){throw 'opaque_python_fixture_start_failed'}
  try{
    $evalLine=$evalChild.StandardOutput.ReadLineAsync()
    if(-not $evalLine.Wait(10000)){throw 'opaque_python_fixture_timeout'}
    [int]$evalPort=0
    if(-not [int]::TryParse($evalLine.Result,[ref]$evalPort) -or $evalPort -le 1024){
      throw 'opaque_python_port_invalid'
    }
    $camouflage=@(& $witness -TargetPid $evalChild.Id -ExpectedScript $fixture -Port $evalPort -FixtureOnly | ConvertFrom-Json)
    if($camouflage[0].process_identity_observed -ne $false){throw 'python_eval_argument_camouflage_accepted'}
  }finally{
    if(-not $evalChild.HasExited){$evalChild.Kill();$evalChild.WaitForExit(10000)|Out-Null}
    $evalChild.Dispose()
  }
  Write-Output 'Issue57 Windows process witness: OS listener PID + creation + exact script; negative cases fail closed; no update'
}finally{
  # Terminate ONLY the child explicitly created by this fixture.
  if(-not $child.HasExited){$child.Kill();$child.WaitForExit(10000)|Out-Null}
  $child.Dispose()
}
