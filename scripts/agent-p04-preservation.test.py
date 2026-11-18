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
ALLOWED={'tools/ames-lab/windows_preflight.py','tools/ames-lab/p04_profile.json','tools/ames-lab/p04_windows_wheels.json',
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
        self.assertEqual(before,after)
        before=git('show',BASE+':netlify.toml');after=(ROOT/'netlify.toml').read_text()
        self.assertTrue(after.startswith(before));self.assertIn('[context."'+BRANCH+'"]\n  ignore = "exit 0"',after)


if __name__=='__main__':unittest.main()
