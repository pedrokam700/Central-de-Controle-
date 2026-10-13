import tempfile, unittest
from pathlib import Path
from core.fluxo_2114 import extrair_plano_2114_completo, executar_fluxo_2114

class FakeTela:
    def __init__(self): self.calls=[]
    def turno_atual(self): return '1st Shift'
    def consultar(self, pcba):
        self.calls.append(pcba)
        return {'query_sn':pcba,'shift':'1st Shift','rows':[], 'summary':{}, 'no_data':True}

class FluxoV011Tests(unittest.TestCase):
    def sample(self):
        return {'source_sha256':'abc','items':[{
            'pcba_sn':'CUR',
            'defect_traces':[{'status':'COMPLETE','defect':{'defect_time':'2026-10-06 10:00:00','defect_code':'D','defect_desc':'Camera: Offset'},
            'trace_3074':{'results':[{'item_sn':'MAT','item_type':'Camera','previous_pcbas':['OLD'],'error':None}]}}]
        }]}

    def test_plano_inclui_old_e_current(self):
        p = extrair_plano_2114_completo(self.sample())
        self.assertEqual(p['targets'], ['OLD','CUR'])
        self.assertEqual(p['historical_target_count'],1)
        self.assertEqual(p['current_target_count'],1)

    def test_seed_v010_evitar_reconsulta_old(self):
        tela=FakeTela()
        seed={'pcbas':[{'pcba_sn':'OLD','status':'COMPLETE','error':None,'result':{'query_sn':'OLD','rows':[{'Defect Code':'X'}], 'summary':{}, 'no_data':False}}]}
        with tempfile.TemporaryDirectory() as d:
            out=executar_fluxo_2114(self.sample(),tela,'abc',Path(d)/'cp.json',pause_s=0,seed_result=seed,include_current=True)
        self.assertEqual(tela.calls,['CUR'])
        self.assertEqual(out['processed_pcba_count'],2)
        self.assertEqual(out['current_target_count'],1)

if __name__ == '__main__': unittest.main()
