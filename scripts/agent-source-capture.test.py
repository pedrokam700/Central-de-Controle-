import pathlib
import sys
import tempfile
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'ames'/'agent'))
from store import Store
import canonical
import source_capture

LINE='TAN10101'

class SourceCaptureTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.store=Store(pathlib.Path(self.tmp.name)/'real.sqlite')
        self.store.initialize()
        w=self.store.ensure_window('previous_day','2026-10-16T07:00-03:00','2026-10-17T07:00-03:00',None,[LINE])
        self.sid=self.store.create_snapshot(window_id=w,source_kind='3028_live_extjs')
        self.store.ingest_defects(self.sid,[{'line':LINE,'pcba_sn':'MAIN-PCBA','product_model':'CPH2859V','defect_code':'D','defect_time':'2026-10-16T09:00-03:00'}])
        frozen=canonical.export_revision(self.store,self.sid,LINE)
        self.target={k:frozen[k] for k in ('source_id','snapshot_id','snapshot_revision','content_hash')}
        self.target['period']=frozen['summary']['period']

    def tearDown(self):
        self.tmp.cleanup()

    def test_five_source_scopes_are_separate_and_original_revision_remains_readable(self):
        self.store.save_snapshot_payload(self.sid,'3028_live_raw',{'raw_records':[{'line':LINE,'fpy':97.2}]})
        item={'part':'LCD','item_sn':'LCM-SN','previous_pcbas':['PCBA-PREV'], 'binds':[{'pcba':'MAIN-PCBA'},{'pcba':'PCBA-PREV'}]}
        source_capture.capture_source(self.store,target=self.target,line=LINE,job_id='JOB1',view='3074',
            result={'status':'partial','items':[item]},status='partial')
        source_capture.capture_source(self.store,target=self.target,line=LINE,job_id='JOB1',view='2114',
            result={'status':'done','pcbas':[{'pcba_sn':'MAIN-PCBA','history':[{'repair':'R1'}]}]},status='done')
        source_capture.capture_source(self.store,target=self.target,line=LINE,job_id='JOB1',view='3022',
            result={'status':'partial','events':[{'pcba_sn':'MAIN-PCBA','station':'A5162'}]},status='partial')
        self.assertEqual(len(source_capture.capture_index(self.store,self.sid,LINE)),3)
        self.assertEqual({x['source_view'] for x in source_capture.capture_index(self.store,self.sid,LINE)},{'3074','2114','3022'})
        capture=self.store.get_snapshot_payload_revision(self.sid,'source_capture_3074_JOB1',1)
        self.assertEqual(capture['result']['items'][0],item)
        self.assertEqual(capture['source_complete'],False)
        self.assertEqual(capture['period'],self.target['period'])
        self.assertEqual(capture['parent_snapshot_revision'],self.target['snapshot_revision'])
        self.assertEqual(self.store.get_snapshot_payload_revision(self.sid,'3028_live_raw',1)['raw_records'][0]['fpy'],97.2)
        self.assertEqual(canonical.read_revision(self.store,self.sid,LINE,1)['snapshot_revision'],1)
        other=canonical.export_revision(self.store,self.sid,LINE)
        # Raw source captures are revisioned separately. Identical derived
        # canonical facts must NOT acquire a fabricated new operational revision.
        self.assertEqual(other['snapshot_revision'],1)
        self.assertEqual(self.target['source_id'],canonical.source_id(self.store))
        rebuilt=Store(self.store.path);rebuilt.initialize()
        self.assertEqual(source_capture.capture_index(rebuilt,self.sid,LINE),source_capture.capture_index(self.store,self.sid,LINE))

    def test_partial_update_same_job_is_versioned_while_another_job_keeps_own_history(self):
        base={'items':[{'sn':'A','material':'LCD'}]}
        source_capture.capture_source(self.store,target=self.target,line=LINE,job_id='JOB1',view='3074',result=base,status='partial')
        source_capture.capture_source(self.store,target=self.target,line=LINE,job_id='JOB1',view='3074',result={'items':[{'sn':'A'},{'sn':'B'}]},status='partial')
        source_capture.capture_source(self.store,target=self.target,line=LINE,job_id='JOB2',view='3074',result={'items':[{'sn':'C'}]},status='partial')
        self.assertEqual(len(self.store.snapshot_payload_history(self.sid,'source_capture_3074_JOB1')),2)
        self.assertEqual(self.store.get_snapshot_payload_revision(self.sid,'source_capture_3074_JOB1',1)['result'],base)
        self.assertEqual(self.store.get_snapshot_payload_revision(self.sid,'source_capture_3074_JOB2',1)['result']['items'][0]['sn'],'C')
        self.assertEqual(len(source_capture.capture_index(self.store,self.sid,LINE)),3)

    def test_partial_progress_is_bounded_and_preserves_separate_final_result(self):
        journal=source_capture.BoundedPartialJournal(self.store,target=self.target,line=LINE,job_id='JOB_PROGRESS')
        self.assertFalse(journal.observe({'stage':'3012','kind':'pcba_result','item':{'x':1}}))
        self.assertFalse(journal.observe({'stage':'3074','kind':'component','item_sn':'SKIP'}))
        self.assertFalse(journal.observe({'stage':'3074','kind':'pcba_result','sn':'HUGE','item':{'pcba_sn':'HUGE','raw':'X'*15000}}))
        for i in range(20):
            journal.observe({'stage':'3074','kind':'pcba_result','sn':f'PCBA-{i}',
                'item':{'pcba_sn':f'PCBA-{i}','components':[{'material_sn':f'LCD-{i}','previous_pcbas':['OLD-PCBA']}]}})
        self.assertEqual(len(journal.entries['3074']),source_capture.MAX_PARTIAL_ITEMS)
        self.assertEqual(journal.writes['3074'],source_capture.MAX_PARTIAL_WRITES)
        history=self.store.snapshot_payload_history(self.sid,'source_capture_3074_JOB_PROGRESS')
        self.assertEqual(len(history),source_capture.MAX_PARTIAL_WRITES)
        first=self.store.get_snapshot_payload_revision(self.sid,'source_capture_3074_JOB_PROGRESS',1)
        last=self.store.get_snapshot_payload_revision(self.sid,'source_capture_3074_JOB_PROGRESS',source_capture.MAX_PARTIAL_WRITES)
        self.assertEqual(first['result']['checkpoint_kind'],'bounded_partial_progress')
        self.assertEqual(first['result']['sample_count'],1)
        self.assertEqual(last['result']['sample_count'],source_capture.MAX_PARTIAL_ITEMS)
        self.assertEqual(last['result']['items'][0]['item']['components'][0]['previous_pcbas'],['OLD-PCBA'])
        # A successful later return appends the source's final original payload,
        # it does not replace or falsely mark partial evidence as complete.
        source_capture.capture_source(self.store,target=self.target,line=LINE,job_id='JOB_PROGRESS',
            view='3074',result={'status':'complete','items':[{'full_original':True}]},status='done')
        self.assertEqual(len(self.store.snapshot_payload_history(self.sid,'source_capture_3074_JOB_PROGRESS')),
            source_capture.MAX_PARTIAL_WRITES+1)
        self.assertEqual(self.store.get_snapshot_payload_revision(self.sid,'source_capture_3074_JOB_PROGRESS',1),first)
        latest=self.store.get_snapshot_payload_revision(self.sid,'source_capture_3074_JOB_PROGRESS',source_capture.MAX_PARTIAL_WRITES+1)
        self.assertEqual(latest['result']['items'][0],{'full_original':True})
        self.assertEqual(canonical.read_revision(self.store,self.sid,LINE,1)['snapshot_revision'],1)

    def test_2114_partial_history_and_3022_progress_are_not_false_complete_evidence(self):
        journal=source_capture.BoundedPartialJournal(self.store,target=self.target,line=LINE,job_id='JOB_INTERRUPTED')
        self.assertTrue(journal.observe({'stage':'2114','kind':'pcba','pcba':'MAIN-PCBA','status':'COMPLETE',
            'state':{'result':{'rows':[{'defect_code':'D','repair_status':'unknown','event':'saved'}]}}}))
        self.assertTrue(journal.observe({'stage':'3022','kind':'pcba','pcba':'MAIN-PCBA',
            'phase':'mes','current':1,'total':4,'status':'COLLECTED','rows':2}))
        self.assertFalse(journal.observe({'stage':'2114','kind':'pcba','pcba':'OTHER','status':'ERROR'}))
        a=self.store.get_snapshot_payload_revision(self.sid,'source_capture_2114_JOB_INTERRUPTED',1)
        b=self.store.get_snapshot_payload_revision(self.sid,'source_capture_3022_JOB_INTERRUPTED',1)
        self.assertEqual(a['result']['items'][0]['result']['rows'][0]['event'],'saved')
        self.assertEqual(b['result']['items'][0]['rows_reported'],2)
        self.assertTrue(b['result']['progress_only'])
        self.assertFalse(b['source_complete'])
        self.assertFalse(b['result']['population_complete'])
        self.assertEqual({x['source_status'] for x in source_capture.capture_index(self.store,self.sid,LINE)},{'partial'})
        self.assertEqual(len(source_capture.capture_index(self.store,self.sid,LINE)),2)

    def test_wrong_snapshot_source_period_or_job_fails_before_mutation(self):
        wrongs=[(dict(self.target,source_id='OTHER'),LINE,'3074','GOOD'),
                (dict(self.target,period={'mode':'today'}),LINE,'3074','GOOD'),
                (dict(self.target,content_hash='BAD'),LINE,'3074','GOOD'),
                (self.target,'TAN10102','3074','GOOD'),
                (self.target,LINE,'3012','GOOD'),
                (self.target,LINE,'3074','../../BAD')]
        for target,line,view,job in wrongs:
            with self.assertRaises(ValueError):
                source_capture.capture_source(self.store,target=target,line=line,job_id=job,view=view,result={'a':1})
        with self.store.connect() as c:
            self.assertEqual(c.execute("SELECT COUNT(*) FROM snapshot_payloads WHERE kind LIKE 'source_capture_%'").fetchone()[0],0)
        self.assertEqual(source_capture.capture_index(self.store,self.sid,'TAN10102'),[])


if __name__=='__main__':
    unittest.main()
