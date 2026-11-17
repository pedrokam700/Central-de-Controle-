"""Counterexamples for cross-view projection loss. Disposable SQLite only."""
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT/'ames/agent'), str(ROOT/'ames/factory-engine')]
import canonical
import local_sn
import process_r11
import process_timeline
from store import Store

LINE = 'TAN10101'
RAW = {'Tran Time': '2026-11-03T11:50:00Z', 'Tran Desc': 'END LOT',
       'Working Oper Code': 'A6900', 'Working Oper': 'Repair station',
       'Tran User Id': 'BRM-SYNTHETIC', 'Tran User Name': 'Pessoa sintética'}


class ProjectionProof(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.store = Store(Path(tmp.name)/'synthetic.sqlite')
        self.store.initialize()
        process_r11.patch_store(self.store)
        self.sid = self.store.create_snapshot(window_id=None, source_kind='synthetic')
        self.store.ingest_defects(self.sid, [{'pcba_sn': 'P', 'line': LINE, 'defect_code': 'D',
            'defect_time': '2026-11-03 09:00:00', 'product_model': 'CPH-SYNTHETIC'}])

    def test_2114_explicit_clock_and_author_survive_canonical_without_filling_undated_row(self):
        self.store.ingest_2114(self.sid, [{'pcba_sn': 'P', 'result': {'rows': [
            {'Defect Hist Seq': 0, 'Defect Code': 'H', 'Defect Time': '2026-11-01 08:00:00',
             'Defect User': 'AUTHOR-0', 'Defect User Name': 'Autor sintético'},
            {'Defect Hist Seq': 1, 'Defect Code': 'UNDATED'}]}}])
        before = canonical.export_revision(self.store, self.sid, LINE)
        rows = {str(r['hist_seq']): r for r in before['datasets']['pcba_history']}
        self.assertEqual(rows['0'].get('defect_time'), '2026-11-01 08:00:00')
        self.assertEqual(rows['0'].get('defect_user'), 'AUTHOR-0')
        self.assertEqual(rows['0'].get('defect_user_name'), 'Autor sintético')
        self.assertIsNone(rows['1'].get('defect_time'))
        self.assertIsNone(rows['1'].get('defect_user_name'))
        self.assertEqual(local_sn.lookup(self.store, 'P')['pcba_history'][-1]['defect_time'], rows['0']['defect_time'])
        self.assertEqual(canonical.read_revision(self.store, self.sid, LINE, before['snapshot_revision']), before)

    def test_legacy_at_event_keeps_clock_and_identity_but_not_production_labels(self):
        with self.store.connect() as con:
            for station in ('A6900', 'A5162'):
                raw = {**RAW, 'Working Oper Code': station}
                con.execute('INSERT INTO process_events(snapshot_id,pcba_sn,station,operation_code,event_time,source,raw_json) VALUES(?,?,?,?,?,?,?)',
                    (self.sid, 'P', station, station, RAW['Tran Time'], '3022', json.dumps(raw)))
        rows = local_sn.lookup(self.store, 'P')['process_events']
        at = next(r for r in rows if r['station'] == 'A6900')
        self.assertEqual(at['operator_name'], 'Pessoa sintética')
        self.assertEqual(at['event_time'], RAW['Tran Time'])
        self.assertIsNone(at.get('production_event_time'))
        self.assertEqual(at.get('production_shift_source'), 'not_production_passage')
        self.assertEqual(at.get('operator_role'), 'observed_process_operator')

    def test_canonical_at_event_is_not_a_productive_passage(self):
        process_timeline.ingest(self.store, [{'event_id': 'SYNTHETIC-AT', 'snapshot_id': self.sid,
            'line_id': LINE, 'snapshot_revision': 1, 'product': 'CPH-SYNTHETIC', 'pcba_sn': 'P', 'process': 'Repair end',
            'station': 'A6900', 'event_time': RAW['Tran Time'], 'source_view': '3022',
            'raw_ref': 'sqlite:synthetic', 'provenance': {}, 'valid': False,
            'coverage': {'status': 'partial'}}])
        row = canonical.export_revision(self.store, self.sid, LINE)['datasets']['process_timeline'][0]
        self.assertEqual(row['event_time'], RAW['Tran Time'])
        self.assertIsNone(row.get('production_event_time'))
        self.assertEqual(row.get('production_shift_source'), 'not_production_passage')


if __name__ == '__main__':
    unittest.main()
