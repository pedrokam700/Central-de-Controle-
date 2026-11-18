"""P08 exact #95 parent, closed changes and unchanged productive contracts."""
import ast
import hashlib
import json
from pathlib import Path
import re
import subprocess
import unittest
ROOT=Path(__file__).resolve().parents[1];BASE='48112ea9e408f5dce7fe85f951616b06ed4020e0';BRANCH='work/ames-p08-generation-reconciliation-20261118'
ALLOWED={
 'scripts/build-integrated-candidate.py','scripts/verify-complete-candidate.py','scripts/candidate97-source.test.py','scripts/candidate97-artifact.test.py','scripts/candidate97-ci-gate.py','scripts/audit/package-source-inventory.py','scripts/ames-candidate-legacy-port-guard.test.mjs','.github/workflows/ames-complete-candidate.yml','docs/ames/packaging/CANDIDATA_INSTALACAO_FUTURA_20261118.md','docs/ames/audits/PR97_PACOTE_COMPLETO_20261118.md','docs/ames/handoffs/PR97_CANDIDATA_COMPLETA_20261118.md',
 'scripts/audit/package-source-inventory.py',
 'docs/ames/audits/CONSOLIDACAO_EEDACC65_PR96_20261118.md','tools/ames-lab/generation_reconcile.py','tools/ames-lab/p08_profile.json','scripts/fixtures/p08_generations.py',
 'scripts/agent-p08-generation.test.py','scripts/agent-p08-native-readers.test.py','scripts/agent-p08-preservation.test.py',
 '.github/workflows/ames-p08-generations.yml','.github/workflows/ames-p04-windows-preflight.yml',
 '.github/workflows/ames-lab-isolation.yml','.github/workflows/ames-lab-existing-regressions.yml',
 'scripts/agent-lab-preservation-static.test.py','scripts/agent-p04-preservation.test.py','vercel.json','netlify.toml',
 'docs/ames/audits/PR96_P08_GENERATIONS_20261118.md','docs/ames/handoffs/PR96_P08_G6_20261118.md'}
def git(*args):return subprocess.check_output(['git',*args],cwd=ROOT,text=True).strip()


class Preservation(unittest.TestCase):
    def test_all_preexisting_blobs_exact_and_only_own_paths_changed(self):
        subprocess.run(['git','merge-base','--is-ancestor',BASE,'HEAD'],cwd=ROOT,check=True)
        self.assertLessEqual(set(git('diff','--name-only',BASE,'HEAD').splitlines()),ALLOWED)
        def tree(ref):return {p:i for row in git('ls-tree','-r',ref).splitlines() for i,p in [row.split('\t',1)] if p not in ALLOWED}
        self.assertEqual(tree(BASE),tree('HEAD'))
    def test_all_existing_test_commands_maintained_as_subsequence(self):
        for name in ('ames-lab-isolation.yml','ames-lab-existing-regressions.yml','ames-p04-windows-preflight.yml'):
            path='.github/workflows/'+name;before=git('show',BASE+':'+path);after=(ROOT/path).read_text()
            commands=lambda s:[x.strip() for x in s.splitlines() if re.match(r'\s*(python3? |node |if \(\$LASTEXITCODE)',x)]
            current=iter(commands(after))
            for command in commands(before):self.assertTrue(any(x==command for x in current),command)
    def test_production_P02_P04_and_frozen_reader_hashes(self):
        p=json.loads((ROOT/'tools/ames-lab/p08_profile.json').read_text())
        self.assertEqual(p['base_sha'],BASE)
        self.assertEqual(p['p02_helper_sha256'],hashlib.sha256((ROOT/'tools/ames-lab/synthetic_deidentify.py').read_bytes()).hexdigest())
        self.assertEqual(p['canonical_reader_sha256'],hashlib.sha256((ROOT/'ames/agent/canonical.py').read_bytes()).hexdigest())
        for path in ('ames/agent/update_candidate.py','tools/ames-workstation/SAFE_STATE_TRANSFER.py','tools/ames-lab/windows_preflight.py','scripts/agent-p04-compatibility.test.py','scripts/agent-p02-deidentification.test.py'):
            self.assertEqual(git('rev-parse',BASE+':'+path),git('rev-parse','HEAD:'+path))
    def test_no_operational_chain_import_or_launch(self):
        path=ROOT/'tools/ames-lab/generation_reconcile.py';tree=ast.parse(path.read_text())
        imports={a.name.split('.')[0] for n in ast.walk(tree) if isinstance(n,ast.Import) for a in n.names}
        imports|={(n.module or '').split('.')[0] for n in ast.walk(tree) if isinstance(n,ast.ImportFrom)}
        self.assertFalse(imports&{'agent','agent_entry','store','canonical','engine_bridge','socket','subprocess','urllib','requests'})
        self.assertNotIn('os.system(',path.read_text());self.assertNotIn('shutil.rmtree(',path.read_text())
    def test_gates_and_independent_blockers_unchanged_pending(self):
        path='docs/ames/homologation/OFFLINE_GATES_TEMPLATE.json'
        self.assertEqual(git('rev-parse',BASE+':'+path),git('rev-parse','HEAD:'+path))
        data=json.loads((ROOT/path).read_text());self.assertFalse(data['execution_authorized']);self.assertEqual(data['physical'],'PENDING')
        self.assertTrue(all(x['status']=='PENDING' for x in data['gates']))
    def test_preview_only_own_branch_disabled(self):
        before=json.loads(git('show',BASE+':vercel.json'));after=json.loads((ROOT/'vercel.json').read_text())
        self.assertIs(after['git']['deploymentEnabled'].pop(BRANCH),False)
        self.assertIs(after['git']['deploymentEnabled'].pop('work/ames-complete-candidate-20261118'),False);self.assertEqual(before,after)


if __name__=='__main__':unittest.main()
