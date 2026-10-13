import unittest
from reports.relatorio_integrado_2114 import _build_views

class V012RealShapeTests(unittest.TestCase):
    def test_reuse_is_linked_by_pcba_time_code_without_description_dependency(self):
        defect={'line':'L3','product_model':'CPH','defect_time':'2026-10-06 10:00:00','defect_code':'D1','defect_desc':'Camera：Offset'}
        trace={'items':[{'pcba_sn':'CUR','defect_traces':[{'status':'COMPLETE','defect':defect,'trace_3074':{'results':[{
            'item_sn':'MAT','item_type':'后置摄像头2','status':'SEGUNDO_USO_NO_MOMENTO_DA_FALHA','previous_pcbas':['OLD'],'previous_pcba_count':1,
            'current_pcba_confirmed':True,'total_pcba_count_known_now':2,'reuse_count_known_now':1,'active_now_pcbas':['CUR'],'inactive_now_pcbas':['OLD']
        }]}}]}]}
        v=_build_views(trace, {'pcbas':[]})
        self.assertEqual(v['stats']['materiais_reuso'],1)
        self.assertEqual(v['analise_rows'][0]['Materiais de reuso'],1)
        self.assertIn('Rear camera 2', v['analise_rows'][0]['Reuso 1'])

if __name__ == '__main__': unittest.main()
