import unittest
from core.correlacao_falhas import analisar_historico_pcba_atual, classificar_historicos
from reports.relatorio_v014 import _process_state
from reports.relatorio_v015 import _build_views
from reports.relatorio_v016 import _build_indicators_v016

class V014CurrentHistoryTests(unittest.TestCase):
    def test_last_matching_seq_is_current_and_prior_y_do_not_override_n(self):
        rows = [
            {"Defect Hist Seq":"0","Defect Code":"CAM","Defect Description":"Camera failed","Repair Status":"Y","Defect Type":"Phone_Disassembly"},
            {"Defect Hist Seq":"1","Defect Code":"CAM","Defect Description":"Camera failed","Repair Status":"Y","Defect Type":"MainBoard"},
            {"Defect Hist Seq":"2","Defect Code":"CAM","Defect Description":"Camera failed","Repair Status":"Y","Defect Type":"MainBoard"},
            {"Defect Hist Seq":"3","Defect Code":"CAM","Defect Description":"Camera failed","Repair Status":"Y","Defect Type":"MainBoard"},
            {"Defect Hist Seq":"4","Defect Code":"CAM","Defect Description":"Camera failed","Repair Status":"N","Defect Type":"MainBoard"},
        ]
        a = analisar_historico_pcba_atual("CAM", "Camera failed", rows)
        self.assertEqual(a["current_seq"], "4")
        self.assertEqual(a["current_history"]["Repair Status"], "N")
        self.assertEqual(a["same_repetitions"], 4)
        self.assertEqual(a["previous_total"], 4)
        self.assertEqual(_process_state(a["current_history"]["Repair Status"], a["current_history"]["Defect Type"]), "ENCAMINHADO / AGUARDANDO REPARO DE PLACA")

    def test_usage_history_and_failure_history_are_not_same_metric(self):
        rows = [{"Defect Hist Seq":"0","Defect Code":"X","Defect Description":"Only failure","Repair Status":"N","Defect Type":""}]
        a = analisar_historico_pcba_atual("X", "Only failure", rows)
        self.assertEqual(a["total"], 1)
        self.assertEqual(a["previous_total"], 0)

    def test_unknown_relation_does_not_crash_or_become_other_failure(self):
        # An undecidable 2114 relation is a valid taxonomy outcome. It must
        # remain visible as uncertainty, not abort an entire line's reuse KPIs.
        rows = [{"Defect Hist Seq": "0", "Defect Code": "", "Defect Description": ""}]
        result = classificar_historicos("GN14-KZ01", "SIM card recognition exception", rows)
        self.assertEqual(result["strongest"], "INDETERMINADA")
        self.assertEqual(result["unknown_count"], 1)
        self.assertEqual(result["same_count"], 0)
        self.assertEqual(result["similar_count"], 0)
        self.assertEqual(result["different_count"], 0)
        self.assertEqual(result["details"][0]["relation"], "INDETERMINADA")

    def test_unknown_prior_record_does_not_fabricate_recurring_failure(self):
        histories = [
            {"Defect Hist Seq": "0", "Defect Code": "", "Defect Description": ""},
            {"Defect Hist Seq": "1", "Defect Code": "GN14-KZ01", "Defect Description": "SIM card recognition exception"},
        ]
        result = analisar_historico_pcba_atual("GN14-KZ01", "SIM card recognition exception", histories)
        self.assertEqual(result["total"], 2)
        self.assertEqual(result["previous_total"], 1)
        self.assertEqual(result["unknown_count"], 1)
        self.assertEqual(result["prior_unknown_count"], 1)
        self.assertEqual(result["same_repetitions"], 0)
        self.assertEqual(result["prior_different_count"], 0)
        self.assertEqual(result["prior_similar_count"], 0)

    def test_full_reuse_view_survives_unknown_2114_history(self):
        # Regression for LOCAL_INSIGHT_BUILD_FAILED_KEYERROR_CLASSIFICAR_HISTORICOS_L86.
        # The current failure's physical PCBA cycle is independent of whether
        # an older 2114 failure can be classified against the current code.
        pcba = "SYNTH-BOARD-3"
        defect = {"line": "TAN10103", "product_model": "CPH2819BR",
                  "defect_code": "GN14-KZ01", "defect_desc": "SIM card recognition exception",
                  "defect_time": "2026-11-10 10:00:00"}
        trace3074 = {"items": [{"pcba_sn": pcba,
            "base_query": {"rows": [{"Barcode": pcba, "Sn Type": "PCBA",
                                      "Bind Time": "2026-11-10 08:00:00", "Iss Status": "Y"}]},
            "defect_traces": [{"defect": defect, "trace_3074": {"results": []}}]}]}
        trace2114 = {"pcbas": [{"pcba_sn": pcba, "status": "COMPLETE", "result": {"rows": [
            {"Defect Hist Seq": "0", "Defect Code": "", "Defect Description": ""},
            {"Defect Hist Seq": "1", "Defect Code": "GN14-KZ01",
             "Defect Description": "SIM card recognition exception"},
        ]}}]}
        views = _build_views(trace3074, trace2114)
        self.assertEqual(len(views["analise_rows"]), 1)
        row = views["analise_rows"][0]
        self.assertEqual(row["Linha"], "TAN10103")
        self.assertEqual(row["Falhas anteriores 2114"], 1)
        self.assertEqual(row["Mesma falha anterior"], 0)
        self.assertEqual(row["Falhas diferentes anteriores"], 0)
        indicators = _build_indicators_v016(views)
        self.assertIn("pcba_kpis", indicators)

if __name__ == '__main__': unittest.main()
