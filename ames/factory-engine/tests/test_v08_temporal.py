import unittest
from core.temporal_3074 import componentes_no_momento_da_falha, pcbas_do_item_ate_a_falha
from core.varredura_3074 import executar_varredura

class V08TemporalTests(unittest.TestCase):
    def test_iss_n_pode_ter_estado_ativo_na_falha(self):
        rows=[{
            "Barcode":"ITEM1", "Sn Type":"Screen",
            "Bind Time":"2026-10-05 12:00:00+00:00",
            "Unbind Time":"2026-10-05 16:00:00+00:00",
            "Iss Status":"N",
        }]
        # 12:30 BRT = 15:30 UTC -> item estava montado.
        r=componentes_no_momento_da_falha(rows,"PCBA","2026-10-05 12:30:00",-3,0)
        self.assertEqual(r["summary"]["active_at_defect"],1)
        self.assertEqual(r["summary"]["iss_status_n_now_among_active_then"],1)

    def test_vinculo_depois_da_falha_nao_e_retroativo(self):
        rows=[{
            "Barcode":"ITEM1", "Sn Type":"Screen",
            "Bind Time":"2026-10-06 01:25:16+00:00",
            "Unbind Time":"", "Iss Status":"Y",
        }]
        # 13:50 BRT = 16:50 UTC em 05/10; bind ocorreu muitas horas depois.
        r=componentes_no_momento_da_falha(rows,"PCBA","2026-10-05 13:50:38",-3,0)
        self.assertEqual(r["summary"]["active_at_defect"],0)
        self.assertEqual(r["summary"]["bound_after_defect"],1)

    def test_historico_do_item_ignora_pcba_futura(self):
        rows=[
            {"Barcode":"OLD","Sn Type":"PCBA","Bind Time":"2026-10-01 12:00:00+00:00","Iss Status":"N"},
            {"Barcode":"CUR","Sn Type":"PCBA","Bind Time":"2026-10-05 12:00:00+00:00","Iss Status":"N"},
            {"Barcode":"FUT","Sn Type":"PCBA","Bind Time":"2026-10-06 12:00:00+00:00","Iss Status":"Y"},
        ]
        r=pcbas_do_item_ate_a_falha(rows,"2026-10-05 11:00:00","CUR",-3,0) # 14:00 UTC
        self.assertEqual(r["previous_pcba_count"],1)
        self.assertEqual([x["pcba_sn"] for x in r["previous_pcbas"]],["OLD"])
        self.assertEqual(len(r["future_associations_ignored"]),1)

if __name__=='__main__': unittest.main()
