from __future__ import annotations

import pathlib
import sys
import tempfile
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'ames'/'agent'))
from store import Store
import canonical


class OperationalPartitionTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.store=Store(pathlib.Path(self.tmp.name)/'original.sqlite')
        self.store.initialize()

    def tearDown(self):
        self.tmp.cleanup()

    def snapshot(self,mode,start,end,line='TAN10103'):
        window=self.store.ensure_window(mode,start,end,None,[line])
        sid=self.store.create_snapshot(window_id=window,source_kind='synthetic')
        with self.store.connect() as con:
            con.execute("INSERT INTO line_metrics(snapshot_id,line,product_model,quantity) VALUES(?,?,?,?)",(sid,line,'CPH2819',100))
        return sid

    def test_old_or_advanced_newest_ids_never_replace_today(self):
        today=self.snapshot('today','2026-10-19T07:00-03:00','2026-10-19T10:00-03:00')
        yesterday=self.snapshot('previous_day','2026-10-16T07:00-03:00','2026-10-17T07:00-03:00')
        advanced=self.snapshot('custom','2026-09-07T07:00-03:00','2026-09-08T07:00-03:00')
        self.assertGreater(advanced,today)
        self.assertEqual(self.store.operational_snapshot_ids_by_line(['TAN10103'],'2026-10-19T07:00-03:00'),{'TAN10103':today})
        self.assertEqual(self.store.operational_snapshot_ids_by_line(['TAN10103'],'2026-10-20T07:00-03:00'),{})
        previous=self.store.historical_candidates(None,40,'2026-10-19T07:00-03:00')
        self.assertEqual([x['snapshot_id'] for x in previous['candidates']],[yesterday])
        self.assertEqual(previous['candidates'][0]['mode'],'previous_day')
        self.assertEqual(canonical.export_revision(self.store,today,'TAN10103')['summary']['period']['mode'],'today')
        self.assertEqual(canonical.export_revision(self.store,yesterday,'TAN10103')['summary']['period']['mode'],'previous_day')

    def test_late_revision_preserves_original_period_and_history(self):
        past=self.snapshot('previous_day','2026-10-16T07:00-03:00','2026-10-17T07:00-03:00')
        self.store.ingest_defects(past,[{'line':'TAN10103','pcba_sn':'PCBA_TEST','product_model':'CPH2819','defect_code':'D','defect_time':'2026-10-16T12:00:00-03:00'}])
        first=canonical.export_revision(self.store,past,'TAN10103')
        with self.store.connect() as con:
            con.execute("UPDATE defect_observations SET repair_status_current='Y' WHERE snapshot_id=?",(past,))
        updated=canonical.export_revision(self.store,past,'TAN10103')
        self.assertGreater(updated['snapshot_revision'],first['snapshot_revision'])
        self.assertEqual(updated['summary']['period'],first['summary']['period'])
        self.assertEqual(updated['summary']['quantity'],first['summary']['quantity'])
        self.assertEqual(canonical.page(self.store,past,'TAN10103',1,'defects')['rows'][0]['repair_status_current'],None)
        self.assertEqual(updated['datasets']['defects'][0]['repair_status_current'],'Y')


if __name__=='__main__':
    unittest.main()
