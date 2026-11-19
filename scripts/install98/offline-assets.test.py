"""Pinned source inputs in guarded CI; REAL built output in authorized Windows.

Never invoke any builder from the no-distribution job. The Windows installer
must pass --built-root after extracting/verifying the actual candidate archive.
"""
import hashlib,json,pathlib,re,sys,unittest
ROOT=pathlib.Path(__file__).resolve().parents[2]
INPUTS=json.loads((ROOT/'scripts/install98/browser-dependencies.json').read_text())
class SourceInputs(unittest.TestCase):
 def test_every_official_input_and_license_matches_reviewed_hash(self):
  for entry in INPUTS['files']:
   with self.subTest(dependency=entry['path']):
    content=(ROOT/INPUTS['root']/entry['path']).read_bytes()
    self.assertEqual(len(content),entry['size']);self.assertEqual(hashlib.sha256(content).hexdigest(),entry['sha256'])
class RealBuiltOutput(unittest.TestCase):
 base=None
 def test_actual_candidate_contains_complete_local_browser_dependency_graph(self):
  base=self.base
  for entry in INPUTS['files']:
   with self.subTest(dependency=entry['path']):self.assertTrue((base/'vendor/browser'/entry['path']).is_file(),entry['path'])
  manifest=json.loads((base/'vendor/browser/manifest.json').read_text())
  for entry in manifest['files']:
   self.assertEqual(hashlib.sha256((base/'vendor/browser'/entry['path']).read_bytes()).hexdigest(),entry['packaged_sha256'])
  for name in ('app.js','offline-bootstrap.mjs'):
   source=(base/name).read_text();imports=re.findall(r'from\s*["\']([^"\']+)["\']',source)
   self.assertFalse([u for u in imports if u.startswith('https://www.gstatic.com/firebasejs/')],name+' still needs CDN boot')
  self.assertNotIn('src="https://cdn.sheetjs.com/',(base/'index.html').read_text())
if __name__=='__main__':
 suite=unittest.TestLoader().loadTestsFromTestCase(SourceInputs)
 if '--built-root' in sys.argv:
  i=sys.argv.index('--built-root');RealBuiltOutput.base=pathlib.Path(sys.argv[i+1]).resolve()
  suite.addTests(unittest.TestLoader().loadTestsFromTestCase(RealBuiltOutput))
 result=unittest.TextTestRunner(verbosity=2).run(suite);raise SystemExit(not result.wasSuccessful())
