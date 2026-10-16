from __future__ import annotations

import sys
import unittest
from contextlib import ExitStack
from unittest.mock import Mock, patch
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGENT = ROOT / "ames" / "agent"
if str(AGENT) not in sys.path:
    sys.path.insert(0, str(AGENT))

import diagnose_3022 as diag  # noqa: E402
import process_r11  # noqa: E402
sys.path.insert(0, str(ROOT / "ames" / "factory-engine"))
from ames import tela_3022 as collector  # noqa: E402


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
        collector_source = (ROOT / "ames" / "factory-engine" / "ames" / "tela_3022.py").read_text(encoding="utf-8")
        self.assertNotIn("diagnose_3022", collector_source)
        source = (AGENT / "diagnose_3022.py").read_text(encoding="utf-8")
        self.assertIn("tela.consultar(pcba, timeout_s=timeout_s, empty_confirm_s=empty_confirm_s)", source)
        self.assertNotIn("tela3022_mod.extract_best_grid =", source)
        self.assertNotIn("tela3022_mod.Tela3022 =", source)

    def test_production_adapter_keeps_explicit_identity_as_strong_evidence(self):
        self.assertEqual(collector._result_identity_3022([{"Lot Id": "0025276382"}], [], "0025276382"), "GRID_IDENTITY_CONFIRMED")
        self.assertEqual(collector._result_identity_3022([{"Lot Id": "0025271111"}], [], "0025276382"), "MISMATCH")
        self.assertEqual(collector._result_identity_3022([{"Current Oper": "A5700"}], [], "0025276382"), "UNCONFIRMED")
        source = (AGENT / "process_r11.py").read_text(encoding="utf-8")
        self.assertIn("resposta anterior não será reutilizada", source)
        self.assertIn('diagnostics.get("status") not in {"CONFIRMED", "CONFIRMED_EMPTY"}', source)
        self.assertNotIn('rr["response_identity"]=', source, "adapter must not override collector confirmation")
        self.assertIn('"query_diagnostics":rr.get("query_diagnostics")', source)
        self.assertIn('"query_diagnostics":item.get("query_diagnostics")', source)

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


class Canonical3022QueryTests(unittest.TestCase):
    def grid(self, pcba=None, *, rows=True, loading=False, seq=1):
        row = {"Current Oper": "A5700", "Hist Seq": seq}
        if pcba is not None:
            row["Lot Id"] = pcba
        return {"headers": list(row), "rows": [row] if rows else [],
                "store_loading": loading, "grid_id": "history", "frame_url": "mes/3022"}

    def run_query(self, grids, *, fields=(), visible=True, input_values=None, timeout=1.7, empty=0.7,
                  watch_armed=False, watch_states=()):
        clock = [0.0]
        def sleep(seconds):
            clock[0] += seconds
        sequence = iter(grids)
        current = [None]
        def extract(*args, **kwargs):
            current[0] = next(sequence, current[0])
            if isinstance(current[0], Exception):
                raise current[0]
            return current[0]
        tela = collector.Tela3022.__new__(collector.Tela3022)
        tela.cfg = {"view_texts": ["View"], "expected_headers": ["Current Oper"]}
        tela._page = Mock(return_value=object())
        tela._grid_visible = Mock(return_value=visible)
        tela._header_fields = Mock(return_value=list(fields))
        tela._arm_grid_refresh_watch = Mock(return_value=watch_armed)
        watch_sequence = iter(watch_states)
        watch_current = [{}]
        def read_watch(*args, **kwargs):
            watch_current[0] = next(watch_sequence, watch_current[0])
            return watch_current[0]
        tela._read_grid_refresh_watch = Mock(side_effect=read_watch)
        field = Mock()
        if input_values:
            values = iter(input_values)
            last_value = [input_values[-1]]
            def input_value(*args, **kwargs):
                last_value[0] = next(values, last_value[0])
                return last_value[0]
            field.input_value = Mock(side_effect=input_value)
        else:
            field.input_value = Mock(return_value="P2")
        tela._query_control = Mock(return_value=field)
        view = Mock()
        with ExitStack() as stack:
            stack.enter_context(patch.object(collector, "extract_best_grid", side_effect=extract))
            stack.enter_context(patch.object(collector, "find_button", return_value=(None, view, None)))
            stack.enter_context(patch.object(collector.time, "time", side_effect=lambda: clock[0]))
            stack.enter_context(patch.object(collector.time, "perf_counter", side_effect=lambda: clock[0]))
            stack.enter_context(patch.object(collector.time, "perf_counter_ns", side_effect=lambda: int(clock[0] * 1_000_000_000) + 1))
            stack.enter_context(patch.object(collector.time, "sleep", side_effect=sleep))
            try:
                result = tela.consultar("P2", timeout_s=timeout, empty_confirm_s=empty)
                return result, tela.last_query_diagnostics, view
            except RuntimeError as exc:
                self.assertIs(exc.query_diagnostics, tela.last_query_diagnostics)
                return None, exc.query_diagnostics, view

    def test_previous_pcba_is_not_parsed_then_target_is_confirmed(self):
        old, target = self.grid("P1"), self.grid("P2")
        result, d, _ = self.run_query([old, old, target])
        self.assertEqual(result["rows"], target["rows"])
        self.assertEqual(d["mismatch_polls"], 1)
        self.assertEqual(d["polls"], 2)
        self.assertEqual(d["status"], "CONFIRMED")
        self.assertEqual(d["confirmation"], "GRID_IDENTITY_CONFIRMED")
        milestones = d["milestones_ms"]
        for name in ("query_start", "input_applied", "submit", "view_clicked", "first_grid", "identity_confirmed", "parse_completed"):
            self.assertIn(name, milestones)
        self.assertLess(milestones["first_grid"], milestones["identity_confirmed"])
        self.assertGreaterEqual(d["total_ms"], milestones["parse_completed"])
        self.assertNotIn("P1", str(d))
        self.assertNotIn("P2", str(d))

    def test_mismatch_fails_even_without_a_baseline_grid(self):
        result, d, _ = self.run_query([RuntimeError("no grid before submit"), self.grid("P1")])
        self.assertIsNone(result)
        self.assertEqual(d["status"], "MISMATCH")
        self.assertNotIn("parse_completed", d["milestones_ms"])

    def test_mixed_identity_rows_fail_closed(self):
        mixed = self.grid("P2")
        mixed["rows"] += self.grid("P1")["rows"]
        result, d, _ = self.run_query([self.grid("P1"), mixed])
        self.assertIsNone(result)
        self.assertEqual(d["status"], "MISMATCH")

    def test_real_3022_contract_accepts_target_input_plus_refreshed_history_grid(self):
        result, d, _ = self.run_query([self.grid(seq=1), self.grid(seq=2)], watch_armed=True)
        self.assertIsNotNone(result)
        self.assertEqual(d["status"], "CONFIRMED")
        self.assertTrue(d["query_context_ok"])
        self.assertTrue(d["grid_changed"])
        self.assertEqual(d["confirmation"], "GRID_REFRESH_CONFIRMED")
        self.assertLess(d["total_ms"], 500)

    def test_unchanged_nonidentifying_grid_is_still_rejected_without_refresh_proof(self):
        grid = self.grid(seq=1)
        result, d, _ = self.run_query([grid, grid], timeout=0.5)
        self.assertIsNone(result)
        self.assertEqual(d["status"], "UNCONFIRMED")
        self.assertFalse(d["refresh_proven"])

    def test_store_load_event_proves_same_content_was_requeried(self):
        grid = self.grid(seq=1)
        result, d, _ = self.run_query(
            [grid, grid],
            watch_armed=True,
            watch_states=[{"started": True, "completed": True, "beforeload": 1, "load": 1}],
        )
        self.assertIsNotNone(result)
        self.assertEqual(d["confirmation"], "STORE_REFRESH_CONFIRMED")
        self.assertTrue(d["refresh_proven"])

    def test_same_pcba_matching_grid_can_be_read_again(self):
        grid = self.grid("P2")
        result, d, _ = self.run_query([grid, grid])
        self.assertIsNotNone(result)
        self.assertEqual(d["before_grid"], d["after_grid"])

    def test_imei_and_component_serials_are_not_primary_pcba_mismatches(self):
        grid = self.grid("P2")
        grid["rows"][0].update({"IMEI": "other-id", "Component SN": "component"})
        result, _, _ = self.run_query([self.grid("P1"), grid])
        self.assertIsNotNone(result)

    def test_explicit_result_sn_is_supported_but_component_sn_is_not(self):
        self.assertEqual(collector._result_identity_3022([{"SN": "P2"}], [], "P2"), "GRID_IDENTITY_CONFIRMED")
        self.assertEqual(collector._result_identity_3022([{"Component SN": "P2"}], [], "P2"), "UNCONFIRMED")

    def test_loading_or_hidden_target_is_not_accepted(self):
        for grid, visible in ((self.grid("P2", loading=True), True), (self.grid("P2"), False)):
            result, d, _ = self.run_query([grid, grid], visible=visible)
            self.assertIsNone(result)
            self.assertEqual(d["status"], "UNCONFIRMED")

    def test_readonly_result_header_requires_refresh_and_exact_match(self):
        field = {"label": "Lot Id", "raw": "P2", "visible": True, "read_only": True}
        result, d, _ = self.run_query([self.grid(seq=1), self.grid(seq=2)], fields=[field])
        self.assertIsNotNone(result)
        self.assertEqual(d["confirmation"], "RESULT_HEADER_MATCH")
        for mutation in ({}, {"read_only": False}, {"visible": False}, {"raw": "P1"}):
            result, _, _ = self.run_query([self.grid(), self.grid()], fields=[{**field, **mutation}], timeout=0.5)
            self.assertIsNone(result)
        result, d, _ = self.run_query([self.grid("P2"), self.grid("P2")], fields=[{**field, "raw": "P1"}], timeout=0.5)
        self.assertIsNone(result)
        self.assertEqual(d["status"], "MISMATCH")

    def test_changed_empty_grid_can_be_confirmed_without_row_identity(self):
        result, d, _ = self.run_query([self.grid("P1"), self.grid(rows=False)], empty=0.3, timeout=0.8, watch_armed=True)
        self.assertIsNotNone(result)
        self.assertTrue(result["no_data"])
        self.assertEqual(d["status"], "CONFIRMED_EMPTY")
        self.assertEqual(d["confirmation"], "GRID_REFRESH_CONFIRMED")

    def test_confirmed_empty_waits_existing_confirmation_window_without_load_event(self):
        field = {"label": "PCBA", "raw": "P2", "visible": True, "read_only": True}
        result, d, _ = self.run_query([self.grid("P1"), self.grid(rows=False)], fields=[field])
        self.assertTrue(result["no_data"])
        self.assertEqual(d["status"], "CONFIRMED_EMPTY")
        self.assertGreaterEqual(d["milestones_ms"]["empty_confirmed"], 700)
        self.assertGreaterEqual(d["polls"], 3)

    def test_empty_loading_cycle_can_prove_refresh_without_signature_change(self):
        field = {"label": "Lot Id", "raw": "P2", "visible": True, "read_only": True}
        empty = self.grid(rows=False)
        result, d, _ = self.run_query([empty, self.grid(rows=False, loading=True), empty], fields=[field])
        self.assertTrue(result["no_data"])
        self.assertEqual(d["before_grid"], d["after_grid"])
        result, d, _ = self.run_query([empty, empty], fields=[field], timeout=0.5)
        self.assertIsNone(result, "an unchanged old empty store is not a completed new query")

    def test_input_retry_is_measured_and_never_submits_unconfirmed_input(self):
        result, d, view = self.run_query([self.grid("P2")], input_values=["P1", "P2"])
        self.assertIsNotNone(result)
        self.assertEqual(d["input_retries"], 1)
        view.click.assert_called_once_with(timeout=5000)
        result, d, view = self.run_query([], input_values=["P1", "P1"])
        self.assertIsNone(result)
        view.click.assert_not_called()
        self.assertNotIn("submit", d["milestones_ms"])

    def test_extraction_error_resets_empty_confirmation(self):
        field = {"label": "Lot Id", "raw": "P2", "visible": True, "read_only": True}
        empty = self.grid(rows=False)
        result, d, _ = self.run_query([self.grid("P1"), empty, RuntimeError("temporary"), empty], fields=[field])
        self.assertTrue(result["no_data"])
        self.assertEqual(d["poll_errors"], 1)
        self.assertGreaterEqual(d["milestones_ms"]["empty_confirmed"], 0.9 * 1000)


if __name__ == "__main__":
    unittest.main()
