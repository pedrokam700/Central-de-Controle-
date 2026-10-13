import unittest
from core.varredura_3074 import executar_varredura

class FakeTela:
    def consultar(self, sn):
        return {"query_sn":sn,"rows":[],"headers":[],"grid_kind":"fake","grid_id":"g","no_data":True}

class EmptyV08Tests(unittest.TestCase):
    def test_sem_registro_e_resultado_valido(self):
        r=executar_varredura(FakeTela(),"PCBA","2026-10-05 10:00:00")
        self.assertEqual(r["status"],"SEM_REGISTROS_3074_NA_CONSULTA")
        self.assertEqual(r["summary"]["components_error"],0)

if __name__=='__main__': unittest.main()
