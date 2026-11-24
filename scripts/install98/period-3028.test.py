"""Replay a long MES interval with conflicting totals. No MES or operational data."""
import sys
import unittest
from copy import deepcopy
from datetime import datetime
from pathlib import Path
from unittest.mock import Mock
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "ames/agent"))
from comment_provenance_3028 import _capture_checked_period

START = datetime(2026, 9, 1, 7)
END = datetime(2026, 10, 31, 7)


def table(rows):
    return {"records": rows, "total": len(rows), "pageResults": [{"success": True}]}


def fixture(count, excess=0, missing_groups=0, corrupt_slice=False):
    def read(line, a, b):
        full = (a, b) == (START, END)
        lo = count * (a - START).days // 60
        hi = count * (b - START).days // 60
        rows = [{"lotId": str(i // 2), "seq": i} for i in range(lo, hi)]
        # Repeated PCBAs are legitimate. Keep every occurrence.
        qty = len(rows)
        if full:
            rows += rows[:excess]
            qty -= missing_groups
        elif corrupt_slice:
            qty += 1
        g = table([{"defectCode": "TEST", "qty": qty}])
        run = {"prodModel": "TEST", "grouped": g, "detail": table(rows)}
        return {"lineId": line, "baseParams": {"from": a.isoformat(), "to": b.isoformat()},
                "summary": table([{"prodModel": "TEST", "qty": 50000, "fpy": "92.376"}]),
                "classification": table([]), "modelRuns": [run]}
    return read


class Period(unittest.TestCase):
    def test_normal_entry_selects_only_long_custom_windows_and_persists_after_validation(self):
        # Execute the installed entry function with isolated persistence and MES boundaries.
        import ast
        from datetime import timedelta
        from unittest.mock import Mock
        tree = ast.parse((Path(__file__).resolve().parents[2] / "ames/agent/agent.py").read_text())
        ingest = next(fn for fn in tree.body if getattr(fn, "name", None) == "ingest_3028_live")
        saved, native, period = Mock(), Mock(), Mock()
        context = dict(CONFIG={}, normalize_lines=list, collect_live_3028=native, collect_3028_period=period,
                       mes_call=lambda f: f, datetime=datetime, timedelta=timedelta, _persist_3028_live=saved)
        exec(compile(ast.Module(body=[ingest], type_ignores=[]), "<3028 entry>", "exec"), context)
        run = context["ingest_3028_live"]
        for mode, end in [("today", END), ("custom", START + timedelta(days=1))]:
            run(mode=mode, lines=["L2"], start_at=START.isoformat(), end_at=end.isoformat())
        self.assertEqual(native.call_count, 2)
        run(mode="custom", lines=["L2"], start_at=START.isoformat(), end_at=END.isoformat())
        period.assert_called_once()
        self.assertEqual(saved.call_args.args, (period.return_value,))
        period.side_effect = ValueError("mismatch")
        with self.assertRaises(ValueError):
            run(mode="custom", lines=["L2"], start_at=START.isoformat(), end_at=END.isoformat())
        self.assertEqual(saved.call_count, 3)

    def test_full_detail_confirmed_even_if_full_grouped_missing_136(self):
        result = _capture_checked_period(fixture(3775, missing_groups=136), "L2", START, END)
        self.assertEqual(result["detail"]["total"], 3775)
        self.assertEqual(sum(r["qty"] for r in result["grouped"]["records"]), 3775)
        self.assertEqual(result["summary"]["records"][0]["fpy"], "92.376")
        self.assertGreater(len(result["verified_windows"]), 1)
        windows = result["verified_windows"]
        self.assertEqual(windows[0]["from"], START.isoformat())
        self.assertEqual(windows[-1]["to"], END.isoformat())
        self.assertTrue(all(a["to"] == b["from"] for a, b in zip(windows, windows[1:])))

    def test_full_grouped_confirmed_even_if_full_detail_repeated_136(self):
        result = _capture_checked_period(fixture(3639, excess=136), "L2", START, END)
        self.assertEqual(result["detail"]["total"], 3639)
        self.assertEqual(len({r["seq"] for r in result["detail"]["records"]}), 3639)

    def test_no_witness_and_persistently_bad_slice_both_rejected(self):
        for read in [fixture(3650, excess=125, missing_groups=11), fixture(3775, missing_groups=136, corrupt_slice=True)]:
            with self.assertRaises(ValueError):
                _capture_checked_period(read, "L2", START, END)

    def test_repeat_of_identical_model_query_preserves_native_summary(self):
        cap = fixture(24)("L2", START, END)
        cap["modelRuns"].append(deepcopy(cap["modelRuns"][0]))
        read = Mock(return_value=cap)
        result = _capture_checked_period(read, "L2", START, END)
        self.assertEqual(result["detail"]["total"], 24)
        read.assert_called_once()


if __name__ == "__main__":
    unittest.main()
