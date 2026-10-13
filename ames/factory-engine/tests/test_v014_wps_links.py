import unittest
from openpyxl import Workbook
from reports.relatorio_v014 import _set_internal_link

class V014WpsLinkTests(unittest.TestCase):
    def test_internal_link_uses_location_not_external_target(self):
        wb = Workbook(); ws = wb.active
        c = ws["A1"]
        _set_internal_link(c, "ANALISE", "A7", "Voltar")
        self.assertEqual(c.hyperlink.location, "'ANALISE'!A7")
        self.assertFalse(c.hyperlink.target)

if __name__ == '__main__': unittest.main()
