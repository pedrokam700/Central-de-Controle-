"""P04 exact-parent scope and unchanged earlier contracts. Source/Git only."""
import ast
import hashlib
import json
from pathlib import Path
import re
import subprocess
import unittest

ROOT=Path(__file__).resolve().parents[1];BASE='5856eb3f0cc1dd391cf93217fd068f0a044f8ab2'
BRANCH='work/ames-p04-windows-preflight-20261118'
ALLOWED={
 'ames/agent/comment_provenance_3028.py',
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
 'docs/ames/audits/CONSOLIDACAO_EEDACC65_PR96_20261118.md',
 'tools/ames-lab/generation_reconcile.py', 'tools/ames-lab/p08_profile.json', 'scripts/fixtures/p08_generations.py', 'scripts/agent-p08-generation.test.py', 'scripts/agent-p08-preservation.test.py', 'scripts/agent-p08-native-readers.test.py', '.github/workflows/ames-p08-generations.yml', 'docs/ames/audits/PR96_P08_GENERATIONS_20261118.md', 'docs/ames/handoffs/PR96_P08_G6_20261118.md',
 'scripts/agent-p04-preservation.test.py','tools/ames-lab/windows_preflight.py','tools/ames-lab/p04_profile.json','tools/ames-lab/p04_windows_wheels.json',
 'scripts/agent-p04-compatibility.test.py','scripts/agent-p04-preservation.test.py','scripts/agent-p04-ci.py',
 '.github/workflows/ames-p04-windows-preflight.yml','.github/workflows/ames-lab-isolation.yml','.github/workflows/ames-lab-existing-regressions.yml',
 'scripts/agent-lab-preservation-static.test.py','vercel.json','netlify.toml',
 'docs/ames/audits/PR95_P04_WINDOWS_20261118.md','docs/ames/handoffs/PR95_P04_WINDOWS_20261118.md'}


def git(*args):return subprocess.check_output(['git',*args],cwd=ROOT,text=True).strip()


class P04Preservation(unittest.TestCase):
    def test_exact_parent_scope_all_existing_blobs(self):
        subprocess.run(['git','merge-base','--is-ancestor',BASE,'HEAD'],cwd=ROOT,check=True)
        self.assertLessEqual(set(git('diff','--name-only',BASE,'HEAD').splitlines()),ALLOWED)
        def tree(ref):
            return {p:i for row in git('ls-tree','-r',ref).splitlines() for i,p in [row.split('\t',1)] if p not in ALLOWED}
        self.assertEqual(tree(BASE),tree('HEAD'))
        self.assertEqual(hashlib.sha256((ROOT/'ames/agent/agent.py').read_bytes()).hexdigest(), '830ea05de6b5c454d932b35c7316de023d2356fe4434df7cf05619e944e717fd', 'Reviewed period recovery entry and static MIME')

    def test_all_existing_business_test_commands_preserved(self):
        for path in ('.github/workflows/ames-lab-isolation.yml','.github/workflows/ames-lab-existing-regressions.yml'):
            before=git('show',BASE+':'+path);after=(ROOT/path).read_text(encoding='utf-8')
            commands=lambda s:[x.strip() for x in s.splitlines() if re.match(r'\s*(python3? |node |if \(\$LASTEXITCODE)',x)]
            self.assertEqual(commands(before),commands(after),path)
        for path in ('scripts/agent-p02-deidentification.test.py','scripts/agent-p02-projection.test.py','scripts/agent-lab-isolation.test.py','scripts/agent-updater-recovery.test.py'):
            self.assertEqual(git('rev-parse',BASE+':'+path),git('rev-parse','HEAD:'+path))

    def test_requirements_and_lock_sources_closed(self):
        profile=json.loads((ROOT/'tools/ames-lab/p04_profile.json').read_text())
        self.assertEqual(profile['base_sha'],BASE)
        for path,sha in profile['requirements'].items():self.assertEqual(hashlib.sha256((ROOT/path).read_bytes()).hexdigest(),sha)
        lock=json.loads((ROOT/'tools/ames-lab/p04_windows_wheels.json').read_text())
        self.assertEqual(len(lock['artifacts']),13);self.assertEqual(len({x['name'] for x in lock['artifacts']}),13)
        for a in lock['artifacts']:
            self.assertTrue(a['url'].startswith('https://files.pythonhosted.org/packages/'))
            self.assertTrue(a['url'].endswith('/'+a['filename']));self.assertTrue(a['filename'].endswith('.whl'))
            self.assertRegex(a['sha256'],r'^[a-f0-9]{64}$')
        self.assertEqual(len(lock['source_only_blockers']),6)
        self.assertTrue(all(x['wheel_available'] is False for x in lock['source_only_blockers']))

    def test_physical_gates_template_remains_original_pending(self):
        path='docs/ames/homologation/OFFLINE_GATES_TEMPLATE.json'
        self.assertEqual(git('rev-parse',BASE+':'+path),git('rev-parse','HEAD:'+path))
        data=json.loads((ROOT/path).read_text());self.assertFalse(data['execution_authorized']);self.assertFalse(data['performed'])
        self.assertEqual(data['physical'],'PENDING');self.assertTrue(all(g['status']=='PENDING' for g in data['gates']))

    def test_only_test_dependencies_and_no_archive_or_launcher(self):
        source=(ROOT/'scripts/agent-p04-ci.py').read_text()
        self.assertIn("os.environ.get('GITHUB_ACTIONS')=='true'",source)
        self.assertIn("'--require-hashes'",source);self.assertIn("'--only-binary=:all:'",source);self.assertIn("'--no-index'",source)
        for forbidden in ('pip wheel','build-r12','START_AGENT_CANONICAL','KEEP_AGENT_RUNNING','sync_playwright().start','connect_over_cdp'):
            self.assertNotIn(forbidden,source)
        workflow=(ROOT/'.github/workflows/ames-p04-windows-preflight.yml').read_text()
        self.assertNotIn('upload-artifact',workflow);self.assertNotIn('setup-python',workflow)
        self.assertIn('windows-2022',workflow);self.assertIn('windows-2025',workflow)

    def test_preview_suppressed_for_only_own_branch(self):
        before=json.loads(git('show',BASE+':vercel.json'));after=json.loads((ROOT/'vercel.json').read_text())
        self.assertIs(after['git']['deploymentEnabled'].pop(BRANCH),False)
        self.assertIs(after['git']['deploymentEnabled'].pop('work/ames-windows-installation-20261118'),False)
        self.assertIs(after['git']['deploymentEnabled'].pop('work/ames-p08-generation-reconciliation-20261118'),False)
        self.assertIs(after['git']['deploymentEnabled'].pop('work/ames-complete-candidate-20261118'),False)
        self.assertEqual(before,after)
        before=git('show',BASE+':netlify.toml');after=(ROOT/'netlify.toml').read_text()
        self.assertTrue(after.startswith(before));self.assertIn('[context."'+BRANCH+'"]\n  ignore = "exit 0"',after)


if __name__=='__main__':unittest.main()
