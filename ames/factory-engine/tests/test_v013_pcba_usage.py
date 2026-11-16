import unittest
from core.uso_pcba import reconstruir_usos_pcba

class V013PcbaUsageTests(unittest.TestCase):
    def test_unbound_pcba_self_batches_with_prod_time_prove_observed_second_use(self):
        pcba = '00252700692435F300201173'
        rows = [
            {'Barcode': pcba, 'Sn Type': 'PCBA', 'Batch Id': 'OCT',
             'Prod Time': '2026-10-15 09:00:00', 'Iss Status': 'N'},
            {'Barcode': pcba, 'Sn Type': 'PCBA', 'Batch Id': 'NOV',
             'Prod Time': '2026-11-03 09:00:00', 'Iss Status': 'N'},
            {'Barcode': pcba, 'Sn Type': 'PCBA', 'Batch Id': 'NOV',
             'Prod Time': '2026-11-03 09:05:00', 'Iss Status': 'N', 'Operation': 'A5150'},
            # A component row in another batch can NEVER increment the board's use.
            {'Barcode': 'LCD-1', 'Sn Type': 'Screen', 'Batch Id': 'NOV',
             'Prod Time': '2026-11-03 09:03:00', 'Iss Status': 'N'},
        ]
        result = reconstruir_usos_pcba(rows, pcba, '2026-11-04 10:00:00')
        self.assertEqual(result['known_use_count'], 2)
        self.assertEqual(result['use_index_at_defect'], 2)
        self.assertEqual(result['use_time_basis'], 'pcba_batch_prod')
        self.assertFalse(any(c['active_now'] for c in result['cycles']))

    def test_later_prod_time_is_not_retroactive_use_proof(self):
        rows = [{'Barcode': 'P1', 'Sn Type': 'PCBA', 'Batch Id': 'FUTURE',
                 'Prod Time': '2026-11-05 09:00:00', 'Iss Status': 'N'}]
        result = reconstruir_usos_pcba(rows, 'P1', '2026-11-04 10:00:00')
        self.assertEqual(result['known_use_count'], 1)
        self.assertIsNone(result['use_index_at_defect'])

    def test_no_pcba_self_batch_does_not_infer_use_from_material_or_2114(self):
        rows = [{'Barcode': 'LCD-1', 'Sn Type': 'Screen', 'Batch Id': 'NOV',
                 'Prod Time': '2026-11-03 09:00:00', 'Iss Status': 'N'},
                {'Barcode': 'P1', 'Sn Type': 'PCBA', 'Prod Time': '2026-11-03 09:00:00',
                 'Iss Status': 'N'}]
        result = reconstruir_usos_pcba(rows, 'P1', '2026-11-04 10:00:00')
        self.assertEqual(result['known_use_count'], 0)
        self.assertIsNone(result['use_index_at_defect'])

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
