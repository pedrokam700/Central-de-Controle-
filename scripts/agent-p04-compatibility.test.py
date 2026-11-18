"""Closed P04 policy counterexamples + REAL stdlib probes, never operational agent."""
import ast
import copy
import importlib.util
import json
import os
from pathlib import Path
import runpy
import sqlite3
import subprocess
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1];TOOL=ROOT/'tools/ames-lab/windows_preflight.py'
LOCK=json.loads((ROOT/'tools/ames-lab/p04_windows_wheels.json').read_text(encoding='utf-8'))


def fixture():
    return {'runtime':{'version':[3,12,10],'implementation':'cpython','bits':64,'platform':'win-amd64','native_machine':'AMD64','isolated':True,'bytecode_disabled':True},
      'sqlite':{'version':[3,45,1],'json1':True,'upsert':True,'foreign_keys':True,'backup':True,'integrity':True},
      'timezone':{'tzdata_version':'2025.2','iana_version':'2025b','resource_verified':True,'vectors_verified':True},
      'packages':{a['name']:{'version':a['version'],'filename':a['filename'],'sha256':a['sha256'],'origin_verified':True,'records_verified':True,'metadata_verified':True} for a in LOCK['artifacts']},
      'imports':{a['name']:True for a in LOCK['artifacts']},'guard':True}


class P04Contracts(unittest.TestCase):
    def api(self):
        self.assertTrue(TOOL.is_file(),'RED: existing find_spec/quick_check is not a Windows compatibility contract')
        return runpy.run_path(str(TOOL))

    def bad(self,part,key,value,reason):
        m=self.api();f=fixture();f[part][key]=value;r=m['assess'](f)
        self.assertEqual(r['core_status'],'FAIL');self.assertIn(reason,r['reasons'])

    def test_01_scope_never_equates_runner_to_factory(self):
        r=self.api()['assess'](fixture());self.assertEqual(r['core_status'],'PASS')
        self.assertEqual(r['workstation_status'],'BLOCKED');self.assertEqual(r['physical'],'PENDING')
        self.assertEqual(r['missing_verified_wheels'],['mouseinfo','pyautogui','pygetwindow','pyrect','pyscreeze','pytweening'])

    def test_02_wrong_Python_minor(self):self.bad('runtime','version',[3,11,10],'PYTHON_VERSION')
    def test_03_unmeasured_patch(self):self.bad('runtime','version',[3,12,9],'PYTHON_VERSION')
    def test_04_non_CPython(self):self.bad('runtime','implementation','pypy','PYTHON_IMPLEMENTATION')
    def test_05_32bit(self):self.bad('runtime','bits',32,'PROCESS_ARCHITECTURE')
    def test_06_ARM64(self):self.bad('runtime','native_machine','ARM64','NATIVE_ARCHITECTURE')
    def test_07_Linux_not_Windows(self):self.bad('runtime','platform','linux-x86_64','WINDOWS_REQUIRED')
    def test_08_missing_isolation(self):self.bad('runtime','isolated',False,'ISOLATION_REQUIRED')
    def test_09_no_JSON1_even_when_SQLite_version_is_recent(self):self.bad('sqlite','json1',False,'SQLITE_JSON1')
    def test_10_old_SQLite(self):self.bad('sqlite','version',[3,24,0],'SQLITE_VERSION')
    def test_11_FK_not_enabled(self):self.bad('sqlite','foreign_keys',False,'SQLITE_FOREIGN_KEYS')
    def test_12_no_upsert(self):self.bad('sqlite','upsert',False,'SQLITE_UPSERT')
    def test_13_no_backup(self):self.bad('sqlite','backup',False,'SQLITE_BACKUP')
    def test_14_missing_tzdata_not_hidden_by_host_tzpath(self):self.bad('timezone','resource_verified',False,'TZDATA_RESOURCE')
    def test_15_wrong_tzdata(self):self.bad('timezone','tzdata_version','2024.1','TZDATA_VERSION')
    def test_16_wrong_timezone_semantics(self):self.bad('timezone','vectors_verified',False,'TIMEZONE_VECTORS')

    def test_17_dependency_missing(self):
        m=self.api();f=fixture();del f['packages']['pandas'];self.assertIn('PACKAGE_MISSING:pandas',m['assess'](f)['reasons'])
    def test_18_wrong_version(self):
        m=self.api();f=fixture();f['packages']['pandas']['version']='3.0.0';self.assertIn('PACKAGE_VERSION:pandas',m['assess'](f)['reasons'])
    def test_19_wrong_ABI_wheel(self):
        m=self.api();f=fixture();f['packages']['numpy']['filename']='numpy-2.2.6-cp311-cp311-win_amd64.whl';self.assertIn('WHEEL_IDENTITY:numpy',m['assess'](f)['reasons'])
    def test_20_unknown_origin_or_sdist_cannot_be_a_wheel(self):
        m=self.api();f=fixture();f['packages']['playwright']['origin_verified']=False;self.assertIn('WHEEL_ORIGIN:playwright',m['assess'](f)['reasons'])
    def test_21_changed_installed_file(self):
        m=self.api();f=fixture();f['packages']['greenlet']['records_verified']=False;self.assertIn('PACKAGE_RECORD:greenlet',m['assess'](f)['reasons'])
    def test_22_namespace_presence_does_not_prove_import(self):self.bad('imports','pandas',False,'IMPORT_FAILED:pandas')
    def test_23_unknown_package_or_metadata_not_ignored(self):
        m=self.api();f=fixture();f['packages']['unreviewed']={};self.assertIn('UNREVIEWED_PACKAGE_SET',m['assess'](f)['reasons'])
    def test_24_bool_is_not_integer_or_truthy_attestation(self):self.bad('runtime','isolated',1,'ISOLATION_REQUIRED')
    def test_25_REAL_memory_SQLite_contract(self):
        r=self.api()['sqlite_probe']();self.assertIs(r['json1'],True);self.assertIs(r['foreign_keys'],True)
        self.assertIs(r['backup'],True);self.assertIs(r['upsert'],True);self.assertIs(r['integrity'],True)
    def test_26_REAL_JSON1_denied_is_not_inferred_from_version(self):
        m=self.api()
        def connect(*a,**kw):
            c=sqlite3.connect(*a,**kw)
            c.set_authorizer(lambda action,a,b,*rest: sqlite3.SQLITE_DENY if action==sqlite3.SQLITE_FUNCTION and str(b).startswith('json_') else sqlite3.SQLITE_OK)
            return c
        self.assertIs(m['sqlite_probe'](connect)['json1'],False)
    def test_27_source_no_operational_chain_or_GUI_import(self):
        self.api();tree=ast.parse(TOOL.read_text(encoding='utf-8'));names=[]
        for n in ast.walk(tree):
            if isinstance(n,ast.Import):names.extend(a.name for a in n.names)
            elif isinstance(n,ast.ImportFrom):names.append(n.module or '')
        self.assertTrue(all(n.split('.')[0] not in {'agent','agent_entry','store','engine_bridge','pyautogui','pyscreeze','mouseinfo'} for n in names))
    def test_28_cli_refuses_outside_explicit_disposable_CI(self):
        self.api();r=subprocess.run([sys.executable,'-I','-B',str(TOOL),'--ci-lab-root','P04-SYNTHETIC-INVALID'],capture_output=True,text=True)
        self.assertEqual(r.returncode,2);v=json.loads(r.stdout);self.assertEqual(v['status'],'REFUSED');self.assertNotIn('Traceback',r.stderr)
    def test_29_integrity_failure(self):self.bad('sqlite','integrity',False,'SQLITE_INTEGRITY')
    def test_30_metadata_incomplete(self):
        m=self.api();f=fixture();f['packages']['pyee']['metadata_verified']=False;self.assertIn('PACKAGE_METADATA:pyee',m['assess'](f)['reasons'])
    def test_31_no_distribution_guard_proof(self):
        m=self.api();f=fixture();f['guard']=False;self.assertIn('GUARD_UNVERIFIED',m['assess'](f)['reasons'])
    def test_32_unknown_fields_are_not_silent_success(self):
        m=self.api();f=fixture();f['private_metadata']='SYNTHETIC-TOKEN';r=m['assess'](f);self.assertEqual(r['core_status'],'FAIL');self.assertIn('UNREVIEWED_FACTS',r['reasons'])


    def test_33_unknown_nested_metadata_cannot_be_attested(self):
        m=self.api();f=fixture();f['runtime']['private_token']='SYNTHETIC-SECRET'
        r=m['assess'](f);self.assertEqual(r['core_status'],'FAIL');self.assertIn('UNREVIEWED_FACTS',r['reasons'])

    def test_34_malformed_sections_fail_closed_with_diagnostic(self):
        m=self.api();f=fixture();f['runtime']=['not','a','runtime']
        r=m['assess'](f);self.assertEqual(r['core_status'],'FAIL');self.assertIn('UNREVIEWED_FACTS',r['reasons'])

    def test_35_minimal_self_hashed_receipt_does_not_prove_complete_measurement(self):
        m=self.api();f=fixture()
        receipt={'code_sha':'a'*40,'scope':'DISPOSABLE_WINDOWS_RUNNER_ONLY','physical':'PENDING',
          'operational_installation_tested':False,'homologation_authorized':False,'assessment':m['assess'](f),'facts':f}
        receipt['receipt_sha256']=m['digest'](receipt)
        self.assertFalse(m['verify_receipt'](receipt,'a'*40))

    def test_36_numpy_import_does_not_require_relaxing_environment_mutation_guard(self):
        # Fresh stdlib-only child checks forbidden mutation before any OS call.
        m=self.api()
        code="import runpy,sys; m=runpy.run_path(sys.argv[1]); m['install_guard'](); import os; os.environ['P04_SYNTHETIC_MUTATION']='1'"
        result=subprocess.run([sys.executable,'-I','-B','-c',code,str(TOOL)],capture_output=True,text=True)
        self.assertNotEqual(result.returncode,0);self.assertIn('P04_SIDE_EFFECT_REFUSED',result.stderr)

if __name__=='__main__':unittest.main()
