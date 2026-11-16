"""R3 regression: only MES-confirmed 3022 per-PCBA responses may skip capture.

Local synthetic source-capture envelopes. Never touches MES, real SQLite or CDP.
"""
import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'ames'/'agent'))
import partial_retry

def legacy(sn='P-A', status='COMPLETE'):
    return {'source_view':'3022','result':{'pcbas':[{
        'pcba_sn':sn,'status':status
    }]}}

def checkpoint(sn='P-A', status='CONFIRMED', rows=None):
    return {'source_view':'3022','result':{
        'checkpoint_kind':'per_pcba_complete_v1','population_complete':False,
        'pcbas':[{'pcba_sn':sn,'status':'COMPLETE','result':{
            'rows':[] if rows is None else rows,
            'query_diagnostics':{'status':status},
        }}],
    }}

class Test3022Proof(unittest.TestCase):
    def test_a_complete_label_without_mes_query_proof_is_pending(self):
        captures=[legacy()]
        self.assertEqual(partial_retry.verified_3022_items(captures),{})
        plan=partial_retry.pending_pcbas(['P-A'],captures)
        self.assertEqual(plan['pending']['3022'],['P-A'])
        self.assertEqual(plan['verified']['3022'],0)
        self.assertTrue(plan['capture_seen']['3022'])

    def test_proven_empty_is_valid_but_legacy_complete_does_not_override(self):
        captures=[checkpoint('P-A','CONFIRMED_EMPTY'),legacy('P-B')]
        self.assertEqual(set(partial_retry.verified_3022_items(captures)),{'P-A'})
        plan=partial_retry.pending_pcbas(['P-A','P-B'],captures)
        self.assertEqual(plan['pending']['3022'],['P-B'])
        self.assertEqual(plan['verified']['3022'],1)

    def test_richer_proven_response_is_reused_and_absent_field_is_rejected(self):
        good=checkpoint('P-A','CONFIRMED',[{'Working Oper Code':'A6900'}])
        self.assertEqual(len(partial_retry.verified_3022_items([good])['P-A']['rows']),1)
        unproven=checkpoint('P-B','UNCONFIRMED',[{'Working Oper Code':'A6900'}])
        malformed=checkpoint('P-C','CONFIRMED')
        del malformed['result']['pcbas'][0]['result']['rows']
        empty_without_query=legacy('P-D','DONE')
        captures=[good,unproven,malformed,empty_without_query]
        plan=partial_retry.pending_pcbas(['P-A','P-B','P-C','P-D'],captures)
        self.assertEqual(plan['pending']['3022'],['P-B','P-C','P-D'])
        self.assertEqual(plan['verified']['3022'],1)

    def test_foreign_pcba_cannot_be_reused(self):
        plan=partial_retry.pending_pcbas(['P-A'],[checkpoint('P-B','CONFIRMED_EMPTY')])
        self.assertEqual(plan['pending']['3022'],['P-A'])
        self.assertEqual(plan['verified']['3022'],0)

    def test_2114_legacy_complete_is_preserved(self):
        captures=[{'source_view':'2114','result':{'pcbas':[{
            'pcba_sn':'P-A','status':'COMPLETE'}]}}]
        plan=partial_retry.pending_pcbas(['P-A'],captures)
        self.assertEqual(plan['pending']['2114'],[])
        self.assertEqual(plan['pending']['3022'],['P-A'])

    def test_3022_bounded_progress_never_proves_data(self):
        captures=[{'source_view':'3022','result':{
            'checkpoint_kind':'bounded_partial_progress',
            'pcbas':[{'pcba_sn':'P-A','status':'COMPLETE',
                      'result':{'rows':[],'query_diagnostics':{'status':'CONFIRMED_EMPTY'}}}]
        }}]
        self.assertEqual(partial_retry.verified_3022_items(captures),{})
        self.assertEqual(partial_retry.pending_pcbas(['P-A'],captures)['pending']['3022'],['P-A'])

if __name__=='__main__':
    unittest.main(verbosity=2)
