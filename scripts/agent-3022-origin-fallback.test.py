"""Contract: derive 3022 reference shift only from a uniquely evidenced defect timestamp.

No MES, web, Firebase, or agent process is started by these tests.
"""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

BASE=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(BASE/"ames"/"agent"))
sys.path.insert(0,str(BASE/"ames"/"factory-engine"))
import production_shift
from ames import tela_3022

def make_result(rows_2114=None,rows_3012=None,rows_3028=None):
    history=rows_2114 if rows_2114 is not None else [
        {'Defect Hist Seq':'1','Defect Code':'CAM','Defect Description':'Camera impurity',
         'TestTools Auto Defect Or Defect By Hand':'Manual'}]
    return {'sn':'PCB','line':'TAN10103','product_model':'CPH2819BR',
            'trace_2114':{'pcbas':[{'pcba_sn':'PCB','status':'COMPLETE',
                                   'result':{'rows':history,'model':'CPH2819BR'}}],
                          'current_failure':dict(history[-1]),'previous_failures':[]},
            'trace_3022':{'pcbas':[{'pcba_sn':'PCB','status':'COMPLETE','result':{'rows':[{'Working Oper Code':'A5162'}]}}]},
            'trace_3012':{'rows':rows_3012 or []},
            'local_snapshot':{'defects_3028':rows_3028 or [],'process_contexts':[]}}

def fake_correlation(engine,events,record,**kwargs):
    assert record['product_model']=='CPH2819BR'
    assert record['pcba_sn']=='PCB'
    assert kwargs['registration_source']=='2114'
    assert kwargs['registration_value']=='Manual'
    assert record['defect_time']=='2026-10-19 10:30:00'
    return {'defect_time_utc':'2026-10-19T13:30:00+00:00',
            'reference_process':{'operation_code':'A5162','station':'A5162',
                                 'event_time_utc':'2026-10-19T12:45:00+00:00'},
            'reference_selection':{'status':'COMPLETE','prior_count':1},
            'registration_mode':'MANUAL','registration_mode_source':'2114',
            'reference_rule_id':'CAMERA_APPEARANCE_MANUAL_A5162',
            'failure_family':'CAMERA',
            'repair_cycle':{},'previous_process':{}}

class OriginTests(unittest.TestCase):
    def test_2114_missing_time_uses_exact_3012_defect_registration_not_repair_time(self):
        r=make_result(rows_3012=[{'pcba_sn':'PCB','defect_code':'CAM',
                                 'defect_time':'2026-10-19 10:30:00',
                                 'repair_time':'2026-10-20 16:10:00'}])
        with patch.object(tela_3022,'correlacionar_falha_3022',side_effect=fake_correlation):
            production_shift.correlate_sn(r,BASE/"ames"/"factory-engine")
        ctx=r['local_snapshot']['process_contexts']
        self.assertEqual(len(ctx),1)
        self.assertEqual(ctx[0]['defect_time_source'],'3012')
        self.assertEqual(ctx[0]['production_shift'],'1st Shift')
        self.assertEqual(ctx[0]['production_shift_source'],'3022')
        self.assertEqual(ctx[0]['production_event_time'],'2026-10-19T09:45:00-03:00')
        self.assertEqual(r['trace_2114']['current_failure']['Defect Time Source'],'3012')
    def test_same_code_two_3012_failure_instants_is_ambiguous_and_not_assigned(self):
        rows=[{'pcba_sn':'PCB','defect_code':'CAM','defect_time':t} for t in
              ('2026-10-19 10:30:00','2026-10-19 11:30:00')]
        r=make_result(rows_3012=rows)
        production_shift.correlate_sn(r,BASE/"ames"/"factory-engine")
        self.assertEqual(r['local_snapshot']['process_contexts'],[])
        self.assertNotIn('Defect Time',r['trace_2114']['current_failure'])
    def test_two_2114_same_code_without_timestamps_is_ambiguous(self):
        row={'Defect Code':'CAM','TestTools Auto Defect Or Defect By Hand':'Manual'}
        r=make_result(rows_2114=[{**row,'Defect Hist Seq':'0'},
                                 {**row,'Defect Hist Seq':'1'}],
                      rows_3012=[{'pcba_sn':'PCB','defect_code':'CAM',
                                  'defect_time':'2026-10-19 10:30:00'}])
        production_shift.correlate_sn(r,BASE/"ames"/"factory-engine")
        self.assertEqual(r['local_snapshot']['process_contexts'],[])
    def test_unique_local_3028_occurrence_is_valid_without_3012(self):
        r=make_result(rows_3028=[{'pcba_sn':'PCB','defect_code':'CAM',
                                   'defect_time':'2026-10-19 10:30:00'}])
        with patch.object(tela_3022,'correlacionar_falha_3022',side_effect=fake_correlation):
            production_shift.correlate_sn(r,BASE/"ames"/"factory-engine")
        self.assertEqual(r['local_snapshot']['process_contexts'][0]['defect_time_source'],'3028')
    def test_safeguard_shift_calendar(self):
        self.assertEqual(production_shift.classify('2026-10-20T23:10:00-03:00')['production_shift'],'2nd Shift')
        self.assertEqual(production_shift.classify('2026-10-21T03:10:00-03:00')['production_operational_date'],'2026-10-20')

if __name__=='__main__':unittest.main()
