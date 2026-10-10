import hashlib
import json
import pathlib
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'ames'/'agent'))
import update_candidate as updater
from store import Store

class UpdateTests(unittest.TestCase):
    def test_backup_update_and_rollback_preserve_database_and_collectors(self):
        with tempfile.TemporaryDirectory() as tmp:
            target=pathlib.Path(tmp)/'installed'/'ames-agent';source=pathlib.Path(tmp)/'candidate';target.mkdir(parents=True);source.mkdir()
            for name in updater.HASHES:shutil.copy2(ROOT/'ames'/'agent'/name,target/name)
            for name in updater.FILES:(target/name).write_text('old '+name);shutil.copy2(ROOT/'ames'/'agent'/name,source/name)
            (source/'candidate-files.json').write_text(json.dumps({n:hashlib.sha256((source/n).read_bytes()).hexdigest() for n in updater.FILES}))
            cfg={'allowed_origins':['https://fallback.example'],'configured_lines':['TAN10102'],'port':8765};(target/'config.json').write_text(json.dumps(cfg))
            store=Store(target/'data'/'ames_local.sqlite3');store.initialize();first=store.create_snapshot(window_id=None,source_kind='legacy')
            with patch.object(updater.socket,'create_connection',side_effect=OSError):saved=updater.update(target,source)
            self.assertTrue((saved/'ames_local.sqlite3').exists());self.assertEqual((saved/'agent.py').read_text(),'old agent.py')
            origins=json.loads((target/'config.json').read_text())['allowed_origins']
            self.assertIn(updater.ORIGIN,origins);self.assertIn(updater.PREVIEW_ORIGIN,origins);self.assertEqual(len(origins),len(set(origins)))
            newer=store.create_snapshot(window_id=None,source_kind='after update')
            with patch.object(updater.socket,'create_connection',side_effect=OSError):updater.rollback(target,saved)
            self.assertEqual(store.latest_snapshot_id(),newer);self.assertGreater(newer,first)
            self.assertEqual(json.loads((target/'config.json').read_text()),cfg)
            self.assertEqual((target/'agent.py').read_text(),'old agent.py')
            for name,value in updater.HASHES.items():self.assertEqual(hashlib.sha256((target/name).read_bytes()).hexdigest(),value)

if __name__=='__main__':unittest.main()
