import unittest
from reports.relatorio_v013 import _process_state

class V013RepairTests(unittest.TestCase):
    def test_semantics(self):
        self.assertEqual(_process_state('N',''), 'AGUARDANDO ANÁLISE DO AUXILIAR')
        self.assertEqual(_process_state('N','MainBoard'), 'ENCAMINHADO / AGUARDANDO REPARO DE PLACA')
        self.assertEqual(_process_state('Y','MainBoard'), 'REPARO DE PLACA CONCLUÍDO')
        self.assertEqual(_process_state('Y','Phone_Disassembly'), 'PHONE DISASSEMBLY CONCLUÍDO')
        self.assertIn('OutroTipo', _process_state('Y','OutroTipo'))

if __name__=='__main__': unittest.main()
