"""D01/D02: disposable synthetic trees, injected I/O/crash; no launcher/builder/MES."""
import ast
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import threading
import re
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
        self.base=Path(self.tmp.name).resolve();self.pkg=self.base/'LAB-installed';self.target=self.pkg/'ames-agent'
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
        with closing(sqlite3.connect(self.data/'ames_local.sqlite3')) as con:
            con.execute('CREATE TABLE evidence(id INTEGER PRIMARY KEY, value TEXT)');con.execute("INSERT INTO evidence(value) VALUES('LAB-before')");con.commit()
        self.write(self.data/'checkpoint.json','LAB-checkpoint');self.write(self.data/'local_agent_token','LAB-only-token')
        self.socket=patch.object(u.socket,'create_connection',side_effect=OSError);self.socket.start();self.addCleanup(self.socket.stop)

    def write(self,path,text):path.parent.mkdir(parents=True,exist_ok=True);path.write_text(text)
    def hash(self,path):return hashlib.sha256(path.read_bytes()).hexdigest()
    def generation(self):return {p:(self.pkg/p).read_bytes() if (self.pkg/p).is_file() else None for p in self.paths}
    def data_state(self):
        with closing(sqlite3.connect(self.data/'ames_local.sqlite3')) as con:rows=con.execute('SELECT * FROM evidence').fetchall()
        return rows,(self.data/'checkpoint.json').read_bytes(),(self.data/'local_agent_token').read_bytes()
    def newer(self):
        with closing(sqlite3.connect(self.data/'ames_local.sqlite3')) as con:con.execute("INSERT INTO evidence(value) VALUES('LAB-NEW')");con.commit()
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
                if repeat or len(hits)==1:
                    dst.write_bytes(b'LAB partially copied bytes')
                    raise OSError('LAB injected copy failure')
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
    def test_interruption_during_automatic_compensation_keeps_barrier_and_before_generation(self):
        before=self.generation();fault,hits=self.copy_fault('ames-agent/'+u.FILES[3])
        def stop(name):
            record=self.pkg/'.ames-update'/'transaction.json'
            if name=='after:ames-agent/agent.py' and json.loads(record.read_text())['state']=='COMPENSATING':
                raise Interrupted('LAB interrupted compensation')
        with fault,patch.object(u,'_phase',side_effect=stop),self.assertRaises(RuntimeError):u.update(self.target,self.src)
        self.assertTrue(hits);self.assert_blocked();record=json.loads((self.pkg/'.ames-update'/'transaction.json').read_text())
        self.newer();data=self.data_state();u.recover(self.target,transaction_id=record['transaction_id'])
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
        source=ast.parse((ROOT/'scripts/build-r12-migration-bundle.py').read_text())
        mapping=next(n.value for n in source.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='ROOT_FILES' for t in n.targets))
        delivered={ast.literal_eval(k) for k in mapping.keys};managed=set(u.ROOT_FILES)
        self.assertIn(HELPER,managed)
        pending=[p for p in managed if p.endswith('.ps1')];seen=set()
        while pending:
            relative=pending.pop()
            if relative in seen:continue
            seen.add(relative);text=(ROOT/'tools/ames-workstation'/Path(relative).name).read_text()
            for name in re.findall(r"(?m)^\s*\.\s+\(Join-Path\s+\$PSScriptRoot\s+'([^']+\.ps1)'\)",text):
                dependency=str(Path(relative).parent/name).replace('\\','/')
                self.assertIn(dependency,delivered);self.assertIn(dependency,managed);pending.append(dependency)
        self.assertIn(HELPER,seen)

    def test_windows_fixture_filesystem_is_recorded_without_workstation_commands(self):
        if os.name!='nt':
            print('LAB filesystem witness: POSIX runner; Windows proof is a separate CI job');return
        import ctypes
        from ctypes import wintypes
        volume=ctypes.create_unicode_buffer(64);fs=ctypes.create_unicode_buffer(64)
        api=ctypes.windll.kernel32.GetVolumeInformationW
        api.argtypes=[wintypes.LPCWSTR,wintypes.LPWSTR,wintypes.DWORD,ctypes.POINTER(wintypes.DWORD),ctypes.POINTER(wintypes.DWORD),ctypes.POINTER(wintypes.DWORD),wintypes.LPWSTR,wintypes.DWORD]
        result=api(str(self.base.anchor),volume,len(volume),None,None,None,fs,len(fs))
        self.assertTrue(result);self.assertTrue(fs.value)
        print('LAB Windows fixture filesystem='+fs.value+'; synthetic I/O/process-exit only, no power-loss attestation')

    def test_source_corruption_between_preflight_and_staging_is_rejected(self):
        saved,before,data=self.saved_and_current();original=u._seal
        def mutate(marker,name,plan,*args,**kwargs):
            if name=='desired':self.write(saved/'ames-agent'/'agent.py','LAB after-validation corruption')
            return original(marker,name,plan,*args,**kwargs)
        with patch.object(u,'_seal',side_effect=mutate),self.assertRaises((ValueError,RuntimeError)):
            u.rollback(self.target,saved)
        self.assertEqual(self.generation(),before);self.assertEqual(self.data_state(),data)

    def test_extra_requirements_and_frontend_are_backed_up_and_rolled_back(self):
        extras={'ames-agent/requirements.txt':'LAB-new-requirements','frontend/LAB.mjs':'LAB-new-view'}
        for rel,text in extras.items():
            self.write(self.src.parent/rel,text);self.write(self.pkg/rel,'LAB-old-extra')
        self.write(self.src.parent/'LOCAL_BUNDLE_MANIFEST.json',json.dumps({'files':{p:self.hash(self.src.parent/p) for p in extras}}))
        saved=u.update(self.target,self.src);self.newer();data=self.data_state()
        for rel,text in extras.items():self.assertEqual((self.pkg/rel).read_text(),text)
        u.rollback(self.target,saved)
        for rel in extras:self.assertEqual((self.pkg/rel).read_text(),'LAB-old-extra')
        self.assertEqual(self.data_state(),data)

    def test_legacy_backup_restores_only_with_independent_complete_proof(self):
        saved,before,data=self.saved_and_current();manifest=json.loads((saved/'backup.json').read_text())
        legacy={k:manifest[k] for k in ('target','agent_files','agent_absent','root_files','root_absent')}
        self.write(saved/'backup.json',json.dumps(legacy))
        self.assertFalse(u.inspect_backup(saved)['integrity_proven'])
        proof={'schema':'central-updater-legacy-proof-v1','backup_json_sha256':self.hash(saved/'backup.json'),'manifest':manifest}
        u.rollback(self.target,saved,legacy_proof=proof)
        self.assertEqual((self.target/'agent.py').read_text(),'LAB-old agent.py')
        self.assertEqual(self.data_state(),data)
        self.write(saved/'ames-agent'/'agent.py','LAB-bad')
        current=self.generation()
        with self.assertRaises(ValueError):u.rollback(self.target,saved,legacy_proof=proof)
        self.assertEqual(self.generation(),current)

    def test_restore_inventory_cannot_target_current_operational_artifacts(self):
        before=self.generation();data=self.data_state()
        for relative in ('ames-agent/data/checkpoint.json','factory-engine/output/LAB.json','factory-engine/logs/LAB.txt','frontend/LAB.sqlite3'):
            with self.subTest(relative=relative),self.assertRaises(ValueError):u._software(relative)
        self.assertEqual(self.generation(),before);self.assertEqual(self.data_state(),data)

    def test_invalid_proof_or_backup_from_other_installation_cannot_write(self):
        saved,before,data=self.saved_and_current()
        m=json.loads((saved/'backup.json').read_text());m['target']=str(self.base/'OTHER'/'ames-agent')
        self.write(saved/'backup.json',json.dumps(m));self.reject_unchanged(saved)
        self.assertEqual(self.generation(),before)

    def test_corrupted_staging_and_wrong_transaction_id_keep_barrier(self):
        saved,before,data=self.saved_and_current()
        def stop(name):
            if name=='after:ames-agent/agent.py':raise Interrupted()
        with patch.object(u,'_phase',side_effect=stop),self.assertRaises(Interrupted):u.rollback(self.target,saved)
        marker=self.pkg/'.ames-update';record=json.loads((marker/'transaction.json').read_text())
        mixed=self.generation()
        with self.assertRaises(RuntimeError):u.recover(self.target,transaction_id='0'*32)
        self.assertEqual(self.generation(),mixed);self.assert_blocked()
        src=marker/'before'/'ames-agent'/'agent.py';original=src.read_bytes();src.write_bytes(b'LAB corrupt staging')
        with self.assertRaises((ValueError,RuntimeError)):u.recover(self.target,transaction_id=record['transaction_id'])
        self.assertEqual(self.generation(),mixed);self.assert_blocked();src.write_bytes(original)
        u.recover(self.target,transaction_id=record['transaction_id'])
        self.assertEqual(self.generation(),before);self.assertEqual(self.data_state(),data)

    def test_third_party_code_or_config_write_blocks_recovery_without_overwrite(self):
        saved,before,data=self.saved_and_current()
        def stop(name):
            if name=='after:ames-agent/agent.py':raise Interrupted()
        with patch.object(u,'_phase',side_effect=stop),self.assertRaises(Interrupted):u.rollback(self.target,saved)
        marker=self.pkg/'.ames-update';record=json.loads((marker/'transaction.json').read_text())
        self.write(self.target/'config.json','{"port":8765,"LAB_NEW_SETTING":true}')
        changed=self.generation()
        with self.assertRaises(RuntimeError):u.recover(self.target,transaction_id=record['transaction_id'])
        self.assertEqual(self.generation(),changed);self.assert_blocked();self.assertEqual(self.data_state(),data)

    def test_finalization_IO_failure_blocks_until_verified_completion(self):
        before=self.generation()
        with patch.object(u.os,'rename',side_effect=OSError('LAB archive failure')),self.assertRaises(RuntimeError):u.update(self.target,self.src)
        self.assert_blocked();completed=self.generation();self.assertNotEqual(before,completed)
        marker=self.pkg/'.ames-update';record=json.loads((marker/'transaction.json').read_text())
        self.assertEqual(record['state'],'COMPLETE')
        u.recover(self.target,transaction_id=record['transaction_id']);self.assertEqual(self.generation(),completed)
        self.assertFalse(marker.exists())

    def worker(self,phase,hold=False):
        # Separate interpreter: forceful process exit exercises persisted state
        # and OS lock release, not only Python exception unwinding.
        return """import sys,os,tempfile
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,sys.argv[1]);import update_candidate as u
tempfile.tempdir=sys.argv[5]
def hook(name):
 if name==sys.argv[4]:
  if sys.argv[6]=='hold':
   print('LAB_READY',flush=True);sys.stdin.readline()
  else:os._exit(73)
u._phase=hook
with patch.object(u.socket,'create_connection',side_effect=OSError):u.update(sys.argv[2],sys.argv[3])
"""
    def worker_args(self,phase,hold=False):
        return [sys.executable,'-B','-c',self.worker(phase,hold),str(ROOT/'ames/agent'),str(self.target),str(self.src),phase,str(self.base),'hold' if hold else 'exit']

    def test_hard_process_exit_recovers_from_persisted_generations_and_preserves_new_data(self):
        for phase in ('prepared','after:ames-agent/agent.py','after:'+HELPER,'verified'):
            with self.subTest(phase=phase):
                before=self.generation();result=subprocess.run(self.worker_args(phase),capture_output=True,text=True,timeout=30)
                self.assertEqual(result.returncode,73,result.stderr)
                self.assert_blocked();marker=self.pkg/'.ames-update';record=json.loads((marker/'transaction.json').read_text())
                self.newer();data=self.data_state();u.recover(self.target,transaction_id=record['transaction_id'])
                self.assertEqual(self.generation(),before);self.assertEqual(self.data_state(),data)

    def test_live_claim_cannot_be_recovered_by_a_second_process(self):
        child=subprocess.Popen(self.worker_args('prepared',True),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        try:
            lines=[];ready=threading.Event()
            def read():lines.append(child.stdout.readline());ready.set()
            thread=threading.Thread(target=read,daemon=True);thread.start()
            self.assertTrue(ready.wait(20),'LAB worker did not reach held phase')
            self.assertEqual(lines,['LAB_READY\n'])
            record=json.loads((self.pkg/'.ames-update'/'transaction.json').read_text());before=self.generation()
            with self.assertRaises(RuntimeError):u.recover(self.target,transaction_id=record['transaction_id'])
            self.assertEqual(self.generation(),before)
            child.stdin.write('GO\n');child.stdin.flush();out,err=child.communicate(timeout=30)
            self.assertEqual(child.returncode,0,err)
        finally:
            if child.poll() is None:child.kill();child.communicate(timeout=10)
            for stream in (child.stdin,child.stdout,child.stderr):
                if stream and not stream.closed:stream.close()

    def test_missing_candidate_helper_and_wrong_manifest_hash_are_preflight_failures(self):
        before=self.generation();helper=self.src.parent/HELPER;original=helper.read_bytes();helper.unlink()
        with self.assertRaises((ValueError,OSError)):u.update(self.target,self.src)
        self.assertEqual(self.generation(),before);helper.write_bytes(original)
        declared={'files':{'ames-agent/'+n:self.hash(self.src/n) for n in u.FILES}}
        declared['files'].update({rel:self.hash(self.src.parent/rel) for rel in u.ROOT_FILES})
        declared['files'][HELPER]='0'*64
        self.write(self.src.parent/'MIGRATION_MANIFEST.json',json.dumps(declared))
        with self.assertRaises(ValueError):u.update(self.target,self.src)
        self.assertEqual(self.generation(),before)

if __name__=='__main__':unittest.main()
