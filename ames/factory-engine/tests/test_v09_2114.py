import unittest
from ames.tela_2114 import resumir_historico, _classify_defect_type

class TestV09Tela2114(unittest.TestCase):
    def test_classifica_phone_disassembly(self):
        r = _classify_defect_type("Phone_Disassembly")
        self.assertEqual(r["class"], "PHONE_DISASSEMBLY")

    def test_classifica_mainboard(self):
        r = _classify_defect_type("MainBoard")
        self.assertEqual(r["class"], "MAINBOARD")

    def test_resumo(self):
        rows = [
            {"Defect Type": "Phone_Disassembly", "Repair Status": "Y"},
            {"Defect Type": "MainBoard", "Repair Status": "Y"},
            {"Defect Type": "MainBoard", "Repair Status": "N"},
            {"Defect Type": "MainBoard", "Repair Status": "Y"},
        ]
        s = resumir_historico(rows)
        self.assertEqual(s["histories_total"], 4)
        self.assertEqual(s["phone_disassembly"], 1)
        self.assertEqual(s["mainboard"], 3)
        self.assertEqual(s["repair_status_y"], 3)
        self.assertEqual(s["repair_status_n"], 1)

if __name__ == "__main__":
    unittest.main()
