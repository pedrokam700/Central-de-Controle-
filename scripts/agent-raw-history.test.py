import concurrent.futures
import pathlib
import sqlite3
import sys
import tempfile
import unittest

sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'ames'/'agent'))
from store import Store,stable_json
import canonical

class RawHistoryTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.store=Store(pathlib.Path(self.tmp.name)/'original.sqlite');self.store.initialize()
        self.sid=self.store.create_snapshot(window_id=None,source_kind='synthetic')
    def tearDown(self):self.tmp.cleanup()

    def test_legacy_head_preserved_late_partial_update_restart_and_idempotency(self):
        old={'trace_2114':{'rows':[{'pcba':'P','evidence':'original'}]},'complete':True}
        with self.store.connect() as con:
            con.execute('INSERT INTO snapshot_payloads VALUES(?,?,?,?)',(self.sid,'integrated',stable_json(old),'2026-10-16T12:00:00Z'))
        source=canonical.source_id(self.store)
        new={'trace_2114':{'rows':[]},'complete':False}
        self.store.save_snapshot_payload(self.sid,'integrated',new)
        self.store.save_snapshot_payload(self.sid,'integrated',new)
        reopened=Store(self.store.path);reopened.initialize()
        self.assertEqual(canonical.source_id(reopened),source)
        history=reopened.snapshot_payload_history(self.sid,'integrated')
        self.assertEqual([r['revision'] for r in history],[1,2])
        self.assertEqual(history[0]['created_at'],'2026-10-16T12:00:00Z')
        self.assertNotIn('payload_json',history[0])
        self.assertEqual(reopened.get_snapshot_payload_revision(self.sid,'integrated',1),old)
        self.assertEqual(reopened.get_snapshot_payload_revision(self.sid,'integrated',2),new)
        self.assertEqual(reopened.get_snapshot_payload(self.sid,['integrated']),new)
        with self.assertRaises(ValueError):reopened.get_snapshot_payload_revision(self.sid,'integrated',3)

    def test_scope_and_concurrent_writes_do_not_drop_versions(self):
        def write(n):self.store.save_snapshot_payload(self.sid,'3028',{'n':n})
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(write,range(8)))
        history=self.store.snapshot_payload_history(self.sid,'3028')
        self.assertEqual(len(history),8)
        self.assertEqual({self.store.get_snapshot_payload_revision(self.sid,'3028',r['revision'])['n'] for r in history},set(range(8)))
        other=self.store.create_snapshot(window_id=None,source_kind='synthetic')
        self.store.save_snapshot_payload(other,'3028',{'n':99});self.store.save_snapshot_payload(self.sid,'3074',{'n':100})
        self.assertEqual(len(self.store.snapshot_payload_history(self.sid,'3028')),8)
        with self.assertRaises(ValueError):self.store.get_snapshot_payload_revision(other,'3074',1)

    def test_head_failure_rolls_back_journal_atomically(self):
        self.store.save_snapshot_payload(self.sid,'3028',{'n':1})
        with self.store.connect() as con:
            con.execute("CREATE TRIGGER reject_test BEFORE INSERT ON snapshot_payloads BEGIN SELECT RAISE(ABORT,'synthetic failure'); END")
        with self.assertRaises(sqlite3.IntegrityError):self.store.save_snapshot_payload(self.sid,'3028',{'n':2})
        self.assertEqual(self.store.get_snapshot_payload(self.sid),{'n':1})
        self.assertEqual(len(self.store.snapshot_payload_history(self.sid,'3028')),1)

    def test_rollback_writer_head_captured_when_new_code_resumes(self):
        self.store.save_snapshot_payload(self.sid,'3028',{'n':1})
        with self.store.connect() as con:
            con.execute('INSERT OR REPLACE INTO snapshot_payloads VALUES(?,?,?,?)',(self.sid,'3028',stable_json({'n':2}),'legacy-time'))
        self.store.save_snapshot_payload(self.sid,'3028',{'n':3})
        self.assertEqual([self.store.get_snapshot_payload_revision(self.sid,'3028',n)['n'] for n in (1,2,3)],[1,2,3])

if __name__=='__main__':unittest.main()
