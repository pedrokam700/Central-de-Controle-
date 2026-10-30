"""Regression: two 3028 failures on one PCBA must use distinct 3074 mounting cycles.
Synthetic data only; no MES, SQLite, network or user data.
"""
import pathlib
import sys
import tempfile
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'ames'/'factory-engine'))
from core.fluxo_3028_3074 import executar_fluxo

PCBA='PCBA-CURRENT'

def row(sn,typ,bind,unbind='',status='N',operation='A5150'):
    return {'Barcode':sn,'Sn Type':typ,'Bind Time':bind,'Unbind Time':unbind,
            'Iss Status':status,'Operation':operation,'Line Id':'TAN10102',
            'Product Model':'CPH2819BR'}

class Fake3074:
    def __init__(self):
        self.calls=[]
        self.current=[
            row('LCD-OLD','LCD','2026-10-19T11:00:00Z','2026-10-19T13:00:00Z'),
            row('BOARD-OLD','Cboard','2026-10-19T11:05:00Z','2026-10-19T13:00:00Z'),
            row('LCD-NEW','LCD','2026-10-19T14:00:00Z','2026-10-19T16:00:00Z'),
            row('BOARD-NEW','Cboard','2026-10-19T14:05:00Z','2026-10-19T16:00:00Z'),
            row('UNKNOWN-ENDED','Battery','2026-10-19T11:05:00Z','','N'),
        ]
        self.hist={
            'LCD-OLD':[row(PCBA,'PCBA','2026-10-19T11:00:00Z','2026-10-19T13:00:00Z')],
            'BOARD-OLD':[row(PCBA,'PCBA','2026-10-19T11:05:00Z','2026-10-19T13:00:00Z')],
            'LCD-NEW':[row(PCBA,'PCBA','2026-10-19T14:00:00Z','2026-10-19T16:00:00Z')],
            'BOARD-NEW':[row('PCBA-PREVIOUS','PCBA','2026-10-16T10:00:00Z','2026-10-16T12:00:00Z'),
                         row('PCBA-OTHER','PCBA','2026-10-17T10:00:00Z','2026-10-17T12:00:00Z'),
                         row(PCBA,'PCBA','2026-10-19T14:05:00Z','2026-10-19T16:00:00Z')],
        }
    def consultar(self,sn):
        self.calls.append(sn)
        if sn==PCBA:return {'rows':list(self.current)}
        if sn in self.hist:return {'rows':list(self.hist[sn])}
        raise AssertionError('Out-of-scope 3074 query: '+sn)

class TwoOccurrenceContracts(unittest.TestCase):
    def test_two_3028_defects_do_not_share_a_material_kit(self):
        records=[
          {'pcba_sn':PCBA,'line':'TAN10102','defect_code':'MOTOR','defect_desc':'Motor No vibration',
           'defect_time':'2026-10-19 09:30:00'}, # factory -03, 12:30Z
          {'pcba_sn':PCBA,'line':'TAN10102','defect_code':'MOTOR','defect_desc':'Motor No vibration',
           'defect_time':'2026-10-19 12:15:00'}, # factory -03, 15:15Z
        ]
        fake=Fake3074()
        with tempfile.TemporaryDirectory() as temp:
            source=pathlib.Path(temp)/'fixture-3028.json'
            source.write_text('synthetic-3028-fingerprint',encoding='utf-8')
            data=executar_fluxo(source,{'records':records,'records_count':2,'unique_pcba_count':1},
                                fake,max_pcbas=0,pause_s=0)
        self.assertEqual(data['processed_pcba_count'],1)
        trace=sorted(data['items'][0]['defect_traces'],key=lambda x:x['defect']['defect_time'])
        self.assertEqual(len(trace),2)
        self.assertNotEqual(trace[0]['defect_key'],trace[1]['defect_key'])
        selected=lambda t:{r['item_sn'] for r in t['trace_3074']['results']}
        self.assertEqual(selected(trace[0]),{'LCD-OLD','BOARD-OLD'})
        self.assertEqual(selected(trace[1]),{'LCD-NEW','BOARD-NEW'})
        for t in trace:
            self.assertEqual(t['trace_3074']['assembly_scope']['status'],'incomplete',
                'N without Unbind is unknown, not proof or zero')
        cboard=next(x for x in trace[1]['trace_3074']['results'] if x['item_sn']=='BOARD-NEW')
        self.assertEqual(set(cboard['previous_pcbas']),{'PCBA-PREVIOUS','PCBA-OTHER'})
        self.assertEqual(cboard['previous_pcba_count'],2)
        self.assertEqual(cboard['status'],'REUSO_MULTIPLO_ANTERIOR')
        self.assertEqual(fake.calls.count(PCBA),1)
        # Frozen CLEAN V3 flow still defers unknown bindings. The canonical
        # bridge audits these separately without changing confirmed KPIs.
        self.assertEqual(set(fake.calls[1:]),{'LCD-OLD','BOARD-OLD','LCD-NEW','BOARD-NEW'})
        self.assertEqual(trace[0]['trace_3074']['candidate_material_history'][0]['status'],
                         'CANDIDATE_QUERY_DEFERRED')

if __name__=='__main__':
    unittest.main(verbosity=2)
