import unittest
from reports.relatorio_v015 import _material_evidence, _build_indicators

class V015UsageVsFailuresTests(unittest.TestCase):
    def test_reused_material_without_old_failure_is_explicit(self):
        ra={"history_occurrences":0,"same_pcbas":0,"similar_pcbas":0,"different_pcbas":0}
        self.assertEqual(_material_evidence(ra), "REUSO SEM FALHA ANTERIOR REGISTRADA")

    def test_pcba_two_uses_one_failure_has_own_indicator(self):
        views={
            "analise_rows":[{
                "PCBA":"P1","Defect Time":"1","_pcba_use_index":2,"Falhas registradas 2114":1,"Falhas anteriores 2114":0,
                "Mesma falha anterior":0,"Mesma família anterior":0,"Linha":"L3","Situação reparo atual":"AGUARDANDO ANÁLISE DO AUXILIAR"
            }],
            "materiais":[],"reusos":[],"material_summary_rows":[],"hist_pcba_rows":[],"hist_material_rows":[]
        }
        ind=_build_indicators(views)
        d=dict(ind["pcba_kpis"])
        self.assertEqual(d["PCBAs 2º+ uso com só 1 falha 2114"],1)
        self.assertEqual(d["PCBAs 2º+ uso com falha anterior"],0)

    def test_reuse_with_and_without_old_failure_are_separate(self):
        views={
            "analise_rows":[],
            "materiais":[{"Material SN":"A","Tipo material":"Screen"},{"Material SN":"B","Tipo material":"Screen"}],
            "reusos":[
                {"Material SN":"A","Tipo material":"Screen","Reusos anteriores a falha":1,"Linha":"L2"},
                {"Material SN":"B","Tipo material":"Screen","Reusos anteriores a falha":1,"Linha":"L2"},
            ],
            "material_summary_rows":[
                {"Material SN":"A","Falhas 2114 nas desvinculadas":0,"PCBAs com mesma falha":0,"PCBAs com mesma família":0,"PCBAs com falha diferente":0,"PCBAs sem histórico de falha":1},
                {"Material SN":"B","Falhas 2114 nas desvinculadas":3,"PCBAs com mesma falha":1,"PCBAs com mesma família":0,"PCBAs com falha diferente":0,"PCBAs sem histórico de falha":0},
            ],
            "hist_pcba_rows":[],"hist_material_rows":[]
        }
        ind=_build_indicators(views); d=dict(ind["material_kpis"])
        self.assertEqual(d["Reuso SEM falha em PCBA desvinculada"],1)
        self.assertEqual(d["Reuso COM falha em PCBA desvinculada"],1)
        self.assertEqual(d["Reuso com a MESMA falha"],1)
        self.assertEqual(d["Screens/LCDs reutilizados"],2)

if __name__ == '__main__': unittest.main()
