from __future__ import annotations

import sys
import unittest
import json
import tempfile
from unittest.mock import patch
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGENT = ROOT / "ames" / "agent"
if str(AGENT) not in sys.path:
    sys.path.insert(0, str(AGENT))

import diagnose_3022 as diag  # noqa: E402
import process_r11  # noqa: E402
sys.path.insert(0, str(ROOT / "ames" / "factory-engine"))
from ames import tela_3022 as collector  # noqa: E402
sys.path.insert(0, str(ROOT / "scripts" / "fixtures"))
from ames_3022_harness import Ext3022Fixture, history_rows


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
    # Unlike the old mocks, these tests execute the exact JS passed to evaluate:
    # real column mapping, visibility filtering, store events and cleanup.
    def fixture(self, plans, **kwargs):
        return Ext3022Fixture(collector, plans, **kwargs)

    def test_sequential_no_sn_rows_accept_after_actual_response_with_hidden_old_grid(self):
        a, b = history_rows('operator-A', 3), history_rows('operator-B', 3)
        with self.fixture([{'rows':a,'delay':240,'mode':'loadData'}, {'rows':b,'delay':840}],
                          hidden=history_rows('hidden-old', 12)) as f:
            for sn, expected, delay in [('A',a,240),('B',b,840)]:
                result=f.tela.consultar(sn)
                self.assertEqual([r['Tran User Id'] for r in result['rows']], [r['Tran User Id'] for r in expected])
                self.assertEqual(result['query_diagnostics']['status'], 'CONFIRMED')
                self.assertTrue(all(not r['Lot Id'] for r in result['rows']))
                self.assertEqual(result['rows'][0]['TRAN CMF3'], 'raw preserved')
                d=result['query_diagnostics'];m=d['milestones_ms']
                self.assertGreaterEqual(d['total_ms'],delay)
                self.assertLess(d['total_ms'],delay+121)
                for step in ('input_located','input_filled','input_applied','view_clicked','first_grid',
                             'response_started_observed','first_rows_observed','grid_ready','response_confirmed','parse_completed'):
                    self.assertIn(step,m)
                self.assertLessEqual(m['grid_ready'],m['parse_completed'])
                self.assertEqual(f.call(op='state')['listeners'],0)
            self.assertEqual(f.call(op='state')['submitted'],['A','B'])

    def test_unchanged_previous_grid_is_not_accepted_for_next_sn(self):
        with self.fixture([{'rows':history_rows('A')},{'mode':'stale'}]) as f:
            f.tela.consultar('A')
            with self.assertRaisesRegex(RuntimeError,'não confirmou atualização'):
                f.tela.consultar('B',timeout_s=.5)
            d=f.tela.last_query_diagnostics
            self.assertEqual(d['status'],'UNCONFIRMED')
            self.assertNotIn('parse_completed',d['milestones_ms'])
            self.assertEqual(f.call(op='state')['listeners'],0)

    def test_identical_content_is_valid_on_new_store_response(self):
        for mode in ('load','loadData'):
            with self.subTest(mode=mode),self.fixture([{'rows':history_rows('same'),'mode':mode}],rows=history_rows('same')) as f:
                rr=f.tela.consultar('B')
                self.assertEqual(rr['query_diagnostics']['before_grid'],rr['query_diagnostics']['after_grid'])
                self.assertEqual(rr['query_diagnostics']['status'],'CONFIRMED')

    def test_explicit_contradiction_fails_closed_and_cleans_listeners(self):
        for identity in ('A','B'):
            rows=history_rows('operator',identity=identity)
            if identity=='B': rows+=history_rows('operator',identity='A')
            with self.subTest(identity=identity),self.fixture([{'rows':rows}]) as f:
                with self.assertRaisesRegex(RuntimeError,'identidade explícita diferente'):
                    f.tela.consultar('B')
                self.assertEqual(f.tela.last_query_diagnostics['status'],'MISMATCH')
                self.assertNotIn('parse_completed',f.tela.last_query_diagnostics['milestones_ms'])
                self.assertEqual(f.call(op='state')['listeners'],0)

    def test_matching_row_identity_does_not_bypass_new_query(self):
        with self.fixture([{'mode':'stale'}], rows=history_rows('old',identity='B')) as f:
            with self.assertRaises(RuntimeError): f.tela.consultar('B',timeout_s=.5)

    def test_failed_load_cannot_accept_old_rows(self):
        with self.fixture([{'mode':'failed','delay':240}],rows=history_rows('old')) as f:
            with self.assertRaisesRegex(RuntimeError,'consulta falhou na store'):
                f.tela.consultar('B')
            self.assertEqual(f.call(op='state')['listeners'],0)

    def test_loading_keeps_old_rows_unaccepted_until_new_response(self):
        with self.fixture([{'rows':history_rows('new'),'delay':2400}],rows=history_rows('old')) as f:
            rr=f.tela.consultar('B')
            self.assertEqual(rr['rows'][0]['Tran User Id'],'new')
            self.assertGreaterEqual(rr['query_diagnostics']['total_ms'],2400)
            self.assertLess(rr['query_diagnostics']['total_ms'],2521)

    def test_empty_response_preserves_confirmation_window(self):
        for mode in ('load','loadData'):
            with self.subTest(mode=mode),self.fixture([{'rows':[],'mode':mode,'delay':240}]) as f:
                rr=f.tela.consultar('B',empty_confirm_s=.7)
                self.assertTrue(rr['no_data'])
                self.assertEqual(rr['query_diagnostics']['status'],'CONFIRMED_EMPTY')
                self.assertGreaterEqual(rr['query_diagnostics']['total_ms'],940)
        with self.fixture([{'mode':'stale'}]) as f:
            with self.assertRaises(RuntimeError): f.tela.consultar('B',timeout_s=.5,empty_confirm_s=.1)

    def test_other_collectors_keep_default_grid_selection(self):
        from ames.ui_helpers import extract_extjs_store_grid
        with self.fixture([],hidden=history_rows('old',9)) as f:
            # Opt-in visibility is limited to 3022. Existing caller semantics stay intact.
            self.assertEqual(extract_extjs_store_grid(f,['Current Oper'])['grid_id'],'hidden-history')
            self.assertEqual(extract_extjs_store_grid(f,['Current Oper'],visible_only=True)['grid_id'],'history')

    def test_visible_readonly_identity_conflict_is_not_ignored(self):
        with self.fixture([{'rows':history_rows('new')}]) as f:
            f.evaluate("""() => {
              const query = Ext.ComponentQuery.query;
              const input = query('field')[0];
              const result = {...input, fieldLabel:'Lot Id', name:'lotid', readOnly:true,
                              getValue:()=> 'A', getRawValue:()=> 'A'};
              Ext.ComponentQuery.query = type => type === 'field' ? [input,result] : query(type);
            }""")
            with self.assertRaisesRegex(RuntimeError,'identidade explícita diferente'):
                f.tela.consultar('B')

    def test_response_event_does_not_require_optional_loading_api(self):
        with self.fixture([{'rows':history_rows('new'),'mode':'loadData'}]) as f:
            f.evaluate("() => { delete Ext.getCmp('history').getStore().isLoading; }")
            self.assertEqual(f.tela.consultar('B')['query_diagnostics']['status'],'CONFIRMED')

    def test_actual_collector_adapter_and_sqlite_preserve_both_responses(self):
        from ames import browser, navigation
        from store import Store
        with tempfile.TemporaryDirectory() as td:
            store=Store(Path(td)/'ames.sqlite3');store.initialize();process_r11.patch_store(store)
            wid=store.ensure_window('today','2026-10-16T07:30:00','2026-10-16T18:00:00',None,['TAN10101'])
            sid=store.create_snapshot(window_id=wid,source_kind='test')
            records=[{'line':'TAN10101','pcba_sn':sn,'defect_key':'defect-'+sn,'product_model':'CPH2859',
                      'defect_code':'E1','defect_desc':'Camera impurity','defect_time':'2026-10-16 10:32:00',
                      'manual_or_auto':'MANUAL'} for sn in ('A','B')]
            store.ingest_defects(sid,records,reconcile_window=False)
            plans=[{'rows':history_rows(sn,3),'delay':240,'mode':'loadData'} for sn in ('A','B')]
            with self.fixture(plans,hidden=history_rows('old',15)) as f, \
                 patch.object(browser,'AmesBrowser',return_value=f), \
                 patch.object(navigation.AmesNavigation,'ensure_3022'):
                out=process_r11.collect_and_persist(store,ROOT/'ames/factory-engine',records,
                                                  snapshot_id=sid,line='TAN10101',performance='fast')
            self.assertEqual(out['status'],'complete',out)
            self.assertEqual(out['collected'],2)
            self.assertEqual(out['processed'],2)
            self.assertTrue(all(p['local_ms'] >= 0 for p in out['pcbas']))
            self.assertGreater(out['events'],0)
            self.assertEqual(out['contexts'],2)
            with store.connect() as con:
                for sn in ('A','B'):
                    raw=con.execute('SELECT raw_json FROM process_raw_events WHERE pcba_sn=?',(sn,)).fetchall()
                    self.assertEqual(len(raw),3)
                    self.assertTrue(all(json.loads(r[0])['Tran User Id']==sn for r in raw))
                    for table in ('process_events','process_defect_contexts','mes_process_timeline'):
                        self.assertGreater(con.execute(f'SELECT COUNT(*) FROM {table} WHERE pcba_sn=?',(sn,)).fetchone()[0],0,table)


if __name__ == '__main__':
    unittest.main()
