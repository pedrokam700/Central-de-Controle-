"""Offline ZIP/staging and SQLite restore tests. Never imports/runs the agent."""
from contextlib import closing
from importlib.util import module_from_spec, spec_from_file_location
import hashlib
import json
from pathlib import Path
import sqlite3
import os
import tempfile
import zipfile

module_path = Path(__file__).resolve().parents[1] / 'tools/ames-workstation/issue57_update_preflight.py'
spec = spec_from_file_location('issue57_update_preflight', module_path)
p = module_from_spec(spec)
spec.loader.exec_module(p)


def asset_in(folder, files, *, sha='a' * 40):
    name = 'AMES_Central_CLEAN_' + sha[:8] + '.zip'
    asset = folder / name
    manifest = {'sha': sha, 'files': {k: hashlib.sha256(v).hexdigest() for k, v in files.items()}}
    with zipfile.ZipFile(asset, 'w') as zip_out:
        for name, data in files.items():
            zip_out.writestr(name, data)
        zip_out.writestr('CANDIDATE_MANIFEST.json', json.dumps(manifest))
    return asset, {'tag': 'test', 'commit': sha, 'asset': asset.name, 'sha256': p.sha256_file(asset)}


with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    asset, manifest = asset_in(root, {
        'ames-agent/agent_hardened_entry.py': b'print(123)\n',
        'frontend/index.html': b'<p>Preview only</p>',
    })
    count = p.verify_archive(asset, manifest)
    assert count == 3
    target = root / 'staged' / 'approved'
    status = p.stage_verified_archive(asset, target, manifest)
    assert status['staged'] and not status['update_authorized']
    assert (target / 'ames-agent/agent_hardened_entry.py').read_bytes() == b'print(123)\n'
    assert not (target / 'ames-agent/data').exists()
    try:
        p.stage_verified_archive(asset, target, manifest)
        raise AssertionError('existing staging tree must not be overwritten')
    except ValueError:
        pass
    try:
        p.verify_archive(asset, {**manifest, 'sha256': '0'*64})
        raise AssertionError('bad digest must fail closed')
    except ValueError:
        pass
    evil, ev = asset_in(root, {'../private.txt': b'unsafe'}, sha='b'*40)
    try:
        p.verify_archive(evil, ev)
        raise AssertionError('path traversal must fail closed')
    except ValueError:
        pass
    private, pv = asset_in(root, {'ames-agent/data/local_agent_token': b'private'}, sha='c'*40)
    try:
        p.verify_archive(private, pv)
        raise AssertionError('private data in ZIP must fail closed')
    except ValueError:
        pass

    live = root / 'live' / 'ames-agent' / 'data' / 'ames_local.sqlite3'
    live.parent.mkdir(parents=True)
    writer = sqlite3.connect(live)
    try:
        writer.execute('PRAGMA journal_mode=WAL')
        writer.execute('CREATE TABLE schema_meta(key TEXT PRIMARY KEY, value TEXT)')
        writer.execute('INSERT INTO schema_meta VALUES (?,?)', ('ames_source_id', 'test-only-secret'))
        writer.execute('CREATE TABLE jobs(status TEXT)')
        writer.commit()
        writer.execute('INSERT INTO jobs VALUES (?)', ('done',))
        writer.commit()
        backup = root / 'protected' / 'ames_local.sqlite3'
        report = p.consistent_sqlite_backup(live, backup)
        assert report['verified'] and report['restore_rehearsed'] and not report['update_authorized']
        with closing(sqlite3.connect(backup)) as snapshot:
            assert snapshot.execute('SELECT value FROM schema_meta').fetchone() == ('test-only-secret',)
            assert snapshot.execute('SELECT COUNT(*) FROM jobs').fetchone()[0] == 1
        writer.execute('INSERT INTO jobs VALUES (?)', ('running',))
        writer.commit()
        with closing(sqlite3.connect(backup)) as snapshot:
            assert snapshot.execute('SELECT COUNT(*) FROM jobs').fetchone()[0] == 1
        try:
            p.consistent_sqlite_backup(live, backup)
            raise AssertionError('existing backup must never be overwritten')
        except ValueError:
            pass
    finally:
        writer.close()
    (live.parent.parent / 'config.json').write_text('{"source_id":"fake-persistent"}')
    (live.parent / 'local_agent_token').write_text('test-only-local-token-do-not-use-in-production-123')
    bundle = root / 'identity-backup'
    report = p.backup_core_identity(root / 'live', bundle)
    assert report['core_identity_verified']
    assert not report['data_tree_complete'] and not report['update_authorized']
    assert (bundle / 'local_agent_token').read_text() == (live.parent / 'local_agent_token').read_text()
    assert (bundle / 'config.json').read_text() == (live.parent.parent / 'config.json').read_text()
    with closing(sqlite3.connect(bundle / 'ames_local.sqlite3')) as db:
        assert db.execute('SELECT COUNT(*) FROM jobs').fetchone()[0] == 2
    try:
        p.backup_core_identity(root / 'live', bundle)
        raise AssertionError('existing private backup must not be reused')
    except FileExistsError:
        pass

    # Runtime evidence outside SQLite: imports, exports and engine checkpoints.
    contents = {
        'imports/export_3028.xlsx': b'workbook only in fixture',
        'exports/report.txt': b'keep offline report',
        'checkpoints/2114/history.json': b'{"pcba":"synthetic"}',
        'backups/previous.sqlite3': b'closed historical bytes',
    }
    for rel, value in contents.items():
        file = live.parent / rel
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_bytes(value)
    runtime = root / 'private-runtime-backup'
    state = p.backup_operational_tree(root / 'live', runtime)
    assert state['agent_data_tree_verified']
    assert state['agent_data_files_verified'] == len(contents)
    assert not state['browser_sync_attested']
    assert not state['exclusive_lease_held'] and not state['update_authorized']
    data_backup = runtime / 'ames-agent' / 'data'
    for rel, value in contents.items():
        assert (data_backup / rel).read_bytes() == value
    assert not (data_backup / 'local_agent_token').exists()
    assert not (data_backup / 'ames_local.sqlite3').exists()
    assert (runtime / 'local_agent_token').read_bytes() == (live.parent / 'local_agent_token').read_bytes()
    with closing(sqlite3.connect(runtime / 'ames_local.sqlite3')) as snapshot:
        assert snapshot.execute('SELECT COUNT(*) FROM jobs').fetchone()[0] == 2
    assert p.verify_operational_backup(runtime)['verified']
    manifest_file = runtime / 'runtime-backup-manifest.json'
    assert 'test-only-local-token' not in manifest_file.read_text(encoding='utf-8')
    try:
        p.backup_operational_tree(root / 'live', runtime)
        raise AssertionError('runtime backup must not overwrite protected evidence')
    except FileExistsError:
        pass
    try:
        p.backup_operational_tree(root / 'live', root / 'insufficient-space', max_bytes=1)
        raise AssertionError('limit must prevent incomplete runtime backups')
    except ValueError:
        pass
    assert not (root / 'insufficient-space').exists()
    (data_backup / 'imports/export_3028.xlsx').write_bytes(b'TAMPERED')
    try:
        p.verify_operational_backup(runtime)
        raise AssertionError('restore check must catch changed backed-up file')
    except ValueError:
        pass
    assert (live.parent / 'imports/export_3028.xlsx').read_bytes() == contents['imports/export_3028.xlsx']
    if os.name != 'nt':
        symlink = live.parent / 'linked-private-dir'
        symlink.symlink_to(root / 'identity-backup', target_is_directory=True)
        try:
            p.backup_operational_tree(root / 'live', root / 'reject-link')
            raise AssertionError('source symlink must fail closed')
        except ValueError:
            pass
        assert not (root / 'reject-link').exists()
print('PASS: official asset digest, manifest/path allowlist, isolated staging and WAL backup/restore')
