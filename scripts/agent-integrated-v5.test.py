import sys, tempfile, unittest, json
from datetime import datetime
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'ames/agent'))
from store import Store
import canonical, process_r11, production_shift, repair_3012, ames_3012_live, local_sn, network_watch

class IntegratedTests(unittest.TestCase):
 def test_shift_boundaries_timezone_and_missing_source(self):
  for stamp,shift,day in [('2026-10-13T07:29:59-03:00','2nd Shift','2026-10-12'),('2026-10-13T07:30:00-03:00','1st Shift','2026-10-13'),('2026-10-13T17:29:59-03:00','1st Shift','2026-10-13'),('2026-10-13T17:30:00-03:00','2nd Shift','2026-10-13'),('2026-10-13T06:00:00Z','2nd Shift','2026-10-12')]:
   out=production_shift.classify(stamp);self.assertEqual(out['production_shift'],shift);self.assertEqual(out['production_operational_date'],day);self.assertEqual(out['production_shift_source'],'3022')
  self.assertIsNone(production_shift.classify(None)['production_shift'])
  self.assertIsNone(production_shift.classify('bad','2026-10-13T10:30Z')['production_shift'])
 def test_migration_persistence_revision_repair_and_offline(self):
  with tempfile.TemporaryDirectory() as tmp:
   store=Store(Path(tmp)/'data.db');store.initialize();process_r11.ensure_schema(store);process_r11.ensure_schema(store)
   sid=store.create_snapshot(window_id=None,source_kind='synthetic')
   store.ingest_defects(sid,[{'line':'TAN10101','product_model':'CPH2819','pcba_sn':'TEST-PCBA','defect_code':'D1','defect_time':'2026-10-13T11:00:00-03:00'}])
   with store.connect() as con:rec=dict(con.execute('SELECT * FROM defect_observations').fetchone())
   ctx=process_r11._context_from_correlation(rec,{'reference_process':{'operation_code':'A5162','event_time_utc':'2026-10-13T06:00:00Z'},'reference_selection':{}})
   process_r11._persist_contexts(store,sid,[ctx])
   first=canonical.export_revision(store,sid,'TAN10101');self.assertEqual(first['datasets']['defects'][0]['production_shift'],'2nd Shift');self.assertEqual(first['datasets']['defects'][0]['production_operational_date'],'2026-10-12')
   repair=ames_3012_live.normalize_3012_row({'lotId':'TEST-PCBA','productId':'PRODUCT-ID','defectCode':'D2','defectTime':'2026-10-12 10:00','repairUser':'TEST-USER','repairComment':'Synthetic repair'})
   repair_3012.ingest(store,{'query':{'sns':['TEST-PCBA']},'rows':[repair]})
   second=canonical.export_revision(store,sid,'TAN10101');r=second['datasets']['defects'][0];self.assertEqual(r['defect_code'],'D1');self.assertEqual(r['repair_evidence_3012'][0]['defect_code'],'D2');self.assertEqual(r['repair_evidence_3012'][0]['product_id'],'PRODUCT-ID');self.assertGreater(second['snapshot_revision'],first['snapshot_revision'])
   with store.connect() as con:con.execute("INSERT INTO jobs(id,kind,status,created_at,finished_at,config_json,result_json) VALUES(?,?,?,?,?,?,?)",('test','sn_lookup','done','2026-10-13','2026-10-13',json.dumps({'sn':'TEST-PCBA'}),json.dumps({'query_sn':'TEST-PCBA','trace_2114':{'pcbas':[{'pcba_sn':'OLD-PCBA','result':{'rows':[{'Defect Code':'OLD','Defect Time':'2026-10-12'}]}}]}})))
   offline=local_sn.lookup(store,'TEST-PCBA');self.assertTrue(offline['offline']);self.assertEqual(offline['repair_3012'][0]['repair_user'],'TEST-USER');self.assertTrue(any(r['pcba_sn']=='OLD-PCBA' for r in offline['pcba_history']))
 def test_3012_exact_sn_coverage_returns_only_missing_ranges(self):
  with tempfile.TemporaryDirectory() as tmp:
   store=Store(Path(tmp)/'coverage.db');store.initialize();repair_3012.ensure_schema(store)
   repair_3012.ingest(store,{'source':repair_3012.TRUSTED_COVERAGE_SOURCE,'query':{'sns':['PCBA-1'],'start_at':'2026-01-01T00:00:00','end_at':'2026-03-31T23:59:59'},'rows':[]})
   gaps=repair_3012.missing_windows(store,'PCBA-1',datetime.fromisoformat('2026-01-01T00:00:00'),datetime.fromisoformat('2026-06-30T23:59:59'))
   self.assertEqual(len(gaps),1);self.assertEqual(gaps[0][0].isoformat(timespec='seconds'),'2026-04-01T00:00:00');self.assertEqual(gaps[0][1].isoformat(timespec='seconds'),'2026-06-30T23:59:59')
   repair_3012.ingest(store,{'source':repair_3012.TRUSTED_COVERAGE_SOURCE,'query':{'sns':['PCBA-1'],'start_at':'2026-04-01T00:00:00','end_at':'2026-06-30T23:59:59'},'rows':[]})
   self.assertEqual(repair_3012.missing_windows(store,'PCBA-1',datetime.fromisoformat('2026-01-01T00:00:00'),datetime.fromisoformat('2026-06-30T23:59:59')),[])
   self.assertEqual(repair_3012.stats(store)['coverage_sns'],1)
 def test_guardian_cannot_repair_ethernet_when_wifi_missing(self):
  with self.assertRaises(ValueError):network_watch.repair_host_route('8.8.8.8')
  with patch.object(network_watch.os,'name','nt'),patch.object(network_watch,'route_state',return_value={}),patch.object(network_watch,'is_admin',return_value=True),patch.object(network_watch,'wlan_state',return_value={'connected':False,'ssid':None}),patch.object(network_watch,'_powershell') as command:
   result=network_watch.repair_host_route();self.assertFalse(result['ok']);command.assert_not_called()
 def test_3012_divergence_retained(self):
  a=ames_3012_live.normalize_3012_row({'lotId':'P','defectCode':'D','defectDesc':'one'})
  b=ames_3012_live.normalize_3012_row({'lotId':'P','defectCode':'D','defectDesc':'two'})
  self.assertNotEqual(a['row_key'],b['row_key']);self.assertEqual(a['raw']['defectDesc'],'one')
if __name__=='__main__':unittest.main()