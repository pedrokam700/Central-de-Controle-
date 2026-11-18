"""Installation changes must preserve the exact PR97 functional runtime."""
import ast,pathlib,subprocess,unittest
ROOT=pathlib.Path(__file__).resolve().parents[2]
BASE='52efc38182401e708dd9f80c6c57a27e7b8726ab'
def git(*args):return subprocess.check_output(['git',*args],cwd=ROOT,text=True).strip()
class Source(unittest.TestCase):
 def test_exact_base_ancestry(self):subprocess.run(['git','merge-base','--is-ancestor',BASE,'HEAD'],cwd=ROOT,check=True)
 def test_all_agent_engine_frontend_and_past_contracts_unchanged(self):
  frozen=['ames/','sw.js','index.html','app.js','styles.css','tools/ames-lab/']
  changed=git('diff','--name-only',BASE,'HEAD').splitlines()
  self.assertFalse([p for p in changed if any(p==x or p.startswith(x) for x in frozen)])
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
