"""P08/G6 synthetic captures: never sacrifice current evidence for older code."""
import hashlib
import json
import os
from pathlib import Path
import runpy
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1];TOOL=ROOT/'tools/ames-lab/generation_reconcile.py'
FIX=runpy.run_path(str(ROOT/'scripts/fixtures/p08_generations.py'));DB=FIX['DB']


class P08(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='p08-',dir=os.environ.get('RUNNER_TEMP') or None);self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name).resolve()/'P08-SYNTHETIC-ONLY'

    def api(self,tech=False):
        self.assertTrue(TOOL.is_file(),'RED: no independent C0/A/B reconciliation contract; updater excludes DB but does not prove old-reader compatibility')
        self.m=runpy.run_path(str(TOOL));FIX['make'](self.root,technical=tech)
        return self.m['reconcile']

    def before(self):return {role:FIX['hashes'](self.root/role) for role in ('C0','A','B')}
    def change(self,sql,args=(),role='B'):
        c=sqlite3.connect(self.root/role/DB)
        try:c.execute(sql,args);c.commit()
        finally:c.close()
        FIX['seal'](self.root)

    def json_change(self,name,key,value,role='B'):
        p=self.root/role/name;data=json.loads(p.read_text(encoding='utf-8'));data[key]=value;FIX['write'](p,data);FIX['seal'](self.root)

    def stop(self,fn,reason):
        before=self.before();result=fn(self.root)
        self.assertEqual(result['decision'],'R2');self.assertEqual(result['reason'],reason)
        self.assertIs(result['start_allowed'],False);self.assertEqual(before,self.before())
        self.assertFalse(self.m['verify_target'](self.root))
        return result

    def test_01_R0_no_execution_no_restore(self):
        f=self.api();before=self.before();r=f(self.root)
        self.assertEqual(r['decision'],'R0');self.assertEqual(r['reason'],'NO_CANDIDATE_EXECUTION')
        self.assertEqual(before,self.before());self.assertFalse((self.root/'return-target').exists())

    def test_02_R1_new_passive_target_has_CURRENT_B_data(self):
        f=self.api(True);before=self.before();r=f(self.root)
        self.assertEqual(r['decision'],'R1');self.assertTrue(self.m['verify_target'](self.root));self.assertEqual(before,self.before())
        self.assertEqual((self.root/'return-target'/DB).read_bytes(),(self.root/'B'/DB).read_bytes())
        self.assertNotEqual((self.root/'return-target'/DB).read_bytes(),(self.root/'A'/DB).read_bytes())
        meta=json.loads((self.root/'return-target/LAB_ONLY.json').read_text())
        self.assertEqual(meta['data_generation'],'SYNTHETIC-B');self.assertEqual(meta['software_generation'],'SYNTHETIC-A')
        self.assertIs(meta['start_allowed'],False)

    def test_03_new_failure_is_R2_not_rollback(self):
        f=self.api(True);self.change("UPDATE defect_observations SET defect_desc='SYNTHETIC NEW FAILURE' WHERE id=1");self.stop(f,'NEW_OR_CHANGED_DATABASE')
    def test_04_new_technician_comment_is_preserved(self):
        f=self.api(True);self.change("UPDATE repair_history_3012 SET repair_comment='SYNTHETIC NEW COMMENT',repair_user='BRM-NEW'");self.stop(f,'NEW_OR_CHANGED_DATABASE')
    def test_05_new_material_binding(self):
        f=self.api(True);self.change("UPDATE material_reuse SET previous_pcba_count=99 WHERE id=1");self.stop(f,'NEW_OR_CHANGED_DATABASE')
    def test_06_checkpoint_newer(self):
        f=self.api(True);self.json_change('ames-agent/data/checkpoint.json','query_sn','SYNTHETIC-NEW-BOARD');self.stop(f,'EXTERNAL_STATE_CHANGED')
    def test_07_pending_jobs(self):
        f=self.api(True);self.change("INSERT INTO jobs(id,kind,status,created_at,config_json) VALUES('SYNTHETIC-JOB','sn_lookup','queued','2026-11-18','{}')");self.stop(f,'WORK_PENDING')
    def test_08_pending_browser_outbox(self):
        f=self.api(True);self.json_change('browser/storage.json','outbox',[{'synthetic':'NEW'}]);self.stop(f,'OUTBOX_UNVERIFIED')
    def test_09_unknown_sync_is_not_zero(self):
        f=self.api(True);self.json_change('sync.json','complete',None);self.stop(f,'SYNC_UNVERIFIED')
    def test_10_source_id_conflict(self):
        f=self.api(True);self.change("UPDATE schema_meta SET value='SYNTHETIC-OTHER-SOURCE' WHERE key='ames_source_id'");self.stop(f,'SOURCE_CONFLICT')
    def test_11_line_scope_changed(self):
        f=self.api(True);self.change("UPDATE defect_observations SET line='TAN10102' WHERE id=1");self.stop(f,'NEW_OR_CHANGED_DATABASE')
    def test_12_period_snapshot_changed(self):
        f=self.api(True);self.change("UPDATE snapshots SET collected_at='2026-11-18T10:00:00Z' WHERE id=1");self.stop(f,'NEW_OR_CHANGED_DATABASE')
    def test_13_unknown_schema(self):
        f=self.api(True);self.change('CREATE TABLE unreviewed(value TEXT)');self.stop(f,'SCHEMA_INCOMPATIBLE')
    def test_14_corrupt_database(self):
        f=self.api();p=self.root/'B'/DB;p.write_bytes(p.read_bytes()[:96]);FIX['seal'](self.root);self.stop(f,'DATABASE_UNVERIFIED')
    def test_15_missing_member(self):
        f=self.api();(self.root/'B/browser/storage.json').unlink();FIX['seal'](self.root);self.stop(f,'INCOMPLETE_GENERATION')
    def test_16_hash_mismatch(self):
        f=self.api();(self.root/'B/logs/agent.log').write_bytes(b'SYNTHETIC-NEW');self.stop(f,'GENERATION_HASH_MISMATCH')
    def test_17_existing_destination_never_overwritten(self):
        f=self.api(True);p=self.root/'return-target';p.mkdir();(p/'NEWER').write_bytes(b'SYNTHETIC NEWER DATA')
        self.stop(f,'DESTINATION_EXISTS');self.assertEqual((p/'NEWER').read_bytes(),b'SYNTHETIC NEWER DATA')
    def test_18_execution_false_with_new_state_is_R2(self):
        f=self.api();self.change("UPDATE pcba_history SET defect_desc='SYNTHETIC NEW' WHERE id=1");self.stop(f,'UNEXECUTED_STATE_CHANGED')
    def test_19_A_drift_from_C0_never_lost(self):
        f=self.api(True);self.change("UPDATE pcba_history SET defect_desc='SYNTHETIC A ADVANCED' WHERE id=1",role='A');self.stop(f,'C0_A_DIVERGENCE')
    def test_20_unknown_execution_proof(self):
        f=self.api(True);self.json_change('execution.json','completed',None);self.stop(f,'EXECUTION_UNVERIFIED')
    def test_21_false_technical_claim_is_not_accepted(self):
        f=self.api();self.json_change('execution.json','entered',True);self.json_change('execution.json','steps',['INDEX_AUDIT_V1']);self.stop(f,'TECHNICAL_REPLAY_MISMATCH')
    def test_22_unknown_config_delta(self):
        f=self.api(True);self.json_change('ames-agent/config.json','port',9999);self.stop(f,'EXTERNAL_STATE_CHANGED')
    def test_23_canonical_conflicting_revision(self):
        f=self.api(True);self.change("UPDATE mes_revisions SET content_hash='SYNTHETIC-CONFLICT' WHERE rowid=1");self.stop(f,'REVISION_CONFLICT')
    def test_24_unknown_old_reader(self):
        f=self.api(True);self.json_change('software.json','canonical_reader_sha256','0'*64,role='A');self.stop(f,'SOFTWARE_INCOMPATIBLE')
    def test_25_hist_seq_zero_unknown_and_all_rows_survive_R1(self):
        f=self.api(True);r=f(self.root);self.assertEqual(r['decision'],'R1')
        a=sqlite3.connect(self.root/'B'/DB);b=sqlite3.connect(self.root/'return-target'/DB)
        try:
            for table, in a.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"):
                self.assertEqual(a.execute('SELECT * FROM "'+table+'" ORDER BY rowid').fetchall(),b.execute('SELECT * FROM "'+table+'" ORDER BY rowid').fetchall(),table)
            self.assertTrue(any(str(x[0])=='0' for x in b.execute('SELECT hist_seq FROM pcba_history')))
        finally:a.close();b.close()
    def test_26_reentry_cannot_replay_or_overwrite(self):
        f=self.api(True);f(self.root);before=FIX['hashes'](self.root);r=f(self.root)
        self.assertEqual(r['reason'],'PENDING_OR_EXISTING_ATTEMPT');self.assertEqual(before,FIX['hashes'](self.root))
    def test_27_target_corruption_not_verified(self):
        f=self.api(True);f(self.root);(self.root/'return-target'/DB).write_bytes(b'SYNTHETIC CORRUPT')
        self.assertFalse(self.m['verify_target'](self.root))
    def test_28_source_new_data_after_preparation_invalidates_current_claim(self):
        f=self.api(True);f(self.root);self.change("UPDATE pcba_history SET defect_desc='SYNTHETIC AFTER RETURN' WHERE id=1")
        self.assertFalse(self.m['verify_target'](self.root))
    def test_29_outbox_unknown_not_empty(self):
        f=self.api(True);self.json_change('browser/storage.json','outbox',None);self.stop(f,'OUTBOX_UNVERIFIED')
    def test_30_unknown_external_file_not_ignored(self):
        f=self.api();(self.root/'B/UNKNOWN.json').write_text('{"synthetic":"NEW"}');FIX['seal'](self.root);self.stop(f,'UNKNOWN_MEMBER')
    def test_31_hardlink_refused(self):
        f=self.api();p=self.root/'B/logs/agent.log';os.link(p,self.root/'B/logs/shared.log');FIX['seal'](self.root);self.stop(f,'UNTRUSTED_LINK_OR_MEMBER')
    def test_32_interruption_during_capture_preserves_sources(self):
        f=self.api(True);before=self.before();reached=[]
        def fail(phase):
            if phase=='after_capture':reached.append(phase);raise OSError('SYNTHETIC IO')
        with patch.dict(f.__globals__,_phase=fail):r=f(self.root)
        self.assertEqual(reached,['after_capture']);self.assertEqual(r['decision'],'R2');self.assertEqual(before,self.before())
        self.assertFalse(self.m['verify_target'](self.root))
    def test_33_abrupt_exit_then_explicit_recover_finalizes_complete_passive_target(self):
        f=self.api(True);before=self.before()
        code="import os,runpy,sys; m=runpy.run_path(sys.argv[1]); m['reconcile'].__globals__['_phase']=lambda p:os._exit(86) if p=='after_target' else None; m['reconcile'](sys.argv[2])"
        r=subprocess.run([sys.executable,'-B','-c',code,str(TOOL),str(self.root)],capture_output=True,text=True)
        self.assertEqual(r.returncode,86,r.stderr);self.assertFalse(self.m['verify_target'](self.root))
        result=self.m['recover'](self.root);self.assertEqual(result['decision'],'R1');self.assertTrue(self.m['verify_target'](self.root));self.assertEqual(before,self.before())
    def test_34_abrupt_exit_before_target_requires_STOP_not_restore(self):
        f=self.api(True);before=self.before()
        code="import os,runpy,sys; m=runpy.run_path(sys.argv[1]); m['reconcile'].__globals__['_phase']=lambda p:os._exit(86) if p=='after_capture' else None; m['reconcile'](sys.argv[2])"
        r=subprocess.run([sys.executable,'-B','-c',code,str(TOOL),str(self.root)],capture_output=True,text=True)
        self.assertEqual(r.returncode,86,r.stderr);result=self.m['recover'](self.root)
        self.assertEqual(result['decision'],'R2');self.assertEqual(before,self.before());self.assertFalse((self.root/'return-target').exists())
    def test_35_public_receipt_has_no_private_identity(self):
        f=self.api(True);r=f(self.root);text=json.dumps(r)
        for secret in ('ba063416','BRM-SYNTHETIC','192.0.2.74','SYNTHETIC-SECRET-TOKEN','Pessoa sintética'):self.assertNotIn(secret,text)
        self.assertFalse(r['start_allowed']);self.assertEqual(r['physical'],'PENDING')


    def test_36_WAL_new_commit_and_uncommitted_frames_preserved_without_restore(self):
        f=self.api(True)
        code="""import json,os,sqlite3,sys
c=sqlite3.connect(sys.argv[1]);c.execute('PRAGMA journal_mode=WAL');c.execute('PRAGMA wal_autocheckpoint=0')
c.execute("INSERT INTO pcba_history(snapshot_id,pcba_sn,hist_seq,defect_code,defect_desc,raw_json) VALUES(1,'P1','9','HIST','SYNTHETIC NEW','{}')");c.commit()
c.execute('PRAGMA cache_size=1');c.execute('PRAGMA cache_spill=ON')
c.execute("INSERT INTO pcba_history(snapshot_id,pcba_sn,hist_seq,defect_code,defect_desc,raw_json) VALUES(1,'P1','10','HIST','SYNTHETIC UNCOMMITTED',?)",(json.dumps({'notes':'SYNTHETIC'*200000}),))
os._exit(86)
"""
        result=subprocess.run([sys.executable,'-B','-c',code,str(self.root/'B'/DB)],capture_output=True,text=True)
        self.assertEqual(result.returncode,86,result.stderr);FIX['seal'](self.root)
        before=self.before();r=f(self.root);self.assertEqual(r['reason'],'WAL_REQUIRES_SUPERVISED_REVIEW');self.assertEqual(before,self.before())
        c=sqlite3.connect(self.root/'.p08-private/work/B/logical.sqlite3')
        try:self.assertEqual(c.execute("SELECT hist_seq FROM pcba_history WHERE hist_seq IN ('9','10')").fetchall(),[('9',)])
        finally:c.close()

    def test_37_corrupt_WAL_is_not_silently_ignored(self):
        f=self.api(True)
        code="import os,sqlite3,sys;c=sqlite3.connect(sys.argv[1]);c.execute('PRAGMA journal_mode=WAL');c.execute(\"UPDATE pcba_history SET defect_desc='SYNTHETIC NEW' WHERE id=1\");c.commit();os._exit(86)"
        r=subprocess.run([sys.executable,'-B','-c',code,str(self.root/'B'/DB)],capture_output=True,text=True);self.assertEqual(r.returncode,86,r.stderr)
        p=Path(str(self.root/'B'/DB)+'-wal');data=bytearray(p.read_bytes());data[-1]^=1;p.write_bytes(data);FIX['seal'](self.root)
        self.stop(f,'WAL_UNVERIFIED')

    def test_38_IO_mid_target_does_not_finalize_or_retry(self):
        f=self.api(True);reached=[];before=self.before()
        def fail(phase):
            if phase=='target_member':reached.append(phase);raise OSError('SYNTHETIC IO')
        with patch.dict(f.__globals__,_phase=fail):r=f(self.root)
        self.assertEqual(reached,['target_member']);self.assertEqual(r['decision'],'R2');self.assertEqual(before,self.before())
        result=self.m['recover'](self.root);self.assertEqual(result['decision'],'R2');self.assertFalse(self.m['verify_target'](self.root))

    def test_39_new_B_data_after_crash_blocks_finalization(self):
        f=self.api(True)
        code="import os,runpy,sys;m=runpy.run_path(sys.argv[1]);m['reconcile'].__globals__['_phase']=lambda p:os._exit(86) if p=='after_target' else None;m['reconcile'](sys.argv[2])"
        r=subprocess.run([sys.executable,'-B','-c',code,str(TOOL),str(self.root)],capture_output=True,text=True);self.assertEqual(r.returncode,86,r.stderr)
        self.change("UPDATE pcba_history SET defect_desc='SYNTHETIC NEW AFTER CRASH' WHERE id=1");before=self.before()
        result=self.m['recover'](self.root);self.assertEqual(result['reason'],'SOURCE_CHANGED');self.assertEqual(before,self.before())
        self.assertFalse(self.m['verify_target'](self.root))

    def test_40_duplicate_observations_are_not_deduplicated_to_hide_delta(self):
        f=self.api(True)
        self.change("INSERT INTO process_events(snapshot_id,pcba_sn,station,operation_code,event_time,source,raw_json) SELECT snapshot_id,pcba_sn,station,operation_code,event_time,source,raw_json FROM process_events LIMIT 1")
        self.stop(f,'NEW_OR_CHANGED_DATABASE')
        c=sqlite3.connect(self.root/'B'/DB)
        try:self.assertEqual(c.execute('SELECT COUNT(*) FROM process_events').fetchone()[0],9)
        finally:c.close()

    def test_41_generation_parent_mismatch(self):
        f=self.api();p=self.root/'B/generation.json';m=json.loads(p.read_text());m['parent_generation']='SYNTHETIC-C0';FIX['write'](p,m)
        marker=self.root/'SYNTHETIC_ONLY.json';d=json.loads(marker.read_text());d['generations']['B']=hashlib.sha256(p.read_bytes()).hexdigest();FIX['write'](marker,d)
        self.stop(f,'GENERATION_IDENTITY_CONFLICT')

    def test_42_revision_payload_identity_conflict(self):
        f=self.api(True);c=sqlite3.connect(self.root/'B'/DB)
        try:
            rowid,body=c.execute('SELECT rowid,payload FROM mes_revisions LIMIT 1').fetchone();body=json.loads(body);body['line_id']='TAN10101'
            c.execute('UPDATE mes_revisions SET payload=? WHERE rowid=?',(json.dumps(body),rowid));c.commit()
        finally:c.close()
        FIX['seal'](self.root);self.stop(f,'REVISION_CONFLICT')

    def test_43_unexplained_physical_DB_change_is_not_technical_proof(self):
        f=self.api(True);self.change('PRAGMA user_version=999');self.stop(f,'TECHNICAL_REPLAY_MISMATCH')

if __name__=='__main__':unittest.main()
