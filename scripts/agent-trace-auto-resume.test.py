"""Safety contract: resume only exact prior scope, never a newer 3028 selection."""
import pathlib
import sys
import unittest
from copy import deepcopy

sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'ames/agent'))
from trace_auto_resume import candidate, needs_continuation, same_scope


class ResumeContractTests(unittest.TestCase):
    def setUp(self):
        self.cfg={
            'lines':['TAN10103'],'trace_mode':'full','max_failures':0,'max_pcbas':0,
            'defect_codes':[], 'snapshot_targets':{'TAN10103':{
                'source_id':'WORKSTATION-A', 'snapshot_id':7,'snapshot_revision':30,
                'content_hash':'HASH-A', 'period':{'mode':'today','start_at':'2026-11-05T07:00:00',
                                                 'end_at':'2026-11-06T07:00:00'}}}}
        self.partial={'id':'OLD','kind':'deep_trace','created_at':'2026-11-06T10:00:00',
                      'status':'done','config':deepcopy(self.cfg),
                      'result':{'stages':{'3074':'done','2114':'done','3022':'done','3012':'partial'}}}

    def test_only_source_revision_may_advance(self):
        next_cfg=deepcopy(self.cfg)
        next_cfg['snapshot_targets']['TAN10103'].update(snapshot_revision=35,content_hash='HASH-B')
        self.assertTrue(same_scope(self.cfg,next_cfg))
        self.assertEqual(candidate(next_cfg,[self.partial])['id'],'OLD')

    def test_source_day_line_snapshot_mode_filter_and_limits_are_isolated(self):
        cases=[]
        for key,value in [('source_id','WORKSTATION-B'),('snapshot_id',8)]:
            cfg=deepcopy(self.cfg);cfg['snapshot_targets']['TAN10103'][key]=value;cases.append(cfg)
        cfg=deepcopy(self.cfg);cfg['snapshot_targets']['TAN10103']['period']['end_at']='2026-11-07T07:00:00';cases.append(cfg)
        cfg=deepcopy(self.cfg);cfg['snapshot_targets']['TAN10103']['period']['mode']='previous_day';cases.append(cfg)
        for key,value in [('trace_mode','reuse_only'),('max_failures',10),('max_pcbas',3),
                          ('defect_codes',['F1']),('lines',['TAN10102']),('include_3012',False)]:
            cfg=deepcopy(self.cfg);cfg[key]=value;cases.append(cfg)
        for cfg in cases:
            with self.subTest(changed=cfg):
                self.assertFalse(same_scope(self.partial['config'],cfg))
                self.assertIsNone(candidate(cfg,[self.partial]))

    def test_last_matching_job_wins_even_when_completed(self):
        self.assertTrue(needs_continuation(self.partial))
        complete=deepcopy(self.partial)
        complete.update(id='NEW',created_at='2026-11-06T11:00:00')
        complete['result']['stages']['3012']='done'
        self.assertIsNone(candidate(self.cfg,[complete,self.partial]))
        interrupted=deepcopy(self.partial)
        interrupted.update(status='error',result=None)
        self.assertEqual(candidate(self.cfg,[interrupted])['id'],'OLD')

    def test_explicit_fresh_never_automatically_recovers(self):
        cfg={**self.cfg,'force_new_run':True}
        self.assertIsNone(candidate(cfg,[self.partial]))

    def test_full_without_3012_does_not_loop_on_intentionally_skipped_history(self):
        cfg={**self.cfg,'include_3012':False}
        complete=deepcopy(self.partial)
        complete['config']=deepcopy(cfg)
        complete['scope']={'trace_mode':'full','include_3012':False}
        complete['result']['scope']={'trace_mode':'full','include_3012':False}
        complete['result']['stages']['3012']='not_run'
        self.assertFalse(needs_continuation(complete))
        self.assertIsNone(candidate(cfg,[complete]))

    def test_required_stage_still_recovers_when_3012_is_opted_out(self):
        cfg={**self.cfg,'include_3012':False}
        partial=deepcopy(self.partial)
        partial['config']=deepcopy(cfg)
        partial['scope']={'trace_mode':'full','include_3012':False}
        partial['result']['scope']={'trace_mode':'full','include_3012':False}
        partial['result']['stages'].update({'3022':'partial','3012':'not_run'})
        self.assertTrue(needs_continuation(partial))
        self.assertEqual(candidate(cfg,[partial])['id'],'OLD')

    def test_history_only_must_prove_3012_even_if_other_views_not_run(self):
        cfg={**self.cfg,'trace_mode':'history_only','include_3012':True}
        job=deepcopy(self.partial)
        job['config']=cfg
        job['scope']={'trace_mode':'history_only','include_3012':True}
        job['result']['stages']={'3074':'not_run','2114':'not_run','3022':'not_run','3012':'done'}
        self.assertFalse(needs_continuation(job))
        job['result']['stages']['3012']='error'
        self.assertTrue(needs_continuation(job))


if __name__=='__main__':unittest.main()
