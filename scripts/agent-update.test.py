import hashlib
import importlib.util
import json
import pathlib
import shutil
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
import zipfile
from unittest.mock import patch
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'ames'/'agent'))
import update_candidate as updater
from store import Store

_frontend_spec=importlib.util.spec_from_file_location('frontend_package',ROOT/'scripts'/'frontend_package.py')
assert _frontend_spec and _frontend_spec.loader
frontend_package=importlib.util.module_from_spec(_frontend_spec);_frontend_spec.loader.exec_module(frontend_package)
_server_spec=importlib.util.spec_from_file_location('serve_staged_frontend',ROOT/'tools'/'ames-workstation'/'serve-staged-frontend.py')
assert _server_spec and _server_spec.loader
local_server=importlib.util.module_from_spec(_server_spec);_server_spec.loader.exec_module(local_server)

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

            migration_only=('agent_hardened_entry.py','hardening.py')
            for name in migration_only:(target/name).unlink()
            (source/'candidate-files.json').write_text(json.dumps({n:hashlib.sha256((source/n).read_bytes()).hexdigest() for n in updater.FILES}))
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
            saved_manifest=json.loads((saved/'backup.json').read_text())
            self.assertIn('FRONTEND_GATE.json',saved_manifest['root_absent'])
            for name in migration_only:self.assertIn(name,saved_manifest['agent_absent'])
            self.assertEqual((package/'00_INICIAR_AQUI.bat').read_text(),'new 00_INICIAR_AQUI.bat')
            self.assertEqual(json.loads((package/'FRONTEND_GATE.json').read_text())['expected_sha'],'1'*40)
            self.assertTrue((target/'agent_entry.py').is_file());self.assertTrue((target/'process_r11.py').is_file())
            for name in migration_only:self.assertTrue((target/name).is_file())
            origins=json.loads((target/'config.json').read_text())['allowed_origins']
            self.assertIn(updater.ORIGIN,origins);self.assertIn(updater.PREVIEW_ORIGIN,origins);self.assertIn(updater.NETLIFY_PREVIEW_ORIGIN,origins);self.assertEqual(len(origins),len(set(origins)))
            newer=store.create_snapshot(window_id=None,source_kind='after update')
            with patch.object(updater.socket,'create_connection',side_effect=OSError):updater.rollback(target,saved)
            self.assertEqual(store.latest_snapshot_id(),newer);self.assertGreater(newer,first)
            self.assertEqual(json.loads((target/'config.json').read_text()),cfg)
            self.assertEqual((target/'agent.py').read_text(),'old agent.py')
            self.assertEqual((package/'00_INICIAR_AQUI.bat').read_text(),'old launcher')
            self.assertFalse((package/'FRONTEND_GATE.json').exists())
            for name in migration_only:self.assertFalse((target/name).exists())
            for name,value in updater.HASHES.items():self.assertEqual(hashlib.sha256((target/name).read_bytes()).hexdigest(),value)

    def _frontend_package(self,root,sha='9'*40):
        dist=root/'dist';(dist/'Central-de-Controle-').mkdir(parents=True)
        identity=(json.dumps({'schema':'central-release-identity-v1','frontend_sha':sha},sort_keys=True,separators=(',',':'))+'\n').encode()
        (dist/'release-identity.json').write_bytes(identity)
        (dist/'release-build.json').write_text(json.dumps({'sha':sha,'build':'test','release_identity_schema':'central-release-identity-v1','release_identity_sha256':hashlib.sha256(identity).hexdigest()}))
        (dist/'Central-de-Controle-'/'index.html').write_text('<!doctype html><title>Central</title>')
        (dist/'Central-de-Controle-'/'app.js').write_text('export const ok=true;')
        (dist/'Central-de-Controle-'/'offline-bootstrap.mjs').write_text('export const localProof=true;')
        package=root/'frontend.zip';frontend_package.build_package(dist,package,sha)
        return package,sha

    def test_stage_frontend_verifies_extracts_atomically_and_never_activates(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp);install=root/'installed';target=install/'ames-agent';target.mkdir(parents=True);(target/'agent.py').write_text('# existing agent')
            package,sha=self._frontend_package(root)
            with patch.object(updater.socket,'create_connection') as network_probe:
                staged=updater.stage_frontend(install,package,sha)
                network_probe.assert_not_called()
            self.assertEqual(staged,install/'frontend-packages'/sha)
            self.assertTrue((staged/'Central-de-Controle-'/'index.html').is_file())
            marker=json.loads((staged/updater.FRONTEND_STAGE_MARKER).read_text())
            stage_manifest=staged/updater.FRONTEND_STAGE_MANIFEST
            self.assertTrue(stage_manifest.is_file())
            self.assertEqual(marker['schema'],updater.FRONTEND_STAGE_SCHEMA)
            self.assertEqual(marker['frontend_sha'],sha)
            self.assertFalse(marker['activated'])
            self.assertIsNone(marker['serving_origin'])
            self.assertEqual(marker['package_sha256'],hashlib.sha256(package.read_bytes()).hexdigest())
            self.assertEqual(marker['stage_manifest_sha256'],hashlib.sha256(stage_manifest.read_bytes()).hexdigest())
            self.assertEqual(json.loads(stage_manifest.read_text())['frontend_sha'],sha)
            self.assertEqual(updater.stage_frontend(target,package,sha),staged)

    def test_stage_frontend_fails_closed_on_wrong_sha_tamper_or_existing_identity_conflict(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp);install=root/'installed';target=install/'ames-agent';target.mkdir(parents=True);(target/'agent.py').write_text('# existing agent')
            package,sha=self._frontend_package(root)
            with self.assertRaises(ValueError):updater.stage_frontend(install,package,'8'*40)
            self.assertFalse((install/'frontend-packages'/('8'*40)).exists())
            tampered=root/'tampered.zip'
            with zipfile.ZipFile(package,'r') as src,zipfile.ZipFile(tampered,'w',compression=zipfile.ZIP_DEFLATED) as dst:
                for info in src.infolist():
                    data=src.read(info.filename)
                    if info.filename=='frontend/Central-de-Controle-/index.html':data+=b' tampered'
                    dst.writestr(info,data)
            with self.assertRaises(ValueError):updater.stage_frontend(install,tampered,sha)
            self.assertFalse((install/'frontend-packages'/sha).exists())
            staged=updater.stage_frontend(install,package,sha)
            marker=json.loads((staged/updater.FRONTEND_STAGE_MARKER).read_text());marker['package_sha256']='0'*64
            (staged/updater.FRONTEND_STAGE_MARKER).write_text(json.dumps(marker))
            with self.assertRaises(ValueError):updater.stage_frontend(install,package,sha)
            self.assertTrue((staged/'Central-de-Controle-'/'index.html').is_file(),'identity conflict must not destructively replace staged frontend')

    def test_loopback_proof_server_rejects_tampered_extracted_stage(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp);install=root/'installed';target=install/'ames-agent';target.mkdir(parents=True);(target/'agent.py').write_text('# existing agent')
            package,sha=self._frontend_package(root);staged=updater.stage_frontend(install,package,sha)
            (staged/'Central-de-Controle-'/'app.js').write_text('tampered after staging')
            with self.assertRaises(ValueError) as rejected:local_server.create_server(staged,sha,0)
            self.assertRegex(str(rejected.exception),r'(size|hash) mismatch')

    def test_loopback_proof_server_serves_verified_shell_but_never_proxies_api_or_metadata(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp);install=root/'installed';target=install/'ames-agent';target.mkdir(parents=True);(target/'agent.py').write_text('# existing agent')
            package,sha=self._frontend_package(root);staged=updater.stage_frontend(install,package,sha)
            httpd=local_server.create_server(staged,sha,0)
            self.assertEqual(httpd.server_address[0],'127.0.0.1')
            self.assertEqual(httpd.central_stage['frontend_sha'],sha)
            thread=threading.Thread(target=httpd.serve_forever,kwargs={'poll_interval':0.05},daemon=True);thread.start()
            try:
                origin=f'http://127.0.0.1:{httpd.server_address[1]}'
                with urllib.request.urlopen(origin+'/Central-de-Controle-/',timeout=3) as response:
                    self.assertEqual(response.status,200);self.assertIn(b'Central',response.read());self.assertEqual(response.headers.get('X-Content-Type-Options'),'nosniff')
                with urllib.request.urlopen(origin+'/Central-de-Controle-/offline-bootstrap.mjs',timeout=3) as response:
                    self.assertEqual(response.headers.get_content_type(),'text/javascript')
                with urllib.request.urlopen(origin+local_server.HEALTH_PATH,timeout=3) as response:
                    health=json.loads(response.read());self.assertEqual(health['frontend_sha'],sha);self.assertFalse(health['launcher_default']);self.assertFalse(health['stage_activated']);self.assertEqual(health['served_from'],'verified-immutable-stage')
                for metadata in (updater.FRONTEND_STAGE_MARKER,updater.FRONTEND_STAGE_MANIFEST):
                    with self.assertRaises(urllib.error.HTTPError) as hidden:urllib.request.urlopen(origin+'/'+metadata,timeout=3)
                    self.assertEqual(hidden.exception.code,404)
                with self.assertRaises(urllib.error.HTTPError) as blocked:
                    urllib.request.urlopen(origin+'/api/chat-cognitive',timeout=3)
                self.assertEqual(blocked.exception.code,503)
                self.assertEqual(json.loads(blocked.exception.read())['error'],'cora_backend_not_configured_for_local_origin')
            finally:
                httpd.shutdown();httpd.server_close();thread.join(timeout=2)
            marker=json.loads((staged/updater.FRONTEND_STAGE_MARKER).read_text())
            self.assertFalse(marker['activated']);self.assertIsNone(marker['serving_origin'])

if __name__=='__main__':unittest.main()