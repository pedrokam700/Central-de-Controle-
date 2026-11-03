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

class AggregateStageTests(unittest.TestCase):
    def test_3074_source_status_is_authoritative_not_absent_raw_status(self):
        # Compile only the two pure helpers: importing agent_entry would launch
        # agent services and is strictly forbidden in this offline test.
        import ast
        filename=Path(__file__).resolve().parents[1]/'ames/agent/agent_entry.py'
        tree=ast.parse(filename.read_text(encoding='utf-8'))
        nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and
               n.name in ('_source_stage','_aggregate_stage')]
        ns={}
        exec(compile(ast.Module(body=nodes,type_ignores=[]),str(filename),'exec'),ns)
        aggregate=ns['_aggregate_stage']
        fixture=lambda status: {'TAN10103': {'3074': {'source_status': status,
                    'coverage_diagnostic': {'source_complete': status=='COMPLETE'}}}}
        self.assertEqual(aggregate(fixture('COMPLETE'),'3074'),'done')
        self.assertEqual(aggregate(fixture('PARTIAL'),'3074'),'partial')
        self.assertEqual(aggregate(fixture('ERROR'),'3074'),'error')
        self.assertEqual(aggregate({'TAN10103':{'3074':{}}},'3074'),'partial')

if __name__=='__main__':unittest.main()
