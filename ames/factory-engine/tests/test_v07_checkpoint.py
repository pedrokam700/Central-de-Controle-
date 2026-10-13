import json
import tempfile
import unittest
from pathlib import Path

from core.fluxo_3028_3074 import executar_fluxo


class Fake3074:
    def __init__(self):
        self.calls = []

    def consultar(self, sn, timeout_s=18.0, retries=2):
        self.calls.append(sn)
        # PCBA base P1 -> 2 itens; item A reutilizado, item B sem reutilizacao.
        if sn == "P1":
            return {"query_sn": sn, "rows": [
                {"Barcode":"P1","Sn Type":"PCBA","Bind Time":"2026-10-05 11:00:00+00:00"},
                {"Barcode":"A","Sn Type":"Screen","Bind Time":"2026-10-05 11:00:00+00:00","Unbind Time":"","Iss Status":"Y"},
                {"Barcode":"B","Sn Type":"Camera","Bind Time":"2026-10-05 11:00:00+00:00","Unbind Time":"","Iss Status":"Y"},
            ], "headers":[], "grid_kind":"fake", "grid_id":"g"}
        if sn == "A":
            return {"query_sn": sn, "rows": [
                {"Barcode":"OLD","Sn Type":"PCBA","Bind Time":"2026-09-01 11:00:00+00:00"},
                {"Barcode":"P1","Sn Type":"PCBA","Bind Time":"2026-10-05 11:00:00+00:00"},
                {"Barcode":"A","Sn Type":"Screen","Bind Time":"2026-10-05 11:00:00+00:00"},
            ], "headers":[], "grid_kind":"fake", "grid_id":"g"}
        if sn == "B":
            return {"query_sn": sn, "rows": [
                {"Barcode":"P1","Sn Type":"PCBA","Bind Time":"2026-10-05 11:00:00+00:00"},
                {"Barcode":"B","Sn Type":"Camera","Bind Time":"2026-10-05 11:00:00+00:00"},
            ], "headers":[], "grid_kind":"fake", "grid_id":"g"}
        raise RuntimeError(sn)


class V07CheckpointTests(unittest.TestCase):
    def test_checkpoint_and_resume(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            source = td / "input.xlsx"
            source.write_bytes(b"fake-xlsx-content")
            cp = td / "checkpoint.json"
            parsed = {
                "records_count": 1,
                "unique_pcba_count": 1,
                "records": [{"pcba_sn":"P1", "defect_desc":"x", "defect_time":"2026-10-05 10:00:00"}],
            }
            f1 = Fake3074()
            r1 = executar_fluxo(source, parsed, f1, max_pcbas=1, checkpoint_path=cp)
            self.assertEqual(r1["processed_pcba_count"], 1)
            self.assertTrue(cp.exists())
            self.assertIn("P1", f1.calls)
            self.assertIn("A", f1.calls)
            self.assertIn("B", f1.calls)

            # Segunda execucao: PCBA completa deve ser pulada, sem consultar MES.
            f2 = Fake3074()
            r2 = executar_fluxo(source, parsed, f2, max_pcbas=1, checkpoint_path=cp)
            self.assertEqual(r2["processed_pcba_count"], 1)
            self.assertEqual(f2.calls, [])

if __name__ == "__main__":
    unittest.main()
