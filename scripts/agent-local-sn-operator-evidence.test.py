"""Read-only 3022 historical operator contract, with disposable SQLite only.

An operator seen in A6900/REPAIR END is identity evidence, not a production
passage or automatic authorship proof for a separate 3012 repair.
"""
import sys
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT/'ames'/'agent'),str(ROOT/'ames'/'factory-engine')]
from store import Store
import process_r11
import process_timeline
import local_sn

def setup():
    td=tempfile.TemporaryDirectory()
    store=Store(Path(td.name)/'no-production.sqlite3')
    store.initialize()
    process_r11.patch_store(store)
    wid=store.ensure_window('today','2026-10-16T07:00:00',
                            '2026-10-17T07:00:00',None,['TAN10101'])
    sid=store.create_snapshot(window_id=wid,source_kind='test-only')
    return td,store,sid

def observed(sid,sn,ident,name,*,event='e1',fields=None,valid=False):
    return {
        'event_id':event,'line_id':'TAN10101','product':'CPH2859',
        'pcba_sn':sn,'process':'Repair end','station':'A6900',
        'event_time':'2026-10-16T15:32:00+00:00','source_view':'3022',
        'snapshot_id':sid,'snapshot_revision':1,
        'provenance':{'operator_evidence':{
            'operator_id':ident,'operator_name':name,
            'operator_fields':fields if fields is not None
                else {'operator_id':'Tran User Id','operator_name':'Tran User'}}},
        'raw_ref':'sqlite:test:'+event,
        'coverage':{'status':'partial','source_complete':False},
        'valid':valid
    }

class TestHistoricalOperatorRead(unittest.TestCase):
    def test_non_end_lot_name_is_read_from_canonical_not_claimed_as_production(self):
        td,store,sid=setup()
        try:
            process_timeline.ingest(store,[observed(sid,'P-A','BRM00079','Pessoa Teste',event='e-a')])
            result=local_sn.lookup(store,'P-A')
            rows=[r for r in result['process_events'] if r.get('operator_name')=='Pessoa Teste']
            self.assertEqual(len(rows),1)
            x=rows[0]
            self.assertEqual((x['pcba_sn'],x['operator_id'],x['station']),
                             ('P-A','BRM00079','A6900'))
            self.assertEqual(x['operator_role'],'observed_process_operator')
            self.assertFalse(x['completion_confirmed'])
            self.assertEqual(x['production_shift_source'],'not_production_passage')
            self.assertEqual(x['line_id'],'TAN10101')
            self.assertEqual(x['source_view'],'3022')
            self.assertEqual(x['snapshot_id'],sid)
        finally:td.cleanup()

    def test_operator_identity_never_crosses_a_pcba_even_with_same_brm(self):
        td,store,sid=setup()
        try:
            process_timeline.ingest(store,[
                observed(sid,'P-A','BRM00079','Pessoa A',event='e-a'),
                observed(sid,'P-B','BRM00079','Pessoa B',event='e-b'),
            ])
            found=local_sn.lookup(store,'P-A')['process_events']
            self.assertEqual({r['operator_name'] for r in found}, {'Pessoa A'})
            self.assertEqual({r['pcba_sn'] for r in found},{'P-A'})
        finally:td.cleanup()

    def test_bare_brm_or_name_without_source_field_is_not_promoted(self):
        td,store,sid=setup()
        try:
            process_timeline.ingest(store,[
                observed(sid,'P-A','BRM00079','BRM00079',event='e-a'),
                observed(sid,'P-A','BRM00080','Nome sem campo',
                         event='e-b',fields={}),
                observed(sid,'P-A','BRM00081','Nome presente',
                         event='e-c',fields={'operator_name':'Tran User'}),
            ])
            self.assertEqual(local_sn.lookup(store,'P-A')['process_events'][-1]['operator_name'],
                             'Nome presente')
            self.assertEqual(len(local_sn.lookup(store,'P-A')['process_events']),1)
        finally:td.cleanup()

    def test_legacy_database_without_canonical_table_is_still_readable(self):
        td=tempfile.TemporaryDirectory()
        try:
            store=Store(Path(td.name)/'legacy.sqlite3')
            store.initialize()
            result=local_sn.lookup(store,'P-OLD')
            self.assertEqual(result['process_events'],[])
        finally:td.cleanup()

if __name__=='__main__':
    unittest.main(verbosity=2)
