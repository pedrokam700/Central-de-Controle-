"""D01/D02: disposable synthetic trees, injected I/O/crash; no launcher/builder/MES."""
import ast
import hashlib
import json
from pathlib import Path
import shutil
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'ames/agent'))
import update_candidate as u
HELPER='suporte/ames-workstation/ISSUE57_RELAUNCH_ENROLLMENT.ps1'

class Interrupted(BaseException):pass

class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.base=Path(self.tmp.name);self.pkg=self.base/'LAB-installed';self.target=self.pkg/'ames-agent'
        self.src=self.base/'LAB-candidate'/'ames-agent';self.target.mkdir(parents=True);self.src.mkdir(parents=True)
        self.paths=['ames-agent/'+n for n in (*u.FILES,'config.json')]+list(dict.fromkeys((*u.ROOT_FILES,HELPER,*u.OPTIONAL_ROOT_FILES)))
        for name in u.FILES:
            (self.target/name).write_text('LAB-old '+name);(self.src/name).write_text('LAB-new '+name)
        for name in u.HASHES:shutil.copy2(ROOT/'ames/agent'/name,self.target/name)
        for rel in dict.fromkeys((*u.ROOT_FILES,HELPER)):
            self.write(self.pkg/rel,'LAB-old '+rel);self.write(self.src.parent/rel,'LAB-new '+rel)
        self.write(self.target/'config.json',json.dumps({'port':8765,'allowed_origins':['https://lab.invalid']}))
        (self.src/'candidate-files.json').write_text(json.dumps({n:self.hash(self.src/n) for n in u.FILES}))
        self.data=self.target/'data';self.data.mkdir()
        with sqlite3.connect(self.data/'ames_local.sqlite3') as con:
            con.execute('CREATE TABLE evidence(id INTEGER PRIMARY KEY, value TEXT)');con.execute("INSERT INTO evidence(value) VALUES('LAB-before')")
        self.write(self.data/'checkpoint.json','LAB-checkpoint');self.write(self.data/'local_agent_token','LAB-only-token')
        self.socket=patch.object(u.socket,'create_connection',side_effect=OSError);self.socket.start();self.addCleanup(self.socket.stop)

    def write(self,path,text):path.parent.mkdir(parents=True,exist_ok=True);path.write_text(text)
    def hash(self,path):return hashlib.sha256(path.read_bytes()).hexdigest()
    def generation(self):return {p:(self.pkg/p).read_bytes() if (self.pkg/p).is_file() else None for p in self.paths}
    def data_state(self):
        with sqlite3.connect(self.data/'ames_local.sqlite3') as con:rows=con.execute('SELECT * FROM evidence').fetchall()
        return rows,(self.data/'checkpoint.json').read_bytes(),(self.data/'local_agent_token').read_bytes()
    def newer(self):
        with sqlite3.connect(self.data/'ames_local.sqlite3') as con:con.execute("INSERT INTO evidence(value) VALUES('LAB-NEW')")
        self.write(self.data/'checkpoint.json','LAB-NEW-checkpoint')
    def saved_and_current(self):
        saved=u.backup(self.target)
        for rel in self.paths:
            if rel=='ames-agent/config.json':continue
            self.write(self.pkg/rel,'LAB-current '+rel)
        self.newer();return saved,self.generation(),self.data_state()
    def reject_unchanged(self,saved):
        before=self.generation();data=self.data_state()
        with self.assertRaises((ValueError,RuntimeError,OSError)):u.rollback(self.target,saved)
        self.assertEqual(self.generation(),before,'RED: preflight changed destination generation')
        self.assertEqual(self.data_state(),data)
    def assert_blocked(self):
        marker=self.pkg/'.ames-update'
        self.assertTrue(marker.is_dir() and any(marker.iterdir()),'RED: missing persistent restart barrier')
        with self.assertRaises((RuntimeError,ValueError)):u.update(self.target,self.src)
    def copy_fault(self,relative,repeat=False):
        original=shutil.copy2;hits=[];wanted=self.pkg/relative
        def fail(src,dst,*args,**kwargs):
            dst=Path(dst)
            if dst.parent==wanted.parent and (dst.name==wanted.name or dst.name.startswith('.'+wanted.name+'.')):
                hits.append(str(dst))
                if repeat or len(hits)==1:raise OSError('LAB injected copy failure')
            return original(src,dst,*args,**kwargs)
        return patch.object(u.shutil,'copy2',side_effect=fail),hits

    def test_missing_middle_agent_member_must_not_change_any_destination(self):
        saved,_,_=self.saved_and_current();(saved/'ames-agent'/u.FILES[len(u.FILES)//2]).unlink();self.reject_unchanged(saved)
    def test_missing_root_member_must_not_change_any_destination(self):
        saved,_,_=self.saved_and_current();(saved/'root'/u.ROOT_FILES[-1]).unlink();self.reject_unchanged(saved)
    def test_corrupt_agent_member_must_be_rejected_before_copy(self):
        saved,_,_=self.saved_and_current();self.write(saved/'ames-agent'/u.FILES[3],'LAB CORRUPTED');self.reject_unchanged(saved)
    def test_corrupt_root_member_must_be_rejected_before_copy(self):
        saved,_,_=self.saved_and_current();self.write(saved/'root'/u.ROOT_FILES[-1],'LAB CORRUPTED');self.reject_unchanged(saved)
    def test_agent_copy_IO_failure_recovers_current_generation_and_new_data(self):
        saved,before,data=self.saved_and_current();fault,hits=self.copy_fault('ames-agent/'+u.FILES[3])
        with fault,self.assertRaises((OSError,RuntimeError)):u.rollback(self.target,saved)
        self.assertTrue(hits);self.assertEqual(self.generation(),before,'RED agent copy: mixed generation');self.assertEqual(self.data_state(),data)
    def test_root_copy_IO_failure_recovers_current_generation_and_new_data(self):
        saved,before,data=self.saved_and_current();fault,hits=self.copy_fault(u.ROOT_FILES[-1])
        with fault,self.assertRaises((OSError,RuntimeError)):u.rollback(self.target,saved)
        self.assertTrue(hits);self.assertEqual(self.generation(),before,'RED root copy: mixed generation');self.assertEqual(self.data_state(),data)
    def test_failed_update_and_failed_automatic_restore_leave_blocked_recoverable_state(self):
        before=self.generation();data=self.data_state();fault,hits=self.copy_fault('ames-agent/'+u.FILES[3],repeat=True)
        with fault,self.assertRaises((OSError,RuntimeError)):u.update(self.target,self.src)
        self.assertTrue(hits);self.assert_blocked()
        tx=json.loads((self.pkg/'.ames-update'/'transaction.json').read_text())
        u.recover(self.target,transaction_id=tx['transaction_id'])
        self.assertEqual(self.generation(),before);self.assertEqual(self.data_state(),data)
    def test_interruptions_preserve_journal_and_allow_explicit_recovery_without_old_DB_restore(self):
        saved,before,data=self.saved_and_current()
        for phase in ('prepared','after:ames-agent/agent.py','after:'+u.ROOT_FILES[-1],'verified'):
            with self.subTest(phase=phase):
                seen=[]
                def stop(name):
                    if name==phase:seen.append(name);raise Interrupted('LAB interruption')
                with patch.object(u,'_phase',side_effect=stop,create=True):
                    try:u.rollback(self.target,saved)
                    except BaseException:pass
                self.assertTrue(seen,'RED: phase not exercised')
                self.assert_blocked();tx=json.loads((self.pkg/'.ames-update'/'transaction.json').read_text())
                self.newer();latest=self.data_state()
                u.recover(self.target,transaction_id=tx['transaction_id'])
                self.assertEqual(self.generation(),before);self.assertEqual(self.data_state(),latest)
    def test_legacy_hashless_backup_is_not_silently_trusted(self):
        saved,_,_=self.saved_and_current();m=json.loads((saved/'backup.json').read_text())
        legacy={k:m[k] for k in ('target','agent_files','agent_absent','root_files','root_absent')}
        (saved/'backup.json').write_text(json.dumps(legacy));self.reject_unchanged(saved)
    def test_backup_records_integrity_of_all_saved_members(self):
        saved=u.backup(self.target);m=json.loads((saved/'backup.json').read_text())
        self.assertEqual(m.get('schema'),'central-updater-backup-v2','RED: backup has no integrity format')
        self.assertTrue(m.get('sha256'));self.assertTrue(all(self.hash(saved/p)==h for p,h in m['sha256'].items()))
    def test_helper_absent_destination_is_copied_then_removed_on_verified_rollback(self):
        (self.pkg/HELPER).unlink();saved=u.update(self.target,self.src)
        self.assertTrue((self.pkg/HELPER).is_file(),'RED helper omitted');self.assertEqual((self.pkg/HELPER).read_text(),'LAB-new '+HELPER)
        u.rollback(self.target,saved);self.assertFalse((self.pkg/HELPER).exists())
    def test_old_helper_is_backed_up_copied_and_restored(self):
        saved=u.update(self.target,self.src)
        self.assertEqual((self.pkg/HELPER).read_text(),'LAB-new '+HELPER,'RED helper remains stale')
        self.assertEqual((saved/'root'/HELPER).read_text(),'LAB-old '+HELPER)
        u.rollback(self.target,saved);self.assertEqual((self.pkg/HELPER).read_text(),'LAB-old '+HELPER)
    def test_transitive_PowerShell_dot_sources_are_delivered_and_managed(self):
        helper=HELPER;self.assertIn(helper,u.ROOT_FILES,'RED: helper outside updater inventory')
        source=ast.parse((ROOT/'scripts/build-r12-migration-bundle.py').read_text())
        mapping=next(n.value for n in source.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='ROOT_FILES' for t in n.targets))
        self.assertIn(helper,{ast.literal_eval(k) for k in mapping.keys})

if __name__=='__main__':unittest.main()
