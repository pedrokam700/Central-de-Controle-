import unittest
from reports.relatorio_v013 import _build_views, _build_indicators

class V013ViewsTests(unittest.TestCase):
    def sample(self):
        trace={
          'items':[{'pcba_sn':'CUR','status':'COMPLETE','base_query':{'rows':[
              {'Barcode':'CUR','Sn Type':'PCBA','Aut Cmf1':'PCBA','Aut Cmf7':'S1','Bind Time':'2026-10-01 10:00:00+00:00','Unbind Time':'2026-10-01 12:00:00+00:00','Iss Status':'N','Operation':'A5150'},
              {'Barcode':'CUR','Sn Type':'PCBA','Aut Cmf1':'PCBA','Aut Cmf7':'S2','Bind Time':'2026-10-02 10:00:00+00:00','Unbind Time':'2026-10-03 20:00:00+00:00','Iss Status':'N','Operation':'A5150'},
          ]},'defect_traces':[{'status':'COMPLETE','defect':{'line':'L3','product_model':'CPH','defect_time':'2026-10-03 10:00:00','defect_code':'GN01-TX02','defect_desc':'Antenna: ANT1 test failed','repair_comment':'','defect_reason_type':'CS','defect_reason_desc':'Proc'},'trace_3074':{'summary':{'active_at_defect':1,'componentes_com_reuso_anterior':1},'results':[{'item_sn':'MAT','item_type':'Screen','status':'SEGUNDO_USO_NO_MOMENTO_DA_FALHA','previous_pcba_count':1,'previous_pcbas':['OLD'],'pcbas_until_defect':['OLD','CUR'],'current_pcba_confirmed':True,'total_pcba_count_known_now':2,'reuse_count_known_now':1,'inactive_now_pcbas':['OLD','CUR'],'active_now_pcbas':[],'all_pcba_history':[]} ]}}]}]
        }
        r2114={'pcbas':[
          {'pcba_sn':'CUR','status':'COMPLETE','result':{'rows':[
            {'Defect Hist Seq':'0','Defect Code':'GN01-TX02','Defect Description':'Antenna: ANT1 test failed','Repair Status':'Y','Defect Type':'MainBoard','TestTools Auto Defect Or Defect By Hand':'Manual'},
            {'Defect Hist Seq':'1','Defect Code':'GN01-TX08','Defect Description':'Antenna: ANT7 test failed','Repair Status':'Y','Defect Type':'MainBoard','TestTools Auto Defect Or Defect By Hand':'Manual'},
          ]}},
          {'pcba_sn':'OLD','status':'COMPLETE','result':{'rows':[{'Defect Hist Seq':'0','Defect Code':'GN11-WX02','Defect Description':'Wireless connection: GPS/WIFI failed','Repair Status':'Y','Defect Type':'MainBoard','TestTools Auto Defect Or Defect By Hand':'Manual'}]}}
        ]}
        return trace,r2114
    def test_views_and_family(self):
        t,r=self.sample(); v=_build_views(t,r); self.assertEqual(len(v['analise_rows']),1); self.assertEqual(len(v['hist_pcba_rows']),2); self.assertTrue(v['hist_pcba_rows'][0]['Ciclos montagem PCBA 3074']); self.assertEqual(len(v['hist_material_rows']),1)
        self.assertEqual(v['analise_rows'][0]['Usos conhecidos da PCBA'],2)
        self.assertEqual(v['hist_material_rows'][0]['Relação com falha atual'],'MESMA FAMÍLIA')
        ind=_build_indicators(v); self.assertEqual(next(x[1] for x in ind['kpis'] if x[0]=='PCBA em 2º uso'),1)

if __name__=='__main__': unittest.main()
