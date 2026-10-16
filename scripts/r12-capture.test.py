import json
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SCRIPT=ROOT/'tools'/'ames-workstation'/'capture-r12-engine.py'

class CaptureR12Tests(unittest.TestCase):
    def engine(self,base,valid=True):
        engine=Path(base)/'AMES_Automacao_V0_16_PADRAO_VALIDADO'
        (engine/'ames').mkdir(parents=True)
        (engine/'config').mkdir()
        (engine/'data').mkdir()
        (engine/'logs').mkdir()
        (engine/'main.py').write_text('print("r12")\n',encoding='utf-8')
        (engine/'ames'/'browser.py').write_text('class AmesBrowser: pass\n',encoding='utf-8')
        tela='class Tela3022: pass\ndef correlacionar_falha_3022(): pass\ndef extrair_passagens_processo(): pass\n' if valid else 'class Tela3022: pass\n'
        (engine/'ames'/'tela_3022.py').write_text(tela,encoding='utf-8')
        (engine/'ames'/'navigation.py').write_text('def ensure_current_shift_2114(): pass\n',encoding='utf-8')
        (engine/'config'/'settings.json').write_text(json.dumps({'mes_time':{'grid':0},'password':'nao-pode-sair','nested':{'token':'x','safe':7}}),encoding='utf-8')
        (engine/'data'/'ames.db').write_bytes(b'sensitive-db')
        (engine/'logs'/'run.log').write_text('sensitive-log',encoding='utf-8')
        return engine

    def test_capture_keeps_contract_and_removes_runtime_secrets(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);self.engine(root);out=root/'capture.zip'
            run=subprocess.run([sys.executable,str(SCRIPT),str(root),str(out)],capture_output=True,text=True)
            self.assertEqual(run.returncode,0,run.stderr+run.stdout)
            with zipfile.ZipFile(out) as z:
                names=set(z.namelist())
                self.assertIn('engine/ames/tela_3022.py',names)
                self.assertIn('engine/ames/navigation.py',names)
                self.assertIn('capture-manifest.json',names)
                self.assertNotIn('engine/data/ames.db',names)
                self.assertNotIn('engine/logs/run.log',names)
                cfg=json.loads(z.read('engine/config/settings.json'))
                self.assertNotIn('password',cfg)
                self.assertNotIn('token',cfg['nested'])
                self.assertEqual(cfg['nested']['safe'],7)
                manifest=json.loads(z.read('capture-manifest.json'))
                self.assertEqual(manifest['schema'],'central-r12-engine-capture-v1')
                self.assertEqual(manifest['required_contract']['2114_shift'],'ensure_current_shift_2114')

    def test_capture_fails_closed_without_temporal_contract(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);self.engine(root,valid=False);out=root/'capture.zip'
            run=subprocess.run([sys.executable,str(SCRIPT),str(root),str(out)],capture_output=True,text=True)
            self.assertNotEqual(run.returncode,0)
            self.assertFalse(out.exists())

if __name__=='__main__':unittest.main()
