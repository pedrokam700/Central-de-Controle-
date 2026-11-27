"""Focused contracts for line-wide 3028 source and revision integrity."""
import copy
import sys
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "ames/agent"))
from comment_provenance_3028 import _checked_capture, _grouped_codes

START = datetime(2026, 9, 1, 7)
END = datetime(2026, 10, 31, 7)
LINE = "TAN10102"
SCOPE = dict(lineId=LINE, dateFrom="20261126", dateTo="20261126", startTimeZone="11", endTimeZone="12")


def capture(summary=(), grouping=(), details=(), classification=()):
    data = dict(summary=summary, classification=classification, grouped=grouping, detail=details)
    result, replay, filters = {}, {}, {}
    for name, rows in data.items():
        pages = [dict(records=list(rows[i:i+2]), total=len(rows), scopeProof="request")
                 for i in range(0,len(rows),2)] or [dict(records=[], total=0, scopeProof="request")]
        result[name] = dict(total=len(rows),pageSize=2,batches=pages)
        replay[name] = copy.deepcopy(pages)
        filters[name] = {**SCOPE, **({"prodModel":""} if name in ("detail","grouped") else {})}
    return dict(lineId=LINE, baseParams=dict(SCOPE), filters=filters, first=result, recheck=replay,
                scope_columns=dict(detail=dict(line="lineId", model="productModel")))


def detail(pcba, model="M1"):
    return dict(lotId=pcba, lineId=LINE, productModel=model, defectCode="A")


class Period(unittest.TestCase):
    def test_no_summary_and_native_totals_may_differ_in_either_direction(self):
        rows = [detail("A"), detail("A"), detail("B","M2")]
        for quantity in (0,2,4):
            result = _checked_capture(capture(grouping=[{"qty":quantity,"defectCode":"A"}], details=rows), LINE, SCOPE)
            self.assertEqual(result["summary"]["records"], [])
            self.assertEqual(result["detail"]["records"], rows)
            self.assertEqual(sum(_grouped_codes(result["grouped"]["records"]).values()), quantity)

    def test_summary_model_omission_does_not_exclude_a_detail_model(self):
        result = _checked_capture(capture(summary=[dict(prodModel="M1")],
                                         details=[detail("A"),detail("B","M2")]), LINE, SCOPE)
        self.assertEqual(result["detail"]["records"][-1]["productModel"], "M2")

    def test_partial_repeated_or_changed_pages_are_rejected(self):
        rows = [detail("A"),detail("B"),detail("C"),detail("D")]
        def truncate(cap):
            cap["first"]["detail"]["batches"][-1]["records"].pop()
        def repeat(cap):
            for batches in (cap["first"]["detail"]["batches"],cap["recheck"]["detail"]):
                batches[1] = copy.deepcopy(batches[0])
        def change(cap):
            cap["recheck"]["detail"][1]["records"][0]["repairComment"] = "retificação"
        for mutate in (truncate,repeat,change):
            cap = capture(details=rows)
            mutate(cap)
            with self.subTest(mutation=mutate.__name__), self.assertRaises(ValueError):
                _checked_capture(cap,LINE,SCOPE)

    def test_every_grid_is_compared_again_even_if_length_stays_equal(self):
        for name in ("summary","classification","grouped","detail"):
            cap = capture(summary=[{"qty":10}],classification=[{"type":"A"}],
                          grouping=[{"qty":4}],details=[detail("A")])
            cap["recheck"][name][0]["records"][0]["changed"] = True
            with self.subTest(grid=name), self.assertRaisesRegex(ValueError,name):
                _checked_capture(cap,LINE,SCOPE)

    def test_contamination_and_invalid_group_quantities_fail_closed(self):
        for foreign in ("", "TAN10101"):
            with self.assertRaisesRegex(ValueError,"linha da ocorrência"):
                _checked_capture(capture(details=[dict(detail("A"),lineId=foreign)]),LINE,SCOPE)
        for key, value in (("lineId","TAN10103"),("prodModel","M1"),("endTimeZone","14")):
            cap = capture(details=[detail("A")])
            cap["filters"]["detail"][key] = value
            with self.assertRaisesRegex(ValueError,"escopo"):
                _checked_capture(cap,LINE,SCOPE)
        for qty in (-1, "inválido"):
            with self.assertRaises(ValueError):
                _grouped_codes([{"qty":qty}])

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



if __name__ == "__main__":
    unittest.main()
