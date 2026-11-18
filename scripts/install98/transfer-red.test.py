"""Real helper + SQLite in fresh synthetic directories; no runtime/network."""
from contextlib import closing
import importlib.util,json,pathlib,runpy,sys,tempfile,unittest
ROOT=pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools/ames-workstation'))
import SAFE_STATE_TRANSFER as transfer
base=runpy.run_path(str(ROOT/'scripts/ames-pr70-state-transfer.test.py'))

class Transfer(base['StateTransferTest']):
 def test_engine_path_must_not_keep_loading_old_generation(self):
  path=self.old/'ames-agent/config.json';cfg=json.loads(path.read_text());cfg['engine_dir']=str(self.old/'factory-engine');path.write_text(json.dumps(cfg))
  (self.old/'factory-engine').mkdir();(self.new/'factory-engine').mkdir()
  transfer.stage(str(self.old),str(self.new),str(self.backup))
  self.assertEqual(json.loads((self.new/'ames-agent/config.json').read_text())['engine_dir'],str(self.new/'factory-engine'))
 def test_backup_keeps_original_configuration_faithful(self):
  before=(self.old/'ames-agent/config.json').read_bytes();transfer.stage(str(self.old),str(self.new),str(self.backup))
  self.assertEqual((self.backup/'config.json').read_bytes(),before)
if __name__=='__main__':unittest.main()
