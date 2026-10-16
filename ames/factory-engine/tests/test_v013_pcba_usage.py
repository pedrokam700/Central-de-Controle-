import unittest
from core.uso_pcba import reconstruir_usos_pcba

class V013PcbaUsageTests(unittest.TestCase):
    def test_seis_ciclos_e_sexto_uso(self):
        sn='P1'; rows=[]
        data=[
            ('2026-02-24 18:40:56+00:00','2026-02-25 01:35:46+00:00',''),
            ('2026-02-25 13:20:41+00:00','2026-02-25 21:45:06+00:00',''),
            ('2026-02-26 21:47:53+00:00','2026-02-26 23:32:25+00:00',''),
            ('2026-04-15 12:01:56+00:00','2026-04-16 04:24:01+00:00',''),
            ('2026-09-15 01:46:20+00:00','2026-09-15 14:13:03+00:00','sess5'),
            ('2026-10-02 22:58:34+00:00','2026-10-05 13:52:19+00:00','sess6'),
        ]
        for b,u,s in data:
            for op in ('A5150','A5202','A5160'):
                rows.append({'Barcode':sn,'Sn Type':'PCBA','Aut Cmf1':'PCBA','Aut Cmf7':s,'Bind Time':b,'Unbind Time':u,'Operation':op,'Iss Status':'N'})
        r=reconstruir_usos_pcba(rows,sn,'2026-10-05 09:07:54')
        self.assertEqual(r['known_use_count'],6)
        self.assertEqual(r['use_index_at_defect'],6)
        self.assertEqual(r['reuses_before_defect'],5)

if __name__=='__main__': unittest.main()
