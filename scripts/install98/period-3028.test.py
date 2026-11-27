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
    def test_mes_summary_model_list_keeps_native_metrics_and_every_occurrence(self):
        order = "CPH2817BR,CPH2815BR"
        cap = fixture(246)("L2", START, END)
        cap["summary"]["records"][0].update(prodModel=order, qty=1531, totalDefectQty=227)
        run = cap["modelRuns"][0]
        run["prodModel"] = order
        run["grouped"]["records"][0]["prodModel"] = "CPH2815BR,CPH2817BR"
        details = run["detail"]
        for i, row in enumerate(details["records"]):
            row.update(lineId="L2", productModel=order.split(",")[i % 2])
        details["pageResults"] = [{"page":i+1, "success":True, "count":min(20,246-i*20)} for i in range(13)]
        read = Mock(return_value=cap)
        result = _capture_checked_period(read, "L2", START, END)
        read.assert_called_once()
        self.assertEqual(result["summary"], cap["summary"])
        self.assertEqual(result["detail"]["records"], details["records"])
        for foreign in ("CPH2817", "CPH2817BRX", "CPH2815BR,OTHER"):
            details["records"][-1]["productModel"] = foreign
            with self.assertRaisesRegex(ValueError, "registro 246, página 13"):
                _capture_checked_period(read, "L2", START, END)

    def test_subwindows_can_reverse_or_narrow_the_full_model_list(self):
        members = ["CPH2815BR", "CPH2817BR"]
        for split in (False, True):
            def read(line, left, right):
                cap = fixture(3775, missing_groups=136)(line, left, right)
                full = (left, right) == (START, END)
                # First seven days precede the change to the other model.
                mid = 3775*7//60
                run = cap["modelRuns"][0]
                rows = run["detail"]["records"]
                for row in rows:
                    row["productModel"] = members[int(row["seq"] >= mid)]
                name = ",".join(members if full else reversed(members))
                if split and not full:
                    name = rows[0]["productModel"]
                run["prodModel"] = name
                cap["summary"]["records"][0]["prodModel"] = name
                return cap
            result = _capture_checked_period(read, "L2", START, END)
            self.assertEqual(result["detail"]["total"], 3775)
            self.assertEqual(result["summary"]["records"][0]["prodModel"], ",".join(members))

    def test_mixed_day_reads_defects_even_in_windows_without_summary(self):
        from datetime import timedelta
        start = datetime(2026, 11, 24, 7)
        end = start + timedelta(days=1)
        names = ["CPH2817BR", "CPH2815BR"]
        # Accepted subwindows in the station report cover only the first 130.
        boundaries = {0:0, 6:62, 9:111, 10:129, 11:130, 12:139, 24:245}
        data = [{"lineId":"TAN10102", "productModel":names[i % 2], "lotId":str(i),
                 "defectCode":"X"} for i in range(245)]

        def indices(a, b):
            return ((a - start) // timedelta(hours=1), (b - start) // timedelta(hours=1))

        def run(model, records, shortfall):
            return {"prodModel":model, "detail":table(records),
                    "grouped":table([{"defectCode":"X", "qty":len(records)-shortfall}])}

        def read(line, a, b):
            lo, hi = indices(a, b)
            missing = lo >= 11
            model = ",".join(names)
            runs = [] if missing else [run(model, data[boundaries[lo]:boundaries[hi]],
                                           4 if (lo,hi)==(0,24) else 2 if lo<11 and hi==12 else 0)]
            cap = {"lineId":line, "baseParams":{"from":a.isoformat(),"to":b.isoformat()},
                   "classification":table([]), "modelRuns":runs}
            cap["summary"] = table([] if missing else [{"prodModel":model, "qty":1531}])
            return cap

        with self.assertRaisesRegex(ValueError, "subconsultas sem confirmação"):
            _capture_checked_period(read, "TAN10102", start, end)

        for recover_by_slicing in (False, True):
            def read_models(line, a, b, models):
                lo, hi = indices(a,b)
                rows = data[boundaries[lo]:boundaries[hi]]
                return [run(m, [r for r in rows if r["productModel"] == m],
                            2 if recover_by_slicing and (lo,hi)==(0,24) else 0) for m in models]
            result = _capture_checked_period(read, "TAN10102", start, end, read_models=read_models)
            self.assertCountEqual([r["lotId"] for r in result["detail"]["records"]], [r["lotId"] for r in data])
            self.assertEqual(result["summary"]["records"][0]["qty"],1531)
            self.assertEqual(sum(r["qty"] for r in result["grouped"]["records"]),245)
            self.assertEqual(len(result["verified_windows"]) > 1, recover_by_slicing)
        with self.assertRaisesRegex(ValueError, "sem confirmação"):
            _capture_checked_period(read, "TAN10102", start, end,
                                    read_models=lambda l,a,b,ms:[run(m, [], 0) for m in ms])

    def test_divergent_native_3028_grids_must_each_match_their_visible_source(self):
        from datetime import timedelta
        end = START + timedelta(hours=1)
        for total, grouped, second in [(293,275,0), (245,241,12)]:
            label = "M1,M2" if second else "M1"
            rows = [{"lineId":"L2","productModel":"M2" if i<second else "M1","lotId":str(i//2),
                     "defectCode":"X" if i>=100 else "Y","defectTime":str(i//2)} for i in range(total)]
            groups = [{"defectCode":"Y","qty":100},{"defectCode":"X","qty":grouped-100}]
            summary = [{"lineId":"L2","prodModel":label,"qty":999}]
            run = {"prodModel":label,"detail":table(rows),"grouped":table(groups)}
            cap = {"lineId":"L2","baseParams":{},"summary":table(summary),"classification":table([]),"modelRuns":[run]}
            native = {"summary":summary,"grouped":groups,"detail":rows}
            result = _capture_checked_period(Mock(return_value=cap),"L2",START,end,read_visible=lambda _:native)
            self.assertEqual(result["verification_method"], "native_selected_3028_grids")
            self.assertEqual(result["detail"]["records"], rows)
            self.assertEqual(result["grouped"]["records"], groups)
            for key,changed in [("detail",rows[:-1]),("detail",[dict(rows[0],lotId="other")]+rows[1:]),
                                ("grouped",[dict(groups[0],defectCode="other"),groups[1]]),
                                ("summary",[dict(summary[0],qty=998)])]:
                with self.subTest(key=key), self.assertRaises(ValueError):
                    _capture_checked_period(Mock(return_value=cap),"L2",START,end,
                                            read_visible=lambda _:{**native,key:changed})

    def test_overlapping_scopes_in_one_capture_cannot_double_count(self):
        from comment_provenance_3028 import _model_tables
        cap = fixture(24)("L2", START, END)
        run = cap["modelRuns"][0]
        run["prodModel"] = "CPH2815BR,CPH2817BR"
        copy = deepcopy(run)
        cap["modelRuns"].append(copy)
        copy["prodModel"] = "CPH2817BR,CPH2815BR"
        self.assertEqual(len(_model_tables(cap)), 1)
        copy["prodModel"] = "CPH2817BR"
        with self.assertRaisesRegex(ValueError, "sobrepostas"):
            _model_tables(cap)

    def test_each_mode_publishes_confirmed_lines_despite_invalid_middle_line(self):
        import ast
        import tempfile
        from store import Store, stable_json, utc_now
        from comment_provenance_3028 import preserve_3028_comment
        tree = ast.parse((Path(__file__).resolve().parents[2] / "ames/agent/agent.py").read_text())
        names = {"ingest_3028_live", "_persist_3028_live"}
        functions = [fn for fn in tree.body if getattr(fn, "name", None) in names]
        calls = []
        def read(**request):
            for line in request["lines"]:
                calls.append(line)
                if line == "L2":
                    raise ValueError("test: response for a different model")
            return {"lines": [line], "line_metrics": [{"line": line, "quantity": 12}]}
        with tempfile.TemporaryDirectory() as directory:
            store = Store(Path(directory) / "synthetic.sqlite")
            store.initialize()
            context = dict(CONFIG={}, STORE=store, WORKSTATION="LAB", stable_json=stable_json,
                           utc_now=utc_now, preserve_3028_comment=preserve_3028_comment,
                           normalize_line_id=str, normalize_lines=list, collect_live_3028=read)
            exec(compile(ast.Module(body=functions, type_ignores=[]), "<3028 entry>", "exec"), context)
            for mode in ("today", "previous", "custom"):
                calls.clear()
                result = context["ingest_3028_live"](mode=mode, lines=["L1","L2","L3"],
                                          start_at=START.isoformat(), end_at=END.isoformat())
                self.assertEqual(calls, ["L1","L2","L3"])
                self.assertEqual(result["pending_lines"], ["L2"])
                self.assertEqual(set(result["snapshot_ids"]), {"L1","L3"})
            with store.connect() as con:
                self.assertEqual(con.execute("SELECT count(*) FROM snapshots").fetchone()[0], 6)
                self.assertEqual(con.execute("SELECT count(*) FROM line_metrics WHERE line='L2'").fetchone()[0], 0)
            store.rebuild_cora_index = Mock(side_effect=RuntimeError("synthetic index failure"))
            with self.assertRaises(RuntimeError):
                context["ingest_3028_live"](lines=["L1"], start_at="a", end_at="b")
            with store.connect() as con:
                self.assertEqual(con.execute("SELECT count(*) FROM snapshots").fetchone()[0], 6)

    def test_occurrence_identity_multiplicity_and_historical_removals(self):
        from store import Store, defect_key
        import tempfile
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as directory:
            store = Store(Path(directory) / "test.sqlite")
            store.initialize()
            a = dict(line="TAN10102", pcba_sn="SIM", defect_code="X", defect_desc="old",
                     defect_oper="OP1", defect_time="2026-11-25 07:03:00",product_model="M1")
            first_window = store.ensure_window("custom","a","b",None,[a["line"]])
            def save(rows, window=first_window, source="3028_live_extjs", full=True):
                sid = store.create_snapshot(window_id=window, source_kind=source)
                store.ingest_defects(sid, rows, reconcile_window=full)
                return sid
            def obs(sid):
                return store.dataset_rows("defects", snapshot_id=sid)
            def removed(sid):
                return len(store.dataset_rows("removed_defects", snapshot_id=sid))
            # Start with the real schema and a legacy key. No bulk rewrite on upgrade.
            legacy = defect_key(a)
            with patch.object(store, "_occurrence_keys", return_value=[(legacy,a)]):
                first = save([a])
            second = save([a, dict(a,defect_oper="OP2"), a, dict(a,product_model="M2")])
            keys = {r["defect_key"] for r in obs(second)}
            self.assertEqual(len(keys), 4)
            self.assertIn(legacy,keys)
            edited = dict(a,defect_desc="updated",repair_comment="checked",repair_code="A")
            third = save([edited,dict(a,defect_code="Y")])
            fourth = save([a,a,dict(a,defect_oper="OP2"),dict(a,product_model="M2")])
            self.assertEqual({r["defect_key"] for r in obs(fourth)},keys)
            self.assertEqual([removed(i) for i in (first,second,third,fourth)], [0,0,3,1])
            self.assertEqual(obs(first)[0]["defect_desc"], "old")
            self.assertEqual({r["repair_comment"] for r in obs(third)}, {"checked",None})
            self.assertEqual(removed(save([],full=False)),0)
            other_window = store.ensure_window("custom","b","c",None,[a["line"]])
            for other in (save([a], window=other_window),save([a],source="3028_export"),
                          save([dict(a,line="TAN10101")],window=other_window)):
                self.assertFalse(keys & {r["defect_key"] for r in obs(other)})
                self.assertEqual(removed(third),3)

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

    def test_changed_model_set_or_balanced_but_unrelated_repeat_refused(self):
        bad = fixture(258, excess=2)("L2", START, END)
        for empty in (False, True):
            different = fixture(258)("L2", START, END)
            if empty:
                different["modelRuns"].clear()
            else:
                run = different["modelRuns"][0]
                run["grouped"]["records"][0]["defectCode"] = "OTHER"
                run["detail"]["records"][0]["seq"] = -1
            with self.assertRaisesRegex(ValueError, "sem confirmação"):
                _capture_checked_period(Mock(side_effect=[bad, different]), "L2", START, END)

    def test_foreground_mes_tab_and_failed_middle_line_keep_operator_context(self):
        from unittest.mock import MagicMock, patch
        from types import ModuleType
        import period_grids_3028 as source
        from comment_provenance_3028 import _COLUMNS, collect_3028_period

        def tab(host, visible):
            p = Mock(url=f"http://{host}/asymes/home#UAWIP.form.VwFpyInquireView")
            p.evaluate.return_value = visible
            return p

        other, hidden, active = tab("other.test", True), tab("fixture.test", False), tab("fixture.test", True)
        syncs, queries = [], []
        def evaluate(script, args=None):
            if script == _COLUMNS:
                return {"detail": {}}
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
            with self.assertRaisesRegex(ValueError, "linha esperada|modelo esperado"):
                _capture_checked_period(Mock(return_value=cap), "L2", START, END)

    def test_native_detail_model_and_bound_line_match_while_preserving_raw_keys(self):
        cap = fixture(260)("L2", START, END)
        cap["scope_columns"] = {"detail": {"line": "lineId"}}
        row = cap["modelRuns"][0]["detail"]["records"][0]
        row.update(lineId="L2", lineIdNew="unbound", productModel=" test ", prodModel="internal")
        read = Mock(return_value=cap)
        result = _capture_checked_period(read, "L2", START, END)
        read.assert_called_once()
        self.assertEqual(result["detail"]["records"][0], row)

    def test_summary_alias_must_be_unique(self):
        cap = fixture(260)("L2", START, END)
        cap["summary"]["records"][0]["productModel"] = "display"
        cap["modelRuns"][0]["detail"]["records"][0]["productModel"] = "DISPLAY"
        _capture_checked_period(Mock(return_value=cap), "L2", START, END)
        cap["summary"] = table(cap["summary"]["records"] + [{"prodModel":"ALT","productModel":"display"}])
        cap["modelRuns"].append({"prodModel":"ALT","detail":table([]),"grouped":table([])})
        with self.assertRaisesRegex(ValueError, "modelo esperado 'TEST', recebido 'DISPLAY'"):
            _capture_checked_period(Mock(return_value=cap), "L2", START, END)

    def test_stale_page_13_rebinds_then_requires_clean_scope(self):
        from datetime import timedelta
        end = START + timedelta(hours=1)
        good = fixture(260)("L2", START, END)
        dirty = deepcopy(good)
        detail = dirty["modelRuns"][0]["detail"]
        detail["pageResults"] = [{"page": n, "success": True, "count": 20} for n in range(1,14)]
        detail["records"][252]["lineId"] = "L1"
        rescope = Mock()
        read = Mock(side_effect=[dirty, good, deepcopy(good)])
        result = _capture_checked_period(read, "L2", START, end, rescope)
        self.assertEqual(result["detail"]["records"], good["modelRuns"][0]["detail"]["records"])
        self.assertEqual(read.call_count, 3)
        rescope.assert_called_once_with("L2", START, end)
        with self.assertRaisesRegex(ValueError, "registro 253, página 13, linha 13 da grade: linha esperada 'L2', recebido 'L1'"):
            _capture_checked_period(Mock(return_value=dirty), "L2", START, end)
        with self.assertRaisesRegex(ValueError, "sem confirmação"):
            _capture_checked_period(Mock(side_effect=[dirty, good, dirty]), "L2", START, end)

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
