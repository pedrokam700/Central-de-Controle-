"""Static source preservation and gate scope. No agent/updater/engine imports."""
import ast
import json
from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]
BASE = 'db3cb5b58c99bcf86c44b671280cb42f7dd31d4c'
BRANCH = 'work/ames-lab-entry-p01-p03-p06-20261117'
ALLOWED = {
 'scripts/audit/package-source-inventory.py',
 'docs/ames/audits/CONSOLIDACAO_EEDACC65_PR96_20261118.md',
 'tools/ames-lab/generation_reconcile.py', 'tools/ames-lab/p08_profile.json', 'scripts/fixtures/p08_generations.py', 'scripts/agent-p08-generation.test.py', 'scripts/agent-p08-preservation.test.py', 'scripts/agent-p08-native-readers.test.py', '.github/workflows/ames-p08-generations.yml', 'docs/ames/audits/PR96_P08_GENERATIONS_20261118.md', 'docs/ames/handoffs/PR96_P08_G6_20261118.md',
 'scripts/agent-p04-preservation.test.py',
    'tools/ames-lab/windows_preflight.py', 'tools/ames-lab/p04_profile.json',
    'tools/ames-lab/p04_windows_wheels.json', 'scripts/agent-p04-compatibility.test.py',
    'scripts/agent-p04-ci.py', 'scripts/agent-p04-preservation.test.py',
    '.github/workflows/ames-p04-windows-preflight.yml',
    'docs/ames/audits/PR95_P04_WINDOWS_20261118.md',
    'docs/ames/handoffs/PR95_P04_WINDOWS_20261118.md',
    'tools/ames-lab/synthetic_deidentify.py', 'tools/ames-lab/p02_profile.json',
    'scripts/fixtures/p02_state.json', 'scripts/fixtures/p02_installation.py',
    'scripts/agent-p02-deidentification.test.py', 'scripts/agent-p02-projection.test.py',
    'docs/ames/audits/PR94_P02_AUDITORIA_20261117.md',
    'docs/ames/handoffs/PR94_P02_SINTETICO_20261117.md',
    'docs/ames/audits/PR93_LAB_VALIDATION_20261117.json',
    'ames/agent/lab_entry.py', 'scripts/agent-lab-isolation.test.py',
    'scripts/agent-lab-preservation-static.test.py',
    '.github/workflows/ames-lab-isolation.yml', '.github/workflows/ames-lab-existing-regressions.yml',
    'netlify.toml', 'vercel.json', 'docs/ames/audits/PR93_LAB_P01_P03_P06_20261117.md',
    'docs/ames/handoffs/PR93_ENTRADA_LAB_P01_P03_P06_20261117.md',
    'docs/ames/homologation/LAB_SYNTHETIC_ENTRY.md',
    'docs/ames/homologation/HOMOLOGACAO_OFFLINE_0539_PR90_20261117.md',
    'docs/ames/homologation/OFFLINE_GATES_TEMPLATE.json',
}


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True).strip()


class LabSourcePreservation(unittest.TestCase):
    def test_exact_base_ancestry_and_closed_change_scope(self):
        subprocess.run(['git','merge-base','--is-ancestor',BASE,'HEAD'],cwd=ROOT,check=True)
        changed=set(git('diff','--name-only',BASE,'HEAD').splitlines())
        self.assertLessEqual(changed,ALLOWED)
        self.assertIn('ames/agent/lab_entry.py',changed)

    def test_every_preexisting_runtime_engine_ui_launcher_blob_is_identical(self):
        def entries(ref):
            result={}
            for row in git('ls-tree','-r',ref).splitlines():
                identity,path=row.split('\t',1)
                if path not in ALLOWED:result[path]=identity
            return result
        self.assertEqual(entries(BASE),entries('HEAD'))
        for path in ('ames/agent/update_candidate.py','ames/agent/agent.py',
                     'ames/agent/agent_entry.py','ames/agent/agent_hardened_entry.py',
                     'ames/agent/engine_bridge.py','ames/agent/process_r11.py',
                     'tools/ames-workstation/START_AGENT_CANONICAL.ps1',
                     'tools/ames-workstation/KEEP_AGENT_RUNNING.ps1','sw.js'):
            self.assertEqual(git('rev-parse',BASE+':'+path),git('rev-parse','HEAD:'+path))

    def test_lab_entry_cannot_import_operational_chain(self):
        source=(ROOT/'ames/agent/lab_entry.py').read_text()
        tree=ast.parse(source)
        modules={alias.name for node in ast.walk(tree) if isinstance(node,ast.Import) for alias in node.names}
        modules|={node.module for node in ast.walk(tree) if isinstance(node,ast.ImportFrom)}
        self.assertEqual(modules,{'__future__','errno','hashlib','json','os','pathlib','re','sqlite3','stat','sys'})
        for node in ast.walk(tree):
            if isinstance(node,ast.Call) and isinstance(node.func,ast.Name):
                self.assertNotIn(node.func.id,{'exec','eval','compile','__import__'})
        for forbidden in ('ThreadingHTTPServer','ensure_token','discover_engine','recover_jobs()','NetworkGuardian('):
            self.assertNotIn(forbidden,source)

    def test_physical_gates_and_independent_blockers_remain_pending(self):
        receipt=json.loads((ROOT/'docs/ames/homologation/OFFLINE_GATES_TEMPLATE.json').read_text())
        self.assertEqual(receipt['physical'],'PENDING')
        self.assertFalse(receipt['execution_authorized']);self.assertFalse(receipt['performed'])
        self.assertTrue(all(g['status']=='PENDING' for g in receipt['gates']))
        self.assertEqual(set(receipt['blockers']),{'P02','P04','P05','P07','P08'})
        self.assertEqual(set(receipt['synthetic_lab_entry_corrections']),{'P01','P03','P06'})

    def test_automatic_preview_disabled_before_branch_publication(self):
        config=json.loads((ROOT/'vercel.json').read_text())
        self.assertIs(config['git']['deploymentEnabled'][BRANCH],False)
        self.assertIs(config['git']['deploymentEnabled']['main'],False)
        self.assertIn('[context."'+BRANCH+'"]\n  ignore = "exit 0"',(ROOT/'netlify.toml').read_text())


if __name__=='__main__':unittest.main()
