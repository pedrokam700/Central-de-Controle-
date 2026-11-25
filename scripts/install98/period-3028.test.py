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
    def test_every_live_mode_validates_before_persistence(self):
        import ast
        tree = ast.parse((Path(__file__).resolve().parents[2] / "ames/agent/agent.py").read_text())
        ingest = next(fn for fn in tree.body if getattr(fn, "name", None) == "ingest_3028_live")
        saved, reader = Mock(), Mock()
        context = dict(CONFIG={}, normalize_lines=list, collect_live_3028=reader, _persist_3028_live=saved)
        exec(compile(ast.Module(body=[ingest], type_ignores=[]), "<3028 entry>", "exec"), context)
        for mode in ("today", "previous", "custom"):
            context["ingest_3028_live"](mode=mode, lines=["L1", "L2"], start_at=START.isoformat(), end_at=END.isoformat())
            self.assertEqual(reader.call_args.kwargs["lines"], ["L1", "L2"])
            self.assertEqual(saved.call_args.args, (reader.return_value,))
        reader.side_effect = ValueError("mismatch on L2")
        with self.assertRaises(ValueError):
            context["ingest_3028_live"](lines=["L1", "L2"], start_at=START.isoformat(), end_at=END.isoformat())
        self.assertEqual(saved.call_count, 3)

    def test_single_hour_rereads_once_on_transient_two_row_mismatch(self):
        from datetime import timedelta
        end = START + timedelta(hours=1)
        bad = fixture(258, excess=2)("L2", START, END)
        good = fixture(258)("L2", START, END)
        read = Mock(side_effect=[bad, good])
        result = _capture_checked_period(read, "L2", START, end)
        self.assertEqual(result["detail"]["total"], 258)
        self.assertEqual(read.call_args_list[0], read.call_args_list[1])
        with self.assertRaisesRegex(ValueError, "L2.*agrupado=258, detalhe=260"):
            _capture_checked_period(Mock(return_value=bad), "L2", START, end)

    def test_foreground_mes_tab_and_failed_middle_line_keep_operator_context(self):
        from unittest.mock import MagicMock, patch
        from types import ModuleType
        import ames_3028_live as source
        from comment_provenance_3028 import collect_3028_period

        def tab(host, visible):
            p = Mock(url=f"http://{host}/asymes/home#UAWIP.form.VwFpyInquireView")
            p.evaluate.return_value = visible
            return p

        other, hidden, active = tab("other.test", True), tab("fixture.test", False), tab("fixture.test", True)
        syncs, queries = [], []
        def evaluate(script, args=None):
            if args is None:
                return True
            line = args["lineId"]
            if script == source.SYNC_VISIBLE_JS:
                syncs.append(dict(args))
                return args
            self.assertEqual(script, source.QUERY_LINE_JS)
            queries.append(line)
            return fixture(258, excess=2 if line == "L2" else 0)(line, START, END)
        active.evaluate.side_effect = evaluate
        manager = MagicMock()
        browser = manager.__enter__.return_value.chromium.connect_over_cdp.return_value
        browser.contexts = [Mock(pages=[other, hidden, active])]
        stub = ModuleType("playwright.sync_api")
        stub.sync_playwright = lambda: manager
        with patch.dict(sys.modules, {"playwright": ModuleType("playwright"), "playwright.sync_api": stub}):
            with self.assertRaisesRegex(ValueError, "L2.*agrupado=258, detalhe=260"):
                collect_3028_period(cdp_url="unused", ames_host="fixture.test", lines=["L1","L2","L3"],
                                    start_at="2026-11-25T07:00", end_at="2026-11-25T08:00")
        self.assertEqual(queries, ["L1", "L2", "L2"])
        self.assertEqual([s["lineId"] for s in syncs], ["L1", "L2", "L2"])
        self.assertEqual((syncs[-1]["dateFrom"], syncs[-1]["startTimeZone"], syncs[-1]["endTimeZone"]),
                         ("20261125", "07", "08"))
        other.evaluate.assert_not_called()
        hidden.wait_for_function.assert_not_called()

    def test_same_count_rows_from_wrong_line_or_model_are_rejected(self):
        for grid, key, wrong in [("detail", "lineIdNew", "L1"), ("grouped", "prodModel", "OTHER")]:
            cap = fixture(258)("L2", START, END)
            cap["modelRuns"][0][grid]["records"][0][key] = wrong
            with self.assertRaisesRegex(ValueError, "outra linha ou modelo"):
                _capture_checked_period(Mock(return_value=cap), "L2", START, END)

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
