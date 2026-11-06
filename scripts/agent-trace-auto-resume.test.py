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


if __name__=='__main__':unittest.main()
