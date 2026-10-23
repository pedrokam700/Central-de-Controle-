"""Issue #57: crash-persistent maintenance journal exercised ONLY in fixtures.

There is intentionally no executable update path. A real Windows coordinator
must independently authenticate consent, drain the agent and Firestore outbox,
coordinate ALL actual guardians and own the process before using a journal.
The marker below prevents accidentally pointing these tests at a real CLEAN.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import stat
import tempfile
import uuid


FIXTURE_MARKER = ".issue57_maintenance_fixture_ONLY"
FIXTURE_MAGIC = "ISSUE57_TEST_ROOT_NOT_A_PRODUCTION_CLEAN"
FIXTURE_PARENT_PREFIX = "issue57-maintenance-ledger-"
JOURNAL_SCHEMA = "ames-maintenance-transaction-test-v1"
LEDGER_DIR = ".ames-update"
CLAIM_FILE = "claim.lock"
JOURNAL_FILE = "transaction.json"  # New guardian already blocks on this path.
TRANSITION_FILE = "transition.lock"
SAFE_PHASES = {
    "claimed": {"drain_requested", "recovery_required"},
    "drain_requested": {"awaiting_external_attestations", "recovery_required"},
    "awaiting_external_attestations": {"backup_verified", "recovery_required"},
    "backup_verified": {"recovery_required"},
    "recovery_required": {"recovered_fixture_only"},
    "recovered_fixture_only": set(),
}


class SimulatedInterruption(Exception):
    """Power-loss boundary; persistent locks must remain after interruption."""


def _regular(path):
    path = Path(path)
    if path.is_symlink() or (hasattr(path, "is_junction") and path.is_junction()):
        return False
    try:
        state = path.stat(follow_symlinks=False)
    except FileNotFoundError:
        return False
    return (stat.S_ISREG(state.st_mode) and not
            (getattr(state, "st_file_attributes", 0) &
             getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0)))


def _directory(path):
    path = Path(path)
    if path.is_symlink() or (hasattr(path, "is_junction") and path.is_junction()):
        return False
    return path.is_dir()


def _fixture_root(root):
    supplied = Path(root)
    if not _directory(supplied):
        raise ValueError("not_a_real_fixture_directory")
    root = supplied.resolve(strict=True)
    temp = Path(tempfile.gettempdir()).resolve()
    if temp not in root.parents or not any(
            p.name.startswith(FIXTURE_PARENT_PREFIX) for p in root.parents if p != temp):
        raise ValueError("test_root_must_be_in_dedicated_temporary_fixture")
    if root.name.lower().startswith("ames_central_clean"):
        raise ValueError("clean_installation_rejected")
    marker = root / FIXTURE_MARKER
    if (not _regular(marker) or marker.stat().st_size > 100 or
            marker.read_text(encoding="utf-8") != FIXTURE_MAGIC):
        raise ValueError("fixture_magic_missing")
    return root


def _fsync_dir(directory):
    # Windows does not offer a regular directory fd through os.open. File
    # fsync is still mandatory. Windows durability must be physically gated.
    if os.name != "nt":
        fd = os.open(directory, os.O_RDONLY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)


def _ledger(root, create=False):
    root = _fixture_root(root)
    ledger = root / LEDGER_DIR
    if not ledger.exists() and create:
        ledger.mkdir(mode=0o700, exist_ok=False)
        _fsync_dir(root)
    if not _directory(ledger):
        if ledger.exists() or create:
            raise ValueError("unsafe_ledger_directory")
        return None
    return ledger


def _write_exclusive(path, payload):
    path = Path(path)
    body = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    try:
        with os.fdopen(fd, "wb") as out:
            out.write(body)
            out.flush()
            os.fsync(out.fileno())
    finally:
        _fsync_dir(path.parent)


def _read(path):
    if not _regular(path) or Path(path).stat().st_size > 4096:
        raise ValueError("ledger_file_missing_or_untrusted")
    document = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(document, dict):
        raise ValueError("invalid_ledger_json")
    return document


def _valid_identity(value):
    return type(value) is str and re.fullmatch(r"[0-9a-f]{64}", value) is not None


def _valid_transaction_id(value):
    return type(value) is str and re.fullmatch(r"[0-9a-f]{32}", value) is not None


def _valid_backup_receipt(receipt, transaction_id, identity):
    return (type(receipt) is dict and set(receipt) == {
        "transaction_id", "installation_identity_sha256", "manifest_sha256", "restoration_verified"}
        and receipt["transaction_id"] == transaction_id
        and receipt["installation_identity_sha256"] == identity
        and _valid_identity(receipt["manifest_sha256"])
        and receipt["restoration_verified"] is True)


def inspect_fixture(root):
    """Read-only state. Never clears a stale lock or starts a guardian."""
    ledger = _ledger(root)
    result = {"schema": JOURNAL_SCHEMA, "state": "no_fixture_transaction",
              "journal_present": False, "claim_present": False,
              "transition_present": False, "update_authorized": False}
    if ledger is None:
        return result
    journal, claim = ledger / JOURNAL_FILE, ledger / CLAIM_FILE
    transition = ledger / TRANSITION_FILE
    result.update(journal_present=journal.exists(), claim_present=claim.exists(),
                  transition_present=transition.exists())
    if not result["journal_present"] and not result["claim_present"] and not result["transition_present"]:
        return result
    result["state"] = "blocked_partial_or_corrupt_transaction"
    if {entry.name for entry in ledger.iterdir()} != {CLAIM_FILE, JOURNAL_FILE}:
        return result
    if not journal.exists() or not claim.exists() or transition.exists():
        return result
    try:
        a, b = _read(claim), _read(journal)
        if (a.get("schema") != JOURNAL_SCHEMA or b.get("schema") != JOURNAL_SCHEMA or
                a.get("transaction_id") != b.get("transaction_id") or
                not _valid_transaction_id(b.get("transaction_id")) or
                a.get("installation_identity_sha256") != b.get("installation_identity_sha256") or
                not _valid_identity(b.get("installation_identity_sha256")) or
                type(b.get("revision")) is not int or b["revision"] < 0 or
                b.get("phase") not in SAFE_PHASES or
                a.get("update_authorized") is not False or
                b.get("update_authorized") is not False):
            return result
        receipt = b.get("backup_receipt")
        if ((b["phase"] == "backup_verified" and receipt is None)
                or (receipt is not None and not _valid_backup_receipt(
                    receipt, b["transaction_id"], b["installation_identity_sha256"]))):
            return result
        result.update(state="blocked_persistent_transaction", phase=b["phase"],
                      revision=b["revision"], transaction_id=b["transaction_id"])
        if receipt is not None:
            result["backup_receipt"] = receipt
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError):
        pass
    return result


def begin_fixture(root, installation_identity_sha256, interrupt_after=None):
    """Atomic O_EXCL claim. Only allowed under an explicit disposable marker."""
    if not _valid_identity(installation_identity_sha256):
        raise ValueError("invalid_installation_identity")
    ledger = _ledger(root, create=True)
    if any(ledger.iterdir()):
        raise ValueError("existing_transaction_requires_manual_recovery")
    transaction_id = uuid.uuid4().hex
    common = {"schema": JOURNAL_SCHEMA, "transaction_id": transaction_id,
              "installation_identity_sha256": installation_identity_sha256,
              "update_authorized": False}
    _write_exclusive(ledger / CLAIM_FILE, common)
    if interrupt_after == "claim":
        raise SimulatedInterruption("claim_persisted")
    _write_exclusive(ledger / JOURNAL_FILE,
                     {**common, "phase": "claimed", "revision": 0})
    if interrupt_after == "journal":
        raise SimulatedInterruption("journal_persisted")
    return inspect_fixture(root)


def transition_fixture(root, transaction_id, expected_revision, next_phase,
                       interrupt_after=None, *, backup_receipt=None):
    """CAS-like persistent transition; a crash leaves a blocking marker.

    The caller cannot pass a production path, skip a phase or erase history.
    No phase of this test-only ledger is permission to update the motor.
    """
    ledger = _ledger(root)
    if (ledger is None or not _valid_transaction_id(transaction_id) or
            type(expected_revision) is not int or expected_revision < 0):
        raise ValueError("unverified_fixture_transaction")
    lock = ledger / TRANSITION_FILE
    _write_exclusive(lock, {"transaction_id": transaction_id})
    # inspect_fixture intentionally treats transition.lock as blocking. Read
    # the underlying exact journal and claim under the exclusive transition.
    try:
        claim, current = _read(ledger / CLAIM_FILE), _read(ledger / JOURNAL_FILE)
        if (claim.get("transaction_id") != transaction_id or
                current.get("transaction_id") != transaction_id or
                claim.get("schema") != JOURNAL_SCHEMA or
                current.get("schema") != JOURNAL_SCHEMA or
                current.get("installation_identity_sha256") != claim.get("installation_identity_sha256") or
                not _valid_identity(claim.get("installation_identity_sha256")) or
                claim.get("update_authorized") is not False or
                current.get("update_authorized") is not False or
                type(current.get("revision")) is not int or
                current.get("revision") != expected_revision or
                next_phase not in SAFE_PHASES.get(current.get("phase"), set())):
            raise ValueError("transaction_identity_or_phase_mismatch")
        if next_phase == "backup_verified":
            if not _valid_backup_receipt(backup_receipt, transaction_id,
                                         current["installation_identity_sha256"]):
                raise ValueError("transaction_backup_receipt_invalid")
            current = {**current, "backup_receipt": dict(backup_receipt)}
        elif backup_receipt is not None:
            raise ValueError("transaction_backup_receipt_out_of_order")
        temp = ledger / (".phase." + uuid.uuid4().hex + ".incomplete")
        _write_exclusive(temp, {**current, "phase": next_phase,
                                "revision": expected_revision + 1})
        if interrupt_after == "before_replace":
            raise SimulatedInterruption("phase_temp_persisted")
        os.replace(temp, ledger / JOURNAL_FILE)
        _fsync_dir(ledger)
        if interrupt_after == "after_replace":
            raise SimulatedInterruption("phase_promoted")
    except BaseException:
        # Deliberately keep transition.lock on uncertainty. A separate,
        # manually attested recovery must inspect and resolve it.
        raise
    lock.unlink()  # ONLY the lock freshly owned inside a marked test fixture.
    _fsync_dir(ledger)
    return inspect_fixture(root)


def fixture_identity(label):
    """Synthetic identity for fixtures, never a token/source_id from factory."""
    return hashlib.sha256(label.encode("utf-8")).hexdigest()
