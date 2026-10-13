import unittest
from ames.ui_helpers import _unique_headers
from ames.tela_3022 import selecionar_passagem_anterior

class V04Tests(unittest.TestCase):
    def test_unique_headers(self):
        self.assertEqual(
            _unique_headers(["Line Id","Line Id","Barcode"]),
            ["Line Id","Line Id__2","Barcode"]
        )

if __name__=="__main__":
    unittest.main()
