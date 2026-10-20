"""Stored history retrieval through the real handler, without agent bootstrap/MES."""
import ast
import json
import pathlib
import sys
import tempfile
import types
import unittest
from urllib.parse import urlparse, parse_qs

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'ames'/'agent'))
from store import Store
import canonical
import workstation_pairing

LINE='TAN10101'

class LocalHistoryTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.store=Store(pathlib.Path(self.tmp.name)/'original.sqlite');self.store.initialize()
        window=self.store.ensure_window('previous_day','2026-10-16T07:00-03:00','2026-10-17T07:00-03:00',None,[LINE])
        self.sid=self.store.create_snapshot(window_id=window,source_kind='synthetic')
        self.store.ingest_defects(self.sid,[{'line':LINE,'pcba_sn':'P','product_model':'CPH2859','defect_code':'D','defect_time':'2026-10-16T10:00-03:00'}])
        # Execute only the actual GET method: importing the entrypoint starts the agent.
        tree=ast.parse((ROOT/'ames/agent/agent_hardened_entry.py').read_text())
        cls=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='HardenedHandler')
        method=next(n for n in cls.body if isinstance(n,ast.FunctionDef) and n.name=='do_GET')
        env={'urlparse':urlparse,'parse_qs':parse_qs,'workstation_pairing':workstation_pairing,'entry':types.SimpleNamespace(
            canonical=canonical,a=types.SimpleNamespace(STORE=self.store,BASE_DIR=pathlib.Path(self.tmp.name),trace_insights=None))}
        exec(compile(ast.Module(body=[method],type_ignores=[]),'<real GET handler>','exec'),env)
        self.handler=types.SimpleNamespace(_authorized=lambda path:True,_send=lambda value,status=200:setattr(self,'response',(status,value)))
        self.get_method=types.MethodType(env['do_GET'],self.handler)

    def tearDown(self):self.tmp.cleanup()

    def get(self,query=''):
        self.handler.path='/api/v1/local-history?line='+LINE+query
        self.get_method();return self.response

    def test_pending_is_explicit_and_listing_has_no_write(self):
        status,rows=self.get();self.assertEqual(status,200)
        self.assertEqual(len(rows),1);self.assertIsNone(rows[0]['snapshot_revision'])
        self.assertTrue(rows[0]['revision_pending'])
        with self.store.connect() as con:self.assertEqual(con.execute('SELECT COUNT(*) FROM mes_revisions').fetchone()[0],0)
        status,p=self.get('&snapshot_id='+str(self.sid));self.assertEqual(status,200)
        status,rows=self.get();self.assertEqual(len(rows),1)
        self.assertFalse(rows[0]['revision_pending']);self.assertEqual(rows[0]['snapshot_revision'],1)
        self.assertEqual(rows[0]['content_hash'],p['content_hash'])

    def test_late_update_restart_and_exact_old_revision_do_not_lose_data(self):
        first=canonical.export_revision(self.store,self.sid,LINE)
        with self.store.connect() as con:
            con.execute("UPDATE defect_observations SET repair_status_current='Y' WHERE snapshot_id=?",(self.sid,))
        rows=canonical.history_index(self.store,LINE)
        self.assertEqual({r['snapshot_revision'] for r in rows},{1,None})
        # Opening the old revision does not accidentally materialize the pending update.
        status,old=self.get(f'&snapshot_id={self.sid}&snapshot_revision=1')
        self.assertEqual(status,200);self.assertEqual(old,first)
        with self.store.connect() as con:self.assertEqual(con.execute('SELECT COUNT(*) FROM mes_revisions').fetchone()[0],1)
        status,updated=self.get(f'&snapshot_id={self.sid}');self.assertEqual(status,200)
        self.assertEqual(updated['snapshot_revision'],2)
        self.assertEqual(first['summary'],updated['summary'])
        self.assertEqual(updated['datasets']['defects'][0]['repair_status_current'],'Y')
        reopened=Store(self.store.path);reopened.initialize()
        self.assertEqual(canonical.source_id(reopened),first['source_id'])
        self.assertEqual(canonical.read_revision(reopened,self.sid,LINE,1),first)
        self.assertEqual(canonical.read_revision(reopened,self.sid,LINE,2),updated)
        self.assertEqual({r['snapshot_revision'] for r in canonical.history_index(reopened,LINE)},{1,2})
        # Every already serialized dataset and coverage flag survives exactly.
        self.assertEqual(json.dumps(canonical.read_revision(reopened,self.sid,LINE,1),sort_keys=True),json.dumps(first,sort_keys=True))

    def test_missing_revision_invalid_scope_and_auth_fail_closed(self):
        canonical.export_revision(self.store,self.sid,LINE)
        for query in (f'&snapshot_id={self.sid}&snapshot_revision=99',f'&snapshot_id={self.sid}&snapshot_revision=0',f'&snapshot_id={self.sid}&snapshot_revision=abc','&snapshot_revision=1'):
            self.assertEqual(self.get(query)[0],400)
        with self.assertRaises(ValueError):canonical.read_revision(self.store,self.sid,'TAN10102',1)
        self.assertEqual(canonical.history_index(self.store,'TAN10102'),[])
        self.handler._authorized=lambda path:False
        self.handler._reject_unauthorized=lambda:setattr(self,'response',(401,{}))
        self.assertEqual(self.get()[0],401)

if __name__=='__main__':unittest.main()
