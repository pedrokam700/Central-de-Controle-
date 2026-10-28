"""3074: uncertain material may have historical PCBA links, but never proven reuse.

Synthetic fixtures only; no MES/browser, user records, SQLite or network.
"""
import pathlib
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'ames'/'factory-engine'))
from core.fluxo_3028_3074 import executar_fluxo

PCBA='CURRENT-BOARD'
DEFECT='2026-10-28 10:00:00'

def row(sn,typ,bind,unbind=None,status='N'):
    return {'Barcode':sn,'Sn Type':typ,'Bind Time':bind,'Unbind Time':unbind,
            'Iss Status':status,'Operation':'A5150','Line Id':'TAN10102'}

class Fake3074:
    def __init__(self,partial=False):
        self.partial=partial
        self.calls=[]
    def consultar(self,sn):
        self.calls.append(sn)
        if sn==PCBA:
            rows=[row('CBOARD-UNCERTAIN','Cboard','2026-10-28T12:00:00Z',None,'N')]
            if not self.partial:
                rows.append(row('CAM-VALID','Front Camera','2026-10-28T12:15:00Z',None,'Y'))
            return {'rows':rows,'store_total_count':2}
        if sn=='CBOARD-UNCERTAIN':
            return {'rows':[
              row('OLDER-A','PCBA','2026-10-23T09:00:00Z','2026-10-23T11:00:00Z','N'),
              row('OLDER-B','PCBA','2026-10-25T09:00:00Z','2026-10-25T11:00:00Z','N'),
              row(PCBA,'PCBA','2026-10-28T12:00:00Z',None,'N')], 'store_total_count':3}
        if sn=='CAM-VALID':
            return {'rows':[row('OTHER','PCBA','2026-10-22T09:00:00Z','2026-10-22T11:00:00Z','N'),
                            row(PCBA,'PCBA','2026-10-28T12:15:00Z',None,'Y')], 'store_total_count':2}
        raise AssertionError('Unknown source request '+sn)

class Tests(unittest.TestCase):
    def run_flow(self,source,collector,checkpoint,audit_uncertain=False):
        records=[{'pcba_sn':PCBA,'defect_time':DEFECT,'defect_code':'VIBRATION',
                  'defect_desc':'Motor No Vibration','line':'TAN10102'}]
        return executar_fluxo(source,{'records':records,'records_count':1,'unique_pcba_count':1},
                              collector,max_pcbas=0,checkpoint_path=checkpoint,pause_s=0,
                              audit_uncertain=audit_uncertain)

    def test_reverse_history_is_visible_as_candidate_not_false_second_use(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp)
            source=root/'3028.json';source.write_text('FIXTURE-3028',encoding='utf-8')
            result=self.run_flow(source,Fake3074(partial=False),root/'checkpoint.json',audit_uncertain=True)
        self.assertEqual(result['items'][0]['status'],'COMPLETE')
        trace=result['items'][0]['defect_traces'][0]['trace_3074']
        self.assertEqual([r['item_sn'] for r in trace['results']],['CAM-VALID'])
        self.assertEqual(trace['summary']['componentes_com_reuso_anterior'],1)
        cand=trace['candidate_material_history']
        self.assertEqual(len(cand),1)
        self.assertEqual(cand[0]['item_sn'],'CBOARD-UNCERTAIN')
        self.assertEqual(set(cand[0]['historical_pcbas']),{'OLDER-A','OLDER-B',PCBA})
        self.assertEqual(cand[0]['status'],'CANDIDATE_HISTORY_AVAILABLE')
        self.assertIsNone(cand[0]['previous_pcba_count'])
        self.assertFalse(cand[0]['proven_at_defect'])

    def test_incomplete_pcba_grid_never_becomes_zero_and_retries_checkpoint(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp)
            source=root/'3028.json';source.write_text('FIXTURE-3028',encoding='utf-8')
            checkpoint=root/'checkpoint.json'
            partial=Fake3074(partial=True)
            first=self.run_flow(source,partial,checkpoint)
            self.assertEqual(first['items'][0]['status'],'PARTIAL')
            trace=first['items'][0]['defect_traces'][0]['trace_3074']
            self.assertEqual(trace['status'],'CONSULTA_PCBA_3074_PARCIAL_NAO_E_ZERO')
            self.assertEqual(trace['base_coverage']['status'],'incomplete_page')
            complete=Fake3074(partial=False)
            final=self.run_flow(source,complete,checkpoint)
            self.assertEqual(final['items'][0]['status'],'COMPLETE')
            self.assertEqual(final['processed_pcba_count'],1)
            self.assertGreaterEqual(complete.calls.count(PCBA),1)
            recovered=final['items'][0]['defect_traces'][0]['trace_3074']
            self.assertEqual(recovered['summary']['componentes_com_reuso_anterior'],1)

if __name__=='__main__':
    unittest.main(verbosity=2)
