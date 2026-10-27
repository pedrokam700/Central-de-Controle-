# Windows-only, disposable CI proof. Never inspect a physical CLEAN root.
$ErrorActionPreference='Stop'
if($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows' -or -not $env:RUNNER_TEMP){
  throw 'fixture_requires_ephemeral_windows_ci'
}
$fixture=Join-Path $env:RUNNER_TEMP ('issue57-private-acl-fixture-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixture -ErrorAction Stop|Out-Null
try{
  $env:ISSUE57_ACL_FIXTURE=$fixture
  $code=@'
import os, sqlite3, sys
from pathlib import Path
root=Path(os.environ['ISSUE57_ACL_FIXTURE'])
agent=root/'synthetic-live'/'ames-agent'
data=agent/'data'
data.mkdir(parents=True)
connection=sqlite3.connect(data/'ames_local.sqlite3')
try:
    connection.execute('CREATE TABLE jobs (id TEXT PRIMARY KEY)')
    connection.execute("INSERT INTO jobs VALUES ('fixture-only')")
    connection.commit()
finally:
    connection.close()  # sqlite3 context manager alone leaks a Windows handle
(agent/'config.json').write_text('{"source_id":"fixture-not-production"}')
(data/'local_agent_token').write_text('test-only-token-never-printed')
(data/'exports').mkdir()
(data/'exports'/'synthetic-report.txt').write_text('test-only-report')
sys.path.insert(0,str(Path.cwd()/'tools'/'ames-workstation'))
from issue57_update_preflight import backup_operational_tree, verify_operational_backup
dest=root/'private-backup'
result=backup_operational_tree(root/'synthetic-live',dest)
assert result['agent_data_tree_verified'] and result['update_authorized'] is False
assert verify_operational_backup(dest)['verified']
'@
  & python -c $code
  if($LASTEXITCODE -ne 0){throw 'synthetic_backup_fixture_failed'}

  $verify=Join-Path $PSScriptRoot '..\tools\ames-workstation\VERIFY_PRIVATE_BACKUP_ACL.ps1'
  $private=Join-Path $fixture 'private-backup'
  $checked=& $verify -PrivateBackup $private
  if(-not $checked.verified -or $checked.update_authorized -or $checked.physical_acl_attested -or $checked.entries_checked -lt 6){
    throw 'expected_private_acl_not_proven'
  }

  # Adversarial broad ACE only on one throwaway fixture file; the read-only
  # verifier must refuse it without reading the token's content.
  $syntheticToken=Join-Path $private 'local_agent_token'
  & icacls.exe $syntheticToken /grant '*S-1-5-32-545:R' *> $null
  if($LASTEXITCODE -ne 0){throw 'unable_to_create_broad_ace_fixture'}
  $rejected=$false
  try{ $null=& $verify -PrivateBackup $private }catch{$rejected=$true}
  if(-not $rejected){throw 'broad_allow_ace_not_rejected'}
  Write-Output 'Issue57 private backup ACL: verified synthetic data and rejected broad ACE; no production touch'
}finally{
  Remove-Item Env:\ISSUE57_ACL_FIXTURE -ErrorAction SilentlyContinue
  # The only recursive removal is our unique runner-temp test fixture.
  if(Test-Path -LiteralPath $fixture -PathType Container){
    Remove-Item -LiteralPath $fixture -Recurse -Force -ErrorAction Stop
  }
}
