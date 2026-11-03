"""3074 candidates from 3028: non-destructive, scoped, non-causal projection."""
from pathlib import Path
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'ames'/'agent'))
from canonical import _candidate_materials_from_trace

class Test3074Candidates(unittest.TestCase):
 def fixture(self):
  return {'trace_3074':{'items':[
   {'pcba_sn':'PCBA-L3','defect_traces':[{'defect_key':'K-3028-3','trace_3074':{
    'candidate_material_history':[
      {'item_sn':'CBOARD-77','item_type':'Cboard','status':'CANDIDATE_HISTORY_AVAILABLE',
       'historical_pcbas':['OLDER-1','OLDER-2'],'temporal_reason':'unlinked_now_missing_unbind_time',
       'binding_operation':'A5150','bind_time_utc':'2026-10-28T14:00:00+00:00'},
      {'item_sn':'LCD-5','temporal_reason':'invalid_or_missing_binding_interval'}
    ]}}]},
   {'pcba_sn':'PCBA-L2','defect_traces':[{'defect_key':'K-3028-2','trace_3074':{
    'candidate_material_history':[{'item_sn':'FOREIGN-LINE'}]}}]}
  ]}}
 def test_only_exact_day_line_board_candidate_visible(self):
  records=_candidate_materials_from_trace(self.fixture(),[
    {'pcba_sn':'PCBA-L3','defect_key':'K-3028-3'}])
  self.assertEqual({row['item_sn'] for row in records},{'CBOARD-77','LCD-5'})
  c=next(x for x in records if x['item_sn']=='CBOARD-77')
  self.assertEqual(c['historical_pcbas'],['OLDER-1','OLDER-2'])
  self.assertEqual(c['scope'],'3028_EXACT_OCCURRENCE_CANDIDATE')
  self.assertFalse(c['proven_at_defect'])
  self.assertFalse(c['proven_reuse_at_defect'])
  self.assertEqual(c['binding_operation'],'A5150')
 def test_no_cross_occurrence_or_board_leak(self):
  records=_candidate_materials_from_trace(self.fixture(),[
    {'pcba_sn':'PCBA-L3','defect_key':'DIFFERENT-DEFECT'}])
  self.assertEqual(records,[])
 def test_legacy_no_key_is_pcba_only_not_causally_assigned(self):
  evidence={'trace_3074':{'items':[{'pcba_sn':'CURRENT',
    'defect_traces':[{'trace_3074':{'temporal_filter':{
      'time_unknown':[{'item_sn':'CBOARD-1'}],
      'boundary_ambiguous':[{'item_sn':'CAM-2'}]
    }}}]}]}}
  result=_candidate_materials_from_trace(evidence,[{'pcba_sn':'CURRENT','defect_key':'MES-1'}])
  self.assertEqual([x['item_sn'] for x in result],['CBOARD-1','CAM-2'])
  self.assertTrue(all(x['scope']=='PCBA_UNASSIGNED_CANDIDATE' for x in result))
  self.assertTrue(all(x['proven_reuse_at_defect'] is False for x in result))
 def test_bounded_no_data(self):
  self.assertEqual(_candidate_materials_from_trace({},[{'pcba_sn':'X'}]),[])
  self.assertEqual(len(_candidate_materials_from_trace(self.fixture(),[{'pcba_sn':'PCBA-L3','defect_key':'K-3028-3'}],max_rows=1)),1)

if __name__=='__main__':unittest.main(verbosity=2)
