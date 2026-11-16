"""PR73: confirmed 3022 checkpoints survive a missing CDP/Home/ExtJS view.

Only a synthetic MES adapter and disposable SQLite are used. This test must
not access production CDP, network, or an operational database.
"""
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT/'ames'/'agent'),str(ROOT/'ames'/'factory-engine'),
              str(ROOT/'scripts'/'fixtures')]
import process_r11
from store import Store
from ames import browser,navigation,tela_3022
from ames_3022_harness import history_rows

ENGINE=ROOT/'ames'/'factory-engine'

def rec(sn):
    return dict(line='TAN10101',pcba_sn=sn,defect_key='D-'+sn,
                product_model='CPH2859',defect_code='AUDIT-D',
                defect_desc='Synthetic failure',defect_time='2026-10-16 10:32:00',
                manual_or_auto='MANUAL')

def setup_store(td,targets):
    store=Store(Path(td)/'isolated.sqlite3');store.initialize()
    process_r11.patch_store(store)
    wid=store.ensure_window('today','2026-10-16T07:00:00',
                           '2026-10-17T07:00:00',None,['TAN10101'])
    sid=store.create_snapshot(window_id=wid,source_kind='pr73-test')
    records=[rec(x) for x in targets]
    store.ingest_defects(sid,records,reconcile_window=False)
    return store,sid,records

def confirmed_non_empty():
    return {'rows':history_rows('AUDIT-REPAIR',3),
            'query_diagnostics':{'status':'CONFIRMED'}}

def confirmed_empty():
    return {'rows':[],'query_diagnostics':{'status':'CONFIRMED_EMPTY'}}

class TestMixedOfflineRecovery(unittest.TestCase):
    def test_missing_cdp_preserves_confirmed_raw_and_marks_only_gaps_pending(self):
        with tempfile.TemporaryDirectory() as td:
            store,sid,records=setup_store(td,['P-A','P-B','P-C','P-D'])
            events=[]
            with patch.object(browser.AmesBrowser,'connect',
                              side_effect=RuntimeError('CDP OFFLINE')) as connect:
                result=process_r11.collect_and_persist(
                    store,ENGINE,records,snapshot_id=sid,line='TAN10101',
                    seed_3022_items={'P-A':confirmed_non_empty(),
                                     'P-C':confirmed_empty()},
                    event_callback=events.append)
            connect.assert_called_once()
            self.assertEqual(result['status'],'partial')
            self.assertEqual((result['requested'],result['collected'],
                              result['processed'],result['errors']),(4,2,2,2))
            by_sn={x['pcba_sn']:x for x in result['pcbas']}
            for sn in ('P-A','P-C'):
                self.assertEqual(by_sn[sn]['status'],'COMPLETE')
                self.assertIn(by_sn[sn]['query_diagnostics']['status'],
                              ('CONFIRMED','CONFIRMED_EMPTY'))
            for sn in ('P-B','P-D'):
                self.assertEqual(by_sn[sn]['status'],'ERROR')
                diag=by_sn[sn]['query_diagnostics']
                self.assertEqual(diag['status'],'SESSION_NOT_READY')
                self.assertEqual(diag['preflight_stage'],'cdp_connect')
                self.assertTrue(diag['requires_resume'])
                self.assertTrue(diag['no_mes_request_sent'])
            self.assertEqual([x['pcba'] for x in events if x.get('status')=='PROCESSED'],
                             ['P-A','P-C'])
            self.assertEqual([x['pcba'] for x in events if x.get('status')=='SKIPPED_RETRYABLE'],
                             ['P-B','P-D'])
            with store.connect() as con:
                self.assertEqual(con.execute(
                    "SELECT COUNT(*) FROM process_raw_events WHERE pcba_sn='P-A'").fetchone()[0],3)
                self.assertEqual(con.execute(
                    "SELECT COUNT(*) FROM process_raw_events WHERE pcba_sn IN ('P-B','P-D')").fetchone()[0],0)

    def test_navigation_home_missing_does_not_discard_good_checkpoints(self):
        class FakeBrowser:
            def __init__(self):self._target=self;self.disconnected=False
            def connect(self):return self
            def disconnect(self):self.disconnected=True
        class FakeNav:
            def __init__(self):self.calls=0
            def ensure_3022(self):
                self.calls+=1
                raise RuntimeError('Aba principal do A-MES não encontrada no Chrome dedicado')
        class FakeTela:
            def __init__(self):self.queries=[];self.page_called=False
            def _page(self):self.page_called=True
            def consultar(self,sn):self.queries.append(sn);return confirmed_empty()
        with tempfile.TemporaryDirectory() as td:
            store,sid,records=setup_store(td,['P-A','P-B'])
            fb,fn,ft=FakeBrowser(),FakeNav(),FakeTela()
            with patch.object(browser,'AmesBrowser',return_value=fb),\
                 patch.object(navigation,'AmesNavigation',return_value=fn),\
                 patch.object(tela_3022,'Tela3022',return_value=ft):
                result=process_r11.collect_and_persist(
                    store,ENGINE,records,snapshot_id=sid,line='TAN10101',
                    seed_3022_items={'P-A':confirmed_empty()})
            self.assertTrue(fb.disconnected)
            self.assertEqual((fn.calls,ft.page_called,ft.queries),(1,False,[]))
            self.assertEqual((result['status'],result['processed'],result['errors']),
                             ('partial',1,1))
            self.assertEqual(result['pcbas'][1]['query_diagnostics']['status'],
                             'SESSION_NOT_READY')
            self.assertEqual(result['pcbas'][1]['query_diagnostics']['preflight_stage'],
                             'view_navigation')

    def test_view_unavailable_does_not_query_a_different_pcba(self):
        class FakeBrowser:
            _target=None
            def connect(self):self._target=self;return self
            def disconnect(self):pass
        class FakeNav:
            def ensure_3022(self):pass
        class FakeTela:
            def _page(self):raise RuntimeError('AWIP3022 view was not rendered')
            def consultar(self,sn):raise AssertionError('must not query View')
        with tempfile.TemporaryDirectory() as td:
            store,sid,records=setup_store(td,['P-A','P-B','P-C'])
            with patch.object(browser,'AmesBrowser',return_value=FakeBrowser()),\
                 patch.object(navigation,'AmesNavigation',return_value=FakeNav()),\
                 patch.object(tela_3022,'Tela3022',return_value=FakeTela()):
                result=process_r11.collect_and_persist(
                    store,ENGINE,records,snapshot_id=sid,line='TAN10101',
                    seed_3022_items={'P-B':confirmed_empty()})
            self.assertEqual(result['status'],'partial')
            self.assertEqual([x['status'] for x in result['pcbas']],
                             ['ERROR','COMPLETE','ERROR'])
            self.assertEqual([x['query_diagnostics'].get('preflight_stage')
                              for x in result['pcbas'] if x['status']=='ERROR'],
                             ['view_ready','view_ready'])

    def test_no_confirmed_seed_offline_is_error_not_false_complete(self):
        with tempfile.TemporaryDirectory() as td:
            store,sid,records=setup_store(td,['P-A','P-B'])
            with patch.object(browser.AmesBrowser,'connect',
                              side_effect=RuntimeError('CDP OFFLINE')):
                result=process_r11.collect_and_persist(
                    store,ENGINE,records,snapshot_id=sid,line='TAN10101',
                    seed_3022_items={'P-A':{'rows':[],
                          'query_diagnostics':{'status':'UNCONFIRMED'}}})
            self.assertEqual((result['status'],result['collected'],
                              result['processed'],result['errors']),('error',0,0,2))
            self.assertTrue(all(x['query_diagnostics']['status']=='SESSION_NOT_READY'
                                for x in result['pcbas']))

if __name__=='__main__':
    unittest.main(verbosity=2)
