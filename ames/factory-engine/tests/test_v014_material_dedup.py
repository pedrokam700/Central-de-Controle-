import unittest
from reports.relatorio_v014 import _reuse_analysis, _build_indicators

class V014MaterialDedupTests(unittest.TestCase):
    def test_same_pcba_with_three_same_failures_counts_one_pcba(self):
        row = {"PCBAs antigas":"OLD", "PCBAs inativas agora":"OLD", "PCBAs atuais Y":"", "Defect Code":"D", "Defect Desc":"Camera failed"}
        pmap = {"OLD":{"status":"COMPLETE","result":{"rows":[
            {"Defect Hist Seq":"0","Defect Code":"D","Defect Description":"Camera failed"},
            {"Defect Hist Seq":"1","Defect Code":"D","Defect Description":"Camera failed"},
            {"Defect Hist Seq":"2","Defect Code":"D","Defect Description":"Camera failed"},
        ]}}}
        a = _reuse_analysis(row,pmap)
        self.assertEqual(a["same_pcbas"],1)
        self.assertEqual(a["same_occurrences"],3)
        self.assertEqual(a["old_pcba_count"],1)

    def test_all_component_types_exist_even_zero_reuse(self):
        views = {
            "analise_rows": [{"PCBA":"P","Defect Time":"1","_pcba_use_index":1,"Falhas registradas 2114":1,"Mesma falha anterior":0,"Mesma família anterior":0,"Linha":"L2","Situação reparo atual":"AGUARDANDO ANÁLISE DO AUXILIAR"}],
            "materiais": [
                {"Material SN":"S1","Tipo material":"显示屏"},
                {"Material SN":"C1","Tipo material":"前置摄像头"},
                {"Material SN":"F1","Tipo material":"指纹模组"},
            ],
            "reusos": [{"Material SN":"C1","Tipo material":"前置摄像头","Reusos anteriores a falha":1,"Linha":"L2"}],
            "hist_pcba_rows": [], "hist_material_rows": [],
        }
        ind = _build_indicators(views)
        names = {x["Tipo material"]: x for x in ind["component_types"]}
        self.assertIn("Screen", names); self.assertIn("Front camera", names); self.assertIn("Fingerprint", names)
        self.assertEqual(names["Screen"]["Reutilizados únicos"],0)
        self.assertEqual(names["Front camera"]["Reutilizados únicos"],1)
        total_reused = next(v for k,v in ind["material_kpis"] if k == "Materiais únicos 2º+ uso")
        camera_reused = next(v for k,v in ind["material_kpis"] if k == "Câmeras reutilizadas")
        self.assertLessEqual(camera_reused, total_reused)

if __name__ == '__main__': unittest.main()
