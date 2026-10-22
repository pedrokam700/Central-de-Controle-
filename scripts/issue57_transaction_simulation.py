"""Issue #57 C3: crash recovery MODEL, deliberately NOT a Windows updater.

It will operate only in a fixture directory carrying a simulation marker. No
processes, registry, SQLite, token, config or real CLEAN roots are addressed.
The physical coordinator still needs exclusive lease/guardian/sync handoff,
backup verification and process-identity checks before adapting this model.
"""

import json
import os
from pathlib import Path
import uuid


MARKER = '.issue57_disposable_simulation'
MAGIC = 'ISSUE57_TEST_ONLY_NO_PRODUCTION'


class SimulatedPowerLoss(Exception):
    pass


def _fixture(root):
    root = Path(root).resolve()
    if not root.is_dir() or not (root / MARKER).is_file() or (root / MARKER).read_text() != MAGIC:
        raise ValueError('not_an_explicit_disposable_simulation')
    if any((root / name).is_symlink() for name in ('active', 'incoming', 'previous', 'quarantine')):
        raise ValueError('simulation_link_rejected')
    return root


def _journal(root, phase):
    path = root / 'transaction.json'
    temp = root / ('.journal.' + uuid.uuid4().hex)
    with temp.open('x', encoding='utf-8') as writer:
        json.dump({'schema': 'ames-swap-recovery-simulation-v1',
                   'phase': phase, 'update_authorized': False}, writer)
        writer.flush()
        os.fsync(writer.fileno())
    os.replace(temp, path)


def _phase(root):
    path = root / 'transaction.json'
    if not path.is_file():
        return None
    state = json.loads(path.read_text(encoding='utf-8'))
    if state.get('schema') != 'ames-swap-recovery-simulation-v1':
        raise ValueError('invalid_recovery_journal')
    return state['phase']


def recover_simulation(root):
    """Fail closed: never destroy a candidate. Keep it in quarantine."""
    root = _fixture(root)
    phase = _phase(root)
    if phase is None:
        return 'no_transaction'
    if phase == 'committed':
        return 'committed_old_slot_retained'
    if phase == 'rolled_back':
        return 'rolled_back'
    if phase not in ('prepared', 'detach_intent', 'promote_intent', 'awaiting_health'):
        raise ValueError('unknown_transaction_state')
    old, new, previous, quarantine = (root / x for x in ('active', 'incoming', 'previous', 'quarantine'))
    if previous.exists():
        if old.exists():
            if quarantine.exists():
                raise ValueError('quarantine_occupied_refuse_overwrite')
            os.replace(old, quarantine)
        os.replace(previous, old)
    elif phase != 'prepared' and phase != 'detach_intent':
        raise ValueError('missing_rollback_slot')
    elif not old.is_dir():
        raise ValueError('missing_original_slot')
    # New binaries are never deleted, and persistent data stays untouched.
    _journal(root, 'rolled_back')
    return 'rolled_back'


def simulate_swap(root, *, health_ok=False, interrupt_after=None):
    root = _fixture(root)
    old, new, previous = (root / x for x in ('active', 'incoming', 'previous'))
    if _phase(root) is not None or not old.is_dir() or not new.is_dir() or previous.exists():
        raise ValueError('simulation_preconditions_not_met')
    _journal(root, 'prepared')
    if interrupt_after == 'prepared':
        raise SimulatedPowerLoss('prepared')
    _journal(root, 'detach_intent')
    os.replace(old, previous)
    if interrupt_after == 'old_detached':
        raise SimulatedPowerLoss('old_detached')
    _journal(root, 'promote_intent')
    os.replace(new, old)
    if interrupt_after == 'new_promoted':
        raise SimulatedPowerLoss('new_promoted')
    _journal(root, 'awaiting_health')
    if interrupt_after == 'awaiting_health':
        raise SimulatedPowerLoss('awaiting_health')
    if not health_ok:
        return recover_simulation(root)
    # Previous slot remains available. No automatic deletion of a last-good
    # version is modeled or allowed here.
    _journal(root, 'committed')
    return 'committed_old_slot_retained'
