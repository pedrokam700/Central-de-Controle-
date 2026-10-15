from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGENT = ROOT / "ames" / "agent"
if str(AGENT) not in sys.path:
    sys.path.insert(0, str(AGENT))

import diagnose_3022 as diag  # noqa: E402
import process_r11  # noqa: E402


class Observability3022Tests(unittest.TestCase):
    def test_grid_signature_is_compact_and_stable(self):
        grid = {
            "headers": ["Current Oper", "Tran Time"],
            "rows": [{"Current Oper": "A5700", "Tran Time": "2026-10-14 10:00:00"}],
            "store_loading": False,
        }
        a = diag.grid_signature(grid)
        b = diag.grid_signature(grid)
        self.assertEqual(a, b)
        self.assertEqual(a["rows"], 1)
        self.assertEqual(a["headers"], 2)
        self.assertEqual(len(a["sha256_16"]), 16)
        self.assertNotIn("A5700", str(a))

    def test_header_association_requires_explicit_match(self):
        fields = [
            {"label": "SN / IMEI / A-S", "name": "sn", "itemId": "snField", "raw": "002527123", "value": "002527123"},
            {"label": "Model", "raw": "CPH2817"},
        ]
        confirmed = diag.header_association(fields, "002527123")
        unproven = diag.header_association(fields, "002527999")
        self.assertEqual(confirmed["status"], "CONFIRMED_VISIBLE_HEADER")
        self.assertEqual(unproven["status"], "UNPROVEN")
        self.assertNotIn("002527123", str(confirmed))

    def test_stale_grid_flag_is_telemetry_only(self):
        before = {"sha256_16": "same"}
        after = {"sha256_16": "same"}
        unproven = {"status": "UNPROVEN"}
        confirmed = {"status": "CONFIRMED_VISIBLE_HEADER"}
        self.assertTrue(diag.stale_grid_risk(before=before, after=after, association=unproven, returned_rows=4))
        self.assertFalse(diag.stale_grid_risk(before=before, after=after, association=confirmed, returned_rows=4))
        self.assertFalse(diag.stale_grid_risk(before=before, after=after, association=unproven, returned_rows=0))

    def test_summary_separates_latency_errors_and_no_data(self):
        summary = diag.summarize([
            {"status": "COMPLETE", "query_ms": 4800, "total_ms": 4900, "no_data": False, "stale_grid_risk": False},
            {"status": "COMPLETE", "query_ms": 3200, "total_ms": 3300, "no_data": True, "stale_grid_risk": True},
            {"status": "ERROR", "total_ms": 18000},
        ])
        self.assertEqual(summary["requested"], 3)
        self.assertEqual(summary["completed"], 2)
        self.assertEqual(summary["errors"], 1)
        self.assertEqual(summary["no_data"], 1)
        self.assertEqual(summary["stale_grid_risk_flags"], 1)
        self.assertEqual(summary["query_avg_ms"], 4000.0)

    def test_diagnostic_does_not_replace_production_collector(self):
        collector = (ROOT / "ames" / "factory-engine" / "ames" / "tela_3022.py").read_text(encoding="utf-8")
        self.assertNotIn("diagnose_3022", collector)
        source = (AGENT / "diagnose_3022.py").read_text(encoding="utf-8")
        self.assertIn("tela.consultar(pcba, timeout_s=timeout_s, empty_confirm_s=empty_confirm_s)", source)
        self.assertNotIn("tela3022_mod.extract_best_grid =", source)
        self.assertNotIn("tela3022_mod.Tela3022 =", source)

    def test_production_adapter_rejects_known_stale_or_wrong_grid(self):
        self.assertEqual(process_r11._grid_query_identity([{"Lot Id": "0025276382"}], "0025276382"), "CONFIRMED")
        self.assertEqual(process_r11._grid_query_identity([{"Lot Id": "0025271111"}], "0025276382"), "CONTRADICTED")
        self.assertEqual(process_r11._grid_query_identity([{"Current Oper": "A5700"}], "0025276382"), "UNKNOWN")
        source = (AGENT / "process_r11.py").read_text(encoding="utf-8")
        self.assertIn("resposta anterior não será reutilizada", source)
        self.assertIn("GRID_IDENTITY_CONFIRMED", source)
        self.assertIn("GRID_CHANGED_AFTER_QUERY", source)
        self.assertIn("_grid_signature(after_grid)!=_grid_signature(before_grid)", source)

    def test_3022_mes_phase_is_exclusive_and_precedes_local_persistence(self):
        source = (AGENT / "process_r11.py").read_text(encoding="utf-8")
        mes_start = source.index("# Phase A")
        lease = source.index("with MES.critical()", mes_start)
        query = source.index("rr=tela.consultar(pcba)", lease)
        local_start = source.index("# Phase B", query)
        sql = source.index("DELETE FROM process_raw_events", local_start)
        self.assertLess(mes_start, lease)
        self.assertLess(lease, query)
        self.assertLess(query, local_start)
        self.assertLess(local_start, sql)
        self.assertIn('"phase":"mes"', source)
        self.assertIn('"phase":"local"', source)

    def test_canonical_trace_owns_3074_to_2114_and_reports_3022_progress(self):
        source = (AGENT / "agent_entry.py").read_text(encoding="utf-8")
        lease = source.index("with a.MES.critical():")
        trace = source.index("a.run_deep_v016_records", lease)
        self.assertLess(lease, trace)
        self.assertIn('if stage=="3022"', source)
        self.assertIn('"phase":phase', source)
        self.assertIn('_aggregate_stage(results,"2114")', source)
        self.assertNotIn('"2114":"done"', source)


if __name__ == "__main__":
    unittest.main()
