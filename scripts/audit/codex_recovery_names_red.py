"""Independent integration contracts, expected RED on fddc754.

Only browser boundary is mocked; real collector JS, adapter and temporary SQLite.
No agent startup, real CDP, production DB, network, installer or new dependencies.
"""
import sys
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'ames/agent'))
sys.path.insert(0,str(ROOT/'ames/factory-engine'))
sys.path.insert(0,str(ROOT/'scripts/fixtures'))
import process_r11
import local_sn
import partial_retry
from store import Store
from ames import tela_3022, browser, navigation
from ames_3022_harness import Ext3022Fixture, history_rows

def record(sn='AUDIT-A'):
    return dict(line='TAN10101',pcba_sn=sn,defect_key='audit-'+sn,product_model='CPH2859',
                defect_code='AUDIT-D',defect_desc='Camera impurity',
                defect_time='2026-10-16 10:32:00',manual_or_auto='MANUAL')

def prepare(td,boards=('AUDIT-A',)):
    store=Store(Path(td)/'disposable.sqlite3');store.initialize();process_r11.patch_store(store)
    wid=store.ensure_window('today','2026-10-16T07:00:00','2026-10-17T07:00:00',None,['TAN10101'])
    sid=store.create_snapshot(window_id=wid,source_kind='independent-audit')
    records=[record(sn) for sn in boards];store.ingest_defects(sid,records,reconcile_window=False)
    return store,sid,records

class IndependentRecoveryNames(unittest.TestCase):
    def test_R1_confirmed_seed_replay_does_not_require_chrome_home(self):
        with tempfile.TemporaryDirectory() as td:
            store,sid,records=prepare(td)
            response={'rows':history_rows('AUDIT-ID',3),'query_diagnostics':{'status':'CONFIRMED'}}
            with patch.object(browser.AmesBrowser,'connect',side_effect=RuntimeError('AUDIT_CDP_UNAVAILABLE')) as connect:
                try:
                    out=process_r11.collect_and_persist(store,ROOT/'ames/factory-engine',records,
                        snapshot_id=sid,line='TAN10101',seed_3022_items={'AUDIT-A':response})
                except RuntimeError as exc:
                    self.fail('Local replay was blocked by browser: '+str(exc))
                self.assertEqual(out['processed'],1)
                connect.assert_not_called()

    def test_N4_saved_non_END_LOT_operator_reaches_local_SN_cache(self):
        rows=history_rows('AUDIT-ID',1)
        rows[0].update({'Working Oper Code':'A6900','Working Oper':'Audit repair',
                        'Tran Desc':'REPAIR END','Tran User':'Pessoa sintética A'})
        with tempfile.TemporaryDirectory() as td:
            store,sid,records=prepare(td)
            with Ext3022Fixture(tela_3022,[{'rows':rows,'delay':240,'mode':'loadData'}]) as f, \
                 patch.object(browser,'AmesBrowser',return_value=f), \
                 patch.object(navigation.AmesNavigation,'ensure_3022'):
                f.evaluate("() => { Ext.getCmp('history').columns.push({text:'Tran User',dataIndex:'Tran User'}); }")
                out=process_r11.collect_and_persist(store,ROOT/'ames/factory-engine',records,
                    snapshot_id=sid,line='TAN10101',performance='fast')
            self.assertEqual(out['status'],'complete')
            with store.connect() as con:
                self.assertEqual(con.execute('SELECT COUNT(*) FROM process_raw_events').fetchone()[0],1)
                self.assertEqual(con.execute('SELECT COUNT(*) FROM mes_process_timeline').fetchone()[0],1)
                saved=json.loads(con.execute('SELECT provenance_json FROM mes_process_timeline').fetchone()[0])
                self.assertEqual(saved['operator_evidence']['operator_name'],'Pessoa sintética A')
            observed=local_sn.lookup(store,'AUDIT-A')['process_events']
            self.assertTrue(any(e.get('operator_name')=='Pessoa sintética A' for e in observed),
                            'Name is saved in raw/canonical timeline but disappears from /local/sn')

    def test_R2_missing_extjs_input_stops_after_two_recoverable_failures(self):
        with tempfile.TemporaryDirectory() as td:
            store,sid,records=prepare(td,('AUDIT-A','AUDIT-B','AUDIT-C','AUDIT-D'))
            with Ext3022Fixture(tela_3022,[]) as f, \
                 patch.object(browser,'AmesBrowser',return_value=f), \
                 patch.object(navigation.AmesNavigation,'ensure_3022'), \
                 patch.object(tela_3022.Tela3022,'_query_control',return_value=None):
                out=process_r11.collect_and_persist(store,ROOT/'ames/factory-engine',records,
                    snapshot_id=sid,line='TAN10101',performance='fast')
                self.assertEqual(f.call(op='state')['submitted'],[])
                self.assertEqual(out['pcbas'][2]['query_diagnostics'].get('status'),'SKIPPED_VIEW_NOT_READY',
                                 'Missing input is a session/view defect; do not spend 5s for every board')

    def test_R3_complete_label_without_3022_query_proof_does_not_skip_capture(self):
        captures=[{'source_view':'3022','result':{'pcbas':[{'pcba_sn':'AUDIT-A','status':'COMPLETE'}]}}]
        self.assertEqual(partial_retry.verified_3022_items(captures),{})
        self.assertEqual(partial_retry.pending_pcbas(['AUDIT-A'],captures)['pending']['3022'],['AUDIT-A'],
                         'The generic COMPLETE path must not bypass verified_3022_items')

if __name__=='__main__':unittest.main(verbosity=2)
