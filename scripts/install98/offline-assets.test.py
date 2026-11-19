"""A complete installed frontend must not fetch its JS dependencies from CDNs."""
import json,pathlib,re,subprocess,tempfile,unittest
ROOT=pathlib.Path(__file__).resolve().parents[2]
class Assets(unittest.TestCase):
 def test_real_static_build_contains_all_verified_web_dependencies(self):
  import os
  with tempfile.TemporaryDirectory() as tmp:
   subprocess.run(['node','scripts/build-static.mjs'],cwd=ROOT,env={**os.environ,'CENTRAL_STATIC_OUT':tmp,'COMMIT':'SYNTHETIC-OFFLINE-ASSET-PROOF'},check=True,capture_output=True)
   base=pathlib.Path(tmp)/'Central-de-Controle-';inputs=json.loads((ROOT/'scripts/install98/browser-dependencies.json').read_text())
   for entry in inputs['files']:
    with self.subTest(dependency=entry['path']):self.assertTrue((base/'vendor/browser'/entry['path']).is_file(),entry['path'])
   for name in ('app.js','offline-bootstrap.mjs'):
    source=(base/name).read_text()
    imports=re.findall(r'from\s*[\"\']([^\"\']+)[\"\']',source)
    self.assertFalse([url for url in imports if url.startswith('https://www.gstatic.com/firebasejs/')],name+' still needs the CDN to load')
   html=(base/'index.html').read_text()
   self.assertNotIn('src="https://cdn.sheetjs.com/',html,'Excel functionality must survive a cold offline start')
if __name__=='__main__':unittest.main()
