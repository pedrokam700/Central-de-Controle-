"""P02 RED/GREEN: synthetic full relational graph, no operational roots/services."""
import hashlib
import json
import os
from pathlib import Path
import runpy
import sqlite3
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
TOOL=ROOT/'tools/ames-lab/synthetic_deidentify.py'
FIX=runpy.run_path(str(ROOT/'scripts/fixtures/p02_installation.py'))


def files(root):return {p.relative_to(root).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in root.rglob('*') if p.is_file()}


class SyntheticP02(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='p02-proof-',dir=os.environ.get('RUNNER_TEMP') or None)
        self.addCleanup(self.tmp.cleanup)
        self.workspace=Path(self.tmp.name).resolve()/'P02-SYNTHETIC-ONLY'

    def api(self):
        self.assertTrue(TOOL.is_file(),'RED: no reviewed deidentification path; SAFE_STATE_TRANSFER preserves operational identity')
        self.mod=runpy.run_path(str(TOOL));self.source=FIX['make_fixture'](self.workspace)
        self.db=self.source/'ames-agent/data/ames_local.sqlite3'
        return self.mod['prepare_synthetic']

    def db_change(self,sql,args=()):
        con=sqlite3.connect(self.db)
        try:con.execute(sql,args);con.commit()
        finally:con.close()
        FIX['seal'](self.workspace)

    def no_release(self):
        self.assertFalse(self.mod['verify_publication'](self.workspace))

    def test_01_separate_backup_lab_and_public_receipt(self):
        prepare=self.api();before=files(self.source);receipt=prepare(self.workspace)
        self.assertEqual(files(self.source),before)
        self.assertEqual(files(self.workspace/'private/master'),before)
        self.assertTrue(self.mod['verify_publication'](self.workspace))
        self.assertTrue(receipt['relations_verified']);self.assertFalse(receipt['real_data_authorized'])
        self.assertEqual(receipt['physical'],'PENDING')
        allowed={'schema','profile','relations_verified','source_unchanged','private_backup_sealed','real_data_authorized','physical'}
        self.assertEqual(set(receipt),allowed)

    def test_02_no_credential_identity_address_or_original_page_bytes(self):
        prepare=self.api();prepare(self.workspace)
        con=sqlite3.connect(self.db)
        try:old_source=con.execute("SELECT value FROM schema_meta WHERE key='ames_source_id'").fetchone()[0]
        finally:con.close()
        for p in (self.workspace/'published').rglob('*'):
            if not p.is_file():continue
            blob=p.read_bytes()
            for value in (old_source,'192.0.2.74','SYNTHETIC-SECRET-TOKEN-NEVER-REAL','SYNTHETIC-FIREBASE-AUTH','BRM-SYNTHETIC','Pessoa sintética','Autor sintético','SYNTHETIC-OWNER'):
                self.assertNotIn(value.encode(),blob)
            self.assertNotIn(p.name,{'local_agent_token','config.json','Preferences','storage.json','session.json'})

    def test_03_every_row_json_relation_and_revision_survives(self):
        prepare=self.api();prepare(self.workspace)
        ledger=json.loads((self.workspace/'private/transform-ledger.json').read_text())
        inverse={new:old for old,new in ledger['mapping'].items()}
        def undo(v,restore=False):
            if isinstance(v,dict):return {(inverse.get(k,k) if restore else k):undo(x,restore) for k,x in v.items()}
            if isinstance(v,list):return [undo(x,restore) for x in v]
            if isinstance(v,str):
                if restore and v in inverse:return inverse[v]
                try:
                    parsed=json.loads(v)
                    return undo(parsed,restore) if isinstance(parsed,(dict,list)) else v
                except (ValueError,TypeError):return v
            return v
        a=sqlite3.connect(self.db);b=sqlite3.connect(self.workspace/'published/lab/ames_local.sqlite3')
        try:
            tables=[r[0] for r in a.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]
            for table in tables:
                left=[undo(list(row)) for row in a.execute('SELECT * FROM "'+table+'" ORDER BY rowid')]
                right=[undo(list(row),True) for row in b.execute('SELECT * FROM "'+table+'" ORDER BY rowid')]
                self.assertEqual(left,right,table)
            self.assertEqual(b.execute('PRAGMA integrity_check').fetchone(),('ok',))
            self.assertEqual(b.execute('PRAGMA foreign_key_check').fetchall(),[])
        finally:a.close();b.close()

    def test_04_no_automatic_resume_or_existing_destination_overwrite(self):
        prepare=self.api();prepare(self.workspace);before=files(self.workspace)
        with self.assertRaises(self.mod['Refused']):prepare(self.workspace)
        self.assertEqual(files(self.workspace),before)

    def test_05_required_files_missing(self):
        prepare=self.api();(self.source/'browser/storage.json').unlink()
        with self.assertRaisesRegex(self.mod['Refused'],r'^INCOMPLETE_SOURCE$'):prepare(self.workspace)
        self.no_release()

    def test_06_hardlinks_and_links_refused(self):
        prepare=self.api();file=self.source/'ames-agent/config.json';alias=self.workspace/'ALIAS'
        os.link(file,alias)
        with self.assertRaisesRegex(self.mod['Refused'],r'^UNTRUSTED_LINK_OR_MEMBER$'):prepare(self.workspace)
        self.no_release()

    def test_07_unknown_metadata_file_even_if_manifested(self):
        prepare=self.api();(self.source/'unknown.json').write_text('{"credential":"SYNTHETIC"}');FIX['seal'](self.workspace)
        with self.assertRaisesRegex(self.mod['Refused'],r'^UNKNOWN_FILE_OR_CAPACITY$'):prepare(self.workspace)
        self.no_release()

    def test_08_unknown_database_schema(self):
        prepare=self.api();self.db_change('CREATE TABLE unexpected(secret TEXT)')
        with self.assertRaisesRegex(self.mod['Refused'],r'^UNREVIEWED_SCHEMA$'):prepare(self.workspace)
        self.no_release()

    def test_09_truncated_database(self):
        prepare=self.api();self.db.write_bytes(self.db.read_bytes()[:96])
        # Reseal bytes without trying to open this intentionally broken database.
        marker=json.loads((self.workspace/'SYNTHETIC_ONLY.json').read_text())
        marker['files']['ames-agent/data/ames_local.sqlite3']=hashlib.sha256(self.db.read_bytes()).hexdigest()
        (self.workspace/'SYNTHETIC_ONLY.json').write_text(json.dumps(marker))
        with self.assertRaisesRegex(self.mod['Refused'],r'^DATABASE_MATERIALIZATION_FAILED$'):prepare(self.workspace)
        self.no_release()

    def test_10_outbox_never_silently_dropped(self):
        prepare=self.api();p=self.source/'browser/storage.json';v=json.loads(p.read_text());v['outbox']=[{'payload':'SYNTHETIC-NEW-EVIDENCE'}];p.write_text(json.dumps(v));FIX['seal'](self.workspace)
        with self.assertRaisesRegex(self.mod['Refused'],r'^OUTBOX_NOT_PROVEN_EMPTY$'):prepare(self.workspace)
        self.no_release();self.assertIn('SYNTHETIC-NEW-EVIDENCE',p.read_text())

    def test_11_contradictory_source_or_checkpoint_revision(self):
        prepare=self.api();p=self.source/'ames-agent/data/checkpoint.json';v=json.loads(p.read_text());v['source_id']='OTHER-SYNTHETIC-SOURCE';p.write_text(json.dumps(v));FIX['seal'](self.workspace)
        with self.assertRaisesRegex(self.mod['Refused'],r'^CHECKPOINT_SOURCE_CONFLICT$'):prepare(self.workspace)
        self.no_release()

    def test_12_unknown_nested_json_never_assumed_safe(self):
        prepare=self.api();self.db_change("UPDATE pcba_history SET raw_json=? WHERE id=(SELECT min(id) FROM pcba_history)",(json.dumps({'unknown_private_metadata':{'url':'http://private.invalid','token':'SYNTHETIC'}}),))
        with self.assertRaisesRegex(self.mod['Refused'],r'^UNKNOWN_JSON_METADATA$'):prepare(self.workspace)
        self.no_release()

    def test_13_queued_jobs_and_monitor_cannot_be_imported(self):
        for state in ('monitor','queued','running'):
            with self.subTest(state=state):
                self.workspace=Path(self.tmp.name).resolve()/('P02-SYNTHETIC-'+state)
                prepare=self.api()
                if state=='monitor':self.db_change('UPDATE monitor_profiles SET enabled=1')
                else:self.db_change("INSERT INTO jobs(id,kind,status,created_at,config_json) VALUES(?,?,?,?,?)",('SYNTHETIC-PENDING','sn_lookup',state,'2026-11-03T10:00:00Z','{}'))
                with self.assertRaisesRegex(self.mod['Refused'],r'^ACTIVE_WORK_UNVERIFIED$'):prepare(self.workspace)
                self.no_release()

    def test_14_WAL_committed_included_uncommitted_excluded_origin_untouched(self):
        prepare=self.api();con=sqlite3.connect(self.db);con.execute('PRAGMA journal_mode=WAL');con.execute('PRAGMA wal_autocheckpoint=0')
        try:
            con.execute("INSERT INTO pcba_history(snapshot_id,pcba_sn,hist_seq,defect_code,defect_desc,raw_json) VALUES(1,'P1','9','HIST','Camera impurity','{}')");con.commit()
            FIX['seal'](self.workspace)
            con.execute("INSERT INTO pcba_history(snapshot_id,pcba_sn,hist_seq,defect_code,defect_desc,raw_json) VALUES(1,'P1','10','HIST','Camera impurity','{}')")
            # Copy of a frozen synthetic writer, NOT an attested real maintenance lease.
            marker=json.loads((self.workspace/'SYNTHETIC_ONLY.json').read_text());marker['files']=files(self.source);(self.workspace/'SYNTHETIC_ONLY.json').write_text(json.dumps(marker))
            before=files(self.source);prepare(self.workspace);self.assertEqual(before,files(self.source))
            out=sqlite3.connect(self.workspace/'published/lab/ames_local.sqlite3')
            try:self.assertEqual(out.execute("SELECT hist_seq FROM pcba_history WHERE hist_seq IN ('9','10')").fetchall(),[('9',)])
            finally:out.close()
        finally:con.rollback();con.close()

    def test_15_missing_declared_WAL_rejected(self):
        prepare=self.api();marker=json.loads((self.workspace/'SYNTHETIC_ONLY.json').read_text());marker['files']['ames-agent/data/ames_local.sqlite3-wal']='0'*64;(self.workspace/'SYNTHETIC_ONLY.json').write_text(json.dumps(marker))
        with self.assertRaisesRegex(self.mod['Refused'],r'^SOURCE_MANIFEST_MISMATCH$'):prepare(self.workspace)
        self.no_release()

    def test_16_interruption_preserves_backup_and_blocks_publication(self):
        prepare=self.api();before=files(self.source)
        reached=[]
        def fail(phase):
            reached.append(phase)
            if phase=='after_db':raise OSError('SYNTHETIC IO FAILURE')
        with patch.dict(prepare.__globals__,_phase=fail):
            with self.assertRaises(self.mod['Refused']):prepare(self.workspace)
        self.assertIn('after_db',reached)
        self.no_release();self.assertEqual(before,files(self.source));self.assertEqual(before,files(self.workspace/'private/master'))
        with self.assertRaises(self.mod['Refused']):prepare(self.workspace)

    def test_17_process_exit_after_backup_or_publish_is_not_success(self):
        prepare=self.api();before=files(self.source)
        code=f"import runpy,os; from pathlib import Path; m=runpy.run_path({str(TOOL)!r}); f=m['prepare_synthetic']; f.__globals__['_phase']=lambda phase:os._exit(86) if phase=='after_publish' else None; f(Path({str(self.workspace)!r}))"
        result=subprocess.run([sys.executable,'-B','-c',code],capture_output=True,text=True,timeout=20)
        self.assertEqual(result.returncode,86);self.no_release();self.assertEqual(before,files(self.source));self.assertEqual(before,files(self.workspace/'private/master'))

    def test_18_public_verifier_detects_tampering(self):
        prepare=self.api();prepare(self.workspace);file=self.workspace/'published/lab/checkpoint.json';file.write_text('{}')
        self.no_release()

    def test_19_no_new_relations_or_absence_converted_to_zero(self):
        prepare=self.api();prepare(self.workspace)
        a=sqlite3.connect(self.db);b=sqlite3.connect(self.workspace/'published/lab/ames_local.sqlite3')
        try:
            self.assertEqual(a.execute('SELECT hist_seq FROM pcba_history ORDER BY id').fetchall(),b.execute('SELECT hist_seq FROM pcba_history ORDER BY id').fetchall())
            self.assertIn(('0',),b.execute('SELECT hist_seq FROM pcba_history').fetchall())
            self.assertEqual(a.execute('SELECT previous_pcba_count,total_pcba_count_known_now FROM material_reuse ORDER BY id').fetchall(),b.execute('SELECT previous_pcba_count,total_pcba_count_known_now FROM material_reuse ORDER BY id').fetchall())
            self.assertEqual(a.execute('SELECT reference_event_time IS NULL,production_event_time IS NULL FROM process_defect_contexts ORDER BY snapshot_id,defect_key').fetchall(),b.execute('SELECT reference_event_time IS NULL,production_event_time IS NULL FROM process_defect_contexts ORDER BY snapshot_id,defect_key').fetchall())
            self.assertEqual(a.execute('SELECT count(*) FROM mes_revisions').fetchone(),b.execute('SELECT count(*) FROM mes_revisions').fetchone())
        finally:a.close();b.close()

    def test_20_renamed_real_installation_arguments_are_not_a_supported_mode(self):
        prepare=self.api();(self.workspace/'SYNTHETIC_ONLY.json').unlink();before=files(self.source)
        with self.assertRaisesRegex(self.mod['Refused'],r'^SYNTHETIC_PROVENANCE_REQUIRED$'):prepare(self.workspace)
        self.assertEqual(files(self.source),before);self.no_release()



    def test_21_symlink_member_refused(self):
        prepare=self.api();p=self.source/'ames-agent/config.json';other=self.workspace/'EXTERNAL';other.write_bytes(p.read_bytes());p.unlink();p.symlink_to(other)
        with self.assertRaisesRegex(self.mod['Refused'],r'^UNTRUSTED_LINK_OR_MEMBER$'):prepare(self.workspace)
        self.no_release()

    def test_22_new_source_write_never_rolled_back_over(self):
        prepare=self.api();p=self.source/'ames-agent/config.json';old=p.read_bytes()
        reached=[]
        def changed(phase):
            reached.append(phase)
            if phase=='after_backup':p.write_text('SYNTHETIC NEW DATA DO NOT OVERWRITE')
        with patch.dict(prepare.__globals__,_phase=changed):
            with self.assertRaisesRegex(self.mod['Refused'],r'^SOURCE_OR_MASTER_CHANGED$'):prepare(self.workspace)
        self.assertIn('after_backup',reached)
        self.no_release();self.assertEqual(p.read_text(),'SYNTHETIC NEW DATA DO NOT OVERWRITE')
        self.assertEqual((self.workspace/'private/master/ames-agent/config.json').read_bytes(),old)

    def test_23_exit_after_backup_preserves_master(self):
        prepare=self.api();before=files(self.source)
        code=f"import runpy,os; from pathlib import Path; m=runpy.run_path({str(TOOL)!r}); f=m['prepare_synthetic']; f.__globals__['_phase']=lambda phase:os._exit(86) if phase=='after_backup' else None; f(Path({str(self.workspace)!r}))"
        r=subprocess.run([sys.executable,'-B','-c',code],capture_output=True,text=True,timeout=20)
        self.assertEqual(r.returncode,86);self.no_release();self.assertEqual(before,files(self.source));self.assertEqual(before,files(self.workspace/'private/master'))

    def test_24_bad_WAL_checksum_is_not_silently_ignored(self):
        prepare=self.api();con=sqlite3.connect(self.db);con.execute('PRAGMA journal_mode=WAL');con.execute('PRAGMA wal_autocheckpoint=0')
        try:
            con.execute("UPDATE pcba_history SET hist_seq='9' WHERE id=(SELECT min(id) FROM pcba_history)");con.commit()
            p=Path(str(self.db)+'-wal');data=bytearray(p.read_bytes());data[-1]^=1;p.write_bytes(data)
            marker=json.loads((self.workspace/'SYNTHETIC_ONLY.json').read_text());marker['files']=files(self.source);(self.workspace/'SYNTHETIC_ONLY.json').write_text(json.dumps(marker))
            with self.assertRaisesRegex(self.mod['Refused'],r'^WAL_FRAME_CHECKSUM$'):prepare(self.workspace)
            self.no_release()
        finally:con.close()

    def test_25_checkpoint_scope_mismatch(self):
        prepare=self.api();p=self.source/'ames-agent/data/checkpoint.json';v=json.loads(p.read_text());v['revision']=999;p.write_text(json.dumps(v));FIX['seal'](self.workspace)
        with self.assertRaisesRegex(self.mod['Refused'],r'^CHECKPOINT_SCOPE_CONFLICT$'):prepare(self.workspace)
        self.no_release()

    def test_26_free_text_is_not_an_identity_escape(self):
        prepare=self.api();canary='SYNTHETIC-PERSON email private@example.invalid SN=PRIVATE-123456'
        self.db_change('UPDATE repair_history_3012 SET repair_comment=?',(canary,));prepare(self.workspace)
        for p in (self.workspace/'published').rglob('*'):
            if p.is_file():self.assertNotIn(canary.encode(),p.read_bytes())

    def test_27_unexpected_filesystem_metadata_refused(self):
        prepare=self.api();p=self.source/'ames-agent/config.json'
        if os.name=='nt':Path(str(p)+':private').write_text('SYNTHETIC ADS')
        else:os.setxattr(p,'user.p02-private',b'SYNTHETIC XATTR')
        with self.assertRaisesRegex(self.mod['Refused'],r'^(?:UNSUPPORTED_EXTENDED_METADATA|UNSUPPORTED_ALTERNATE_STREAM)$'):prepare(self.workspace)
        self.no_release()


    def test_28_unlisted_nested_READY_is_not_ignored(self):
        prepare=self.api();prepare(self.workspace)
        self.assertTrue(self.mod['verify_publication'](self.workspace))
        (self.workspace/'published/lab/READY.json').write_text('SYNTHETIC PRIVATE LEAK')
        self.no_release()

    def test_29_edited_READY_cannot_reseal_tampered_data(self):
        prepare=self.api();prepare(self.workspace)
        target=self.workspace/'published/lab/checkpoint.json';target.write_text('{"private":"SYNTHETIC LEAK"}')
        file=self.workspace/'published/READY.json';data=json.loads(file.read_text());data['files']['lab/checkpoint.json']=hashlib.sha256(target.read_bytes()).hexdigest();file.write_text(json.dumps(data))
        self.no_release()

    def test_30_late_contender_cannot_invalidate_completed_owner(self):
        prepare=self.api();globals_=prepare.__globals__;inventory=globals_['_inventory'];blocked=threading.Event();release=threading.Event();errors=[]
        waited=False
        def delayed(source):
            nonlocal waited
            value=inventory(source)
            if threading.current_thread().name=='p02-contender' and not waited:
                waited=True;blocked.set()
                if not release.wait(15):raise AssertionError('Race witness not released')
            return value
        def contender():
            try:prepare(self.workspace)
            except Exception as error:errors.append(error)
        with patch.dict(globals_,_inventory=delayed):
            thread=threading.Thread(target=contender,name='p02-contender');thread.start()
            try:
                self.assertTrue(blocked.wait(15));prepare(self.workspace);before=files(self.workspace)
            finally:release.set();thread.join(15)
        self.assertFalse(thread.is_alive());self.assertEqual(len(errors),1);self.assertIsInstance(errors[0],self.mod['Refused'])
        self.assertEqual(before,files(self.workspace));self.assertTrue(self.mod['verify_publication'](self.workspace))

    def test_31_date_suffix_cannot_carry_private_text(self):
        self.api();mapper=self.mod['Mapper']('SYNTHETIC-SOURCE')
        with self.assertRaisesRegex(self.mod['Refused'],r'^UNKNOWN_DATE_FORMAT$'):
            mapper.date('2026-11-03 09:00:00 SYNTHETIC-SECRET')

    def test_32_period_partial_and_completed_SN_history_survive(self):
        prepare=self.api()
        con=sqlite3.connect(self.db)
        try:
            con.execute("INSERT INTO analysis_windows(id,window_key,mode,start_at,end_at,requested_lines_json,created_at,updated_at) VALUES(10,'SYNTHETIC-WINDOW','today','2026-11-03T07:00:00-03:00','2026-11-04T07:00:00-03:00','[\"TAN10103\"]','2026-11-03T07:00:00Z','2026-11-03T07:00:00Z')")
            con.execute("UPDATE snapshots SET window_id=10,status='partial' WHERE id=1")
            con.execute("INSERT INTO jobs(id,kind,status,created_at,config_json,result_json) VALUES(?,?,?,?,?,?)",('SYNTHETIC-COMPLETED-SN','sn_lookup','done','2026-11-03T10:00:00Z',json.dumps({'sn':'P1'}),json.dumps({'query_sn':'P1','trace_2114':{'pcbas':[]}})))
            con.commit()
        finally:con.close()
        FIX['seal'](self.workspace);prepare(self.workspace)
        con=sqlite3.connect(self.workspace/'published/lab/ames_local.sqlite3')
        try:
            self.assertEqual(con.execute('SELECT status,window_id FROM snapshots WHERE id=1').fetchone(),('partial',10))
            self.assertEqual(con.execute('SELECT start_at,end_at FROM analysis_windows WHERE id=10').fetchone(),('2027-11-02T07:00:00-03:00','2027-11-03T07:00:00-03:00'))
            self.assertEqual(con.execute('SELECT kind,status FROM jobs').fetchone(),('sn_lookup','done'))
        finally:con.close()

    def test_33_forged_fixture_marker_does_not_admit_other_private_identity(self):
        prepare=self.api();(self.source/'ames-agent/data/local_agent_token').write_text('NOT-THE-KNOWN-SYNTHETIC-CREDENTIAL');FIX['seal'](self.workspace)
        with self.assertRaisesRegex(self.mod['Refused'],r'^FIXTURE_PROVENANCE_REQUIRED$'):prepare(self.workspace)
        self.no_release();self.assertFalse((self.workspace/'private').exists())

if __name__=='__main__':unittest.main()
