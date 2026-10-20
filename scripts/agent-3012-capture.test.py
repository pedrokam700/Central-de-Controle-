"""3012 capture regression: versioned rows, job scopes, restart, partials."""
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"ames"/"agent"))
from store import Store
import repair_3012, repair_3012_capture as capture

def row(comment="first",key="R1"):
    return {"row_key":key,"pcba_sn":"PCBA1","defect_code":"D1",
            "defect_time":"2026-10-16 09:00:00","repair_comment":comment,
            "raw":{"proof":comment}}

class CaptureTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.db=Store(Path(self.tmp.name)/"live.db")
        self.db.initialize()
        repair_3012.ensure_schema(self.db)
        self.q={"sns":["PCBA1"],"start_at":"2026-10-16T00:00:00",
                "end_at":"2026-10-17T00:00:00"}
    def tearDown(self): self.tmp.cleanup()
    def begin(self,j,scope=None):
        capture.begin(self.db,j,"repair_query_exact",self.q,scope or self.q)
    def ingest(self,r,j=None,q=None):
        return repair_3012.ingest(self.db,{"rows":[r],"query":q or self.q,
          "source":repair_3012.TRUSTED_COVERAGE_SOURCE},job_id=j)
    def test_changed_row_keeps_prior_job_and_versions_after_restart(self):
        self.begin("old")
        self.ingest(row(), "old")
        capture.finish(self.db,"old",[row()],"live",{})
        self.begin("new", {**self.q,"start_at":"2026-10-18T00:00:00"})
        self.ingest(row("changed"),"new")
        capture.finish(self.db,"new",[row("changed")],"live",{})
        old=capture.read(self.db,"old")
        new=capture.read(Store(self.db.path),"new")
        self.assertEqual(old["rows"][0]["fields"]["repair_comment"],"first")
        self.assertEqual(new["rows"][0]["fields"]["repair_comment"],"changed")
        self.assertEqual([old["rows"][0]["revision"],new["rows"][0]["revision"]],[1,2])
        self.assertNotEqual(old["scope_hash"],new["scope_hash"])
        self.assertFalse(new["source_complete"])
        self.assertFalse(new["population_complete"])
    def test_same_row_repeated_does_not_duplicate(self):
        self.begin("job")
        self.ingest(row(),"job")
        self.ingest(row(),"job")
        capture.finish(self.db,"job",[row(),row()],"cache",{})
        with self.db.connect() as con:
            self.assertEqual(con.execute("SELECT COUNT(*) FROM repair_row_versions_3012").fetchone()[0],1)
            self.assertEqual(con.execute("SELECT COUNT(*) FROM repair_query_rows_3012").fetchone()[0],1)
    def test_partial_error_keeps_previous_rows(self):
        self.begin("partial")
        self.ingest(row(),"partial")
        capture.fail(self.db,"partial")
        self.assertEqual(capture.read(self.db,"partial")["status"],"partial")
        with self.assertRaises(ValueError):
            capture.finish(self.db,"partial",[row()],"live")
    def test_same_job_different_scope_is_rejected(self):
        self.begin("same")
        with self.assertRaises(ValueError):
            capture.begin(self.db,"same","repair_query_exact",
                          {"sns":["ANOTHER"]},{"sns":["ANOTHER"]})
    def test_filters_are_not_population_coverage(self):
        self.begin("filtered", {**self.q,"line":"TAN10103"})
        self.ingest(row(),"filtered",{**self.q,"line":"TAN10103"})
        self.assertEqual(repair_3012.coverage(self.db,"PCBA1"),[])
        capture.finish(self.db,"filtered",[row()],"live",{})
        self.assertEqual(capture.read(self.db,"filtered")["scope"]["line"],"TAN10103")
    def test_empty_capture_is_not_zero_defects(self):
        self.begin("empty")
        capture.finish(self.db,"empty",[],"cache",{"covered":0})
        rec=capture.read(self.db,"empty")
        self.assertEqual(rec["row_count"],0)
        self.assertFalse(rec["source_complete"])
        self.assertFalse(rec["population_complete"])
    def test_legacy_before_update_and_no_production_attachment(self):
        self.ingest(row("legacy"))
        self.begin("later")
        self.ingest(row("new"),"later")
        with self.db.connect() as con:
            vals=[x[0] for x in con.execute("SELECT revision FROM repair_row_versions_3012 ORDER BY revision")]
            cols=[x[1] for x in con.execute("PRAGMA table_info(repair_query_runs_3012)")]
        self.assertEqual(vals,[1,2])
        self.assertNotIn("snapshot_id",cols)
if __name__=="__main__":unittest.main()
