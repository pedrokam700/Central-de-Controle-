"""Black-box LAB contract. Only synthetic temp trees; no operational entry import."""
import hashlib
import json
import os
from pathlib import Path
import runpy
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
ENTRY = ROOT / 'ames/agent/lab_entry.py'


class LabIsolation(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='ames-lab-proof-')
        self.addCleanup(self.tmp.cleanup)
        self.area = Path(self.tmp.name).resolve()
        self.lab = self.area / 'AMES-LAB-SYNTHETIC'
        self.lab.mkdir()

    def available(self):
        self.assertTrue(ENTRY.is_file(), 'RED: no separate fail-closed synthetic LAB entry on PR92')

    def lab_env(self):
        # Child receives an explicit synthetic environment, never runner/workstation config.
        return {k:v for k,v in os.environ.items() if k.upper() in {'PATH','SYSTEMROOT','WINDIR','TEMP','TMP','LANG','LC_ALL'}}

    def run_lab(self, commands=(), *, initialize=False, entry=ENTRY, flags=('-I', '-S', '-B'), env=None):
        self.available()
        args = [sys.executable, *flags, str(entry), '--lab-root', str(self.lab)]
        if initialize:
            args.append('--initialize-synthetic')
        return subprocess.run(args, input=''.join(json.dumps(x)+'\n' for x in commands),
                              text=True, capture_output=True, timeout=12, cwd=self.area, env=self.lab_env() if env is None else env)

    def init(self):
        result = self.run_lab(initialize=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        return result

    def denied(self, result):
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn('LAB_REFUSED', result.stderr)

    def guard_probe(self, code):
        self.available()
        # Test-only caller preloads libraries before installing the same policy.
        # No arbitrary code/probe/SQL command exists on the public LAB protocol.
        script = "import runpy,sys,os,socket,subprocess,sqlite3; from pathlib import Path\n"
        script += f"m=runpy.run_path({str(ENTRY)!r}); root=Path({str(self.lab)!r}); m['install_guard'](root)\n"
        script += "try:\n " + code + "\nexcept PermissionError:\n print('DENIED_BEFORE_OS')\nelse:\n raise SystemExit('ISOLATION_MISSING')\n"
        result = subprocess.run([sys.executable, '-I', '-S', '-B', '-c', script], capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), 'DENIED_BEFORE_OS')

    def test_01_explicit_isolated_interpreter_required(self):
        self.denied(self.run_lab(initialize=True, flags=('-B',)))
        self.assertEqual(list(self.lab.iterdir()), [])

    def test_02_fresh_explicit_root_and_manifest_required(self):
        self.denied(self.run_lab())
        self.assertEqual(list(self.lab.iterdir()), [])

    def test_03_initialize_controlled_shutdown_and_restart(self):
        result=self.run_lab([{'command':'append_fixture'}, {'command':'status'}, {'command':'shutdown'}], initialize=True)
        self.assertEqual(result.returncode,0,result.stderr)
        docs=[json.loads(x) for x in result.stdout.splitlines()]
        self.assertEqual(docs[0]['mode'],'SYNTHETIC_LAB_ONLY')
        self.assertFalse(docs[0]['network']); self.assertFalse(docs[0]['operational_agent'])
        self.assertEqual(docs[2]['records'],1)
        again=self.run_lab([{'command':'status'}])
        self.assertEqual(again.returncode,0,again.stderr)
        self.assertEqual(json.loads(again.stdout.splitlines()[1])['records'],1)
        self.assertEqual(json.loads(again.stdout.splitlines()[1])['evidence_sha256'],docs[2]['evidence_sha256'])

    def test_04_no_overwrite_or_import_existing_state(self):
        self.init()
        before={p.name:p.read_bytes() for p in self.lab.iterdir() if p.is_file()}
        self.denied(self.run_lab(initialize=True))
        self.assertEqual(before,{p.name:p.read_bytes() for p in self.lab.iterdir() if p.is_file()})

    def test_05_refuse_operational_artifacts_before_any_write(self):
        for name in ('config.json','local_agent_token','ames_local.sqlite3','ChromeProfile','jobs.json','session.json','.ames-update'):
            with self.subTest(name=name):
                path=self.lab/name; path.write_text('SYNTHETIC CONTAMINATION')
                self.denied(self.run_lab(initialize=True)); self.assertEqual(path.read_text(),'SYNTHETIC CONTAMINATION')
                self.assertEqual(list(self.lab.iterdir()),[path]); path.unlink()

    def test_06_refuse_external_engine_chrome_db_profile_and_config(self):
        self.init()
        file=self.lab/'lab.json'; base=json.loads(file.read_text())
        for key in ('engine_dir','engine','chrome_cdp','chrome','database','db_path','chrome_profile_dir','config_path','ames_start_url','source_id','token','jobs'):
            with self.subTest(key=key):
                file.write_text(json.dumps({**base,key:str(self.area/'OPERATIONAL-SENTINEL')}))
                self.denied(self.run_lab())
        file.write_text(json.dumps(base))

    def test_07_no_inherited_operational_environment(self):
        for key in ('AMES_ENGINE_DIR','AMES_CONFIG','CHROME_PROFILE_DIR','GOOGLE_APPLICATION_CREDENTIALS','FIREBASE_CONFIG'):
            with self.subTest(key=key):
                env=self.lab_env();env[key]=str(self.area/'OPERATIONAL-SENTINEL')
                self.denied(self.run_lab(initialize=True,env=env))
                self.assertEqual(list(self.lab.iterdir()),[])

    def test_08_no_import_from_cwd_or_pythonpath(self):
        marker=self.area/'IMPORT-ESCAPED'
        for module in ('sitecustomize','agent','agent_entry','engine_bridge','sqlite3'):
            (self.area/(module+'.py')).write_text(f'open({str(marker)!r},"w").write("bad")\n')
        env=self.lab_env();env['PYTHONPATH']=str(self.area)
        result=self.run_lab(initialize=True,env=env)
        self.assertEqual(result.returncode,0,result.stderr);self.assertFalse(marker.exists())

    def test_09_reject_sql_code_paths_and_recovery_commands(self):
        self.init()
        for command in ({'command':'sql','sql':'ATTACH DATABASE outside'}, {'command':'exec','code':'pass'},
                        {'command':'recover_jobs'}, {'command':'chrome_start'}, {'command':'network_repair'},
                        {'command':'append_fixture','pcba':'REAL'}, {'command':'status','path':'../outside'}):
            with self.subTest(command=command):
                self.denied(self.run_lab([command]))
                # Process has exited; explicit supervised TEST cleanup only.
                claim=self.lab/'session.claim'
                if claim.exists():claim.unlink()
        self.assertEqual(json.loads(self.run_lab([{'command':'status'}]).stdout.splitlines()[1])['records'],0)

    def test_10_network_all_sockets_and_dns_denied_before_os(self):
        for code in ("socket.socket()", "socket.getaddrinfo('mes.invalid',80)",
                     "sys.audit('socket.connect',None,('firebase.invalid',443))", "sys.audit('socket.bind',None,('127.0.0.1',8765))"):
            with self.subTest(code=code):self.guard_probe(code)

    def test_11_process_install_repair_route_guardian_denied_before_os(self):
        for args in ([sys.executable,'-c','raise SystemExit(77)'], ['pip','install','SYNTHETIC'],
                     ['netsh','SYNTHETIC'], ['powershell','SYNTHETIC'], ['guardian-SENTINEL']):
            with self.subTest(args=args):self.guard_probe(f'subprocess.Popen({args!r})')

    def test_12_write_and_read_outside_root_denied(self):
        outside=self.area/'OUTSIDE';outside.write_text('preserved')
        for code in (f'open({str(outside)!r},"w")',f'open({str(outside)!r},"r")',
                     f'os.remove({str(outside)!r})',f'os.mkdir({str(self.area/"ESCAPE")!r})'):
            with self.subTest(code=code):self.guard_probe(code)
        self.assertEqual(outside.read_text(),'preserved');self.assertFalse((self.area/'ESCAPE').exists())

    def test_13_external_sqlite_and_native_extension_denied(self):
        self.guard_probe(f'sqlite3.connect({str(self.area/"outside.sqlite3")!r})')
        self.guard_probe("__import__('ctypes')")
        self.assertFalse((self.area/'outside.sqlite3').exists())

    def test_14_refuse_symlink_root_or_member(self):
        self.available()
        outside=self.area/'SENTINEL';outside.write_text('preserved')
        try:(self.lab/'lab.json').symlink_to(outside)
        except OSError as error:self.skipTest(f'symlink privilege unavailable: {error}')
        self.denied(self.run_lab(initialize=True));(self.lab/'lab.json').unlink()
        self.lab.rmdir();self.lab.symlink_to(self.area,target_is_directory=True)
        self.denied(self.run_lab(initialize=True));self.assertEqual(outside.read_text(),'preserved')

    def test_15_refuse_hardlinked_members(self):
        self.init()
        file=self.lab/'lab.json';outside=self.area/'alias';os.link(file,outside)
        self.denied(self.run_lab());self.assertEqual(file.read_bytes(),outside.read_bytes())

    def test_16_journal_claim_blocks_before_lab_mutation(self):
        self.available()
        package=self.area/'package';agent=package/'ames-agent';agent.mkdir(parents=True)
        copied=agent/'lab_entry.py';shutil.copyfile(ENTRY,copied)
        marker=package/'.ames-update';marker.mkdir();(marker/'claim.lock').write_text('SYNTHETIC PENDING D01')
        before=(marker/'claim.lock').read_bytes()
        self.denied(self.run_lab(initialize=True,entry=copied))
        self.assertEqual(list(self.lab.iterdir()),[]);self.assertEqual((marker/'claim.lock').read_bytes(),before)
        (marker/'claim.lock').unlink()
        result=self.run_lab(initialize=True,entry=copied)
        self.assertEqual(result.returncode,0,result.stderr)

    def test_17_corrupt_or_foreign_db_never_initialized(self):
        self.init();db=self.lab/'lab.sqlite3';db.write_bytes(b'SYNTHETIC CORRUPTION')
        before=db.read_bytes();self.denied(self.run_lab());self.assertEqual(db.read_bytes(),before)

    def test_18_truncated_manifest_and_unknown_files_fail_closed(self):
        self.init();(self.lab/'lab.json').write_text('{')
        self.denied(self.run_lab())

    def test_19_no_new_files_outside_lab_and_no_productive_imports(self):
        before=set(self.area.rglob('*'))
        result=self.run_lab([{'command':'append_fixture'},{'command':'status'}],initialize=True)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertTrue(all(p.is_relative_to(self.lab) for p in set(self.area.rglob('*'))-before))
        status=json.loads(result.stdout.splitlines()[2]);self.assertEqual(status['operational_imports'],[])
        self.assertEqual(status['jobs_recovered'],0);self.assertEqual(status['services_started'],[])

    def test_20_interrupted_process_preserves_committed_synthetic_evidence(self):
        self.available()
        args=[sys.executable,'-I','-S','-B',str(ENTRY),'--lab-root',str(self.lab),'--initialize-synthetic']
        with subprocess.Popen(args,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,cwd=self.area,env=self.lab_env()) as child:
            self.assertIn('SYNTHETIC_LAB_ONLY',child.stdout.readline())
            child.stdin.write('{"command":"append_fixture"}\n');child.stdin.flush()
            self.assertEqual(json.loads(child.stdout.readline())['records'],1)
            child.kill();child.wait(timeout=8)
        result=self.run_lab([{'command':'status'}]);self.denied(result)
        # Interrupted session requires supervision; no auto-job recovery or marker deletion.
        self.assertTrue((self.lab/'session.claim').exists())
        con=sqlite3.connect(self.lab/'lab.sqlite3')
        try:self.assertEqual(con.execute('SELECT count(*) FROM lab_evidence').fetchone()[0],1)
        finally:con.close()
        (self.lab/'session.claim').unlink()  # Supervised TEST cleanup after process termination proof.
        self.assertEqual(self.run_lab([{'command':'status'}]).returncode,0)


    def test_21_guard_must_prove_itself_before_writes(self):
        self.available()
        code=f"""import runpy,sys
m=runpy.run_path({str(ENTRY)!r})
sys.addaudithook=lambda hook:None
sys.argv=['LAB','--lab-root',{str(self.lab)!r},'--initialize-synthetic']
raise SystemExit(m['main']())
"""
        result=subprocess.run([sys.executable,'-I','-S','-B','-c',code],capture_output=True,text=True,env=self.lab_env(),timeout=10)
        self.denied(result);self.assertIn('GUARD_NOT_ACTIVE',result.stderr)
        self.assertEqual(list(self.lab.iterdir()),[])

    def test_22_foreign_schema_is_rejected_without_rw_open(self):
        self.init()
        db=self.lab/'lab.sqlite3'
        con=sqlite3.connect(db)
        try:con.execute('CREATE TABLE foreign_operational_sentinel (secret TEXT)');con.commit()
        finally:con.close()
        before=db.read_bytes()
        self.denied(self.run_lab())
        self.assertEqual(db.read_bytes(),before);self.assertFalse((self.lab/'session.claim').exists())

    def test_23_no_automatic_operational_import(self):
        self.guard_probe("__import__('agent')")
        self.guard_probe("__import__('network_watch')")

    def test_24_sqlite_sidecars_are_pending_not_ignored(self):
        self.init()
        for suffix in ('-wal','-shm','-journal'):
            with self.subTest(suffix=suffix):
                file=self.lab/('lab.sqlite3'+suffix);file.write_text('SYNTHETIC PENDING')
                before=(self.lab/'lab.sqlite3').read_bytes()
                self.denied(self.run_lab())
                self.assertEqual(file.read_text(),'SYNTHETIC PENDING')
                self.assertEqual((self.lab/'lab.sqlite3').read_bytes(),before);file.unlink()

    def test_25_partial_initialization_preserves_claim_and_blocks_restart(self):
        self.available()
        code=f"""import runpy,sys
m=runpy.run_path({str(ENTRY)!r})
def failed(root):raise OSError('SYNTHETIC_IO_FAILURE_NOT_PUBLIC')
m['main'].__globals__['connect']=failed
sys.argv=['LAB','--lab-root',{str(self.lab)!r},'--initialize-synthetic']
raise SystemExit(m['main']())
"""
        result=subprocess.run([sys.executable,'-I','-S','-B','-c',code],capture_output=True,text=True,env=self.lab_env(),timeout=10)
        self.denied(result);self.assertNotIn('SYNTHETIC_IO_FAILURE_NOT_PUBLIC',result.stderr)
        before={p.name:p.read_bytes() for p in self.lab.iterdir()}
        self.assertIn('session.claim',before);self.assertIn('lab.json',before)
        self.denied(self.run_lab())
        self.assertEqual(before,{p.name:p.read_bytes() for p in self.lab.iterdir()})

    def test_26_concurrent_session_refused_without_modifying_owner(self):
        self.available()
        args=[sys.executable,'-I','-S','-B',str(ENTRY),'--lab-root',str(self.lab),'--initialize-synthetic']
        child=subprocess.Popen(args,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,cwd=self.area,env=self.lab_env())
        try:
            self.assertIn('SYNTHETIC_LAB_ONLY',child.stdout.readline())
            before={p.name:p.read_bytes() for p in self.lab.iterdir()}
            self.denied(self.run_lab())
            self.assertEqual(before,{p.name:p.read_bytes() for p in self.lab.iterdir()})
            stdout,stderr=child.communicate('{"command":"shutdown"}\n',timeout=8)
            self.assertEqual(child.returncode,0,stderr)
        finally:
            if child.poll() is None:child.kill();child.wait(timeout=8)
            for stream in (child.stdin,child.stdout,child.stderr):
                if stream is not None:stream.close()
        self.assertFalse((self.lab/'session.claim').exists())

    def test_27_attach_and_sqlite_extension_blocked(self):
        self.available()
        code=f"""import runpy,sqlite3
from pathlib import Path
m=runpy.run_path({str(ENTRY)!r})
root=Path({str(self.lab)!r});m['install_guard'](root);con=m['connect'](root)
try:
 for sql in ("ATTACH DATABASE ':memory:' AS extra","SELECT load_extension('SYNTHETIC')","PRAGMA temp_store_directory='SYNTHETIC'"):
  try:con.execute(sql)
  except sqlite3.DatabaseError:pass
  else:raise SystemExit('SQL_POLICY_MISSING')
 try:con.enable_load_extension(True)
 except PermissionError:pass
 else:raise SystemExit('NATIVE_POLICY_MISSING')
finally:con.close()
print('DENIED')
"""
        result=subprocess.run([sys.executable,'-I','-S','-B','-c',code],capture_output=True,text=True,env=self.lab_env(),timeout=10)
        self.assertEqual(result.returncode,0,result.stderr);self.assertEqual(result.stdout.strip(),'DENIED')

    def test_28_manifest_boolean_types_are_not_numeric_permission(self):
        self.init()
        file=self.lab/'lab.json';base=json.loads(file.read_text())
        for key in ('synthetic_only','network','guardian','recover_jobs'):
            with self.subTest(key=key):
                changed={**base,key:int(base[key])};file.write_text(json.dumps(changed))
                self.denied(self.run_lab())
        file.write_text(json.dumps(base))



    def test_29_regular_stdio_files_refused_before_lab_or_external_writes(self):
        self.available()
        args=[sys.executable,'-I','-S','-B',str(ENTRY),'--lab-root',str(self.lab),'--initialize-synthetic']
        for name in ('stdout','stderr','stdin'):
            with self.subTest(stream=name):
                self.lab=self.area/('AMES-LAB-STDIO-'+name.upper());self.lab.mkdir()
                args[args.index('--lab-root')+1]=str(self.lab)
                target=self.area/('EXTERNAL-'+name)
                if name=='stdin':target.write_text('{"command":"status"}\n')
                else:target.write_bytes(b'')
                with target.open('r' if name=='stdin' else 'w') as stream:
                    kwargs={'stdout':subprocess.PIPE,'stderr':subprocess.PIPE,'text':True,
                            'timeout':10,'env':self.lab_env()}
                    if name=='stdin':kwargs['stdin']=stream
                    else:kwargs.update(input='',**{name:stream})
                    result=subprocess.run(args,**kwargs)
                self.assertNotEqual(result.returncode,0)
                if name!='stdin':self.assertEqual(target.read_bytes(),b'')
                self.assertEqual(list(self.lab.iterdir()),[])


if __name__=='__main__':unittest.main()
