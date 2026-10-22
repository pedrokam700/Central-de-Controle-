"""Offline ZIP/staging and SQLite restore tests. Never imports/runs the agent."""
from contextlib import closing
from importlib.util import module_from_spec, spec_from_file_location
import hashlib
import json
from pathlib import Path
import sqlite3
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
print('PASS: official asset digest, manifest/path allowlist, isolated staging and WAL backup/restore')
