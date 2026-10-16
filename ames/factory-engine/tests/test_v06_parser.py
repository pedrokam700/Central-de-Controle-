import unittest
from ames.tela_3028 import _english_header, _parse_defect_time

class V06ParserTests(unittest.TestCase):
    def test_bilingual_header(self):
        self.assertEqual(_english_header("不良现象\nDefect Desc"), "Defect Desc")
        self.assertEqual(_english_header("SN"), "SN")

    def test_mes_datetime(self):
        self.assertEqual(
            _parse_defect_time("20261005112049"),
            "2026-10-05 11:20:49"
        )

if __name__ == "__main__":
    unittest.main()
