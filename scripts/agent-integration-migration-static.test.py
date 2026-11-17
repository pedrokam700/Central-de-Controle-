"""Source/AST contracts only. No builder import/execution, ZIP or installation."""
import ast
import hashlib
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
AGENT = ROOT/'ames/agent'


def parsed(path):
    return ast.parse(path.read_text(encoding='utf-8-sig'))


def assigned(tree, name):
    return next(node.value for node in tree.body if isinstance(node, ast.Assign)
                and any(isinstance(target, ast.Name) and target.id == name for target in node.targets))


def constants(tree, name):
    return ast.literal_eval(assigned(tree, name))


def migration_inventory():
    tree = parsed(ROOT/'scripts/build-r12-migration-bundle.py')
    names = {ast.literal_eval(key) for key in assigned(tree, 'ROOT_FILES').keys}
    for node in ast.walk(tree):
        if not isinstance(node, ast.Assign):
            continue
        for target in node.targets:
            if (isinstance(target, ast.Subscript) and isinstance(target.value, ast.Name)
                    and target.value.id == 'payload' and isinstance(target.slice, ast.Constant)
                    and isinstance(target.slice.value, str)):
                names.add(target.slice.value)
    return tree, names


class StaticMigration(unittest.TestCase):
    def test_planned_root_paths_exist_and_inventory_excludes_operational_state(self):
        tree, names = migration_inventory()
        mapping = assigned(tree, 'ROOT_FILES')
        for value in mapping.values:
            if isinstance(value, ast.Constant) and value.value is None:
                continue  # The sole generated .cmd alias is not an existing file.
            self.assertIsInstance(value, ast.BinOp)
            self.assertIsInstance(value.op, ast.Div)
            self.assertEqual(value.left.id, 'WORKSTATION')
            self.assertTrue((ROOT/'tools/ames-workstation'/ast.literal_eval(value.right)).is_file())
        names |= {'ames-agent/'+n for n in constants(parsed(AGENT/'update_candidate.py'), 'FILES')}
        self.assertFalse(any(n.endswith(('.sqlite3', '.db', '.log')) or 'local_agent_token' in n for n in names))
        self.assertIn('ATUALIZAR_R12_EXISTENTE.bat', names)
        self.assertIn('ROLLBACK_R12_EXISTENTE.bat', names)

    def test_candidate_canonical_imports_from_disposable_inventory_without_starting_agent(self):
        updater = parsed(AGENT/'update_candidate.py')
        files = set(constants(updater, 'FILES')) | set(constants(updater, 'HASHES'))
        with tempfile.TemporaryDirectory() as folder:
            for name in files:
                shutil.copy2(AGENT/name, Path(folder)/name)
            # Isolated import only: no agent/entry import, server, guardian,
            # engine browser, network, SQLite initialization or builder.
            result = subprocess.run([sys.executable, '-I', '-c',
                'import sys;sys.path.insert(0,sys.argv[1]);import canonical,process_r11,local_sn', folder],
                capture_output=True, text=True, timeout=20)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertFalse(list(Path(folder).glob('**/*.sqlite*')))

    def test_legacy_manifest_gate_aliases_and_launcher_dependencies_statically(self):
        tree, _ = migration_inventory()
        build = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'build')
        dictionaries = {next(t.id for t in n.targets if isinstance(t, ast.Name)): n.value
                        for n in build.body if isinstance(n, ast.Assign) and isinstance(n.value, ast.Dict)
                        and any(isinstance(t, ast.Name) for t in n.targets)}
        values = lambda name: {ast.literal_eval(k): v for k, v in zip(dictionaries[name].keys, dictionaries[name].values)}
        manifest, gate = values('manifest'), values('gate')
        self.assertEqual(ast.literal_eval(manifest['purpose']), 'update-existing-compatible-r11-r12')
        self.assertIn('V0.5.23_LOCAL_3022_R11', ast.literal_eval(manifest['supported_existing_baselines']))
        self.assertEqual(ast.literal_eval(manifest['installer_ux']), 'folder-picker-explicit-result-no-auto-close')
        self.assertEqual(gate['expected_sha'].id, 'frontend_sha')
        self.assertTrue(ast.literal_eval(gate['factory_gate_required']))
        self.assertGreaterEqual(len(constants(tree, 'PREVIEW_URLS')), 2)
        source = (ROOT/'scripts/build-r12-migration-bundle.py').read_text()
        updater_source = (AGENT/'update_candidate.py').read_text()
        match = re.search(r'FILES=\((.*?)\)\nROOT_FILES=', updater_source, re.S)
        self.assertEqual(set(re.findall(r"'([^']+\.py)'", match.group(1))), set(constants(parsed(AGENT/'update_candidate.py'), 'FILES')))
        self.assertIn('for name in FILES', source)
        self.assertIn("digest(payload[f'ames-agent/{name}'])", source)
        launcher = (ROOT/'tools/ames-workstation/INICIAR_POSTO_CENTRAL_V2.bat').read_text(encoding='utf-8-sig')
        for text in (':depsrepair', 'playwright>=1.55', 'pandas>=2.2', '09_REPARAR_DEPENDENCIAS.bat'):
            self.assertIn(text, launcher)
    def test_updater_transitive_local_imports_are_in_files_or_frozen_providers(self):
        updater = parsed(AGENT/'update_candidate.py')
        files = set(constants(updater, 'FILES'))
        providers = set(constants(updater, 'HASHES')) | {'update_candidate.py'}
        missing = []
        for name in sorted(files):
            for node in ast.walk(parsed(AGENT/name)):
                modules = ([alias.name.split('.')[0] for alias in node.names] if isinstance(node, ast.Import)
                           else [(node.module or '').split('.')[0]] if isinstance(node, ast.ImportFrom) and not node.level else [])
                for module in modules:
                    dependency = module + '.py'
                    if (AGENT/dependency).is_file() and dependency not in files | providers:
                        missing.append((name, dependency, node.lineno))
        self.assertEqual(missing, [], 'Candidate/updater would omit local imports at startup')

    def test_migration_inventory_contains_every_required_updater_root_file(self):
        required = set(constants(parsed(AGENT/'update_candidate.py'), 'ROOT_FILES'))
        _, offered = migration_inventory()
        self.assertEqual(sorted(required-offered), [], 'Updater preflight must accept its own planned inventory')

    def test_frozen_collectors_are_present_and_exact_without_packaging(self):
        hashes = constants(parsed(AGENT/'update_candidate.py'), 'HASHES')
        for name, expected in hashes.items():
            self.assertEqual(hashlib.sha256((AGENT/name).read_bytes()).hexdigest(), expected)

    def test_migration_wrapper_keeps_explicit_stop_hash_gate_and_rollback(self):
        tree, _ = migration_inventory()
        update = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == '_update_bat')
        rollback = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == '_rollback_bat')
        # Read the literal; do not call even the wrapper generation function.
        update_text = next(n.value.func.value.value for n in ast.walk(update) if isinstance(n, ast.Return))
        rollback_text = next(n.value.func.value.value for n in ast.walk(rollback) if isinstance(n, ast.Return))
        for text in ('BrowseForFolder', 'Get-NetTCPConnection', '8765', 'capture-r12-engine.py',
                     'update_candidate.py" update', 'pause', 'nao vai fechar sozinha'):
            self.assertIn(text, update_text)
        for text in ('BrowseForFolder', 'candidate-backups', 'backup.json', ' rollback ', 'pause'):
            self.assertIn(text, rollback_text)

    def test_migration_manifest_keeps_physical_gate_and_exact_sha_contract(self):
        tree, names = migration_inventory()
        build = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'build')
        manifest = next(n.value for n in ast.walk(build) if isinstance(n, ast.Assign)
                        and any(isinstance(t, ast.Name) and t.id == 'manifest' for t in n.targets))
        values = {ast.literal_eval(key): value for key, value in zip(manifest.keys, manifest.values)}
        self.assertEqual(ast.literal_eval(values['schema']), 'central-existing-installation-migration-v5')
        self.assertFalse(ast.literal_eval(values['new_pc_supported']))
        self.assertTrue(ast.literal_eval(values['factory_gate_required']))
        self.assertEqual(values['frontend_sha'].id, 'frontend_sha')
        self.assertIn('FRONTEND_GATE.json', names)
        self.assertIn('ATUALIZAR_INSTALACAO_EXISTENTE.bat', names)
        self.assertIn('RESTAURAR_INSTALACAO_ANTERIOR.bat', names)


if __name__ == '__main__':
    unittest.main()
