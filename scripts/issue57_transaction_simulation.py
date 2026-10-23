"""Issue #57 C3: crash recovery MODEL, deliberately NOT a Windows updater.

It will operate only in a fixture directory carrying a simulation marker. No
processes, registry, SQLite, token, config or real CLEAN roots are addressed.
The physical coordinator still needs exclusive lease/guardian/sync handoff,
backup verification and process-identity checks before adapting this model.
"""

import json
import hashlib
import os
from pathlib import Path
import re
import stat
import tempfile
import uuid


MARKER = '.issue57_disposable_simulation'
MAGIC = 'ISSUE57_TEST_ONLY_NO_PRODUCTION'
FIXTURE_PARENT_PREFIX = 'issue57-slot-transaction-'
SCHEMA = 'ames-swap-recovery-simulation-v2'
MAX_SLOT_FILES = 10000
MAX_SLOT_BYTES = 300 * 1024 * 1024
PHASES = {'prepared', 'detach_intent', 'promote_intent', 'awaiting_health',
          'committed', 'rolled_back'}


class SimulatedPowerLoss(Exception):
    pass


def _fixture(root):
    supplied = Path(root)
    if not _safe_directory(supplied):
        raise ValueError('not_an_explicit_disposable_simulation')
    root = supplied.resolve(strict=True)
    temp = Path(tempfile.gettempdir()).resolve()
    if (temp not in root.parents or not any(
            part.name.startswith(FIXTURE_PARENT_PREFIX)
            for part in root.parents if part != temp) or
            root.name.lower().startswith('ames_central_clean')):
        raise ValueError('simulation_must_remain_inside_dedicated_temp_fixture')
    marker = root / MARKER
    if (not _safe_file(marker) or marker.stat().st_size > 100 or
            marker.read_text(encoding='utf-8') != MAGIC):
        raise ValueError('not_an_explicit_disposable_simulation')
    if any(((root / name).exists() or (root / name).is_symlink()) and
           not _safe_directory(root / name)
           for name in ('active', 'incoming', 'previous', 'quarantine')):
        raise ValueError('simulation_link_rejected')
    return root


def _safe_directory(path):
    path = Path(path)
    return (not path.is_symlink() and
            not (hasattr(path, 'is_junction') and path.is_junction()) and path.is_dir())


def _safe_file(path):
    path = Path(path)
    if path.is_symlink() or (hasattr(path, 'is_junction') and path.is_junction()):
        return False
    try:
        state = path.stat(follow_symlinks=False)
    except FileNotFoundError:
        return False
    return (stat.S_ISREG(state.st_mode) and not
            (getattr(state, 'st_file_attributes', 0) &
             getattr(stat, 'FILE_ATTRIBUTE_REPARSE_POINT', 0)))


def _fsync_dir(directory):
    # Windows cannot fsync an ordinary directory fd with os.open. This remains
    # a MODEL, not a claim of crash durability in a real Windows installation.
    if os.name != 'nt':
        fd = os.open(directory, os.O_RDONLY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)


def _fingerprint(slot):
    """Deterministic proof that a complete binary slot is the expected slot."""
    if not _safe_directory(slot):
        raise ValueError('slot_directory_untrusted')
    total = 0
    count = 0
    names = set()
    digest = hashlib.sha256()
    def fail_walk(error):
        raise error
    for root, directories, files in os.walk(slot, followlinks=False, onerror=fail_walk):
        directories.sort(key=str.casefold)
        files.sort(key=str.casefold)
        for name in directories:
            if not _safe_directory(Path(root) / name):
                raise ValueError('slot_directory_link_or_junction')
        for name in files:
            path = Path(root) / name
            if not _safe_file(path):
                raise ValueError('slot_file_link_or_junction')
            rel = path.relative_to(slot).as_posix()
            folded = rel.casefold()
            if folded in names:
                raise ValueError('case_insensitive_slot_collision')
            names.add(folded)
            size = path.stat(follow_symlinks=False).st_size
            total += size
            count += 1
            if total > MAX_SLOT_BYTES or count > MAX_SLOT_FILES:
                raise ValueError('slot_size_or_entry_limit')
            digest.update(rel.encode('utf-8'))
            digest.update(b'\0')
            digest.update(str(size).encode('ascii'))
            digest.update(b'\0')
            with path.open('rb') as reader:
                for chunk in iter(lambda: reader.read(1024 * 1024), b''):
                    digest.update(chunk)
            digest.update(b'\0')
    if count == 0:
        raise ValueError('empty_binary_slot')
    return digest.hexdigest()


def _journal(root, phase, evidence):
    path = root / 'transaction.json'
    temp = root / ('.journal.' + uuid.uuid4().hex)
    if phase not in PHASES:
        raise ValueError('invalid_simulation_phase')
    with temp.open('x', encoding='utf-8') as writer:
        json.dump({**evidence, 'schema': SCHEMA, 'phase': phase,
                   'update_authorized': False}, writer, sort_keys=True)
        writer.flush()
        os.fsync(writer.fileno())
    os.replace(temp, path)
    _fsync_dir(root)


def _phase(root):
    path = root / 'transaction.json'
    if path.is_symlink():
        raise ValueError('untrusted_simulation_journal')
    if not path.exists():
        return None
    if not _safe_file(path) or path.stat().st_size > 4096:
        raise ValueError('untrusted_simulation_journal')
    state = json.loads(path.read_text(encoding='utf-8'))
    if (not isinstance(state, dict) or
            set(state) != {'schema', 'phase', 'transaction_id', 'old_sha256',
                           'incoming_sha256', 'update_authorized'} or
            state.get('schema') != SCHEMA or
            state.get('phase') not in PHASES or
            state.get('update_authorized') is not False or
            not isinstance(state.get('transaction_id'), str) or
            re.fullmatch(r'[a-f0-9]{32}', state['transaction_id']) is None or
            any(not isinstance(state.get(key), str) or
                re.fullmatch(r'[a-f0-9]{64}', state[key]) is None
                for key in ('old_sha256', 'incoming_sha256'))):
        raise ValueError('invalid_recovery_journal')
    return state


def _matches(slot, expected):
    return slot.exists() and _fingerprint(slot) == expected


def recover_simulation(root, *, interrupt_after=None):
    """Fail closed: never destroy a candidate. Keep it in quarantine."""
    if interrupt_after not in (None, 'candidate_quarantined', 'old_restored'):
        raise ValueError('invalid_recovery_interruption_point')
    root = _fixture(root)
    document = _phase(root)
    if document is None:
        return 'no_transaction'
    phase = document['phase']
    old_digest = document['old_sha256']
    new_digest = document['incoming_sha256']
    old, new, previous, quarantine = (root / x for x in ('active', 'incoming', 'previous', 'quarantine'))
    if phase == 'committed':
        if not (_matches(old, new_digest) and _matches(previous, old_digest)):
            raise ValueError('committed_slot_identity_changed')
        return 'committed_old_slot_retained'
    if phase == 'rolled_back':
        if not _matches(old, old_digest) or previous.exists():
            raise ValueError('rolled_back_slot_identity_changed')
        if quarantine.exists() and not _matches(quarantine, new_digest):
            raise ValueError('quarantined_candidate_identity_changed')
        if new.exists() and not _matches(new, new_digest):
            raise ValueError('unpromoted_candidate_identity_changed')
        return 'rolled_back'
    if previous.exists():
        if not _matches(previous, old_digest):
            raise ValueError('previous_slot_identity_mismatch')
        if old.exists():
            if quarantine.exists() or not _matches(old, new_digest):
                raise ValueError('candidate_slot_identity_or_quarantine_conflict')
            os.replace(old, quarantine)
            _fsync_dir(root)
            if interrupt_after == 'candidate_quarantined':
                raise SimulatedPowerLoss('candidate_quarantined')
        elif quarantine.exists() and not _matches(quarantine, new_digest):
            raise ValueError('quarantined_candidate_identity_mismatch')
        elif new.exists() and not _matches(new, new_digest):
            raise ValueError('staged_candidate_identity_mismatch')
        if not quarantine.exists() and not new.exists():
            raise ValueError('lost_candidate_without_quarantine')
        os.replace(previous, old)
        _fsync_dir(root)
        if interrupt_after == 'old_restored':
            raise SimulatedPowerLoss('old_restored')
    else:
        # Idempotent replay after power loss *during rollback*. A previous
        # attempt may have already restored old and quarantined the candidate.
        if not _matches(old, old_digest):
            raise ValueError('missing_or_changed_original_slot')
        if (phase not in ('prepared', 'detach_intent') and
                not ((quarantine.exists() and _matches(quarantine, new_digest)) or
                     (new.exists() and _matches(new, new_digest)))):
            raise ValueError('missing_rollback_slot_without_proven_candidate')
    if not _matches(old, old_digest):
        raise ValueError('recovered_slot_not_original')
    # New binaries are never deleted, and persistent data stays untouched.
    _journal(root, 'rolled_back', document)
    return 'rolled_back'


def simulate_swap(root, *, health_ok=False, interrupt_after=None,
                  transaction_id=None, health_probe=None):
    root = _fixture(root)
    old, new, previous = (root / x for x in ('active', 'incoming', 'previous'))
    if _phase(root) is not None or not old.is_dir() or not new.is_dir() or previous.exists():
        raise ValueError('simulation_preconditions_not_met')
    if transaction_id is not None and (type(transaction_id) is not str or
            re.fullmatch(r'[a-f0-9]{32}', transaction_id) is None):
        raise ValueError('invalid_coordinator_transaction')
    if health_probe is not None and not callable(health_probe):
        raise ValueError('invalid_fixture_health_probe')
    evidence = {'transaction_id': transaction_id or uuid.uuid4().hex,
                'old_sha256': _fingerprint(old),
                'incoming_sha256': _fingerprint(new)}
    _journal(root, 'prepared', evidence)
    if interrupt_after == 'prepared':
        raise SimulatedPowerLoss('prepared')
    _journal(root, 'detach_intent', evidence)
    os.replace(old, previous)
    _fsync_dir(root)
    if interrupt_after == 'old_detached':
        raise SimulatedPowerLoss('old_detached')
    _journal(root, 'promote_intent', evidence)
    os.replace(new, old)
    _fsync_dir(root)
    if interrupt_after == 'new_promoted':
        raise SimulatedPowerLoss('new_promoted')
    _journal(root, 'awaiting_health', evidence)
    if interrupt_after == 'awaiting_health':
        raise SimulatedPowerLoss('awaiting_health')
    if health_probe is not None:
        try:
            # A coordinator can now check an actually launched disposable
            # candidate instead of substituting a precomputed healthy flag.
            health_ok = health_probe(old) is True
        except Exception:
            health_ok = False
    if not health_ok:
        return recover_simulation(root)
    # Previous slot remains available. No automatic deletion of a last-good
    # version is modeled or allowed here.
    if not (_matches(old, evidence['incoming_sha256']) and
            _matches(previous, evidence['old_sha256'])):
        raise ValueError('post_health_slot_identity_mismatch')
    _journal(root, 'committed', evidence)
    return 'committed_old_slot_retained'
