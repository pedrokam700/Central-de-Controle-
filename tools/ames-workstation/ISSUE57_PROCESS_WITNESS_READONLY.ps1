param(
  [Parameter(Mandatory=$true)][ValidateRange(1,2147483647)][int]$TargetPid,
  [Parameter(Mandatory=$true)][string]$ExpectedScript,
  [ValidateRange(1,65535)][int]$Port=8765,
  [switch]$FixtureOnly
)

# Issue #57 T1: OS-level, READ-ONLY witness. Never stops/restarts/installs an
# agent, opens credentials, grants a lease or certifies the installed guardian.
# Output deliberately omits CommandLine, paths, user/SID and raw timestamps.
$ErrorActionPreference='Stop'
$result=[ordered]@{
  schema='ames-windows-process-witness-v1'
  read_only=$true
  pid=$TargetPid
  endpoint_owner_pid=0
  script_sha256=$null
  script_path_sha256=$null
  start_marker=$null
  process_identity_observed=$false
  guardian_attested=$false
  all_sessions_attested=$false
  update_authorized=$false
  reason='unverified'
}

function Get-Issue57Hash([string]$value){
  $sha=[Security.Cryptography.SHA256]::Create()
  try{return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($value)))).Replace('-','').ToLowerInvariant()}
  finally{$sha.Dispose()}
}

try{
  # Port 8765 is the only operational target. Random fixture ports are
  # permitted exclusively on a GitHub-hosted Windows CI runner.
  if($FixtureOnly){
    if($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows' -or
       -not $env:RUNNER_TEMP){throw 'fixture_environment_required'}
  }elseif($Port -ne 8765){throw 'production_port_mismatch'}

  $scriptPath=[IO.Path]::GetFullPath($ExpectedScript)
  $file=Get-Item -LiteralPath $scriptPath -ErrorAction Stop
  if($file.PSIsContainer -or ($file.Attributes -band [IO.FileAttributes]::ReparsePoint)){
    throw 'script_file_untrusted'
  }
  $proc=Get-CimInstance Win32_Process -Filter ("ProcessId = {0}" -f $TargetPid) -ErrorAction Stop
  if(@($proc).Count -ne 1 -or -not $proc.CommandLine -or
     [string]$proc.Name -notmatch '^(?:python|pythonw)\.exe$' -or
     -not $proc.CreationDate -or -not $proc.ExecutablePath){throw 'process_unverified'}

  # The independent kernel TCP table, not /ready, must prove the listener.
  $owners=@(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop)
  if($owners.Count -eq 0){throw 'listener_absent'}
  foreach($owner in $owners){
    if([int]$owner.OwningProcess -ne $TargetPid -or
       [string]$owner.LocalAddress -notin @('127.0.0.1','::1')){
      throw 'port_owner_or_bind_mismatch'
    }
  }

  # Parse command-line arguments with the Windows API: a substring search
  # would incorrectly accept an attacker-controlled prefix/path argument.
  if(-not ('Issue57ArgvReadOnly' -as [type])){
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class Issue57ArgvReadOnly {
    [DllImport("shell32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
    public static extern IntPtr CommandLineToArgvW(string text, out int argc);
    [DllImport("kernel32.dll")]
    public static extern IntPtr LocalFree(IntPtr pointer);
}
'@
  }
  [int]$argc=0
  $pointer=[Issue57ArgvReadOnly]::CommandLineToArgvW([string]$proc.CommandLine,[ref]$argc)
  if($pointer -eq [IntPtr]::Zero -or $argc -lt 2){throw 'command_line_unparseable'}
  try{
    $scriptArgument=$null
    for($index=1;$index -lt $argc;$index++){
      $text=[Runtime.InteropServices.Marshal]::PtrToStringUni(
        [Runtime.InteropServices.Marshal]::ReadIntPtr($pointer,$index*[IntPtr]::Size))
      # A script path appearing as a later argument to "python -c" or "-m"
      # is NOT the program executed. Only fixed safe interpreter flags may
      # precede the first, rooted source-code argument.
      if($text -cin @('-B','-u','-E','-I','-s','-S')){continue}
      $scriptArgument=$text
      break
    }
    if(-not $scriptArgument -or -not [IO.Path]::IsPathRooted($scriptArgument) -or
       -not [string]::Equals([IO.Path]::GetFullPath($scriptArgument),$scriptPath,
                             [StringComparison]::OrdinalIgnoreCase)){
      throw 'script_argument_mismatch'
    }
  }finally{[void][Issue57ArgvReadOnly]::LocalFree($pointer)}

  # The marker binds OS process creation, PID and executed image, but it is
  # not an authorization token and not an attestation of guardian cooperation.
  $creation=([DateTime]$proc.CreationDate).ToUniversalTime().Ticks
  $result.endpoint_owner_pid=$TargetPid
  $result.script_sha256=(Get-FileHash -LiteralPath $scriptPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $result.script_path_sha256=Get-Issue57Hash $scriptPath.ToLowerInvariant()
  $result.start_marker=Get-Issue57Hash ("{0}|{1}|{2}" -f $TargetPid,$creation,([string]$proc.ExecutablePath).ToLowerInvariant())
  $result.process_identity_observed=$true
  $result.reason='process_only_guardian_and_writers_unattested'
}catch{
  # Never serialize native error messages, command line or private paths.
  $result.endpoint_owner_pid=0
  $result.script_sha256=$null
  $result.script_path_sha256=$null
  $result.start_marker=$null
  $result.process_identity_observed=$false
  $result.reason='independent_windows_witness_failed_closed'
}
[pscustomobject]$result|ConvertTo-Json -Compress -Depth 3
