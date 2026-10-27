import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools/ames-workstation'))
from pr69_apply_code import apply, BASE_SHA, PatchBlocked, safe_relative

TARGET='f'*40


class CodePatch(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)/'install'
        self.root.mkdir()
        self.folder=self.root/'_PR69_PATCH'
        (self.folder/'files').mkdir(parents=True)
        self.items={
            'frontend/Central-de-Controle-/ames/example.mjs':(b'old source',b'new source'),
            'CANDIDATE_MANIFEST.json':(
                json.dumps({'sha':BASE_SHA}).encode(),json.dumps({'sha':TARGET}).encode()),
            'LOCAL_BUNDLE_MANIFEST.json':(
                json.dumps({'sha':BASE_SHA}).encode(),json.dumps({'sha':TARGET}).encode()),
        }
        specs=[]
        for name,(old,new) in self.items.items():
            original=self.root/name;original.parent.mkdir(parents=True,exist_ok=True)
            original.write_bytes(old)
            replacement=self.folder/'files'/name
            replacement.parent.mkdir(parents=True,exist_ok=True)
            replacement.write_bytes(new)
            specs.append({'path':name,'old_sha256':hashlib.sha256(old).hexdigest(),
                          'new_sha256':hashlib.sha256(new).hexdigest()})
        (self.folder/'PATCH_PR69_MANIFEST.json').write_text(json.dumps({
            'base_sha':BASE_SHA,'target_sha':TARGET,'files':specs}))
        private=self.root/'ames-agent/data'
        private.mkdir(parents=True)
        (private/'operational.sqlite').write_bytes(b'PRIVATE SQLITE MUST NOT CHANGE')

    def run_patch(self,listen=False,guardian=False):
        return apply(self.root,self.folder,listener_check=lambda:listen,guardian_check=lambda:guardian)

    def test_success_and_idempotence_keep_original_sqlite_untouched(self):
        first=self.run_patch()
        self.assertEqual(first['sha'],TARGET)
        self.assertEqual(first['files_changed'],3)
        self.assertFalse(first['sqlite_touched'])
        self.assertEqual(self.run_patch()['files_changed'],0)
        self.assertEqual((self.root/'ames-agent/data/operational.sqlite').read_bytes(),
                         b'PRIVATE SQLITE MUST NOT CHANGE')

    def test_active_agent_blocks_without_touching_files(self):
        with self.assertRaisesRegex(PatchBlocked,'PORT_8765_ACTIVE'):
            self.run_patch(listen=True)
        self.assertEqual(json.loads((self.root/'CANDIDATE_MANIFEST.json').read_text())['sha'],BASE_SHA)

    def test_guardian_enrollment_blocks_until_disabled(self):
        with self.assertRaisesRegex(PatchBlocked,'GUARDIAN_ENROLLED'):
            self.run_patch(guardian=True)

    def test_edited_source_fails_closed_before_replacing_other_files(self):
        source=self.root/'frontend/Central-de-Controle-/ames/example.mjs'
        source.write_bytes(b'unexpected user edit')
        with self.assertRaisesRegex(PatchBlocked,'modified_install_file'):
            self.run_patch()
        self.assertEqual(source.read_bytes(),b'unexpected user edit')
        self.assertEqual(json.loads((self.root/'CANDIDATE_MANIFEST.json').read_text())['sha'],BASE_SHA)

    def test_private_config_paths_forbidden(self):
        for name in ('ames-agent/data/database.sqlite','ames-agent/config.json',
                     '../another-install/file','C:/Windows/system.ini'):
            with self.assertRaises(PatchBlocked):safe_relative(name)


if __name__=='__main__':
    unittest.main()
