"""Real archive positive/negative tests, only in authorized packaging CI."""
import hashlib
import json
import os
from pathlib import Path
import runpy
import tempfile
import unittest
import zipfile
import zlib

ROOT=Path(__file__).resolve().parents[1]
VERIFY=runpy.run_path(str(ROOT/'scripts/verify-complete-candidate.py'))['verify']
ARCHIVE=Path(os.environ['CANDIDATE_ZIP']);SHA=os.environ['GITHUB_SHA']

class Artifact(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name).resolve()
    def modified(self,mutate,rehash=False):
        with zipfile.ZipFile(ARCHIVE) as z:data={n:z.read(n) for n in z.namelist()}
        mutate(data)
        if rehash:
            h=lambda b:hashlib.sha256(b).hexdigest()
            identity=json.loads(data['PACKAGE_IDENTITY.json'])
            for name,prefix in [('frontend','frontend/'),('agent','ames-agent/'),('engine','factory-engine/')]:
                members={n:h(v) for n,v in sorted(data.items()) if n.startswith(prefix)}
                identity['components'][name]={'code_sha':SHA,'files':len(members),'members_sha256':h(json.dumps(members,sort_keys=True,separators=(',',':')).encode())}
            data['PACKAGE_IDENTITY.json']=json.dumps(identity).encode()
            local=json.loads(data['LOCAL_BUNDLE_MANIFEST.json'])
            local['files']={n:h(data[n]) for n in local['files'] if n in data};data['LOCAL_BUNDLE_MANIFEST.json']=json.dumps(local).encode()
            manifest=json.loads(data['CANDIDATE_MANIFEST.json']);manifest['files']={n:h(v) for n,v in data.items() if n!='CANDIDATE_MANIFEST.json'};data['CANDIDATE_MANIFEST.json']=json.dumps(manifest).encode()
        path=self.root/'counterproof.zip'
        with zipfile.ZipFile(path,'x') as z:
            for n,v in data.items():z.writestr(n,v)
        return path
    def test_real_archive_and_full_extraction(self):
        dest=self.root/'empty';r=VERIFY(ARCHIVE,SHA,dest)
        self.assertTrue(r['passive_extraction_verified']);self.assertGreaterEqual(r['members'],349)
        self.assertFalse(r['installation_authorized']);self.assertEqual(r['EEDACC65_source_model']['removed'],[])
    def test_existing_destination_preserved(self):
        p=self.root/'existing';p.mkdir();(p/'NEWER').write_bytes(b'SYNTHETIC')
        with self.assertRaisesRegex(ValueError,'New absolute'):VERIFY(ARCHIVE,SHA,p)
        self.assertEqual((p/'NEWER').read_bytes(),b'SYNTHETIC')
    def test_missing_dependency_even_with_rehashed_manifests(self):
        p=self.modified(lambda d:d.pop('suporte/ames-workstation/ISSUE57_RELAUNCH_ENROLLMENT.ps1'),True)
        with self.assertRaisesRegex(ValueError,'Actual members'):VERIFY(p,SHA)
    def test_rehashed_changed_source_does_not_pass(self):
        p=self.modified(lambda d:d.__setitem__('ames-agent/process_r11.py',d['ames-agent/process_r11.py']+b'\n# altered\n'),True)
        with self.assertRaisesRegex(ValueError,'Source bytes mismatch'):VERIFY(p,SHA)
    def test_rehashed_SW_wrong_version_does_not_pass(self):
        key='frontend/Central-de-Controle-/sw.js'
        p=self.modified(lambda d:d.__setitem__(key,d[key].replace(SHA.encode(),b'0'*40)),True)
        with self.assertRaisesRegex(ValueError,'SW mismatch'):VERIFY(p,SHA)
    def test_unknown_rehashed_member_is_refused(self):
        p=self.modified(lambda d:d.__setitem__('UNKNOWN.txt',b'SYNTHETIC'),True)
        with self.assertRaisesRegex(ValueError,'Actual members'):VERIFY(p,SHA)
    def test_escape_never_reaches_extraction(self):
        p=self.modified(lambda d:d.__setitem__('../ESCAPE.txt',b'SYNTHETIC'));dest=self.root/'extract'
        with self.assertRaises(ValueError):VERIFY(p,SHA,dest)
        self.assertFalse(dest.exists());self.assertFalse((self.root/'ESCAPE.txt').exists())
    def test_windows_case_alias_refused(self):
        p=self.modified(lambda d:d.__setitem__('leia_primeiro.TXT',b'SYNTHETIC'))
        with self.assertRaisesRegex(ValueError,'case-aliased'):VERIFY(p,SHA)
    def test_symlink_member_refused(self):
        p=self.modified(lambda d:None)
        with zipfile.ZipFile(p,'a') as z:
            info=zipfile.ZipInfo('synthetic-link');info.create_system=3;info.external_attr=0o120777<<16;z.writestr(info,b'/SYNTHETIC')
        with self.assertRaisesRegex(ValueError,'Special'):VERIFY(p,SHA)
    def test_manifest_duplicate_key_refused(self):
        p=self.modified(lambda d:d.__setitem__('CANDIDATE_MANIFEST.json',b'{"sha":"a","sha":"b"}'))
        with self.assertRaisesRegex(ValueError,'Duplicate JSON'):VERIFY(p,SHA)
    def test_false_operational_authorization_refused(self):
        def change(d):
            m=json.loads(d['PACKAGE_IDENTITY.json']);m['installation_authorized']=True;d['PACKAGE_IDENTITY.json']=json.dumps(m).encode()
        p=self.modified(change,True)
        with self.assertRaisesRegex(ValueError,'identity metadata'):VERIFY(p,SHA)
    def test_wrong_expected_SHA_refused(self):
        with self.assertRaisesRegex(ValueError,'checkout SHA'):VERIFY(ARCHIVE,'0'*40)
    def test_actual_compressed_bytes_corruption_is_refused(self):
        raw=bytearray(ARCHIVE.read_bytes())
        with zipfile.ZipFile(ARCHIVE) as z:info=z.getinfo('ames-agent/agent.py')
        offset=info.header_offset
        name_len=int.from_bytes(raw[offset+26:offset+28],'little');extra_len=int.from_bytes(raw[offset+28:offset+30],'little')
        raw[offset+30+name_len+extra_len]^=32
        path=self.root/'corrupt.zip';path.write_bytes(raw)
        with self.assertRaises((ValueError,zipfile.BadZipFile,zlib.error)):VERIFY(path,SHA)

if __name__=='__main__':unittest.main()
