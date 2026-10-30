"""Real bridge summary, synthetic captures only; no MES connection."""
import copy
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'ames/agent'))
from engine_bridge import summarize_3074_capture

class CoverageTests(unittest.TestCase):
    def fixture(self):
        return dict(requested_pcba_count=1,processed_pcba_count=1,pcba_error_count=0,
            items=[dict(status='COMPLETE',defect_traces=[dict(trace_3074=dict(
                base_coverage=dict(status='returned',returned=1,reported_total=1)))])])

    def test_complete_is_extraction_not_reuse(self):
        result=summarize_3074_capture(self.fixture())
        self.assertEqual(result['source_status'],'COMPLETE')
        self.assertIsNone(result['coverage_diagnostic']['reuse_proven'])

    def test_base_page_partial_and_unknown_total_cannot_certify_complete(self):
        for coverage in [dict(status='incomplete_page',returned=1,reported_total=7),
                         dict(status='returned',returned=1,reported_total=None)]:
            value=self.fixture();value['items'][0]['defect_traces'][0]['trace_3074']['base_coverage']=coverage
            before=copy.deepcopy(value);r=summarize_3074_capture(value)
            self.assertEqual(r['source_status'],'PARTIAL');self.assertEqual(value,before)
            self.assertEqual(r['coverage_diagnostic']['partial_page_count'],1)

    def test_nested_material_page_and_counts_fail_closed(self):
        value=self.fixture()
        value['items'][0]['defect_traces'][0]['trace_3074']['results']=[dict(coverage=dict(status='incomplete_page',returned=2,reported_total=5))]
        self.assertEqual(summarize_3074_capture(value)['source_status'],'PARTIAL')
        for field,value in [('processed_pcba_count',0),('requested_pcba_count',2),('pcba_error_count',1),('requested_pcba_count',True)]:
            raw=self.fixture();raw[field]=value
            self.assertNotEqual(summarize_3074_capture(raw)['source_status'],'COMPLETE')

    def test_complete_label_without_page_evidence_remains_partial(self):
        raw=self.fixture();raw['items']=[{'status':'COMPLETE'}]
        result=summarize_3074_capture(raw)
        self.assertEqual(result['source_status'],'PARTIAL')
        self.assertEqual(result['coverage_diagnostic']['partial_pages'][0]['reason'],'pagination_evidence_missing')

if __name__=='__main__':unittest.main()
