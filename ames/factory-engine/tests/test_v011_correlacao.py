import unittest
from core.correlacao_falhas import comparar_falhas, analisar_historico_pcba_atual

class CorrelacaoV011Tests(unittest.TestCase):
    def test_mesma_por_codigo(self):
        r = comparar_falhas('GN01-TX02','Antenna ANT1','GN01-TX02','Antenna changed')
        self.assertEqual(r['relation'], 'MESMA_FALHA')

    def test_similar_camera(self):
        r = comparar_falhas('A','Camera: Offset','B','Camera: Rear camera failed')
        self.assertEqual(r['relation'], 'INDETERMINADA')  # Generic camera does not prove rear subtype (Issue52).
        self.assertEqual(r['current_family'], 'CAMERA')

    def test_diferente_camera_audio(self):
        r = comparar_falhas('A','Camera: Offset','B','Speaker: noise')
        self.assertEqual(r['relation'], 'FALHA_DIFERENTE')

    def test_repeticao_mesma_falha_so_acima_de_um(self):
        hist = [
            {'Defect Code':'GN10-YS01','Defect Description':'Speaker: noise'},
            {'Defect Code':'GN10-YS01','Defect Description':'Speaker: noise'},
            {'Defect Code':'GN01-TX01','Defect Description':'Antenna: ANT0 test failed'},
        ]
        r = analisar_historico_pcba_atual('GN10-YS01','Speaker: noise',hist)
        self.assertEqual(r['same_count'], 2)
        self.assertEqual(r['same_repetitions'], 1)
        self.assertEqual(r['status'], 'MESMA_FALHA_REPETIDA')

if __name__ == '__main__': unittest.main()
