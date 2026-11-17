"""3028 -> confirmed 3022 -> disposable SQLite -> immutable canonical proof.
No agent startup, live browser, MES, operational database or network.
"""
from copy import deepcopy
from pathlib import Path
import json
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT/'ames/agent'), str(ROOT/'ames/factory-engine')]
import canonical
import process_r11
import production_shift
import partial_retry
from store import Store
from ames import browser
import source_capture

ENGINE = ROOT/'ames/factory-engine'
LINE = 'TAN10101'


def occurrence(sn='SYNTHETIC-0001', at='2026-11-16T10:00:00-03:00', line=LINE):
    return dict(pcba_sn=sn, line=line, product_model='CPH2859', defect_code='CAM-D',
                defect_desc='Camera impurity', defect_time=at, manual_or_auto='MANUAL')


def event(at='2026-11-16T12:00:00Z', seq=1, **extra):
    return {'Hist Seq': seq, 'Tran Time': at, 'Tran Desc': 'END LOT',
            'Working Oper Code': 'A5162', 'Working Oper': 'Camera assembly',
            'Current Oper Code': 'A7600', 'Line Id': LINE, **extra}


def response(rows, sn='SYNTHETIC-0001', **extra):
    return {'query_sn': sn, 'rows': rows,
            'query_diagnostics': {'status': 'CONFIRMED' if rows else 'CONFIRMED_EMPTY'}, **extra}


def context(rec, at='2026-11-16T12:00:00Z', **extra):
    return {**rec, 'source': '3022', 'reference_station_code': 'A5162',
            'reference_rule_id': 'CAMERA_APPEARANCE_MANUAL_A5162',
            'reference_status': 'COMPLETE', 'reference_event_time': at,
            'status': 'COMPLETE_REFERENCE', **extra}


def export_fixture():
    """Same real adapter/canonical pipeline as the tests, with all gap classes."""
    with tempfile.TemporaryDirectory() as directory:
        store = Store(Path(directory)/'fixture.sqlite')
        store.initialize()
        process_r11.patch_store(store)
        window = store.ensure_window('custom', '2026-11-16T07:00:00-03:00', '2026-11-17T07:00:00-03:00', None, [LINE, 'TAN10102'])
        sid = store.create_snapshot(window_id=window, source_kind='synthetic')
        cases = ['GOOD', 'EMPTY', 'UNQUERIED', 'RAW_ONLY', 'PARTIAL', 'INVALID', 'TIMEZONE', 'UNMAPPED', 'NO_MATCH', 'CONFLICT', 'DUPLICATE']
        store.ingest_defects(sid, [occurrence(sn) for sn in cases] + [occurrence('GOOD', at='2026-11-16T11:00:00-03:00'), occurrence('GOOD-0', line='TAN10102')])
        before = canonical.export_revision(store, sid, LINE)
        records = store.base_rows(sid, LINE)
        selected = [r for r in records if r['pcba_sn'] in ('GOOD', 'EMPTY')]
        seeds = {'GOOD': response([event(), event('2026-11-16T13:30:00Z', 2), event('2026-11-16T15:00:00Z', 3),
                                  event('2026-11-16T12:50:00Z', 4, **{'Tran Desc': 'REPAIR END', 'Working Oper Code': 'A6900'})], sn='GOOD'),
                 'EMPTY': response([], sn='EMPTY')}
        with patch.object(browser.AmesBrowser, 'connect', side_effect=AssertionError('NO MES ALLOWED')) as connect:
            process_r11.collect_and_persist(store, ENGINE, selected, snapshot_id=sid, line=LINE, seed_3022_items=seeds)
            connect.assert_not_called()
        lookup = {r['pcba_sn']: r for r in records}
        contexts = [context(lookup['INVALID'], at='invalid'),
                    context(lookup['TIMEZONE'], defect_time_utc='2026-11-16T16:00:00Z'),
                    context(lookup['UNMAPPED'], at=None, reference_rule_id=None, reference_station_code=None, reference_status='RULE_NOT_MAPPED'),
                    context(lookup['NO_MATCH'], defect_key='LEGACY-OTHER-OCCURRENCE', defect_time='2026-11-15T10:00:00-03:00')]
        for sn, stations in [('CONFLICT', ('A5162', 'A5150')), ('DUPLICATE', ('A5162', 'A5162'))]:
            for index, station in enumerate(stations):
                contexts.append(context(lookup[sn], defect_key=f'LEGACY-{sn}-{index}', reference_station_code=station))
        process_r11._persist_contexts(store, sid, contexts)
        target = {k: before[k] for k in ('source_id', 'snapshot_id', 'snapshot_revision', 'content_hash')}
        target['period'] = before['summary']['period']
        for sn, rr in [('RAW_ONLY', response([event()], sn='RAW_ONLY')),
                       ('PARTIAL', response([event()], sn='PARTIAL', coverage={'status': 'incomplete_page'}))]:
            source_capture.capture_source(store, target=target, line=LINE, job_id='SYNTHETIC-'+sn,
                view='3022', result={'checkpoint_kind': 'per_pcba_complete_v1',
                    'pcbas': [{'pcba_sn': sn, 'status': 'COMPLETE', 'result': rr}]}, status='partial')
        after = canonical.export_revision(store, sid, LINE)
        assert canonical.read_revision(store, sid, LINE, before['snapshot_revision']) == before
        return {'before': before, 'after': after, 'other_line': canonical.export_revision(store, sid, 'TAN10102')}


class Production3022(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.store = Store(Path(self.tmp.name)/'synthetic.sqlite')
        self.store.initialize()
        process_r11.patch_store(self.store)
        window = self.store.ensure_window('custom', '2026-11-16T07:00:00-03:00',
                                         '2026-11-17T07:00:00-03:00', None, [LINE, 'TAN10102'])
        self.sid = self.store.create_snapshot(window_id=window, source_kind='synthetic')
        self.store.ingest_defects(self.sid, [occurrence(), occurrence(at='2026-11-16T11:00:00-03:00'),
                                           occurrence('SYNTHETIC-00010', line='TAN10102')])
        self.records = self.store.base_rows(self.sid, LINE)

    def collect(self, rr, records=None):
        with patch.object(browser.AmesBrowser, 'connect', side_effect=RuntimeError('SYNTHETIC NO CDP')) as connect:
            result = process_r11.collect_and_persist(self.store, ENGINE, records or self.records,
                snapshot_id=self.sid, line=LINE, seed_3022_items={'SYNTHETIC-0001': rr})
        return result, connect.call_count

    def test_confirmed_checkpoint_replays_two_distinct_occurrences_without_mes(self):
        rows = [event(), event('2026-11-16T13:30:00Z', 2), event('2026-11-16T15:00:00Z', 3),
                event('2026-11-16T12:50:00Z', 4, **{'Tran Desc': 'REPAIR END', 'Working Oper Code': 'A6900'})]
        result, calls = self.collect(response(rows))
        self.assertEqual(calls, 0)
        self.assertEqual(result['status'], 'complete')
        contexts = self.store.dataset_rows('process_defect_contexts', self.sid, line=LINE)
        self.assertEqual([c['reference_event_time'] for c in contexts],
                         ['2026-11-16T12:00:00+00:00', '2026-11-16T13:30:00+00:00'])
        with self.store.connect() as con:
            saved = [json.loads(r[0]) for r in con.execute('SELECT raw_json FROM process_raw_events WHERE snapshot_id=? ORDER BY row_index', (self.sid,))]
        self.assertEqual(saved, rows)
        self.assertEqual(canonical.export_revision(self.store, self.sid, 'TAN10102')['process_contexts'], [])

    def test_confirmed_flag_cannot_override_explicit_wrong_response_sn_or_scope(self):
        for change in ({'query_sn': 'SYNTHETIC-00010'}, {'line_id': 'TAN10102'},
                       {'snapshot_id': self.sid + 1}, {'source_id': 'FOREIGN'},
                       {'snapshot_revision': 98765}, {'period': {'start_at': 'OTHER'}},
                       {'rows': [event(**{'PCBA SN': 'SYNTHETIC-00010'})]}):
            with self.subTest(change=change):
                rr = {**response([event()]), **change}
                result, calls = self.collect(rr)
                self.assertEqual(result['processed'], 0)
                self.assertEqual(calls, 1)  # only mocked connection, never a real MES call

    def test_verified_old_revision_same_period_remains_reusable_locally(self):
        frozen = canonical.export_revision(self.store, self.sid, LINE)
        rr = response([event()], source_id=frozen['source_id'], snapshot_id=self.sid,
                      snapshot_revision=frozen['snapshot_revision'], period=frozen['summary']['period'])
        result, calls = self.collect(rr)
        self.assertEqual((result['processed'], calls), (1, 0))

    def test_partial_checkpoint_is_not_a_complete_reusable_response(self):
        result, _ = self.collect(response([event()], coverage={'status': 'incomplete_page'}))
        self.assertEqual(result['processed'], 0)

    def test_checkpoint_planner_rejects_explicit_wrong_sn(self):
        envelope = {'source_view': '3022', 'result': {'checkpoint_kind': 'per_pcba_complete_v1',
            'pcbas': [{'pcba_sn': 'SYNTHETIC-0001', 'status': 'COMPLETE',
                       'result': response([event()], sn='SYNTHETIC-00010')}]}}
        self.assertEqual(partial_retry.verified_3022_items([envelope]), {})

    def test_later_confirmed_empty_does_not_erase_an_observed_confirmed_history(self):
        def capture(rr):
            return {'source_view': '3022', 'result': {'checkpoint_kind': 'per_pcba_complete_v1',
                'pcbas': [{'pcba_sn': 'SYNTHETIC-0001', 'status': 'COMPLETE', 'result': rr}]}}
        rich = response([event()])
        recovered = partial_retry.verified_3022_items([capture(rich), capture(response([]))])
        self.assertEqual(recovered['SYNTHETIC-0001'], rich)

    def test_explicit_foreign_line_and_at_end_lot_do_not_replace_production_reference(self):
        rows = [event(), event('2026-11-16T12:45:00Z', 2, **{'Line Id': 'TAN10102'}),
                event('2026-11-16T12:50:00Z', 3, **{'Working Oper': 'Repair station', 'Tran User Id': 'BRM-SYNTHETIC'})]
        self.collect(response(rows))
        first = self.store.dataset_rows('process_defect_contexts', self.sid, line=LINE)[0]
        self.assertEqual(first['reference_event_time'], '2026-11-16T12:00:00+00:00')

    def test_reference_filter_preserves_at_repair_and_proven_return_as_separate_context(self):
        rows = [event(), event('2026-11-16T14:00:00Z', 2, **{'Tran Desc': 'REPAIR', 'TRAN CMF3': 'Phone_Bat_Cover'}),
                event('2026-11-16T14:30:00Z', 3, **{'Working Oper Code': 'A5201', 'Working Oper': 'Return route', 'Tran User Id': 'BRM-SYNTHETIC'})]
        self.collect(response(rows))
        first = self.store.dataset_rows('process_defect_contexts', self.sid, line=LINE)[0]
        self.assertEqual(first['reference_station_code'], 'A5162')
        self.assertEqual(first['return_station_code'], 'A5201')

    def test_legacy_context_key_is_rebound_only_by_exact_occurrence_without_rewriting_raw(self):
        rec = self.records[0]
        old = canonical.export_revision(self.store, self.sid, LINE)
        ctx = context(rec, defect_key='LEGACY-CHECKPOINT-KEY')
        process_r11._persist_contexts(self.store, self.sid, [ctx])
        new = canonical.export_revision(self.store, self.sid, LINE)
        projected = next(c for c in new['process_contexts'] if c['pcba_sn'] == rec['pcba_sn'])
        self.assertEqual(projected['defect_key'], rec['defect_key'])
        self.assertIsNotNone(new['datasets']['defects'][0]['production_event_time'])
        with self.store.connect() as con:
            self.assertEqual(con.execute('SELECT defect_key FROM process_defect_contexts').fetchone()[0], 'LEGACY-CHECKPOINT-KEY')
        self.assertEqual(canonical.read_revision(self.store, self.sid, LINE, old['snapshot_revision']), old)

    def test_conflicting_explicit_defect_clocks_are_not_shifted_to_manufacture_proof(self):
        ctx = context(self.records[0], at='2026-11-16T14:00:00Z', defect_time_utc='2026-11-16T16:00:00Z')
        self.assertIsNone(production_shift.from_context(ctx)['production_event_time'])

    def test_at_station_cannot_be_generation_even_with_legacy_production_labels(self):
        ctx = context(self.records[0], reference_station_code='A6900')
        self.assertIsNone(production_shift.from_context(ctx)['production_event_time'])

    def test_date_without_clock_cannot_become_midnight_production(self):
        self.assertIsNone(production_shift.classify('2026-11-16')['production_event_time'])
        self.collect(response([event('2026-11-16')]))
        first = self.store.dataset_rows('process_defect_contexts', self.sid, line=LINE)[0]
        self.assertIsNone(first['production_event_time'])

    def test_naive_grid_utc_and_offset_clocks_agree_and_0700_is_not_shift_boundary(self):
        self.collect(response([event('2026-11-16 12:00:00')]))
        first = self.store.dataset_rows('process_defect_contexts', self.sid, line=LINE)[0]
        self.assertEqual(first['production_event_time'], '2026-11-16T09:00:00-03:00')
        for stamp, day in [('2026-11-17T06:59:00-03:00', '2026-11-16'), ('2026-11-17T07:00:00-03:00', '2026-11-17')]:
            self.assertEqual(production_shift.classify(stamp)['production_operational_date'], day)
        self.assertIsNone(production_shift.classify(None, '2026-11-16T12:00:00Z')['production_event_time'])

    def test_export_distinguishes_not_queried_from_confirmed_empty_context(self):
        before = canonical.export_revision(self.store, self.sid, LINE)
        diagnostics = before.get('production_diagnostics') or []
        self.assertEqual(len(diagnostics), 2)
        self.assertTrue(all(d['code'] == 'PCBA_NOT_QUERIED' for d in diagnostics))
        self.collect(response([]))
        after = canonical.export_revision(self.store, self.sid, LINE)
        self.assertTrue(all(d['code'] == 'NO_REFERENCE_PASSAGE' for d in after.get('production_diagnostics') or []))
        self.assertEqual(canonical.read_revision(self.store, self.sid, LINE, before['snapshot_revision']), before)


if __name__ == '__main__':
    if sys.argv[1:] == ['--fixture']:
        print(json.dumps(export_fixture()))
    else:
        unittest.main()
