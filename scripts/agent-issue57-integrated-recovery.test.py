"""Integrated Issue #57 C2/C3 fixture gate, NEVER a Windows updater.

Only synthetic sources under a dedicated OS temporary directory. This test
intentionally keeps ledger.update_authorized=False because no real browser,
guardian, physical PID, MES job or operator consent is attested here.
"""

from importlib.util import module_from_spec, spec_from_file_location
import hashlib
import json
from pathlib import Path
import sqlite3
import tempfile
import zipfile


ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = spec_from_file_location(name, path)
    mod = module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


preflight = load('issue57_test_preflight', ROOT / 'tools/ames-workstation/issue57_update_preflight.py')
ledger = load('issue57_test_ledger', ROOT / 'tools/ames-workstation/issue57_maintenance_ledger.py')
swap = load('issue57_test_swap', ROOT / 'scripts/issue57_transaction_simulation.py')


def prepare(root, case):
    root.mkdir()
    (root / swap.MARKER).write_text(swap.MAGIC, encoding='utf-8')
    (root / ledger.FIXTURE_MARKER).write_text(ledger.FIXTURE_MAGIC, encoding='utf-8')
    active = root / 'active' / 'ames-agent'
    active.mkdir(parents=True)
    (active / 'agent_hardened_entry.py').write_bytes(b'# old agent synthetic bytes\n')

    # The operational database and identities deliberately live OUTSIDE the
    # replaceable active/incoming slots. Never model swapping SQLite.
    persistent = root / 'persistent-clean' / 'ames-agent'
    data = persistent / 'data'
    data.mkdir(parents=True)
    db = sqlite3.connect(data / 'ames_local.sqlite3')
    try:
        db.execute('CREATE TABLE jobs (job TEXT PRIMARY KEY, status TEXT NOT NULL)')
        db.execute('INSERT INTO jobs VALUES (?,?)', ('fixture-' + case, 'completed'))
        db.commit()
    finally:
        db.close()
    (persistent / 'config.json').write_text('{"source_id":"fixture-only"}', encoding='utf-8')
    (data / 'local_agent_token').write_text('secret-in-fixture-never-printed', encoding='utf-8')
    (data / 'exports').mkdir()
    (data / 'exports' / 'report.txt').write_text('preserved fixture report')

    snapshot = root / 'private-backup'
    backed = preflight.backup_operational_tree(root / 'persistent-clean', snapshot)
    assert backed['agent_data_tree_verified'] and not backed['update_authorized']
    restore = preflight.rehearse_operational_restore(snapshot)
    assert restore['restored_into_temporary_fixture'] and not restore['update_authorized']

    files = {'ames-agent/agent_hardened_entry.py': b'# new agent synthetic bytes\n',
             'frontend/index.html': b'<p>fixture new UI</p>'}
    commit = 'c' * 40
    archive = root / ('AMES_Central_CLEAN_' + commit[:8] + '.zip')
    manifest = {'sha': commit,
                'files': {path: hashlib.sha256(body).hexdigest()
                          for path, body in files.items()}}
    with zipfile.ZipFile(archive, 'w') as output:
        for path, body in files.items():
            output.writestr(path, body)
        output.writestr('CANDIDATE_MANIFEST.json', json.dumps(manifest))
    expected = {'tag': 'fixture', 'commit': commit, 'asset': archive.name,
                'sha256': preflight.sha256_file(archive)}
    staged = preflight.stage_verified_archive(archive, root / 'incoming', expected)
    assert staged['staged'] and not staged['update_authorized']
    claimed = ledger.begin_fixture(root, ledger.fixture_identity('fixture-' + case))
    assert claimed['phase'] == 'claimed' and not claimed['update_authorized']
    return claimed['transaction_id'], snapshot, data


with tempfile.TemporaryDirectory(prefix=ledger.FIXTURE_PARENT_PREFIX) as tmp:
    root = Path(tmp) / (swap.FIXTURE_PARENT_PREFIX + 'integrated')
    root.mkdir()
    scenarios = ('prepared', 'old_detached', 'new_promoted', 'awaiting_health')
    for boundary in scenarios + ('failed_health', 'passed_health'):
        case = root / boundary
        transaction_id, snapshot, data = prepare(case, boundary)
        if boundary in scenarios:
            try:
                swap.simulate_swap(case, interrupt_after=boundary)
                raise AssertionError('fixture power-loss boundary was not honored')
            except swap.SimulatedPowerLoss:
                assert swap.recover_simulation(case) == 'rolled_back'
            assert (case / 'active' / 'ames-agent' / 'agent_hardened_entry.py').read_bytes() == b'# old agent synthetic bytes\n'
            state = ledger.transition_fixture(case, transaction_id, 0, 'recovery_required')
            assert state['phase'] == 'recovery_required'
        elif boundary == 'failed_health':
            assert swap.simulate_swap(case, health_ok=False) == 'rolled_back'
        else:
            assert swap.simulate_swap(case, health_ok=True) == 'committed_old_slot_retained'
            assert (case / 'active' / 'ames-agent' / 'agent_hardened_entry.py').read_bytes() == b'# new agent synthetic bytes\n'
            assert (case / 'previous' / 'ames-agent' / 'agent_hardened_entry.py').read_bytes() == b'# old agent synthetic bytes\n'
        assert preflight.verify_operational_backup(snapshot)['verified']
        assert preflight.rehearse_operational_restore(snapshot)['sqlite_quick_check']
        db = sqlite3.connect(data / 'ames_local.sqlite3')
        try:
            assert db.execute('SELECT COUNT(*) FROM jobs').fetchone()[0] == 1
        finally:
            # sqlite3.Connection's context manager commits but does NOT close.
            # Windows will not remove a disposable fixture with a live handle.
            db.close()
        assert (data / 'local_agent_token').read_text() == 'secret-in-fixture-never-printed'
        assert (data / 'exports' / 'report.txt').read_text() == 'preserved fixture report'
        record = ledger.inspect_fixture(case)
        assert record['journal_present'] and record['claim_present']
        assert record['update_authorized'] is False

print('PASS: staged allowlist + WAL backup/restore + persistent ledger + simulated slot recovery, fixture-only')
