import unittest
from core.temporal_3074 import historico_completo_pcbas_do_item
from reports.relatorio_3028_3074 import extrair_linhas


class V081ReusoTests(unittest.TestCase):
    def test_historico_completo_y_n_e_reusos(self):
        rows = [
            {"Barcode":"PCBA_OLD1","Sn Type":"PCBA","Bind Time":"2026-10-01 10:00:00+00:00","Unbind Time":"2026-10-01 12:00:00+00:00","Iss Status":"N"},
            {"Barcode":"PCBA_OLD2","Sn Type":"PCBA","Bind Time":"2026-10-02 10:00:00+00:00","Unbind Time":"2026-10-02 12:00:00+00:00","Iss Status":"N"},
            {"Barcode":"PCBA_CUR","Sn Type":"PCBA","Bind Time":"2026-10-03 10:00:00+00:00","Unbind Time":"","Iss Status":"Y"},
        ]
        r = historico_completo_pcbas_do_item(rows, 0)
        self.assertEqual(r["distinct_pcba_count"], 3)
        self.assertEqual(r["reuse_count"], 2)
        self.assertEqual(r["active_now_pcbas"], ["PCBA_CUR"])
        self.assertEqual(r["inactive_now_pcbas"], ["PCBA_OLD1", "PCBA_OLD2"])

    def test_excel_rows_expoem_material_usos_e_pcbas(self):
        result = {"items":[{
            "pcba_sn":"CUR",
            "defect_traces":[{
                "defect":{"line":"L3","product_model":"CPH","defect_time":"2026-10-05 10:00:00","defect_desc":"Falha","repair_comment":"Swap"},
                "trace_3074":{"status":"OK","results":[{
                    "item_sn":"MAT1","item_type":"Screen","iss_status_now":"Y","status":"SEGUNDO_USO_NO_MOMENTO_DA_FALHA",
                    "previous_pcba_count":1,"previous_pcbas":["OLD"],"pcbas_until_defect":["OLD","CUR"],"current_pcba_confirmed":True,
                    "total_pcba_count_known_now":2,"reuse_count_known_now":1,"inactive_now_pcbas":["OLD"],"active_now_pcbas":["CUR"],
                    "all_pcba_history":[{"pcba_sn":"OLD","iss_status_now":"N"},{"pcba_sn":"CUR","iss_status_now":"Y"}],
                }]}
            }]
        }]}
        falhas, materiais, reuso = extrair_linhas(result)
        self.assertEqual(len(falhas), 1)
        self.assertEqual(len(materiais), 1)
        self.assertEqual(len(reuso), 1)
        self.assertEqual(reuso[0]["Material SN"], "MAT1")
        self.assertEqual(reuso[0]["Usos totais conhecidos"], 2)
        self.assertEqual(reuso[0]["Reusos totais conhecidos"], 1)
        self.assertEqual(reuso[0]["PCBAs antigas"], "OLD")
        self.assertEqual(reuso[0]["PCBAs atuais Y"], "CUR")

    def test_falhas_separam_cada_reuso_em_coluna(self):
        result = {"items":[{
            "pcba_sn":"CUR",
            "defect_traces":[{
                "defect":{"line":"L3","product_model":"CPH","defect_time":"2026-10-05 10:00:00","defect_desc":"Falha"},
                "trace_3074":{"status":"OK","results":[
                    {"item_sn":"MAT1","item_type":"Screen","iss_status_now":"N","status":"SEGUNDO_USO_NO_MOMENTO_DA_FALHA",
                     "previous_pcba_count":1,"previous_pcbas":["OLD1"],"pcbas_until_defect":["OLD1","CUR"],"current_pcba_confirmed":True,
                     "total_pcba_count_known_now":2,"reuse_count_known_now":1,"inactive_now_pcbas":["OLD1"],"active_now_pcbas":[]},
                    {"item_sn":"MAT2","item_type":"UBoard","iss_status_now":"Y","status":"REUSO_MULTIPLO_ANTERIOR",
                     "previous_pcba_count":2,"previous_pcbas":["OLD2","OLD3"],"pcbas_until_defect":["OLD2","OLD3","CUR"],"current_pcba_confirmed":True,
                     "total_pcba_count_known_now":3,"reuse_count_known_now":2,"inactive_now_pcbas":["OLD2","OLD3"],"active_now_pcbas":["CUR"]}
                ]}
            }]
        }]}
        falhas, _, _ = extrair_linhas(result)
        self.assertIn("Reuso 1", falhas[0])
        self.assertIn("Reuso 2", falhas[0])
        self.assertNotIn("Resumo materiais de reuso", falhas[0])
        juntos = falhas[0]["Reuso 1"] + "\n" + falhas[0]["Reuso 2"]
        self.assertIn("MAT1", juntos)
        self.assertIn("OLD1", juntos)
        self.assertIn("MAT2", juntos)
        self.assertIn("OLD2", juntos)
        self.assertIn("OLD3", juntos)


if __name__ == "__main__":
    unittest.main()
