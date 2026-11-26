"""Installation changes must preserve the exact PR97 functional runtime."""
import ast,hashlib,pathlib,subprocess,unittest
ROOT=pathlib.Path(__file__).resolve().parents[2]
BASE='52efc38182401e708dd9f80c6c57a27e7b8726ab'
def git(*args):return subprocess.check_output(['git',*args],cwd=ROOT,text=True).strip()
class Source(unittest.TestCase):
 def test_exact_base_ancestry(self):subprocess.run(['git','merge-base','--is-ancestor',BASE,'HEAD'],cwd=ROOT,check=True)
 def test_runtime_changes_limited_to_reviewed_installation_period_and_history_files(self):
  frozen=['ames/','sw.js','index.html','app.js','styles.css','tools/ames-lab/']
  changed=git('diff','--name-only',BASE,'HEAD').splitlines()
  # Exact reviewed deltas for owned Home/OPC tabs and session-failure recovery.
  navigation_files = {
   'ames/agent/ames_3012_live.py': '7b2e1cfb1905bb1d8b07a8fcabb70a5092e068c0711e8f0e322b8c71ccc4fdb3',
   'ames/agent/ames_3012_strategy.py': 'fbc70efbfc3fc8656d49052882c6d4a77768289fd5926c97ea084871f368e287',
   'ames/factory-engine/ames/navigation.py': '74d3d4249029099d75edbe1c3cbcae438e21952fb9d7e41de71a9b36f49f64fb',
   'ames/factory-engine/tests/test_pr70_2114_tab_recovery.py': '6373fd71728f045128f9d33dc6eb84aebc3dab99fbce3d4dd19e726c03ccac54',
  }
  for path, digest in navigation_files.items():
   self.assertEqual(hashlib.sha256((ROOT/path).read_bytes()).hexdigest(),digest,path)
  self.assertFalse([p for p in changed if p not in navigation_files and p not in {'ames/console-improvements.css', 'ames/console-reuse-history-timeline.mjs', 'ames/agent/agent.py', 'ames/console-reuse-cohorts.mjs', 'ames/console-sn-repair-evidence.mjs', 'ames/data/reuse-history-timeline.mjs', 'ames/agent/comment_provenance_3028.py'} and any(p==x or p.startswith(x) for x in frozen)])
  before=git('show',BASE+':ames/agent/agent.py')
  old='        mime = mimetypes.guess_type(str(path))[0] or "application/octet-stream"'
  reviewed='        mime = "application/javascript" if path.suffix.lower() in {".js", ".mjs"} else (mimetypes.guess_type(str(path))[0] or "application/octet-stream")'
  self.assertTrue(before.index('    def _send_static(')<before.index(old)<before.index('    def _send_download('))
  self.assertEqual(git('show','150c32e025e8ba440b7d20d13a4f666dfb3289ae:ames/agent/agent.py'),before.replace(old,reviewed,1))
  self.assertIn(reviewed, (ROOT/'ames/agent/agent.py').read_text())
 def test_local_history_startup_has_explicit_route_free_entry(self):
  # Native boot already proves the local app works without MES/WLAN.
  # Current entrypoints nevertheless unconditionally require the factory route.
  for name in ('TROCAR_PARA_PR69_NOVA.ps1','START_LOCAL_CANDIDATE.ps1'):
   source=(ROOT/'tools/ames-workstation'/name).read_text()
   self.assertTrue('[switch]$LocalOnly' in source,name+' lacks explicit local-history startup')
 def test_runtime_imports_not_added_to_transfer(self):
  tree=ast.parse((ROOT/'tools/ames-workstation/SAFE_STATE_TRANSFER.py').read_text())
  modules={a.name.split('.')[0] for n in ast.walk(tree) if isinstance(n,ast.Import) for a in n.names}
  modules|={(n.module or '').split('.')[0] for n in ast.walk(tree) if isinstance(n,ast.ImportFrom)}
  self.assertFalse(modules&{'agent','agent_entry','store','engine_bridge','socket','requests','urllib'})
 def test_kernel_proof_required_before_genuine_code_execution(self):
  s=(ROOT/'scripts/install98/containment.ps1').read_text();self.assertIn('KERNEL_DENIAL_NOT_PROVEN_NO_AGENT_MAY_START',s)
  self.assertIn("$fields['DestAddress'] -eq '198.51.100.1'",s);self.assertIn("$fields['ProcessID']",s)
  s=(ROOT/'scripts/install98/integration.py').read_text();self.assertLess(s.index("['kernel_deny_proven']"),s.index("sourceA=LAB"))
if __name__=='__main__':unittest.main()
