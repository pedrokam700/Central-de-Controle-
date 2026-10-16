import unittest
from core.correlacao_falhas import analisar_historico_pcba_atual
from reports.relatorio_v014 import _process_state

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

if __name__ == '__main__': unittest.main()
