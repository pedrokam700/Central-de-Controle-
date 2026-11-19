"""Real helper + SQLite in fresh synthetic directories; no runtime/network."""
from contextlib import closing
import importlib.util,json,pathlib,runpy,sys,tempfile,unittest
from unittest.mock import patch
ROOT=pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools/ames-workstation'))
import SAFE_STATE_TRANSFER as transfer
base=runpy.run_path(str(ROOT/'scripts/ames-pr70-state-transfer.test.py'))

class Transfer(base['StateTransferTest']):
 def test_engine_path_must_not_keep_loading_old_generation(self):
  path=self.old/'ames-agent/config.json';cfg=json.loads(path.read_text());cfg['engine_dir']=str(self.old/'factory-engine');path.write_text(json.dumps(cfg))
  (self.old/'factory-engine').mkdir();(self.new/'factory-engine/ames').mkdir(parents=True)
  (self.new/'factory-engine/main.py').write_text('# synthetic contract marker\n')
  (self.new/'factory-engine/ames/browser.py').write_text('# synthetic contract marker\n')
  before=path.read_bytes();expected=dict(cfg);expected['engine_dir']=str(self.new/'factory-engine')
  transfer.stage(str(self.old),str(self.new),str(self.backup))
  self.assertEqual(path.read_bytes(),before)
  self.assertEqual((self.backup/'config.json').read_bytes(),before)
  transfer.verify_operational_backup(self.backup)
  self.assertEqual(json.loads((self.new/'ames-agent/config.json').read_text()),expected)
  self.assertEqual(json.loads((self.new/'ames-agent/config.json').read_text())['engine_dir'],str(self.new/'factory-engine'))
 def assert_refused_before_write(self,pattern):
  with self.assertRaisesRegex(ValueError,pattern):transfer.stage(str(self.old),str(self.new),str(self.backup))
  self.assertFalse(self.backup.exists());self.assertFalse((self.new/'ames-agent/data').exists());self.assertFalse((self.new/'ames-agent/config.json').exists())
 def engine_config(self,value):
  path=self.old/'ames-agent/config.json';cfg=json.loads(path.read_text());cfg['engine_dir']=value;path.write_text(json.dumps(cfg))
 def test_unknown_external_engine_is_not_relocated(self):
  self.engine_config(str(self.old.parent/'EXTERNAL'));self.assert_refused_before_write('external_engine_reference')
 def test_relative_engine_is_not_relocated(self):
  self.engine_config('factory-engine');self.assert_refused_before_write('engine_reference_unverified')
 def test_invalid_engine_type_is_not_relocated(self):
  self.engine_config({'path':'unknown'});self.assert_refused_before_write('engine_reference_unverified')
 def test_missing_candidate_engine_refuses_before_write(self):
  self.engine_config(str(self.old/'factory-engine'));self.assert_refused_before_write('candidate_engine_incomplete')
 def test_environment_old_engine_override_refused(self):
  with patch.dict(transfer.os.environ,{'AMES_ENGINE_DIR':str(self.old/'factory-engine')}):self.assert_refused_before_write('external_engine_override')
 def test_relative_environment_override_refused(self):
  with patch.dict(transfer.os.environ,{'AMES_ENGINE_DIR':'factory-engine'}):self.assert_refused_before_write('external_engine_override')
 def test_nonobject_configuration_refused(self):
  (self.old/'ames-agent/config.json').write_text('[]');self.assert_refused_before_write('configuration_root_unverified')
 def test_backup_keeps_original_configuration_faithful(self):
  before=(self.old/'ames-agent/config.json').read_bytes();transfer.stage(str(self.old),str(self.new),str(self.backup))
  self.assertEqual((self.backup/'config.json').read_bytes(),before)
if __name__=='__main__':unittest.main()
