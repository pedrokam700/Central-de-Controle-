"""Read source/AST only. Never import agent/updater/builder, open SQLite or run Windows.

PASS means a finding/contract is statically verified, NOT that Windows offline
homologation ran or any listed blocker is fixed. Report contains public source
identities only. No installation paths, operational data or private fingerprints.
"""
import ast
import hashlib
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
BASE = '1ecc8daae2e1d8e055f36135cfe460817b0d69d9'
PLAN = 'docs/ames/homologation/HOMOLOGACAO_OFFLINE_0539_PR90_20261117.md'


def source(path):
    return (ROOT / path).read_text(encoding='utf-8-sig')


def tree(path):
    return ast.parse(source(path))


def function(path, name):
    return next(n for n in ast.walk(tree(path)) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == name)


def constant(path, name):
    node = next(n for n in tree(path).body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == name for t in n.targets))
    return ast.literal_eval(node.value)


def calls(node, name):
    return [n for n in ast.walk(node) if isinstance(n, ast.Call) and
            (isinstance(n.func, ast.Name) and n.func.id == name or
             isinstance(n.func, ast.Attribute) and n.func.attr == name)]


FINDINGS = [
    {'id':'D02','severity':'HIGH','status':'CORRECTED_SYNTHETIC_TESTS','path':'ames/agent/update_candidate.py',
     'fact':'ROOT_FILES includes the transitive PowerShell helper; candidate copy, backup, absence and rollback are covered by synthetic tests.',
     'proposal':'Retain dependency closure and absent/stale helper tests; never execute operational PowerShell in this proof.'},
    {'id':'D01','severity':'HIGH','status':'CORRECTED_SYNTHETIC_TESTS','path':'ames/agent/update_candidate.py','symbol':'rollback',
     'fact':'All backup members are validated before restoration plans; persistent staged generations support verified compensation or blocked supervised recovery.',
     'proposal':'Retain integrity/I/O/interruption regressions; Windows and Linux synthetic CI do not authorize physical homologation.'},
    {'id':'P01','severity':'BLOCKER','status':'PENDING','path':'tools/ames-workstation/START_LOCAL_CANDIDATE.ps1',
     'fact':'Normal launchers call network preparation, dependency repair, Chrome and agent; not an offline dry run.',
     'proposal':'Do not invoke; require a reviewed offline-only entry strategy and external VM containment before any future clone launch.'},
    {'id':'P02','severity':'BLOCKER','status':'PENDING','path':'tools/ames-workstation/SAFE_STATE_TRANSFER.py','symbol':'stage',
     'fact':'State transfer intentionally copies config and local token, preserves source identity, and cannot attest browser outbox or lease.',
     'proposal':'Separate private immutable backup from synthetic/desidentified lab derivative; never use stage as anonymizer or receipt as maintenance authorization.'},
    {'id':'P03','severity':'BLOCKER','status':'PENDING','path':'ames/agent/agent_hardened_entry.py',
     'fact':'Import chain initializes/migrates SQLite/config/token; main starts monitor, job recovery and network guardian.',
     'proposal':'No import or --help as inventory; future isolated clone must have neutralized lab scheduling/state and a separately validated offline launch contract.'},
    {'id':'P04','severity':'HIGH','status':'PENDING','path':'ames/agent/preflight.py','symbol':'check',
     'fact':'find_spec and quick_check do not prove package versions, tzdata or required JSON1 function semantics.',
     'proposal':'Future lab must verify interpreter/ABI, locked offline dependency inventory, timezone and functional JSON1 queries before launching.'},
    {'id':'P05','severity':'BLOCKER','status':'PENDING','path':'sw.js',
     'fact':'Fresh service-worker install fetches exact external gstatic SDK URLs; stock cold offline shell without provisioned SDK cannot be assumed ready.',
     'proposal':'Keep cold/warm shell and synthetic harness gates distinct; no operational Chrome profile or internet warmup. Review offline public dependency provisioning separately.'},
    {'id':'P06','severity':'HIGH','status':'PENDING','path':'ames/agent/engine_bridge.py','symbol':'discover_engine',
     'fact':'Environment/config/parent/CWD engine fallbacks and default operational Chrome path can escape a copied directory.',
     'proposal':'Separate VM/account/profile, explicit lab-only paths, no inherited operational environment/mounts, independently verified containment.'},
    {'id':'P07','severity':'BLOCKER','status':'PENDING','path':'tools/ames-workstation/issue57_update_preflight.py','symbol':'backup_operational_tree',
     'fact':'Agent-data backup alone excludes browser outbox and full machine state; read-only SQLite mode is not a global maintenance lease.',
     'proposal':'Future externally attested freeze, private coherent raw DB/WAL capture, logical backup from a working copy, independent restore and private completeness ledger.'},
    {'id':'P08','severity':'HIGH','status':'PENDING','path':'tools/ames-workstation/TROCAR_PARA_PR69_NOVA.ps1',
     'fact':'Failure path may restart old installation root; does not reconcile candidate evidence newly written after startup.',
     'proposal':'No automatic stale-state resumption after new writes; preserve both generations, prove compatibility with current data or stop for supervised recovery.'},
]


def report():
    paths = set()
    for folder in ('tools/ames-workstation', 'scripts/templates'):
        paths.update(p.relative_to(ROOT).as_posix() for p in (ROOT/folder).rglob('*') if p.is_file() and p.suffix.lower() in ('.ps1','.bat','.cmd','.py','.pyw'))
    paths.update('ames/agent/'+name for name in ('agent.py','agent_entry.py','agent_hardened_entry.py','store.py','canonical.py','production_shift.py','production_diagnostics.py','preflight.py','update_candidate.py','update_readiness.py','engine_bridge.py','network_watch.py','workstation_autostart.py','candidate_config.py','hardening.py','performance_indexes.py','requirements.txt','config.example.json'))
    paths.update(('ames/factory-engine/requirements.txt','sw.js','offline-bootstrap.mjs','ames/data/workstation-update-policy.mjs','scripts/build-r12-migration-bundle.py','scripts/ames-r12-migration-bundle.test.mjs'))
    findings=[]
    for entry in FINDINGS:
        node=function(entry['path'],entry['symbol']) if 'symbol' in entry else None
        findings.append({**entry,'line':node.lineno if node else 1})
    return {'schema':'ames-offline-preparation-static-v1','base_sha':BASE,'physical':'PENDING','execution_authorized':False,
            'static_only':True,'runtime_changed':True,'runtime_scope':'update_candidate.py D01/D02 only','windows_executed':False,'sqlite_opened':False,'builders_executed':False,
            'plan':PLAN,'findings':findings,
            'source_sha256':{p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in sorted(paths)},
            'limit':'AST/text proves source structure only; no original installation, package, Windows parser, ABI, backup or homologation has been exercised.'}


class StaticOfflinePreparation(unittest.TestCase):
    def test_D01_whole_backup_validated_before_plans_and_staged_transaction(self):
        node=function('ames/agent/update_candidate.py','rollback')
        load=calls(node,'_load_backup')[0]
        self.assertLess(load.lineno,calls(node,'_restore_agent')[0].lineno)
        self.assertLess(load.lineno,calls(node,'_restore_root')[0].lineno)
        self.assertTrue(calls(node,'_transaction'))
        for name in ('_restore_agent','_restore_root'):
            plan=function('ames/agent/update_candidate.py',name)
            for mutator in ('_copy_preserving','copy2','replace','unlink'):
                self.assertFalse(calls(plan,mutator))
        for symbol in ('_load_backup','_seal','_staged','_claim_lock','recover'):
            self.assertIsNotNone(function('ames/agent/update_candidate.py',symbol))
        self.assertEqual(constant('ames/agent/update_candidate.py','BACKUP_SCHEMA'),'central-updater-backup-v2')

    def test_D02_builder_and_updater_cover_transitive_PowerShell_helper(self):
        relative='suporte/ames-workstation/ISSUE57_RELAUNCH_ENROLLMENT.ps1'
        self.assertIn(relative,constant('ames/agent/update_candidate.py','ROOT_FILES'))
        builder=tree('scripts/build-r12-migration-bundle.py')
        mapping=next(n.value for n in builder.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='ROOT_FILES' for t in n.targets))
        self.assertIn(relative,{ast.literal_eval(k) for k in mapping.keys})
        for file in ('START_AGENT_CANONICAL.ps1','KEEP_AGENT_RUNNING.ps1'):
            self.assertIn(". (Join-Path $PSScriptRoot 'ISSUE57_RELAUNCH_ENROLLMENT.ps1')",source('tools/ames-workstation/'+file))

    def test_rollback_never_targets_database_and_unverified_legacy_is_blocked(self):
        node=function('ames/agent/update_candidate.py','rollback');text=ast.unparse(node)
        self.assertNotIn('sqlite3.connect',text);self.assertNotIn('ames_local.sqlite3',text)
        self.assertTrue(calls(node,'_load_backup'))
        guard=source('ames/agent/update_candidate.py')
        self.assertIn('Operational data is never a restore target',guard)
        self.assertIn('central-updater-legacy-proof-v1',guard)

    def test_normal_windows_entry_is_not_offline_or_read_only(self):
        text=source('tools/ames-workstation/START_LOCAL_CANDIDATE.ps1')
        for token in ('08_PREPARAR_REDE_AMES.bat','01_INSTALAR_UMA_VEZ.bat','09_REPARAR_DEPENDENCIAS.bat','05_ABRIR_CHROME_AMES.bat'):
            self.assertIn(token,text)
        diagnostic=source('tools/ames-workstation/DIAGNOSTICO_POSTO.ps1')
        self.assertIn('BeginConnect(',diagnostic)
        self.assertIn('CommandLine=$p.CommandLine',diagnostic)

    def test_state_transfer_is_identity_preserving_not_lab_sanitization(self):
        node=function('tools/ames-workstation/SAFE_STATE_TRANSFER.py','stage')
        text=ast.unparse(node)
        for value in ('local_agent_token','config.json','_source_identity'):
            self.assertIn(value,text)
        backup=calls(node,'backup_operational_tree')[0]
        self.assertEqual(len(backup.args),2)
        self.assertNotIn('external_inventory',{k.arg for k in backup.keywords})
        self.assertIn('"browser_sync_attested": False',source('tools/ames-workstation/issue57_update_preflight.py'))

    def test_readiness_explicitly_is_not_authorization(self):
        text=source('ames/agent/update_readiness.py')
        for fragment in ('"update_authorized": False','"maintenance_lease": False','exclusive_lease_unavailable','sync_not_attested'):
            self.assertIn(fragment,text)
        inventory=source('tools/ames-workstation/INVENTARIAR_GUARDIANS_READONLY.ps1')
        for fragment in ('all_sessions_attested=$false','exclusive_maintenance_lease_held=$false','updater_eligible=$false'):
            self.assertIn(fragment,inventory)

    def test_import_and_startup_mutate_state_and_start_background_work(self):
        agent=tree('ames/agent/agent.py')
        self.assertTrue(any(isinstance(n,ast.Expr) and isinstance(n.value,ast.Call) and ast.unparse(n.value)=='STORE.initialize()' for n in agent.body))
        entry=function('ames/agent/agent_entry.py','main')
        for name in ('recover_jobs','ensure_monitor_thread','start'):
            self.assertTrue(calls(entry,name))
        hard=source('ames/agent/agent_hardened_entry.py')
        for name in ('hardening.install','performance_indexes.install','local_security.ensure_token'):
            self.assertIn(name,hard)

    def test_presence_preflight_does_not_prove_JSON1_or_tzdata(self):
        node=function('ames/agent/preflight.py','check');text=ast.unparse(node)
        self.assertTrue(calls(node,'find_spec'))
        for value in ('json_valid(', 'json_extract(', 'json_each(', 'json_remove(', 'tzdata', 'ZoneInfo'):
            self.assertNotIn(value,text)
        self.assertIn('tzdata>=',source('ames/agent/requirements.txt'))
        self.assertNotIn('tzdata',source('ames/factory-engine/requirements.txt'))
        for name in ('json_remove','json_group_array','json_extract','json_each'):
            self.assertIn(name,source('ames/agent/canonical.py'))

    def test_cold_stock_service_worker_needs_external_exact_SDK(self):
        text=source('sw.js');precache=text[text.index('async function precache()'):text.index('// Do not activate')]
        self.assertIn('await fetch(req)',precache)
        self.assertIn('throw new Error',precache)
        self.assertIn('https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js',text)
        self.assertIn('https://www.gstatic.com/',source('offline-bootstrap.mjs'))

    def test_rollback_switch_has_no_candidate_new_data_reconciliation(self):
        text=source('tools/ames-workstation/TROCAR_PARA_PR69_NOVA.ps1')
        rollback=text[text.index('if($rollbackNeeded){'):]
        self.assertIn("Join-Path $oldRoot 'suporte\\ames-workstation\\START_AGENT_CANONICAL.ps1'",rollback)
        self.assertNotIn('Invoke-StateTransfer',rollback)
        self.assertNotIn('new_evidence',rollback)

    def test_current_python_updater_dependency_inventory_is_closed(self):
        updater='ames/agent/update_candidate.py'
        files=set(constant(updater,'FILES'));providers=set(constant(updater,'HASHES'))|{'update_candidate.py'}
        missing=[]
        for file in sorted(files):
            for node in ast.walk(tree('ames/agent/'+file)):
                modules=([a.name.split('.')[0] for a in node.names] if isinstance(node,ast.Import) else
                         [(node.module or '').split('.')[0]] if isinstance(node,ast.ImportFrom) and not node.level else [])
                for module in modules:
                    dep=module+'.py'
                    if (ROOT/'ames/agent'/dep).is_file() and dep not in files|providers:missing.append((file,dep))
        self.assertEqual(missing,[])
        for name,digest in constant(updater,'HASHES').items():
            self.assertEqual(hashlib.sha256((ROOT/'ames/agent'/name).read_bytes()).hexdigest(),digest)

    def test_plan_requires_all_gates_no_execution_and_private_evidence(self):
        text=source(PLAN)
        for gate in ('G0','G1','G2','G3','G4','G5','G6','G7'):
            self.assertIn('### '+gate,text)
        for token in ('PENDENTE','D01','JSON1','07:00','WAL','outbox','8765','NO-GO','INTERROMPER'):
            self.assertIn(token,text)
        receipt=json.loads(source('docs/ames/homologation/OFFLINE_GATES_TEMPLATE.json'))
        self.assertEqual(receipt['physical'],'PENDING');self.assertFalse(receipt['execution_authorized'])
        self.assertEqual({g['id'] for g in receipt['gates']},{'G'+str(i) for i in range(8)})
        self.assertTrue(all(g['status']=='PENDING' and g['private_evidence_ref'] is None for g in receipt['gates']))

    def test_static_suite_itself_cannot_import_or_execute_runtime(self):
        own=ast.parse(Path(__file__).read_text())
        modules={a.name for n in ast.walk(own) if isinstance(n,ast.Import) for a in n.names}
        modules|={n.module for n in ast.walk(own) if isinstance(n,ast.ImportFrom)}
        self.assertLessEqual(modules,{'ast','hashlib','json','pathlib','sys','unittest'})
        for name in ('exec','eval','compile','__import__','import_module','connect','system','Popen','run','spawn','ZipFile'):
            self.assertFalse(calls(own,name),name)


if __name__=='__main__':
    if sys.argv[1:]==['--report']:
        print(json.dumps(report(),ensure_ascii=False,indent=2))
    else:
        unittest.main()
