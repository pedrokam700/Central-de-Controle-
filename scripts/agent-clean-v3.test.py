import sys, unittest, tempfile, json, types
from pathlib import Path
from unittest.mock import patch
from datetime import datetime
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'ames/factory-engine'));sys.path.insert(0,str(ROOT/'ames/agent'))
from ames.shift_2114 import current_shift,ensure_shift
from operator_evidence import operator_evidence
import engine_bridge
import core.correlacao_falhas as correlation
class Tests(unittest.TestCase):
 def test_shift_boundaries_and_retry(self):
  for h,m,label in [(7,29,'2nd Shift'),(7,30,'1st Shift'),(17,29,'1st Shift'),(17,30,'2nd Shift'),(0,1,'2nd Shift')]:self.assertEqual(current_shift(datetime(2026,10,13,h,m))[1],label)
  class Page:
   calls=0
   def evaluate(self,*args):self.calls+=1;return {'ok':self.calls>=3}
  page=Page()
  with patch('ames.shift_2114.time.sleep'):self.assertEqual(ensure_shift(page,datetime(2026,10,13,9)),'1st Shift')
  self.assertEqual(page.calls,4)
  with patch('ames.shift_2114.time.sleep'),patch.object(page,'evaluate',return_value={'ok':False,'raw':'1st Shift'}):
   with self.assertRaises(RuntimeError):ensure_shift(page)
 def test_operator_requires_explicit_source(self):
  missing=operator_evidence({'TRAN CMF3':'BRM00068 Irlane','Tran Desc':'Export Repair'})
  self.assertIsNone(missing['operator_id']);self.assertIsNone(missing['operator_name'])
  raw={'Tran User Id':'SYNTHETIC-ID','Tran User Name':'Synthetic Operator','Working Oper Code':'A6900','Working Oper':'Export Repair','Tran Time':'2026-10-13 12:00'}
  ev=operator_evidence(raw);self.assertEqual(ev['operator_id'],'SYNTHETIC-ID');self.assertEqual(ev['operator_fields']['operator_name'],'Tran User Name');self.assertEqual(ev['station'],'A6900')
  self.assertIsNone(operator_evidence({'Tran User Id':'SYNTHETIC-ID'})['operator_name'])
 def test_sn_preserves_prior_pcba_and_material_history(self):
  history=[{'Defect Hist Seq':'2','Defect Code':'D1','Defect Description':'Front camera','Defect Time':'2026-10-13 09:00','Manual/Automatic':'Manual','Repair Status':'N'},{'Defect Hist Seq':'1','Defect Code':'D1','Defect Description':'Front camera','Defect Time':'2026-10-12 09:00','Manual/Automatic':'Automatic','Repair Status':'Y'}]
  class Browser:
   def __init__(self,*a):pass
   def connect(self):return self
   def disconnect(self):pass
  class Nav:
   def __init__(self,*a):pass
   def ensure_3074(self):pass
   def ensure_2114(self):return None
   def ensure_current_shift_2114(self,*a):return '1st Shift'
  class Materials:
   def __init__(self,*a):pass
   def consultar(self,sn):
    if sn=='P1':
     return {'rows':[{'Barcode':'M1','Sn Type':'Front Camera',
       'Bind Time':'2026-10-12 10:00:00','Unbind Time':'','Iss Status':'Y'}]}
    if sn=='M1':
     return {'rows':[
       {'Barcode':'OLD1','Sn Type':'PCBA','Bind Time':'2026-10-11 09:00:00','Unbind Time':'2026-10-12 07:00:00','Iss Status':'N'},
       {'Barcode':'P1','Sn Type':'PCBA','Bind Time':'2026-10-12 10:00:00','Unbind Time':'','Iss Status':'Y'}]}
    return {'rows':[]}
  class Hist:
   def __init__(self,*a):pass
   def consultar(self,sn):return {'rows':history if sn=='P1' else [history[1]],'model':'CPH2819'}
  modules={'ames.browser':types.SimpleNamespace(AmesBrowser=Browser),'ames.navigation':types.SimpleNamespace(AmesNavigation=Nav),'ames.tela_3074':types.SimpleNamespace(Tela3074=Materials,componentes_serializados=lambda *a,**k:[{'item_sn':'M1','item_type':'Front Camera'}],pcbas_historicas=lambda rows:[r.get('Barcode') for r in rows if r.get('Sn Type')=='PCBA']),'ames.tela_2114':types.SimpleNamespace(Tela2114=Hist),'ames.tela_3022':types.SimpleNamespace(),'core.correlacao_falhas':correlation}
  original=engine_bridge.importlib.import_module
  with patch.object(engine_bridge.importlib,'import_module',side_effect=lambda n:modules[n] if n in modules else original(n)):
   result=engine_bridge.run_individual_lookup(ROOT/'ames/factory-engine','P1',include_3022=False)
  self.assertEqual(result['trace_2114']['previous_failures'][0]['relation'],'MESMA_FALHA')
  old=result['trace_3074']['reused_components'][0]['previous_pcba_evidence'][0]
  self.assertEqual(old['pcba_sn'],'OLD1');self.assertEqual(old['history']['Defect Code'],'D1');self.assertEqual(old['history']['Defect Time'],'2026-10-12 09:00')
  self.assertIsNone(result['summary']['3022_events']);self.assertIsNone(result['trace_3022']['process_passages'])
if __name__=='__main__':unittest.main()
