"""Local revision recovery gates: no MES, SQLite mutation or factory secrets."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ames" / "agent"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ames" / "factory-engine"))
from integrated_snapshot_history import recover_snapshot_line
from core.uso_pcba import reconstruir_usos_pcba
from engine_bridge import build_trace_insights


LINE = "TAN10103"
OTHER = "TAN10102"
DATE = "2026-10-30 07:15:00"


def event(sn, code="GN01", line=LINE, dt=DATE):
    return {"pcba_sn": sn, "defect_code": code, "defect_time": dt,
            "line": line, "defect_desc": "Test"}


def capture(sn, code="GN01", line=LINE, status="COMPLETE", aut="PCBA",
            old=("OLD",), rows=None, dt=DATE):
    d = event(sn, code, line, dt)
    if rows is None:
        rows = [{"Barcode": sn, "Aut Cmf1": aut, "Sn Type": "",
                 "Bind Time": "2026-10-29 06:00:00", "Iss Status": "Y"}]
    return {"pcba_sn": sn, "status": status, "current_defects": [d],
            "base_query": {"rows": rows},
            "defect_traces": [{"status": status, "defect": d,
                 "trace_3074": {"results": [{"item_sn": "MATERIAL",
                     "current_pcba_confirmed": True,
                     "previous_pcbas": list(old)}]}}]}


def version(items, history=None):
    return {"trace_3074": {"items": items}, "trace_2114": {"pcbas": history or []}}


class RecoveryGate(unittest.TestCase):
    def test_proven_partial_queries_recover_two_distinct_physical_mountings(self):
        def mounting(bind, unbind=None):
            return {"Barcode": "A", "Sn Type": "PCBA", "Aut Cmf1": "PCBA",
                    "Bind Time": bind, "Unbind Time": unbind,
                    "Operation": "A5150", "Iss Status": "N" if unbind else "Y"}
        prior = mounting("2026-10-28 11:00:00+00:00", "2026-10-28 12:00:00+00:00")
        current = mounting("2026-10-30 10:00:00+00:00")
        first = capture("A", rows=[prior, {"Barcode": "CAMERA-1", "Sn Type": "Camera"}])
        latest = capture("A", rows=[current, {"Barcode": "CAMERA-2", "Sn Type": "Camera"}])
        for item in (first, latest):
            item["base_query"].update(query_sn="A", query_confirmation="STORE_REFRESH_AFTER_VIEW",
                                      coverage={"status": "incomplete_page"})
        out, diag = recover_snapshot_line([version([first]), version([latest])], LINE, [event("A")])
        self.assertEqual(diag["pcbas_with_reconciled_self_mountings"], 1)
        rows = out["trace_3074"]["items"][0]["base_query"]["rows"]
        self.assertEqual(len([r for r in rows if r.get("Barcode") == "A"]), 2)
        self.assertEqual([r["Barcode"] for r in rows if r.get("Barcode", "").startswith("CAMERA")], ["CAMERA-2"],
                         "A previous partial response must not invent material completeness")
        self.assertEqual(reconstruir_usos_pcba(rows, "A", "2026-10-30 09:00:00")["use_index_at_defect"], 2)
        self.assertEqual(out["trace_3074"]["source_status"], "PARTIAL")
        self.assertFalse(diag["source_complete"])
        # The production KPI builder must see the recovered 2nd physical use,
        # while the query/page and total population remain explicitly partial.
        summary = build_trace_insights(Path(__file__).resolve().parents[1] / "ames" / "factory-engine", out, line=LINE)
        self.assertEqual(summary["drilldowns"]["pcba_analysis"][0]["_pcba_use_index"], 2)
        self.assertIn(["PCBA em 2º uso", 1], summary["pcba_kpis"])

    def test_older_unverified_grid_and_other_line_cannot_add_mountings(self):
        prior = capture("A", rows=[{"Barcode": "A", "Aut Cmf1": "PCBA", "Bind Time": "2026-10-28 11:00:00"}])
        latest = capture("A", rows=[{"Barcode": "A", "Aut Cmf1": "PCBA", "Bind Time": "2026-10-30 10:00:00"}])
        latest["base_query"].update(query_sn="A", query_confirmation="STORE_REFRESH_AFTER_VIEW")
        out, diag = recover_snapshot_line([version([prior]), version([latest])], LINE, [event("A")])
        self.assertEqual(diag["pcbas_with_reconciled_self_mountings"], 0)
        self.assertEqual(len(out["trace_3074"]["items"][0]["base_query"]["rows"]), 1)
        # Even a proven query for the wrong production line is excluded by
        # the exact 3028 defect identity before any self-mounting reconciliation.
        prior["base_query"].update(query_sn="A", query_confirmation="STORE_REFRESH_AFTER_VIEW")
        prior["defect_traces"][0]["defect"]["line"] = OTHER
        out, diag = recover_snapshot_line([version([prior]), version([latest])], LINE, [event("A")])
        self.assertEqual(diag["pcbas_with_reconciled_self_mountings"], 0)

    def test_repeated_binding_status_update_does_not_create_new_use(self):
        old = capture("A", rows=[{"Barcode": "A", "Aut Cmf1": "PCBA", "Sn Type": "PCBA",
                                   "Bind Time": "2026-10-30 10:00:00", "Iss Status": "Y"}])
        new = capture("A", rows=[{"Barcode": "A", "Aut Cmf1": "PCBA", "Sn Type": "PCBA",
                                   "Bind Time": "2026-10-30 10:00:00", "Unbind Time": "2026-10-31 10:00:00",
                                   "Iss Status": "N"}])
        for item in (old, new):
            item["base_query"].update(query_sn="A", query_confirmation="EXACT_QUERY_ROW")
        out, diag = recover_snapshot_line([version([old]), version([new])], LINE, [event("A")])
        self.assertEqual(diag["pcbas_with_reconciled_self_mountings"], 0)
        self.assertEqual(reconstruir_usos_pcba(out["trace_3074"]["items"][0]["base_query"]["rows"],
                                                "A", "2026-10-30 09:00:00")["known_use_count"], 1)

    def test_selective_batches_recover_same_snapshot(self):
        out, diag = recover_snapshot_line(
            [version([capture("A")]), version([capture("B")])],
            LINE, [event("A"), event("B")])
        self.assertEqual(diag["recovered_pcbas"], 2)
        self.assertEqual(diag["pcbas_with_3074_self_binding"], 2)
        self.assertEqual(out["trace_3074"]["source_status"], "PARTIAL")
        self.assertFalse(diag["source_complete"])

    def test_exact_line_code_and_time_required(self):
        out, diag = recover_snapshot_line([version([
            capture("A", line=OTHER), capture("B", code="DIFFERENT"),
            capture("C", dt="2026-10-29 07:15:00")])], LINE,
            [event("A"), event("B"), event("C")])
        self.assertIsNone(out)
        self.assertEqual(diag["reason"], "no_matching_integrated_items")

    def test_complete_old_not_overwritten_by_failed_new_query(self):
        out, _ = recover_snapshot_line(
            [version([capture("A")]),
             version([capture("A", status="ERROR", aut="WRONG")])],
            LINE, [event("A")])
        row = out["trace_3074"]["items"][0]
        self.assertEqual(row["status"], "COMPLETE")
        self.assertEqual(row["base_query"]["rows"][0]["Aut Cmf1"], "PCBA")

    def test_do_not_promote_partial_to_complete(self):
        out, _ = recover_snapshot_line(
            [version([capture("A", status="PARTIAL")])], LINE, [event("A")])
        self.assertEqual(out["trace_3074"]["items"][0]["status"], "PARTIAL")
        self.assertEqual(out["trace_3074"]["source_status"], "PARTIAL")

    def test_per_occurrence_merge_and_reject_wrong_defect(self):
        a = capture("A")
        b = capture("A", code="OTHER")
        out, _ = recover_snapshot_line([version([a]), version([b])], LINE,
                                       [event("A"), event("A", code="OTHER")])
        traces = out["trace_3074"]["items"][0]["defect_traces"]
        self.assertEqual({x["defect"]["defect_code"] for x in traces}, {"GN01", "OTHER"})

    def test_only_proven_previous_pcbas_enter_history(self):
        hist = [{"pcba_sn": x, "status": "COMPLETE", "result": {"rows": []}}
                for x in ("A", "OLD", "UNRELATED")]
        out, _ = recover_snapshot_line([version([capture("A")], hist)], LINE,
                                       [event("A")])
        self.assertEqual({x["pcba_sn"] for x in out["trace_2114"]["pcbas"]},
                         {"A", "OLD"})

    def test_recovered_2114_does_not_replace_five_seq_records_with_later_two(self):
        sn = "SYNTHETIC_FIVE_ROW_HISTORY"
        def hist(seqs, status="COMPLETE"):
            return {"pcba_sn": sn, "status": status, "result": {"rows": [
                {"Defect Hist Seq": n,
                 "Defect Code": "GN11-WX02" if n else "GN01-IR02",
                 "Defect Description": "Wireless connection: GPS/WIFI failed" if n else "Sensor: Infrared sensor test failed",
                 "Defect Type": "MainBoard" if n != 1 else "Phone Disassembly",
                 "Repair Status": "Y"} for n in seqs]}}
        out, diag = recover_snapshot_line(
            [version([capture(sn)], [hist(range(5))]),
             version([capture(sn)], [hist((3, 4))])], LINE, [event(sn)])
        results = out["trace_2114"]["pcbas"]
        self.assertEqual(len(results), 1)
        self.assertEqual([r["Defect Hist Seq"] for r in results[0]["result"]["rows"]], list(range(5)))
        self.assertFalse(diag["source_complete"])

    def test_more_complete_newer_history_is_still_accepted(self):
        sn = "BOARD"
        def hist(seqs):
            return {"pcba_sn": sn, "status": "COMPLETE", "result": {"rows": [
                {"Defect Hist Seq": n, "Defect Code": "GN11-WX02"} for n in seqs]}}
        out, _ = recover_snapshot_line(
            [version([capture(sn)], [hist((0, 1))]),
             version([capture(sn)], [hist((0, 1, 2))])], LINE, [event(sn)])
        self.assertEqual(len(out["trace_2114"]["pcbas"][0]["result"]["rows"]), 3)

    def test_unknown_self_binding_does_not_become_first_use(self):
        out, diag = recover_snapshot_line(
            [version([capture("A", aut="CAMERA")])], LINE, [event("A")])
        self.assertEqual(diag["pcbas_with_3074_self_binding"], 0)
        self.assertFalse(diag["source_complete"])
        self.assertEqual(out["trace_3074"]["source_status"], "PARTIAL")


if __name__ == "__main__":
    unittest.main()
