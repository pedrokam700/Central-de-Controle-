"""Disposable Windows CI listener / maintenance peer, never an installed agent.

The maintenance mode is only reachable through private stdin/stdout handles
created by the owning fixture. It does not serve HTTP or accept TCP payloads.
No credential is passed in argv/environment, printed or written to the ledger.
"""

from contextlib import closing
import json
import os
from pathlib import Path
import socket
import sqlite3
import sys
from threading import Lock
import time
from types import SimpleNamespace


def maintenance_peer(listener):
    if (os.environ.get('GITHUB_ACTIONS') != 'true' or os.environ.get('RUNNER_OS') != 'Windows'
            or not os.environ.get('ISSUE57_DRAIN_FIXTURE_ROOT')):
        raise RuntimeError('windows_ci_fixture_only')
    repo = Path(__file__).resolve().parents[1]
    sys.path[:0] = [str(repo / 'ames/agent'), str(repo / 'tools/ames-workstation')]
    from maintenance_admission import MaintenanceAdmission, MaintenanceBlocked
    from maintenance_protocol import DrainSession, MAX_MESSAGE
    from update_readiness import observe
    import issue57_maintenance_ledger as ledger
    bootstrap = sys.stdin.buffer.readline(MAX_MESSAGE + 1)
    if len(bootstrap) > MAX_MESSAGE or not bootstrap.endswith(b'\n'):
        raise RuntimeError('fixture_bootstrap_invalid')
    setup = json.loads(bootstrap)
    root = ledger._fixture_root(os.environ['ISSUE57_DRAIN_FIXTURE_ROOT'])
    journal = ledger.inspect_fixture(root)
    if journal.get('transaction_id') != setup['transaction_id'] or journal.get('phase') != 'claimed':
        raise RuntimeError('fixture_transaction_mismatch')
    claim = json.loads((root / '.ames-update/claim.lock').read_text(encoding='utf-8'))
    if claim['installation_identity_sha256'] != setup['installation_sha256']:
        raise RuntimeError('fixture_installation_mismatch')
    db_path = root / 'ames-agent/data/ames_local.sqlite3'
    # Both the drain/readiness and backup use THIS exact synthetic installation.
    with closing(sqlite3.connect(db_path.as_uri() + '?mode=ro', uri=True)) as db:
        if db.execute('PRAGMA quick_check').fetchone() != ('ok',):
            raise RuntimeError('fixture_database_invalid')
    admission = MaintenanceAdmission()
    scheduler = SimpleNamespace(snapshot=lambda: {'busy': False, 'queued': 0, 'normal_jobs': 0})
    session = DrainSession(admission, lambda: observe(scheduler, {}, Lock(),
                           SimpleNamespace(path=db_path), admission), bytes.fromhex(setup['key']),
                           setup['installation_sha256'], setup['transaction_id'])
    del setup, bootstrap
    print(json.dumps({'target': session.target, 'port': listener.getsockname()[1]}), flush=True)
    while True:
        wire = sys.stdin.buffer.readline(MAX_MESSAGE + 1)
        if not wire:
            break
        if len(wire) > MAX_MESSAGE or not wire.endswith(b'\n'):
            raise RuntimeError('fixture_frame_invalid')
        sys.stdout.buffer.write(session.handle(wire[:-1]) + b'\n')
        sys.stdout.buffer.flush()
    blocked = False
    try:
        with admission.mutation():
            pass
    except MaintenanceBlocked:
        blocked = True
    print(json.dumps({'fenced': admission.snapshot()['draining'], 'new_job_blocked': blocked}), flush=True)


if __name__ == '__main__':
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind(('127.0.0.1', 0))
        listener.listen(1)
        if sys.argv[1:] == ['--maintenance-fixture-peer']:
            maintenance_peer(listener)
        elif not sys.argv[1:]:
            print(listener.getsockname()[1], flush=True)
            time.sleep(30)
        else:
            raise RuntimeError('fixture_mode_invalid')
