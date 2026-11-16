"""Offline 3022 replay contract: disposable SQLite, no real browser or MES.
Run: python3 scripts/agent-3022-local-replay.test.py
"""
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT/'ames'/'agent'),str(ROOT/'ames'/'factory-engine')]
import process_r11
from store import Store
from ames import browser,navigation,tela_3022

ENGINE=ROOT/'ames'/'factory-engine'

def rec(sn):
    return dict(line='TAN10101',pcba_sn=sn,defect_key='D-'+sn,
                product_model='CPH2859',defect_code='AUDIT-D',
                defect_desc='Synthetic failure',defect_time='2026-10-16 10:32:00',
                manual_or_auto='MANUAL')

def setup_store(folder,boards):
    store=Store(folder/'disposable.sqlite3')
    store.initialize()
    process_r11.patch_store(store)
    wid=store.ensure_window('today','2026-10-16T07:00:00',
                            '2026-10-17T07:00:00',None,['TAN10101'])
    sid=store.create_snapshot(window_id=wid,source_kind='test')
    records=[rec(sn) for sn in boards]
    if records:store.ingest_defects(sid,records,reconcile_window=False)
    return store,sid,records

def confirmed_empty():
    return {'rows':[],'query_diagnostics':{'status':'CONFIRMED_EMPTY'}}

class TestLocalReplay(unittest.TestCase):
    def test_all_confirmed_without_chrome(self):
        with tempfile.TemporaryDirectory() as td:
            store,sid,records=setup_store(Path(td),['P-A','P-B'])
            events=[]
            with patch.object(browser.AmesBrowser,'connect',
                              side_effect=RuntimeError('CDP UNAVAILABLE')) as connect:
                result=process_r11.collect_and_persist(store,ENGINE,records,
                   snapshot_id=sid,line='TAN10101',
                   seed_3022_items={'P-A':confirmed_empty(),'P-B':confirmed_empty()},
                   event_callback=events.append)
                connect.assert_not_called()
            self.assertEqual((result['status'],result['processed']),('complete',2))
            self.assertEqual([e['pcba'] for e in events if e.get('status')=='CHECKPOINT_COMPLETE'],['P-A','P-B'])
            self.assertEqual([e['pcba'] for e in events if e.get('status')=='PROCESSED'],['P-A','P-B'])

    def test_missing_query_proof_must_still_require_mes(self):
        invalid=[{'rows':[],'query_diagnostics':{'status':'UNCONFIRMED'}},
                 {'rows':[],'query_diagnostics':{}},
                 {'query_diagnostics':{'status':'CONFIRMED'}},None]
        with tempfile.TemporaryDirectory() as td:
            store,sid,records=setup_store(Path(td),['P-A'])
            for bad in invalid:
                with self.subTest(bad=bad):
                    with patch.object(browser.AmesBrowser,'connect',
                        side_effect=RuntimeError('CDP UNAVAILABLE')) as connect:
                        with self.assertRaisesRegex(RuntimeError,'CDP UNAVAILABLE'):
                            process_r11.collect_and_persist(store,ENGINE,records,
                                snapshot_id=sid,line='TAN10101',
                                seed_3022_items={'P-A':bad})
                        connect.assert_called_once()
            with patch.object(browser.AmesBrowser,'connect',
                side_effect=RuntimeError('CDP UNAVAILABLE')) as connect:
                with self.assertRaisesRegex(RuntimeError,'CDP UNAVAILABLE'):
                    process_r11.collect_and_persist(store,ENGINE,records,
                        snapshot_id=sid,line='TAN10101',
                        seed_3022_items={'P-FOREIGN':confirmed_empty()})
                connect.assert_called_once()

    def test_mixed_only_queries_missing_board(self):
        class FakeBrowser:
            def __init__(self):self.connects=0;self.disconnects=0
            def connect(self):self.connects+=1;return self
            def disconnect(self):self.disconnects+=1
        class FakeNavigation:
            def __init__(self):self.prepared=0
            def ensure_3022(self):self.prepared+=1
        class FakeTela:
            def __init__(self):self.calls=[];self.pages=0
            def _page(self):self.pages+=1
            def consultar(self,pcba):self.calls.append(pcba);return confirmed_empty()
        with tempfile.TemporaryDirectory() as td:
            store,sid,records=setup_store(Path(td),['P-A','P-B','P-C'])
            fb,fn,ft=FakeBrowser(),FakeNavigation(),FakeTela()
            with patch.object(browser,'AmesBrowser',return_value=fb),\
                 patch.object(navigation,'AmesNavigation',return_value=fn),\
                 patch.object(tela_3022,'Tela3022',return_value=ft):
                result=process_r11.collect_and_persist(store,ENGINE,records,
                    snapshot_id=sid,line='TAN10101',performance='fast',
                    seed_3022_items={'P-A':confirmed_empty(),'P-C':confirmed_empty()})
            self.assertEqual(ft.calls,['P-B'])
            self.assertEqual((fb.connects,fb.disconnects,fn.prepared,ft.pages),(1,1,1,1))
            self.assertEqual((result['status'],result['processed']),('complete',3))

    def test_no_targets_skips_chrome(self):
        with tempfile.TemporaryDirectory() as td:
            store,sid,records=setup_store(Path(td),[])
            with patch.object(browser.AmesBrowser,'connect',
                side_effect=RuntimeError('CDP UNAVAILABLE')) as connect:
                result=process_r11.collect_and_persist(store,ENGINE,records,
                   snapshot_id=sid,line='TAN10101')
                connect.assert_not_called()
            self.assertEqual((result['requested'],result['processed']),(0,0))

if __name__=='__main__':
    unittest.main(verbosity=2)
