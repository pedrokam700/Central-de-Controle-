import unittest

from core.fluxo_2114 import extrair_contextos_2114, executar_fluxo_2114
from reports.relatorio_integrado_2114 import extrair_reuso_2114


class FakeTela2114:
    def __init__(self):
        self.calls = []

    def turno_atual(self):
        return "1st Shift"

    def consultar(self, sn):
        self.calls.append(sn)
        return {
            "query_sn": sn,
            "shift": "1st Shift",
            "model": "CPH2819BR",
            "rows": [
                {
                    "Lot Id": sn,
                    "Defect Hist Seq": "0",
                    "Defect Code": "GN10-YS01",
                    "Defect Description": "Speaker: noise",
                    "Defect Oper": "A5220",
                    "Repair Status": "Y",
                    "TestTools Auto Defect Or Defect By Hand": "Manual",
                    "Defect Type": "MainBoard",
                    "Defect Type Class": "MAINBOARD",
                    "Defect Location": "UJ3201",
                    "Defect Material ID": "621019005523",
                }
            ],
            "summary": {"histories_total": 1, "phone_disassembly": 0, "mainboard": 1},
            "no_data": False,
        }


def sample_3074():
    # OLD1 aparece em dois materiais diferentes: deve ser consultada uma vez só.
    return {
        "source_sha256": "abc123",
        "items": [{
            "pcba_sn": "CUR",
            "defect_traces": [{
                "status": "COMPLETE",
                "defect": {
                    "line": "L3",
                    "product_model": "CPH2819BR",
                    "defect_time": "2026-10-05 10:00:00",
                    "defect_code": "D1",
                    "defect_desc": "Falha atual",
                    "repair_comment": "Swap",
                },
                "trace_3074": {
                    "results": [
                        {
                            "item_sn": "MAT1",
                            "item_type": "Screen",
                            "status": "SEGUNDO_USO_NO_MOMENTO_DA_FALHA",
                            "previous_pcba_count": 1,
                            "previous_pcbas": ["OLD1"],
                            "pcbas_until_defect": ["OLD1", "CUR"],
                            "current_pcba_confirmed": True,
                            "total_pcba_count_known_now": 2,
                            "reuse_count_known_now": 1,
                            "active_now_pcbas": ["CUR"],
                            "inactive_now_pcbas": ["OLD1"],
                            "all_pcba_history": [
                                {"pcba_sn": "OLD1", "iss_status_now": "N"},
                                {"pcba_sn": "CUR", "iss_status_now": "Y"},
                            ],
                        },
                        {
                            "item_sn": "MAT2",
                            "item_type": "UBoard",
                            "status": "REUSO_MULTIPLO_ANTERIOR",
                            "previous_pcba_count": 2,
                            "previous_pcbas": ["OLD1", "OLD2"],
                            "pcbas_until_defect": ["OLD1", "OLD2", "CUR"],
                            "current_pcba_confirmed": True,
                            "total_pcba_count_known_now": 3,
                            "reuse_count_known_now": 2,
                            "active_now_pcbas": ["CUR"],
                            "inactive_now_pcbas": ["OLD1", "OLD2"],
                            "all_pcba_history": [
                                {"pcba_sn": "OLD1", "iss_status_now": "N"},
                                {"pcba_sn": "OLD2", "iss_status_now": "N"},
                                {"pcba_sn": "CUR", "iss_status_now": "Y"},
                            ],
                        },
                    ]
                },
            }],
        }],
    }


class V010Tests(unittest.TestCase):
    def test_contextos_e_dedupe(self):
        plan = extrair_contextos_2114(sample_3074())
        self.assertEqual(plan["context_count"], 3)
        self.assertEqual(plan["target_count"], 2)
        self.assertEqual(plan["targets"], ["OLD1", "OLD2"])

    def test_fluxo_consulta_pcba_antiga_uma_vez(self):
        tela = FakeTela2114()
        r = executar_fluxo_2114(sample_3074(), tela, source_sha256="abc123")
        self.assertEqual(r["requested_pcba_count"], 2)
        self.assertEqual(r["processed_pcba_count"], 2)
        self.assertEqual(tela.calls, ["OLD1", "OLD2"])

    def test_excel_view_liga_material_pcba_e_historico(self):
        tela = FakeTela2114()
        r2114 = executar_fluxo_2114(sample_3074(), tela, source_sha256="abc123")
        resumo, detalhe, max_old = extrair_reuso_2114(sample_3074(), r2114)
        self.assertEqual(len(resumo), 2)
        self.assertEqual(max_old, 2)
        self.assertEqual(resumo[0]["PCBA antiga 1"], "OLD1")
        self.assertIn("Speaker: noise", resumo[0]["Historico 2114 - PCBA 1"])
        self.assertTrue(any(x["PCBA antiga"] == "OLD2" for x in detalhe))


if __name__ == "__main__":
    unittest.main()
