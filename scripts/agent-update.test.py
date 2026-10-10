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
    def test_backup_update_and_rollback_preserve_database_collectors_workstation_and_frontend_gate(self):
        with tempfile.TemporaryDirectory() as tmp:
            package=pathlib.Path(tmp)/'installed';target=package/'ames-agent'
            candidate_root=pathlib.Path(tmp)/'candidate';source=candidate_root/'ames-agent'
            target.mkdir(parents=True);source.mkdir(parents=True)
            for name in updater.HASHES:shutil.copy2(ROOT/'ames'/'agent'/name,target/name)
            for name in updater.FILES:
                (target/name).write_text('old '+name)
                shutil.copy2(ROOT/'ames'/'agent'/name,source/name)
            (source/'candidate-files.json').write_text(json.dumps({n:hashlib.sha256((source/n).read_bytes()).hexdigest() for n in updater.FILES}))

            # Simula a raiz real produzida pelo bundle. O updater deve copiar as
            # ferramentas e o gate do frontend, mas rollback precisa remover o gate
            # se ele não existia antes da migração.
            for rel in updater.ROOT_FILES:
                dst=candidate_root/rel;dst.parent.mkdir(parents=True,exist_ok=True);dst.write_text('new '+rel)
            gate=candidate_root/'FRONTEND_GATE.json';gate.write_text(json.dumps({'expected_sha':'1'*40,'preview_urls':['https://example.test']}))
            old_launcher=package/'00_INICIAR_AQUI.bat';old_launcher.write_text('old launcher')

            cfg={'allowed_origins':['https://fallback.example'],'configured_lines':['TAN10102'],'port':8765};(target/'config.json').write_text(json.dumps(cfg))
            store=Store(target/'data'/'ames_local.sqlite3');store.initialize();first=store.create_snapshot(window_id=None,source_kind='legacy')
            with patch.object(updater.socket,'create_connection',side_effect=OSError):saved=updater.update(target,source)
            self.assertTrue((saved/'ames_local.sqlite3').exists())
            self.assertEqual((saved/'ames-agent'/'agent.py').read_text(),'old agent.py')
            self.assertEqual((saved/'root'/'00_INICIAR_AQUI.bat').read_text(),'old launcher')
            self.assertIn('FRONTEND_GATE.json',json.loads((saved/'backup.json').read_text())['root_absent'])
            self.assertEqual((package/'00_INICIAR_AQUI.bat').read_text(),'new 00_INICIAR_AQUI.bat')
            self.assertEqual(json.loads((package/'FRONTEND_GATE.json').read_text())['expected_sha'],'1'*40)
            self.assertTrue((target/'agent_entry.py').is_file());self.assertTrue((target/'process_r11.py').is_file())
            origins=json.loads((target/'config.json').read_text())['allowed_origins']
            self.assertIn(updater.ORIGIN,origins);self.assertIn(updater.PREVIEW_ORIGIN,origins);self.assertIn(updater.NETLIFY_PREVIEW_ORIGIN,origins);self.assertEqual(len(origins),len(set(origins)))
            newer=store.create_snapshot(window_id=None,source_kind='after update')
            with patch.object(updater.socket,'create_connection',side_effect=OSError):updater.rollback(target,saved)
            self.assertEqual(store.latest_snapshot_id(),newer);self.assertGreater(newer,first)
            self.assertEqual(json.loads((target/'config.json').read_text()),cfg)
            self.assertEqual((target/'agent.py').read_text(),'old agent.py')
            self.assertEqual((package/'00_INICIAR_AQUI.bat').read_text(),'old launcher')
            self.assertFalse((package/'FRONTEND_GATE.json').exists())
            for name,value in updater.HASHES.items():self.assertEqual(hashlib.sha256((target/name).read_bytes()).hexdigest(),value)

if __name__=='__main__':unittest.main()
