import ast
import inspect
import json
import unittest
from pathlib import Path

import main
from core.fluxo_2114 import extrair_plano_2114_completo


class V0111RegressionTests(unittest.TestCase):
    def test_run_2114_phase_binds_tela2114(self):
        source = inspect.getsource(main._run_2114_phase)
        tree = ast.parse(source)
        imported = False
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module == "ames.tela_2114":
                imported = any(alias.name == "Tela2114" for alias in node.names)
        self.assertTrue(imported, "Tela2114 deve ser importada dentro de _run_2114_phase")

    def test_error_json_trace_can_build_v011_plan(self):
        # Estrutura mínima equivalente ao ERRO_ANALISE_COMPLETA:
        trace = {
            "items": [{
                "pcba_sn": "CUR1",
                "defect_traces": [{
                    "status": "COMPLETE",
                    "defect": {
                        "defect_time": "2026-10-06 10:00:00",
                        "defect_code": "D1",
                        "defect_desc": "Falha",
                    },
                    "trace_3074": {
                        "results": [{
                            "item_sn": "MAT1",
                            "item_type": "Camera",
                            "previous_pcbas": ["OLD1"],
                            "status": "SEGUNDO_USO_NO_MOMENTO_DA_FALHA",
                        }]
                    }
                }]
            }]
        }
        plan = extrair_plano_2114_completo(trace)
        self.assertEqual(plan["current_target_count"], 1)
        self.assertEqual(plan["historical_target_count"], 1)
        self.assertEqual(plan["target_count"], 2)


if __name__ == "__main__":
    unittest.main()
