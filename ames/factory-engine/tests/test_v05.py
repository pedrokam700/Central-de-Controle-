import unittest
from core.varredura_3074 import classificar_reuso_anterior, resumir_resultados

class V08CompatTests(unittest.TestCase):
    def test_classificacao(self):
        self.assertEqual(classificar_reuso_anterior(0), "SEM_REUSO_ANTERIOR")
        self.assertEqual(classificar_reuso_anterior(1), "SEGUNDO_USO_NO_MOMENTO_DA_FALHA")
        self.assertEqual(classificar_reuso_anterior(2), "REUSO_MULTIPLO_ANTERIOR")

    def test_resumo(self):
        rs=[
            {"status":"SEM_REUSO_ANTERIOR","error":None},
            {"status":"SEGUNDO_USO_NO_MOMENTO_DA_FALHA","error":None},
            {"status":"REUSO_MULTIPLO_ANTERIOR","error":None},
            {"status":"ERRO_CONSULTA","error":"x"},
        ]
        s=resumir_resultados(rs)
        self.assertEqual(s["components_scanned_total"],4)
        self.assertEqual(s["componentes_com_reuso_anterior"],2)
        self.assertEqual(s["components_error"],1)

if __name__=='__main__': unittest.main()
