"""Local revision recovery gates: no MES, SQLite mutation or factory secrets."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ames" / "agent"))
from integrated_snapshot_history import recover_snapshot_line


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
        sn = "00252700662035F300086822"
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
