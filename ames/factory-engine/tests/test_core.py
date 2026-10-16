import unittest
from datetime import datetime

from core.normalizacao import normalizar_sn
from core.correlacao import similaridade_falha, classificar_correlacao
from core.rastreabilidade import classificar_reutilizacao
from ames.tela_3022 import selecionar_passagem_anterior


class CoreTests(unittest.TestCase):
    def test_normalizar_sn(self):
        self.assertEqual(normalizar_sn("12345.0"), "12345")
        self.assertEqual(normalizar_sn(" A'6111 "), "A'6111")

    def test_reutilizacao(self):
        rows = [{"Barcode": "P1"}, {"Barcode": "P2"}, {"Barcode": "P2"}]
        r = classificar_reutilizacao(rows)
        self.assertEqual(r["distinct_pcba_count"], 2)
        self.assertEqual(r["status"], "SEGUNDO_USO")

    def test_correlacao_camera(self):
        score = similaridade_falha("Camera: Dirty rear", "Rear camera dirty")
        self.assertGreaterEqual(score, 0.55)

    def test_3022_antes_da_falha(self):
        eventos = [
            {"Current Oper Code": "A5162", "Current Oper": "SN centralized scan", "Tran Time": "2026-09-01 08:00:00"},
            {"Current Oper Code": "A5162", "Current Oper": "SN centralized scan", "Tran Time": "2026-09-01 12:00:00"},
            {"Current Oper Code": "A5162", "Current Oper": "SN centralized scan", "Tran Time": "2026-09-01 16:00:00"},
        ]
        r = selecionar_passagem_anterior(eventos, "2026-09-01 14:00:00", posto_codigo="A5162")
        self.assertEqual(r["Tran Time"], "2026-09-01 12:00:00")


if __name__ == "__main__":
    unittest.main()
