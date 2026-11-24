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
