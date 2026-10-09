import importlib.util
import json
import pathlib
import sys
import tempfile
import unittest
import threading
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'ames'/'agent'))
from store import Store
import canonical
import process_timeline

def seed(store):
    store.initialize();sid=store.create_snapshot(window_id=None,source_kind='synthetic')
    store.ingest_defects(sid,[{'line':line,'pcba_sn':'P','product_model':product,'defect_code':'D','defect_time':'2026-10-09T10:00:00Z'} for line,product in [('TAN10101','CPH2859'),('TAN10102','CPH2859V')]])
    with store.connect() as con:
        con.execute('INSERT INTO pcba_history(snapshot_id,pcba_sn,hist_seq,defect_code,defect_desc) VALUES(?,?,?,?,?)',(sid,'P','1','D','test'))
        con.execute('INSERT INTO material_reuse(snapshot_id,current_pcba_sn,item_sn,item_type,bind_time_utc) VALUES(?,?,?,?,?)',(sid,'P','M','RAM','2026-10-08T10:00:00Z'))
    return sid

class ContractTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.store=Store(pathlib.Path(self.tmp.name)/'data.sqlite');self.sid=seed(self.store)
    def tearDown(self):self.tmp.cleanup()
    def test_revisions_ids_restart_and_idempotent_export(self):
        a=canonical.export_revision(self.store,self.sid,'TAN10101');b=canonical.export_revision(self.store,self.sid,'TAN10101');self.assertEqual(a,b)
        self.assertEqual(a['snapshot_revision'],1);ident=a['datasets']['defects'][0]['occurrence_id']
        with self.store.connect() as c:c.execute('UPDATE defect_observations SET repair_status_current=? WHERE snapshot_id=?',('Y',self.sid))
        b=canonical.export_revision(self.store,self.sid,'TAN10101');self.assertEqual(b['snapshot_revision'],2);self.assertEqual(ident,b['datasets']['defects'][0]['occurrence_id'])
        old=canonical.page(self.store,self.sid,'TAN10101',1,'defects');self.assertNotEqual(old['rows'][0].get('repair_status_current'),b['datasets']['defects'][0]['repair_status_current'])
        reopened=Store(self.store.path);reopened.initialize();self.assertEqual(b,canonical.export_revision(reopened,self.sid,'TAN10101'))
    def test_context_ambiguity_not_first_line_and_material_identity(self):
        for line in canonical.LINES[:2]:
            p=canonical.export_revision(self.store,self.sid,line);hist=p['datasets']['pcba_history'][0]
            self.assertEqual(hist['line_id'],line);self.assertTrue(hist['provenance']['line_ambiguous']);self.assertEqual(len(hist['provenance']['line_candidates']),2)
            mat=p['datasets']['material_reuse'][0];self.assertEqual(mat['material_sn'],'M');self.assertTrue(mat['bind_id']);self.assertIsNone(mat['unbind_id'])
            self.assertFalse(p['coverage']['defects']['source_complete']);self.assertTrue(p['coverage']['defects']['transport_complete'])
        rows=self.store.dataset_rows('pcba_history',self.sid);self.assertIsNone(rows[0]['line']);self.assertTrue(rows[0]['line_ambiguous'])
    def test_cursor_complete_and_scope_bound(self):
        with self.store.connect() as c:
            for i in range(5):c.execute('INSERT INTO pcba_history(snapshot_id,pcba_sn,hist_seq,defect_code,defect_desc) VALUES(?,?,?,?,?)',(self.sid,'P',str(i+2),'D','test'))
        canonical.export_revision(self.store,self.sid,'TAN10101');r=canonical.page(self.store,self.sid,'TAN10101',1,'pcba_history',limit=2)
        self.assertFalse(r['complete']);self.assertEqual(len(r['rows']),2)
        allrows=r['rows'];cursor=r['next_cursor']
        while cursor:
            r=canonical.page(self.store,self.sid,'TAN10101',1,'pcba_history',cursor,2);allrows+=r['rows'];cursor=r['next_cursor']
        self.assertEqual(len(allrows),6);self.assertEqual(len({r['record_id'] for r in allrows}),6)
        canonical.export_revision(self.store,self.sid,'TAN10102')
        with self.assertRaises(ValueError):canonical.page(self.store,self.sid,'TAN10102',1,'pcba_history',canonical.page(self.store,self.sid,'TAN10101',1,'pcba_history',limit=2)['next_cursor'])
    def test_same_pcba_time_defect_keeps_exact_cph_variants(self):
        row={'line':'TAN10101','pcba_sn':'P','product_model':'CPH2859V','defect_code':'D','defect_time':'2026-10-09T10:00:00Z'}
        self.store.ingest_defects(self.sid,[row,row])
        p=canonical.export_revision(self.store,self.sid,'TAN10101')
        self.assertEqual({r['product'] for r in p['datasets']['defects']},{'CPH2859','CPH2859V'})
        self.assertEqual(len({r['occurrence_id'] for r in p['datasets']['defects']}),2)
    def test_process_adapter_absent_and_temporal_boundary(self):
        with self.assertRaises(RuntimeError):process_timeline.collect(self.store,line_id='TAN10101',product='CPH2859',pcba_sn='P')
        p=canonical.export_revision(self.store,self.sid,'TAN10101');self.assertFalse(p['capabilities']['process_timeline']);self.assertEqual(p['coverage']['process_timeline']['status'],'not_collected')
        base={'event_id':'E1','line_id':'TAN10101','product':'CPH2859','pcba_sn':'P','process':'TEST','station':'S','event_time':'2026-10-09T09:00:00Z','source_view':'3022','snapshot_id':self.sid,'snapshot_revision':1,'provenance':{'adapter':'test'},'raw_ref':'test:E1','coverage':{'status':'partial'},'valid':True}
        process_timeline.ingest(self.store,[base]);occ={**base,'defect_time':'2026-10-09T10:00:00Z'}
        self.assertEqual(process_timeline.preceding([base,{**base,'event_id':'future','event_time':'2026-10-09T11:00:00Z'}],occ)['event_id'],'E1')
        self.assertIsNone(process_timeline.preceding([base,{**base,'event_id':'tie'}],occ))
        self.assertIsNone(process_timeline.preceding([base],{**occ,'product':'CPH2859V'}))

if __name__=='__main__':unittest.main()
