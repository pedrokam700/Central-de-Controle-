from __future__ import annotations

import sys
import tempfile
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGENT = ROOT / "ames" / "agent"
if str(AGENT) not in sys.path:
    sys.path.insert(0, str(AGENT))

import offline_catalog  # noqa: E402
import repair_3012  # noqa: E402
from store import Store  # noqa: E402


class OfflineCatalogTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.tmp.name) / "ames.sqlite3")
        self.store.initialize()
        repair_3012.ensure_schema(self.store)
        self.entry = types.SimpleNamespace(a=types.SimpleNamespace(STORE=self.store))
        offline_catalog.install(self.entry)

    def tearDown(self):
        self.tmp.cleanup()

    def _snapshot_with_failure(self, line="TAN10102", pcba="002527123", model="CPH2817"):
        sid = self.store.create_snapshot(window_id=None, source_kind="test")
        self.store.ingest_defects(sid, [{
            "line": line,
            "pcba_sn": pcba,
            "defect_code": "GN01-TX01",
            "defect_desc": "Earpiece receiver noise",
            "defect_time": "2026-10-14 10:00:00",
            "product_model": model,
        }], reconcile_window=False)
        self.store.rebuild_cora_index(sid)
        return sid

    def test_catalog_exposes_only_real_optional_datasets(self):
        sid = self._snapshot_with_failure()
        catalog = {row["dataset"]: row for row in self.store.dataset_catalog(sid)}
        self.assertIn("repair_history_3012", catalog)
        self.assertIn("repair_coverage_3012", catalog)
        self.assertIn("snapshots", catalog)
        self.assertNotIn("dataset_inventado", catalog)
        self.assertEqual(catalog["repair_history_3012"]["scope"], "local_history")

    def test_3012_history_is_global_not_bound_to_selected_snapshot(self):
        sid = self._snapshot_with_failure()
        payload = {
            "source": "AWIP3012_DIRECT_EXTJS",
            "query": {"sns": ["002527999"], "start_at": "2026-01-01T00:00:00", "end_at": "2026-10-14T23:59:59"},
            "rows": [{
                "row_key": "r-1", "pcba_sn": "002527999", "line": "TAN10102", "product_model": "CPH2817",
                "defect_code": "GN01-TX01", "defect_desc": "Receiver noise", "defect_time": "2026-04-01 08:00:00",
                "repair_user": "repair01", "repair_time": "2026-04-01 09:00:00", "repair_code": "RC01",
            }],
        }
        repair_3012.ingest(self.store, payload)
        rows = self.store.dataset_rows("repair_history_3012", snapshot_id=sid, line="TAN10102")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["pcba_sn"], "002527999")
        coverage = self.store.dataset_rows("repair_coverage_3012", snapshot_id=sid, line="TAN10102")
        self.assertEqual(len(coverage), 1)
        self.assertEqual(coverage[0]["sn"], "002527999")

    def test_search_finds_product_model_from_metadata_and_3012(self):
        self._snapshot_with_failure(model="CPH2817")
        results = self.store.search_cora("CPH2817", line="TAN10102", limit=20)
        self.assertTrue(results)
        self.assertTrue(any("CPH2817" in str(row.get("metadata_json") or row.get("title") or "") for row in results))

    def test_local_lookup_metadata_never_turns_missing_cache_into_mes_zero(self):
        sid = self._snapshot_with_failure()
        repair_3012.ingest(self.store, {
            "source": "AWIP3012_DIRECT_EXTJS",
            "query": {"sns": ["002527123"], "start_at": "2026-01-01T00:00:00", "end_at": "2026-10-14T23:59:59"},
            "rows": [],
        })
        enriched = offline_catalog._enrich_local_lookup(self.store, {
            "query_sn": "002527123",
            "targets": ["002527123"],
            "defects": [{"snapshot_id": sid, "defect_time": "2026-10-14 10:00:00"}],
            "pcba_history": [], "material_reuse": [], "process_events": [], "repair_3012": [],
            "coverage": {"3028": True, "3074": False, "2114": False, "3022": False, "3012": False},
        })
        self.assertEqual(enriched["coverage_meta"]["3028"]["state"], "cached")
        self.assertEqual(enriched["coverage_meta"]["2114"]["state"], "not_collected")
        self.assertEqual(enriched["coverage_meta"]["3012"]["state"], "not_collected")
        self.assertFalse(enriched["database_meta"]["current_state_proven"])
        self.assertIn("não prova ausência", enriched["database_meta"]["note"])
        self.assertIn("002527123", enriched["coverage_3012"])


if __name__ == "__main__":
    unittest.main()
