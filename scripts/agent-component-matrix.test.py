"""The bridge exposes existing Excel evidence without changing collectors or classifiers."""
import sys, unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'ames/agent'));sys.path.insert(0,str(ROOT/'ames/factory-engine'))
import engine_bridge
from types import SimpleNamespace
class Matrix(unittest.TestCase):
    def test_existing_views_are_projected_without_credentials_or_kit_collapse(self):
        rows=[{'Linha':'TAN10101','PCBA da falha':'P','Tipo material':'Screen','Material SN':s,
               'Reusos anteriores a falha':1,'PCBAs antigas':'OLD','password':'secret'} for s in ['M1','M2','M1']]
        views={'materiais':rows,'reusos':[],'analise_rows':[],'material_summary_rows':[], 'hist_material_rows':[],'hist_pcba_rows':[]}
        reports={'core.failure_taxonomy':SimpleNamespace(configuration=lambda: {'version':'test'}),'reports.relatorio_v015':SimpleNamespace(_build_views=lambda *args:views),
                 'reports.relatorio_v016':SimpleNamespace(_build_indicators_v016=lambda _: {},_material_name=lambda v:v)}
        with patch.object(engine_bridge.importlib,'import_module',side_effect=reports.__getitem__):
            r=engine_bridge.build_trace_insights(ROOT/'ames/factory-engine',{},'TAN10101')
        items=r['drilldowns']['component_type_items']
        self.assertEqual(len(items),3);self.assertEqual(items[0]['PCBA atual'],'P')
        self.assertEqual(items[0]['PCBAs desvinculadas'],'OLD');self.assertNotIn('password',items[0])
        self.assertEqual(r['component_types'],[])
if __name__=='__main__':unittest.main()
