"""Deep trace must consult verified 3074/Home even after OPC/2114 is opened.

No MES, database, token, or real factory network connection is used.
"""
import pathlib
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'ames'/'agent'))
import engine_bridge

class DeepHomePageTests(unittest.TestCase):
    def test_3028_trace_pins_home_3074_not_last_active_opc(self):
        home=object()
        opc=object()
        calls=[]
        class Browser:
            def __init__(self,*a):self._target=self
            def connect(self):return self
            def disconnect(self):calls.append('disconnect')
            def choose_active_page(self,*a):
                raise AssertionError('Never choose last active OPC/2114 for 3074')
        class Navigation:
            def __init__(self,*a):pass
            def ensure_3074(self):
                calls.append('3074:home');return home
            def ensure_2114(self):
                calls.append('2114:opc');return opc
            def ensure_current_shift_2114(self,*a):return '1st Shift'
        class Tela3074:
            def __init__(self,*a):self.target_page=None
            def _page(self):
                if self.target_page is None:raise AssertionError('3074 page not pinned')
                return self.target_page
            def consultar(self,sn):
                self.assert_true(self._page() is home)
                return {'rows':[]}
            def assert_true(self,ok):
                if not ok:raise AssertionError('Used non-Home page')
        class Tela2114:
            def __init__(self,*a):pass
            def _page(self):return opc
            def turno_atual(self):return '1st Shift'
        def run3074(_source,_parser,tela,**kw):
            calls.append('run3074')
            self.assertIs(tela._page(),home)
            self.assertEqual(tela.consultar('PCBA-A'),{'rows':[]})
            return {'source_sha256':'fake','items':[],'requested_pcba_count':1,'processed_pcba_count':1}
        def run2114(_r,_tela,**kw):
            calls.append('run2114')
            return {'pcbas':[],'contexts':[],'processed_pcba_count':0}
        mods={
            'ames.browser':types.SimpleNamespace(AmesBrowser=Browser),
            'ames.navigation':types.SimpleNamespace(AmesNavigation=Navigation),
            'ames.tela_3074':types.SimpleNamespace(Tela3074=Tela3074),
            'ames.tela_2114':types.SimpleNamespace(Tela2114=Tela2114),
            'core.fluxo_3028_3074':types.SimpleNamespace(executar_fluxo=run3074),
            'core.fluxo_2114':types.SimpleNamespace(executar_fluxo_2114=run2114),
        }
        with tempfile.TemporaryDirectory() as folder,patch.dict(sys.modules,mods):
            result=engine_bridge.run_deep_v016_records(
                pathlib.Path(folder),[{'pcba_sn':'PCBA-A','defect_code':'D1',
                'defect_time':'2026-10-27T09:00:00-03:00'}],
                'trace-test',pathlib.Path(folder)/'scratch')
        self.assertEqual(result['trace_3074']['processed_pcba_count'],1)
        self.assertEqual(calls,['3074:home','2114:opc','run3074','run2114','disconnect'])

if __name__=='__main__':
    unittest.main(verbosity=2)
