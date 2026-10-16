import unittest
from reports.relatorio_3028_3074 import extrair_linhas
from reports.relatorio_integrado_2114 import extrair_reuso_2114

class V0104ExcelAntigasTests(unittest.TestCase):
    def sample(self):
        return {
            "items": [{
                "pcba_sn": "CUR",
                "defect_traces": [{
                    "defect": {
                        "line":"L3","product_model":"CPH","defect_time":"2026-10-06 10:00:00",
                        "defect_code":"D","defect_desc":"Falha atual","repair_comment":""
                    },
                    "trace_3074": {
                        "results": [{
                            "item_sn":"MAT","item_type":"Camera","iss_status_now":"N",
                            "status":"SEGUNDO_USO_NO_MOMENTO_DA_FALHA",
                            "previous_pcba_count":1,
                            "previous_pcbas":["OLD"],
                            "pcbas_until_defect":["OLD","CUR"],
                            "current_pcba_confirmed":True,
                            "total_pcba_count_known_now":2,
                            "reuse_count_known_now":1,
                            # O caso real que gerou o bug: CUR já foi desmontada e virou N.
                            "inactive_now_pcbas":["OLD","CUR"],
                            "active_now_pcbas":[],
                            "all_pcba_history":[
                                {"pcba_sn":"OLD","iss_status_now":"N"},
                                {"pcba_sn":"CUR","iss_status_now":"N"},
                            ],
                        }]
                    },
                }],
            }]
        }

    def test_pcba_atual_n_nao_vira_antiga(self):
        _, materiais, reuso = extrair_linhas(self.sample())
        self.assertEqual(reuso[0]["PCBAs antigas"], "OLD")
        self.assertEqual(reuso[0]["PCBAs inativas agora"], "OLD | CUR")

    def test_reuso_2114_nao_cria_nao_consultada_para_pcba_atual(self):
        r2114 = {
            "contexts":[{
                "historical_pcba":"OLD","historical_use_index":1,
                "current_pcba":"CUR","material_sn":"MAT","material_type":"Camera",
                "defect_time":"2026-10-06 10:00:00","defect_code":"D",
                "defect_desc":"Falha atual","repair_comment":""
            }],
            "pcbas":[{
                "pcba_sn":"OLD","status":"COMPLETE","error":None,
                "result":{"shift":"1st Shift","rows":[{
                    "Defect Hist Seq":"0","Defect Code":"X","Defect Description":"Falha antiga",
                    "Defect Type":"MainBoard","Repair Status":"Y"
                }]}
            }]
        }
        resumo, _, max_old = extrair_reuso_2114(self.sample(), r2114)
        self.assertEqual(max_old, 1)
        self.assertEqual(resumo[0]["Qtde PCBAs antigas"], 1)
        self.assertEqual(resumo[0]["PCBA antiga 1"], "OLD")
        self.assertNotIn("PCBA antiga 2", resumo[0])

if __name__ == "__main__":
    unittest.main()
