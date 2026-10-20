"""B3.4b4: conservative 3012 history proof never mutates factory occurrence.

PR #36's exact PCBA/defect-code/defect-time principle is respected,
but no generic same-PCBA candidate gets promoted to confirmed repair.
"""
import pathlib,sys,tempfile,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'ames'/'agent'))
from store import Store
import canonical,repair_association

LINE='TAN10103'
DEFECT={'pcba_sn':'BOARD-01','defect_code':'D01','defect_time':'2026-10-16 09:50:00'}

class RepairAssociationTests(unittest.TestCase):
 def test_exact_factory_time_and_utc_match_still_not_repair_proof(self):
  x=repair_association.classify_3012_for_occurrence(DEFECT,{
     'row_key':'3012-X','pcba_sn':'BOARD-01','defect_code':'D01',
     'defect_time':'2026-10-16T12:50:00Z','repair_time':'2026-10-16T13:10:00Z'})
  self.assertEqual(x['association'],'exact_identity_candidate')
  self.assertEqual(x['occurrence_match'],'candidate')
  self.assertEqual(x['identity_basis'],['pcba_sn','defect_code','defect_instant'])
  self.assertFalse(x['repair_confirmed'])
  self.assertEqual(x['temporal_relation'],'after_occurrence')
  self.assertEqual(x['raw_ref'],'sqlite:3012:3012-X')

 def test_wrong_pcba_code_instant_or_prior_repair_are_not_current_repair(self):
  rows=[
   ({'pcba_sn':'OTHER','defect_code':'D01','defect_time':'2026-10-16T12:50:00Z'},'unrelated'),
   ({'pcba_sn':'BOARD-01','defect_code':'D02','defect_time':'2026-10-16T12:50:00Z'},'distinct_occurrence_candidate'),
   ({'pcba_sn':'BOARD-01','defect_code':'D01','defect_time':'2026-10-16T10:10:00-03:00'},'distinct_occurrence_candidate'),
   ({'pcba_sn':'BOARD-01','defect_code':'D01','defect_time':'2026-10-16T12:50:00Z','repair_time':'2026-10-15T13:10:00Z'},'distinct_occurrence_candidate'),
  ]
  for repair,status in rows:
   with self.subTest(repair=repair):
    x=repair_association.classify_3012_for_occurrence(DEFECT,repair)
    self.assertEqual(x['association'],status)
    self.assertFalse(x['candidate_for_occurrence'])
    self.assertFalse(x['repair_confirmed'])

 def test_unknown_times_and_missing_code_preserved_not_proven(self):
  for tm in ('2026-10-16','nonsense',None):
   x=repair_association.classify_3012_for_occurrence(DEFECT,{
      'pcba_sn':'BOARD-01','defect_code':None,'defect_time':tm})
   self.assertEqual(x['association'],'same_pcba_candidate')
   self.assertNotIn('defect_instant',x['identity_basis'])
   self.assertTrue(x['candidate_for_occurrence'])
   self.assertFalse(x['repair_confirmed'])

 def test_integrated_versioning_keeps_other_occurrences_separate(self):
  with tempfile.TemporaryDirectory() as d:
   store=Store(pathlib.Path(d)/'original.sqlite');store.initialize()
   w=store.ensure_window('previous_day','2026-10-16T07:00-03:00','2026-10-17T07:00-03:00',None,[LINE])
   sid=store.create_snapshot(window_id=w,source_kind='3028_live')
   store.ingest_defects(sid,[{'line':LINE,'pcba_sn':'BOARD-01','defect_code':'D01',
      'defect_time':'2026-10-16 09:50:00','product_model':'CPH2859V'}])
   original=canonical.export_revision(store,sid,LINE)
   self.assertEqual(original['projection_version'],canonical.PROJECTION_VERSION)
   with store.connect() as db:
    db.execute('''CREATE TABLE IF NOT EXISTS repair_history_3012(
      row_key TEXT PRIMARY KEY,pcba_sn TEXT,defect_code TEXT,defect_time TEXT,repair_time TEXT)''')
    canonical.install_evidence_triggers(db)
    db.execute("INSERT INTO repair_history_3012 VALUES(?,?,?,?,?)",
      ('R-SAME','BOARD-01','D01','2026-10-16T12:50:00Z','2026-10-16T13:00:00Z'))
    db.execute("INSERT INTO repair_history_3012 VALUES(?,?,?,?,?)",
      ('R-OTHER','BOARD-01','D02','2026-10-16T13:15:00Z','2026-10-16T13:30:00Z'))
   new=canonical.export_revision(store,sid,LINE)
   self.assertEqual(new['snapshot_revision'],2)
   rows={x['row_key']:x for x in new['datasets']['defects'][0]['repair_evidence_3012']}
   self.assertEqual(rows['R-SAME']['association'],'exact_identity_candidate')
   self.assertEqual(rows['R-OTHER']['association'],'distinct_occurrence_candidate')
   self.assertFalse(rows['R-OTHER']['candidate_for_occurrence'])
   self.assertFalse(rows['R-SAME']['repair_confirmed'])
   self.assertEqual(new['source_coverage']['3012']['stored_rows'],1)
   self.assertEqual(new['source_coverage']['3012']['source_complete'],False)
   self.assertEqual(canonical.read_revision(store,sid,LINE,1),original)
   self.assertEqual(original['datasets']['defects'][0]['defect_code'],'D01')
   self.assertEqual(original['summary']['period'],new['summary']['period'])

if __name__=='__main__':unittest.main()
