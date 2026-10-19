"""Restore all existing history journals using only disposable SQLite files."""
import pathlib, shutil, sys, tempfile, unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'ames'/'agent'))
from store import Store
import canonical, source_capture, repair_3012, repair_3012_capture as repairs

class RestoreHistory(unittest.TestCase):
    def test_backup_restore_preserves_five_sources_identity_and_late_revisions(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp);db=Store(root/'original.sqlite');db.initialize();repair_3012.ensure_schema(db)
            line='TAN10101';window=db.ensure_window('previous_day','2026-10-16T07:00-03:00','2026-10-17T07:00-03:00',None,[line])
            sid=db.create_snapshot(window_id=window,source_kind='synthetic')
            db.ingest_defects(sid,[{'line':line,'pcba_sn':'P','product_model':'CPH2859','defect_code':'D','defect_time':'2026-10-16T09:00-03:00'}])
            original=canonical.export_revision(db,sid,line);target={k:original[k] for k in ('source_id','snapshot_id','snapshot_revision','content_hash')};target['period']=original['summary']['period']
            db.save_snapshot_payload(sid,'3028_live_raw',{'fpy':97,'records':['original']})
            for view in ('3074','2114','3022'):
                source_capture.capture_source(db,target=target,line=line,job_id='J',view=view,result={'evidence':view},status='partial')
            q={'sns':['P'],'start_at':'2026-10-16T00:00:00','end_at':'2026-10-17T00:00:00'}
            row={'row_key':'R','pcba_sn':'P','defect_code':'D','defect_time':'2026-10-16 09:00:00','repair_comment':'original'}
            repairs.begin(db,'AT1','repair_query_exact',q,q)
            repair_3012.ingest(db,{'rows':[row],'query':q,'source':repair_3012.TRUSTED_COVERAGE_SOURCE},job_id='AT1')
            repairs.finish(db,'AT1',[row],'live',{})
            before=repairs.read(db,'AT1');index=source_capture.capture_index(db,sid,line)
            backup=db.backup(root/'backups',reason='isolated_test')
            restored_path=root/'restored.sqlite';shutil.copy2(backup['path'],restored_path)
            restored=Store(restored_path);restored.initialize()
            with restored.connect() as con:self.assertEqual(con.execute('PRAGMA integrity_check').fetchone()[0],'ok')
            self.assertEqual(canonical.source_id(restored),original['source_id'])
            self.assertEqual(canonical.read_revision(restored,sid,line,1),original)
            self.assertEqual(source_capture.capture_index(restored,sid,line),index)
            self.assertEqual(repairs.read(restored,'AT1'),before)
            restored.save_snapshot_payload(sid,'3028_live_raw',{'partial':True})
            self.assertEqual(restored.get_snapshot_payload_revision(sid,'3028_live_raw',1)['fpy'],97)
            repairs.begin(restored,'AT2','repair_query_exact',q,q)
            late={**row,'repair_comment':'late'}
            repair_3012.ingest(restored,{'rows':[late],'query':q,'source':repair_3012.TRUSTED_COVERAGE_SOURCE},job_id='AT2')
            repairs.finish(restored,'AT2',[late],'live',{})
            self.assertEqual(repairs.read(restored,'AT1'),before)
            self.assertEqual(canonical.read_revision(restored,sid,line,1),original)
            self.assertEqual(db.get_snapshot_payload(sid,['3028_live_raw'])['fpy'],97)
            self.assertFalse(repairs.read(restored,'AT2')['population_complete'])
if __name__=='__main__':unittest.main()
