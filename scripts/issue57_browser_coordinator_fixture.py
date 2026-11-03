"""Private stdio bridge for the existing coordinator + REAL browser CI test.

Synthetic agent/readiness only; never imports an installed agent, accesses MES,
serves HTTP or opens a production installation. Browser keys never enter logs.
"""
from contextlib import closing
import hashlib
import json
from pathlib import Path
import secrets
import sqlite3
import sys
import tempfile
from threading import Lock
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / 'ames/agent'), str(ROOT / 'tools/ames-workstation')]
from maintenance_admission import MaintenanceAdmission
from maintenance_protocol import DrainClient, DrainSession
from issue57_drain_coordinator import FixtureDrainCoordinator, BrowserMaintenanceClient
from issue57_maintenance_ledger import FIXTURE_PARENT_PREFIX, FIXTURE_MARKER, FIXTURE_MAGIC, inspect_fixture


def send(value):
    print(json.dumps(value, separators=(',', ':')), flush=True)


def receive():
    wire = sys.stdin.buffer.readline(8193)
    if not wire or len(wire) > 8192 or not wire.endswith(b'\n'):
        raise ValueError('fixture_private_channel_unverified')
    return json.loads(wire)


with tempfile.TemporaryDirectory(prefix=FIXTURE_PARENT_PREFIX) as tmp:
    root = Path(tmp) / 'fixture'
    data = root / 'ames-agent/data'
    data.mkdir(parents=True)
    (root / FIXTURE_MARKER).write_text(FIXTURE_MAGIC)
    (data.parent / 'config.json').write_text('{"source_id":"synthetic-browser-fixture"}')
    (data / 'local_agent_token').write_text('synthetic-private-fixture-only')
    with closing(sqlite3.connect(data / 'ames_local.sqlite3')) as db:
        db.execute('CREATE TABLE jobs(status TEXT)')
        db.commit()
    (root / 'logs').mkdir()
    (root / 'logs/agent_guardian.log').write_bytes(b'synthetic browser integration guardian log')
    identity = hashlib.sha256(str(root).encode()).hexdigest()
    admission = MaintenanceAdmission()
    def connect(transaction):
        key = secrets.token_bytes(32)
        session = DrainSession(admission, lambda: {'idle_observed': True, 'observation_stable': True,
                               'new_admissions_fenced': admission.snapshot()['draining']}, key, identity, transaction)
        return DrainClient(session.handle, key, session.target, transaction)
    coordinator = FixtureDrainCoordinator(root, identity, connect, lambda pid: {
        'pid': pid, 'endpoint_owner_pid': pid, 'installation_sha256': identity, 'start_marker': 'c' * 64})
    coordinator.observe()
    binding = {'installation_sha256': identity, 'scope_id': secrets.token_hex(32), 'transaction_id': coordinator.claim['transaction_id']}
    key = secrets.token_bytes(32)
    send({'type': 'setup', 'binding': binding, 'key': key.hex()})
    assert receive() == {'ready': True}
    def exchange(wire):
        send({'type': 'exchange', 'wire': wire.decode('ascii')})
        reply = receive()
        if set(reply) != {'wire'}:
            raise OSError('browser_scope_disconnected')
        return reply['wire'].encode('ascii')
    participant = BrowserMaintenanceClient(exchange, key, binding['scope_id'])
    assert coordinator.enroll_browser(participant)['enrolled_browser_scopes'] == 1
    assert coordinator.observe()['browser_profiles_attested'] is False
    assert coordinator.prepare_backup()['bound_to_transaction']
    coordinator.verify_bound_backup()
    send({'type': 'close-scope'})
    assert receive() == {'closed': True}
    try:
        coordinator.observe()
        raise AssertionError('lost_browser_was_accepted')
    except ValueError:
        pass
    state = inspect_fixture(root)
    assert state['phase'] == 'recovery_required' and state['claim_present']
    assert admission.snapshot()['draining']
    assert state['browser_receipt']['scope_id'] == binding['scope_id']
    assert state['backup_receipt']['transaction_id'] == binding['transaction_id']
    send({'type': 'done', 'binding': binding, 'phase': state['phase'], 'claim_present': True,
          'browser_receipt': state['browser_receipt'], 'update_authorized': False})
