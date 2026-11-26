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
 'ames/agent/store.py',
 'ames/agent/ames_3028_live.py',
 'ames/agent-client.mjs',
 'ames/console-view.mjs',
 'scripts/install98/browser-3028-replay.py',
 'ames/agent/comment_provenance_3028.py',
 'ames/agent/ames_3012_live.py',
 'ames/agent/ames_3012_strategy.py',
 'ames/factory-engine/ames/navigation.py',
 'ames/factory-engine/tests/test_pr70_2114_tab_recovery.py',
 'ames/console-improvements.css',
 'ames/console-reuse-cohorts.mjs',
 'ames/console-reuse-history-timeline.mjs',
 'ames/console-sn-repair-evidence.mjs',
 'ames/data/reuse-history-timeline.mjs',
 'scripts/install98/period-3028.test.py',
 'scripts/ames-reuse-event-timeline.test.mjs',
 'scripts/ames-reuse-timeline.browser.mjs',
 'AGENTS.md','tools/ames-workstation/check_install_path.py',
 'tools/ames-workstation/01_INSTALAR_UMA_VEZ.bat','tools/ames-workstation/09_REPARAR_DEPENDENCIAS_CLEAN.bat',
 # PR98 integrated delivery: eight already reviewed support/doc paths from ab81dd98.
 'docs/ames/audits/PR98_MATRIZ_CONTINUIDADE_INSTALACAO_20261119.md',
 'docs/ames/homologation/PR98_ATUALIZACAO_SUPERVISIONADA_OPPO_20261119.md',
 'scripts/agent-package-contract.test.py',
 'scripts/ames-pr69-complete-package.test.mjs',
 'scripts/install98/IDENTIFICAR_CENTRAL_8765_READONLY.ps1',
 'scripts/install98/assisted-preflight.test.ps1',
 'scripts/install98/port-identification.test.ps1',
 'tools/ames-workstation/00_CONFERIR_ATUALIZACAO.bat',

 'scripts/install98/complete-archive.py','scripts/install98/archive-dependencies.test.py','scripts/install98/delivery-gate.py',
 'scripts/install98/firebase-lab-inputs.json','scripts/install98/auth-fixture.py',
 'scripts/build-static.mjs','scripts/install98/offline-assets.test.py','scripts/install98/browser-dependencies.json','vendor/browser/manifest.json','vendor/browser/firebase/10.8.0/firebase-app.js','vendor/browser/firebase/10.8.0/firebase-auth.js','vendor/browser/firebase/10.8.0/firebase-firestore.js','vendor/browser/firebase/10.8.0/LICENSE.txt','vendor/browser/sheetjs/0.20.3/xlsx.full.min.js','vendor/browser/sheetjs/0.20.3/LICENSE.txt',
 'ames/agent/agent.py','scripts/install98/static-mime.test.py',
 'scripts/install98/full-entry.test.py','scripts/install98/full-switch.py','scripts/install98/nine-screen-probe.py','tools/ames-workstation/01_TROCAR.bat','tools/ames-workstation/01_TROCAR_PARA_PR69_NOVA.bat',
 'tools/ames-workstation/TROCAR_PARA_PR69_NOVA.ps1','tools/ames-workstation/START_LOCAL_CANDIDATE.ps1',
 # PR98: actual isolated Windows installation proofs and narrowly authorized transfer fix.
 '.github/workflows/ames-windows-installation.yml','scripts/install98/dependencies.json','scripts/install98/prepare.py','scripts/install98/containment.ps1','scripts/install98/integration.py','scripts/install98/transfer-red.test.py','scripts/install98/rollback-probe.ps1','scripts/install98/source-contract.test.py','docs/ames/handoffs/PR98_INSTALACAO_WINDOWS_20261118.md','tools/ames-workstation/SAFE_STATE_TRANSFER.py',
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
        self.assertEqual(hashlib.sha256((ROOT/'ames/agent/agent.py').read_bytes()).hexdigest(), 'f7587c31197ae311b40c88ae96a1140d41307e58662c09c05bdf3bf658cd7db0', 'Reviewed all-mode 3028 entry and static MIME')
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
        # PR98 intentional installer fix is pinned to its reviewed implementation;
        # the actual helper/SQLite/WAL contracts run separately on Linux/Windows.
        self.assertEqual(hashlib.sha256((ROOT/'tools/ames-workstation/SAFE_STATE_TRANSFER.py').read_bytes()).hexdigest(), 'd0da7ff6b6ab4dd533512a19fa1d001e7877783f312a876744f9fec3d56c869d')
        for path in ('ames/agent/update_candidate.py','tools/ames-lab/windows_preflight.py','scripts/agent-p04-compatibility.test.py','scripts/agent-p02-deidentification.test.py'):
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
        self.assertIs(after['git']['deploymentEnabled'].pop('work/ames-windows-installation-20261118'),False)
        self.assertIs(after['git']['deploymentEnabled'].pop('work/ames-complete-candidate-20261118'),False);self.assertEqual(before,after)


if __name__=='__main__':unittest.main()
