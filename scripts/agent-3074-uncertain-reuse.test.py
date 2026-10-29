"""3074: uncertain material may have historical PCBA links, but never proven reuse.

Synthetic fixtures only; no MES/browser, user records, SQLite or network.
"""
import pathlib
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'ames'/'factory-engine'))
sys.path.insert(0,str(ROOT/'ames'/'agent'))
from core.varredura_3074 import executar_varredura
from core.fluxo_3028_3074 import executar_fluxo
from engine_bridge import enrich_deferred_3074_candidates

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
    def test_reverse_history_is_visible_as_candidate_not_false_second_use(self):
        fake=Fake3074(partial=False)
        trace=executar_varredura(fake,PCBA,DEFECT,query_memo={},pause_s=0,audit_uncertain=True)
        self.assertEqual([r['item_sn'] for r in trace['results']],['CAM-VALID'])
        self.assertEqual(trace['summary']['componentes_com_reuso_anterior'],1)
        cand=trace['candidate_material_history']
        self.assertEqual(len(cand),1)
        self.assertEqual(cand[0]['item_sn'],'CBOARD-UNCERTAIN')
        self.assertEqual(set(cand[0]['historical_pcbas']),{'OLDER-A','OLDER-B',PCBA})
        self.assertEqual(cand[0]['status'],'CANDIDATE_HISTORY_AVAILABLE')
        self.assertIsNone(cand[0]['previous_pcba_count'])
        self.assertFalse(cand[0]['proven_at_defect'])
        self.assertEqual(trace['base_coverage']['status'],'returned')

    def test_frozen_default_scans_only_selected_materials(self):
        fake=Fake3074(partial=False)
        trace=executar_varredura(fake,PCBA,DEFECT,query_memo={},pause_s=0)
        self.assertEqual(fake.calls,[PCBA,'CAM-VALID'])
        self.assertEqual(trace['candidate_material_history'][0]['status'],'CANDIDATE_QUERY_DEFERRED')
        self.assertEqual(trace['summary']['componentes_com_reuso_anterior'],1)

    def test_incomplete_pcba_grid_is_not_reported_as_zero(self):
        fake=Fake3074(partial=True)
        trace=executar_varredura(fake,PCBA,DEFECT,query_memo={},pause_s=0)
        self.assertEqual(trace['status'],'CONSULTA_PCBA_3074_PARCIAL_NAO_E_ZERO')
        self.assertEqual(trace['base_coverage']['status'],'incomplete_page')
        self.assertEqual(trace['summary']['componentes_com_reuso_anterior'],0)
        self.assertEqual(trace['candidate_material_history'][0]['status'],'CANDIDATE_QUERY_DEFERRED')
        self.assertEqual(fake.calls,[PCBA])

    def test_batch_default_reverse_audits_uncertain_history_without_promoting_reuse(self):
        with tempfile.TemporaryDirectory() as temp:
            source=pathlib.Path(temp)/'source-3028.txt'
            source.write_text('fixture',encoding='utf-8')
            records=[{'pcba_sn':PCBA,'line':'TAN10102','defect_code':'VIB',
                      'defect_desc':'Motor no vibration','defect_time':DEFECT}]
            parsed={'records':records,'records_count':1,'unique_pcba_count':1}
            fake=Fake3074()
            checkpoint=pathlib.Path(temp)/'checkpoint.json'
            first=executar_fluxo(source,parsed,fake,checkpoint_path=checkpoint,
                                 pause_s=0)
            before=first['items'][0]['defect_traces'][0]['trace_3074']
            self.assertEqual(before['candidate_material_history'][0]['status'],'CANDIDATE_QUERY_DEFERRED')
            self.assertEqual(fake.calls,[PCBA,'CAM-VALID'])
            restored=Fake3074()
            after=enrich_deferred_3074_candidates(
                first,restored,checkpoint_path=checkpoint,pause_s=0)
            trace=after['items'][0]['defect_traces'][0]['trace_3074']
            self.assertEqual(trace['candidate_material_history'][0]['status'],'CANDIDATE_HISTORY_AVAILABLE')
            self.assertEqual(set(trace['candidate_material_history'][0]['historical_pcbas']),
                             {'OLDER-A','OLDER-B',PCBA})
            self.assertEqual(trace['summary']['componentes_com_reuso_anterior'],1)
            self.assertFalse(trace['candidate_material_history'][0]['proven_at_defect'])
            self.assertEqual(restored.calls,['CBOARD-UNCERTAIN'],
                             'resume previously deferred evidence, never repeat completed scans')
            again=Fake3074()
            replay=executar_fluxo(source,parsed,again,checkpoint_path=checkpoint,pause_s=0)
            enrich_deferred_3074_candidates(replay,again,checkpoint_path=checkpoint,pause_s=0)
            self.assertEqual(again.calls,[], 'complete evidence remains resumable without MES queries')

    def test_bridge_limits_reverse_queries_to_eight_per_pcba(self):
        class ManyCandidates:
            def __init__(self):self.calls=[]
            def consultar(self,sn):
                self.calls.append(sn)
                if sn=='WIDE':
                    return {'rows':[row('M'+str(i),'Cboard','2026-10-28T12:00:00Z',None,'N')
                                    for i in range(10)],'store_total_count':10}
                return {'rows':[row('OLDER-'+sn,'PCBA','2026-10-20T10:00:00Z',
                                    '2026-10-20T11:00:00Z','N')], 'store_total_count':1}
        fake=ManyCandidates()
        trace=executar_varredura(fake,'WIDE',DEFECT,pause_s=0)
        defect={'defect_key':'D1','defect':{'defect_time':DEFECT},'trace_3074':trace}
        payload={'items':[{'pcba_sn':'WIDE','defect_traces':[defect]}]}
        enriched=enrich_deferred_3074_candidates(payload,fake,pause_s=0)
        statuses=[c['status'] for c in trace['candidate_material_history']]
        self.assertEqual(statuses.count('CANDIDATE_HISTORY_AVAILABLE'),8)
        self.assertEqual(statuses.count('CANDIDATE_QUERY_DEFERRED'),2)
        self.assertEqual(len(fake.calls),9,'one base query and eight bounded reverse lookups')
        self.assertEqual(enriched['candidate_reverse_audit']['confirmed_reuse_added'],0)
        self.assertEqual(trace['summary']['componentes_com_reuso_anterior'],0)

if __name__=='__main__':
    unittest.main(verbosity=2)
