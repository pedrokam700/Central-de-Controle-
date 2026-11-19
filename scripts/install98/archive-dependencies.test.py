"""Synthetic archive input counterproofs; never install these fixture wheels."""
import hashlib,pathlib,runpy,tempfile,unittest,zipfile
ROOT=pathlib.Path(__file__).resolve().parents[2]
LOAD=runpy.run_path(str(ROOT/'scripts/install98/complete-archive.py'))
class Closure(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.wheels=pathlib.Path(self.tmp.name)
  self.lock={'artifacts':[]};self.receipt={'sources':[],'built_and_official_wheels':{}}
  for i in range(21):
   name='synthetic'+str(i);path=self.wheels/(name+'-1.0-py3-none-any.whl')
   with zipfile.ZipFile(path,'x') as archive:archive.writestr(name+'-1.0.dist-info/METADATA','Metadata-Version: 2.1\nName: '+name+'\nVersion: 1.0\n')
   sha=hashlib.sha256(path.read_bytes()).hexdigest();entry={'name':name,'version':'1.0','url':'https://files.pythonhosted.org/packages/SYNTHETIC/'+name+'.tar.gz','sha256':'a'*64,'scope':'runtime','kind':'sdist'}
   self.lock['artifacts'].append(entry);self.receipt['sources'].append({k:entry[k] for k in ('name','version','url','sha256')});self.receipt['built_and_official_wheels'][path.name]=sha
 def check(self):return LOAD['dependencies'](self.wheels,self.receipt,self.lock)
 def test_complete_synthetic_metadata_relationships(self):
  payload,records=self.check();self.assertEqual(len(payload),21);self.assertEqual(len(records),21)
  self.assertTrue(all(x['method']=='GENUINE_SOURCE_BUILT_OFFLINE_UNDER_WFP' for x in records))
 def test_missing_wheel(self):
  next(self.wheels.iterdir()).unlink()
  with self.assertRaisesRegex(ValueError,'INCOMPLETE'):self.check()
 def test_unexpected_file(self):
  (self.wheels/'session.json').write_text('{}')
  with self.assertRaisesRegex(ValueError,'UNEXPECTED'):self.check()
 def test_corrupt_wheel(self):
  next(self.wheels.iterdir()).write_bytes(b'CORRUPT')
  with self.assertRaisesRegex(ValueError,'HASH'):self.check()
 def test_invented_source_receipt(self):
  self.receipt['sources'][0]['sha256']='b'*64
  with self.assertRaisesRegex(ValueError,'PROVENANCE'):self.check()
 def test_version_mismatch(self):
  self.lock['artifacts'][0]['version']='2.0';self.receipt['sources'][0]['version']='2.0'
  with self.assertRaisesRegex(ValueError,'IDENTITY'):self.check()
 def test_duplicate_dependency_identity(self):
  path=self.wheels/'synthetic1-1.0-py3-none-any.whl'
  with zipfile.ZipFile(path,'w') as archive:archive.writestr('synthetic0-1.0.dist-info/METADATA','Metadata-Version: 2.1\nName: synthetic0\nVersion: 1.0\n')
  self.receipt['built_and_official_wheels'][path.name]=hashlib.sha256(path.read_bytes()).hexdigest()
  with self.assertRaisesRegex(ValueError,'DUPLICATE'):self.check()
 def test_unreviewed_architecture(self):
  path=self.wheels/'synthetic0-1.0-py3-none-any.whl';other=path.with_name('synthetic0-1.0-cp312-cp312-win32.whl');path.rename(other)
  self.receipt['built_and_official_wheels'][other.name]=self.receipt['built_and_official_wheels'].pop(path.name)
  with self.assertRaisesRegex(ValueError,'PLATFORM'):self.check()
 def test_official_wheel_cannot_be_rebuilt_as_if_identical(self):
  self.lock['artifacts'][0].update(kind='bdist_wheel',filename='synthetic0-1.0-py3-none-any.whl')
  with self.assertRaisesRegex(ValueError,'OFFICIAL_WHEEL_BYTES_CHANGED'):self.check()
 def test_linked_wheel(self):
  external=tempfile.TemporaryDirectory();self.addCleanup(external.cleanup)
  path=self.wheels/'synthetic0-1.0-py3-none-any.whl';target=pathlib.Path(external.name)/path.name
  path.rename(target);path.symlink_to(target)
  with self.assertRaisesRegex(ValueError,'UNSAFE_WHEEL_PATH'):self.check()
if __name__=='__main__':unittest.main()
