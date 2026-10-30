"""Exercise actual deep-trace admission/worker against SQLite, with MES mocked."""
import ast
import copy
import json
import pathlib
import sys
import tempfile
import time
import types
import unittest
from contextlib import nullcontext
from urllib.parse import urlparse

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'ames/agent'))
from store import Store
import canonical
import source_capture

LINE='TAN10101';OTHER='TAN10102'

class TraceTargetTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.store=Store(pathlib.Path(self.tmp.name)/'original.sqlite');self.store.initialize()
        window=self.store.ensure_window('previous_day','2026-10-16T07:00-03:00','2026-10-17T07:00-03:00',None,[LINE,OTHER])
        self.sid=self.store.create_snapshot(window_id=window,source_kind='synthetic')
        self.store.ingest_defects(self.sid,[{'line':line,'pcba_sn':'SAME-PCBA','product_model':'CPH2859','defect_code':code,'defect_time':'2026-10-16T10:00-03:00'} for line,code in [(LINE,'D1'),(OTHER,'D2')]])
        self.first=canonical.export_revision(self.store,self.sid,LINE)
        self.cfg={'lines':[LINE],'trace_mode':'reuse_only','snapshot_targets':{LINE:{key:copy.deepcopy(self.first[key]) for key in ('source_id','snapshot_id','snapshot_revision','content_hash')}}}
        self.cfg['snapshot_targets'][LINE]['period']=copy.deepcopy(self.first['summary']['period'])
        self.calls=[];self.jobs=[];self.admissions=[]
        def collect(engine,records,**kwargs):
            self.calls.append((records,kwargs));return {'trace_3074':{'status':'complete'},'trace_2114':{'status':'complete'}}
        def enrich(sid,payload):
            with self.store.connect() as con:con.execute("UPDATE defect_observations SET repair_status_current='Y' WHERE snapshot_id=? AND line=?",(sid,LINE))
            return {'snapshot_id':sid}
        a=types.SimpleNamespace(STORE=self.store,CONFIG={},ENGINE_DIR='synthetic-engine',DATA_DIR=pathlib.Path(self.tmp.name),
            trace_insights=None,normalize_lines=lambda lines:lines,utc_now=lambda:'synthetic-now',_job_update=lambda job_id,**kw:{'id':job_id,**kw},
            _persist_job=lambda job:self.jobs.append(job),_select_trace_records=lambda rows,**kw:rows,MES=types.SimpleNamespace(critical=nullcontext),
            _job_live_event=lambda jid,ev,line,idx,total,sid:{'id':jid,'stage':ev.get('stage'),'event':ev.get('kind')},
            run_deep_v016_records=collect,enrich_snapshot_from_integrated=enrich,
            _launch_mes_job=lambda kind,cfg,worker:self.admissions.append(cfg) or {'id':'J'})
        source=ast.parse((ROOT/'ames/agent/agent_entry.py').read_text())
        names={'_trace_snapshot_ids','_rebase_trace_targets_at_execution','_run_deep_trace_job','start_deep_trace_job','_source_stage','_aggregate_stage'}
        nodes=[n for n in source.body if isinstance(n,ast.FunctionDef) and n.name in names]
        self.env={'a':a,'canonical':canonical,'json':json,'time':time,'_process_support':lambda:{'ready':True},'urlparse':urlparse,'source_capture':source_capture}
        exec(compile(ast.Module(body=nodes,type_ignores=[]),'<actual trace functions>','exec'),self.env)
        cls=next(n for n in source.body if isinstance(n,ast.ClassDef) and n.name=='Handler')
        method=next(n for n in cls.body if isinstance(n,ast.FunctionDef) and n.name=='do_POST')
        exec(compile(ast.Module(body=[method],type_ignores=[]),'<actual POST handler>','exec'),self.env)

    def tearDown(self):self.tmp.cleanup()

    def test_selected_old_snapshot_and_line_are_preserved_despite_newer_snapshot(self):
        newer=self.store.create_snapshot(window_id=None,source_kind='synthetic')
        self.store.ingest_defects(newer,[{'line':LINE,'pcba_sn':'WRONG-NEW','product_model':'CPH2859','defect_code':'D3'}])
        self.env['start_deep_trace_job'](self.cfg)
        self.env['_run_deep_trace_job']('J',self.cfg)
        self.assertEqual(self.jobs[-1]['status'],'done');self.assertEqual(len(self.calls),1)
        records,kwargs=self.calls[0];self.assertEqual({r['snapshot_id'] for r in records},{self.sid})
        self.assertEqual({r['line'] for r in records},{LINE});self.assertEqual({r['defect_code'] for r in records},{'D1'})
        self.assertEqual(canonical.read_revision(self.store,self.sid,LINE,1),self.first)
        captured=source_capture.capture_index(self.store,self.sid,LINE)
        self.assertEqual({x['source_view'] for x in captured},{'3074','2114'})
        self.assertEqual({x['parent_snapshot_revision'] for x in captured},{1})
        self.assertEqual({x['period']['mode'] for x in captured},{'previous_day'})
        self.assertEqual({x['source_status'] for x in captured},{'done'})
        updated=canonical.export_revision(self.store,self.sid,LINE)
        self.assertEqual(updated['snapshot_revision'],2);self.assertEqual(updated['summary'],self.first['summary'])
        self.assertIsNone(self.store.base_rows(newer,line=LINE)[0].get('repair_status_current'))

    def test_missing_mismatched_or_unknown_target_is_rejected_before_admission(self):
        cases=[{**self.cfg,'snapshot_targets':None},{**self.cfg,'lines':[OTHER]}]
        for key,value in [('source_id','other-pc'),('snapshot_id','999'),('snapshot_revision',99),('snapshot_revision',True),('content_hash','wrong'),('period',{'mode':'today'})]:
            cfg=copy.deepcopy(self.cfg);cfg['snapshot_targets'][LINE][key]=value;cases.append(cfg)
        for cfg in cases:
            with self.assertRaises(ValueError):self.env['start_deep_trace_job'](cfg)
        self.assertEqual(self.admissions,[]);self.assertEqual(self.calls,[])

    def test_queue_race_rebases_same_snapshot_and_two_successive_jobs_complete(self):
        self.env['start_deep_trace_job'](self.cfg)
        with self.store.connect() as con:con.execute("UPDATE defect_observations SET repair_status_current='Y' WHERE snapshot_id=?",(self.sid,))
        # Admission checks durable identity; the existing scheduler owns request_id replay.
        self.env['start_deep_trace_job'](self.cfg)
        self.env['_run_deep_trace_job']('J',self.cfg)
        self.assertEqual(len(self.calls),1);self.assertEqual(self.jobs[-1]['status'],'done')
        self.env['_run_deep_trace_job']('J2',self.cfg)
        self.assertEqual(len(self.calls),2);self.assertEqual(self.jobs[-1]['status'],'done')
        self.assertEqual({r['snapshot_id'] for records,_ in self.calls for r in records},{self.sid})
        self.assertGreater(self.cfg['snapshot_targets'][LINE]['snapshot_revision'],1)
        self.assertEqual(canonical.read_revision(self.store,self.sid,LINE,1),self.first)

    def test_worker_rejects_identity_change_even_after_admission(self):
        self.env['start_deep_trace_job'](self.cfg)
        for field,value in [('source_id','other-pc'),('period',{'mode':'today'}),('snapshot_revision',999)]:
            cfg=copy.deepcopy(self.cfg);cfg['snapshot_targets'][LINE][field]=value
            self.env['_run_deep_trace_job']('BAD',cfg)
            self.assertEqual(self.jobs[-1]['status'],'error')
        self.assertEqual(self.calls,[])

    def test_continuously_changing_epoch_is_bounded_and_never_queries_mes(self):
        count=[]
        original=canonical.export_revision
        def racing(*args,**kwargs):
            value=original(*args,**kwargs);count.append(1)
            with self.store.connect() as con:
                con.execute('UPDATE mes_source_clock SET epoch=epoch+1 WHERE snapshot_id=?',(self.sid,))
            return value
        from unittest.mock import patch
        with patch.object(canonical,'export_revision',side_effect=racing):
            self.env['_run_deep_trace_job']('RACE',self.cfg)
        self.assertEqual(len(count),3);self.assertEqual(self.calls,[])
        self.assertEqual(self.jobs[-1]['status'],'error')

    def test_interrupted_deep_trace_retains_partial_3074_and_2114_evidence(self):
        def stopped(engine,records,**kwargs):
            notify=kwargs['event_callback']
            notify({'stage':'3074','kind':'pcba_result','sn':'SAME-PCBA',
                'item':{'pcba_sn':'SAME-PCBA','materials':[{'item_sn':'LCD-001','previous_pcbas':['OLD-1','OLD-2']}]}})
            notify({'stage':'2114','kind':'pcba','pcba':'SAME-PCBA','status':'COMPLETE',
                'state':{'result':{'rows':[{'repair_state':'unknown','device':'P'}]}}})
            raise RuntimeError('simulated mid-collection interruption')
        self.env['a'].run_deep_v016_records=stopped
        self.env['_run_deep_trace_job']('J_INTERRUPTED',self.cfg)
        self.assertEqual(self.jobs[-1]['status'],'error')
        saved=source_capture.capture_index(self.store,self.sid,LINE)
        self.assertEqual({x['source_view'] for x in saved},{'3074','2114'})
        self.assertEqual({x['parent_snapshot_revision'] for x in saved},{1})
        material=self.store.get_snapshot_payload_revision(self.sid,'source_capture_3074_J_INTERRUPTED',1)
        self.assertEqual(material['result']['items'][0]['item']['materials'][0]['previous_pcbas'],['OLD-1','OLD-2'])
        self.assertTrue(all(x['source_status']=='partial' for x in saved))
        self.assertEqual(canonical.read_revision(self.store,self.sid,LINE,1),self.first)
        newer=self.store.create_snapshot(window_id=None,source_kind='synthetic')
        self.store.ingest_defects(newer,[{'line':LINE,'pcba_sn':'OTHER-PCBA','defect_code':'D9'}])
        self.assertEqual(source_capture.capture_index(self.store,newer,LINE),[])

    def test_handler_preserves_snapshot_target_contract(self):
        response=[]
        handler=types.SimpleNamespace(path='/api/v1/deep-trace',_body=lambda:copy.deepcopy(self.cfg),_send=lambda payload,status:response.append((status,payload)))
        types.MethodType(self.env['do_POST'],handler)()
        self.assertEqual(response[0][0],202)
        self.assertEqual(self.admissions[0]['snapshot_targets'],self.cfg['snapshot_targets'])

    def test_source_status_unknown_timeout_and_uncollected_never_certify_complete(self):
        stage=self.env['_source_stage'];aggregate=self.env['_aggregate_stage']
        for raw in ('timeout','TIMED_OUT','failed','error'):
            self.assertEqual(stage(raw),'error')
        for raw in (None,'','pending','not_collected'):
            self.assertEqual(stage(raw),'not_run')
        self.assertEqual(stage('new_mes_status_not_mapped'),'partial')
        one={'3074':{'status':'complete'}}
        self.assertEqual(aggregate({LINE:one},'3074'),'done')
        self.assertEqual(aggregate({LINE:one,OTHER:{'3074':{'status':'pending'}}},'3074'),'partial')
        self.assertEqual(aggregate({LINE:one,OTHER:{'3074':{'status':'custom_unmapped'}}},'3074'),'partial')
        self.assertEqual(aggregate({LINE:{'3074':{'status':'timeout'}}},'3074'),'error')
        self.assertEqual(aggregate({LINE:{'skipped':True}},'3074'),'not_run')

    def test_finished_worker_reports_incomplete_3074_without_claiming_full_coverage(self):
        self.env['a'].run_deep_v016_records=lambda engine,records,**kw:{
            'trace_3074':{'status':'timeout'},'trace_2114':{'status':'complete'}}
        self.env['_run_deep_trace_job']('J_TIMEOUT',self.cfg)
        job=self.jobs[-1]
        self.assertEqual(job['status'],'done','scheduler completion is not a coverage certificate')
        self.assertEqual(job['result']['stages']['3074'],'error')
        self.assertEqual(job['result']['stages']['2114'],'done')
        self.assertIn('sem cobertura completa: 3074',job['message'])
        rows=source_capture.capture_index(self.store,self.sid,LINE)
        self.assertEqual({row['source_status'] for row in rows},{'error','done'})

if __name__=='__main__':unittest.main()
