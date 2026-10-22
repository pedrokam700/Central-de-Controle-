"""Issue #57: all filesystem mutations are confined to disposable fixtures."""

from importlib.util import module_from_spec, spec_from_file_location
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile


module_path = Path(__file__).resolve().parents[1] / "tools/ames-workstation/issue57_maintenance_ledger.py"
spec = spec_from_file_location("issue57_maintenance_ledger", module_path)
ledger = module_from_spec(spec)
spec.loader.exec_module(ledger)

# Exact marker path already checked by the proposed *new* guardian. The old
# guardian in the real workstation has not been replaced or attested.
guardian_source = (module_path.parent / "KEEP_AGENT_RUNNING.ps1").read_text(encoding="utf-8")
assert "'.ames-update'" in guardian_source
assert "Global\\CentralAMES.UpdateTransaction.8765" in guardian_source
assert "Get-ChildItem -LiteralPath $maintenanceDir" in guardian_source


def fixture(base, name):
    root = base / name
    root.mkdir()
    (root / ledger.FIXTURE_MARKER).write_text(ledger.FIXTURE_MAGIC, encoding="utf-8")
    (root / "persistent").mkdir()
    (root / "persistent" / "sqlite-sentinel").write_text("production data must not be touched")
    (root / "persistent" / "token-sentinel").write_text("secret never goes in journal")
    return root


def must_fail(call, error=ValueError):
    try:
        call()
        raise AssertionError("unsafe operation did not fail closed")
    except error:
        pass


def sentinel(root):
    assert (root / "persistent" / "sqlite-sentinel").read_text() == "production data must not be touched"
    assert (root / "persistent" / "token-sentinel").read_text() == "secret never goes in journal"


with tempfile.TemporaryDirectory(prefix=ledger.FIXTURE_PARENT_PREFIX) as tmp:
    base = Path(tmp)
    clean_like = base / "AMES_Central_CLEAN_fake"
    clean_like.mkdir()
    (clean_like / ledger.FIXTURE_MARKER).write_text(ledger.FIXTURE_MAGIC)
    must_fail(lambda: ledger.begin_fixture(clean_like, ledger.fixture_identity("same")))

    markerless = base / "no_marker"
    markerless.mkdir()
    must_fail(lambda: ledger.begin_fixture(markerless, ledger.fixture_identity("same")))
    assert not (markerless / ".ames-update").exists()

    root = fixture(base, "normal")
    empty = ledger.inspect_fixture(root)
    assert empty["state"] == "no_fixture_transaction"
    assert empty["update_authorized"] is False
    identity = ledger.fixture_identity("fixture-root-1")
    assert len(identity) == 64
    must_fail(lambda: ledger.begin_fixture(root, "source_id_or_token_is_not_a_digest"))

    initial = ledger.begin_fixture(root, identity)
    assert initial["state"] == "blocked_persistent_transaction"
    assert initial["phase"] == "claimed" and initial["revision"] == 0
    assert initial["journal_present"] and initial["claim_present"]
    assert initial["update_authorized"] is False
    must_fail(lambda: ledger.begin_fixture(root, identity))

    tx = initial["transaction_id"]
    must_fail(lambda: ledger.transition_fixture(root, tx, True, "drain_requested"))
    must_fail(lambda: ledger.transition_fixture(root, "user-chosen-fake-id", 0, "drain_requested"))
    for revision, phase in enumerate(("drain_requested", "awaiting_external_attestations", "recovery_required", "recovered_fixture_only"), start=1):
        progressed = ledger.transition_fixture(root, tx, revision - 1, phase)
        assert progressed["phase"] == phase
        assert progressed["revision"] == revision
        assert not progressed["transition_present"]
        assert progressed["update_authorized"] is False
    must_fail(lambda: ledger.begin_fixture(root, identity))
    sentinel(root)

    # The last-good journal stays durable; "recovered" is not permission to
    # re-enter the transaction automatically or delete prior evidence.
    assert (root / ".ames-update" / "transaction.json").is_file()
    assert (root / ".ames-update" / "claim.lock").is_file()

    crash_claim = fixture(base, "crash_claim")
    must_fail(lambda: ledger.begin_fixture(crash_claim, identity, interrupt_after="claim"), ledger.SimulatedInterruption)
    state = ledger.inspect_fixture(crash_claim)
    assert state["claim_present"] and not state["journal_present"]
    assert state["state"] == "blocked_partial_or_corrupt_transaction"
    must_fail(lambda: ledger.begin_fixture(crash_claim, identity))
    sentinel(crash_claim)

    crash_journal = fixture(base, "crash_journal")
    must_fail(lambda: ledger.begin_fixture(crash_journal, identity, interrupt_after="journal"), ledger.SimulatedInterruption)
    assert ledger.inspect_fixture(crash_journal)["state"] == "blocked_persistent_transaction"
    must_fail(lambda: ledger.begin_fixture(crash_journal, identity))

    crash_before_replace = fixture(base, "crash_before_replace")
    claimed = ledger.begin_fixture(crash_before_replace, identity)
    must_fail(lambda: ledger.transition_fixture(crash_before_replace, claimed["transaction_id"], 0,
                                                "drain_requested", interrupt_after="before_replace"),
              ledger.SimulatedInterruption)
    state = ledger.inspect_fixture(crash_before_replace)
    assert state["transition_present"] and state["state"] == "blocked_partial_or_corrupt_transaction"
    document = json.loads((crash_before_replace / ".ames-update" / "transaction.json").read_text())
    assert document["phase"] == "claimed", "no torn/partially-written journal may be promoted"
    must_fail(lambda: ledger.begin_fixture(crash_before_replace, identity))
    must_fail(lambda: ledger.transition_fixture(crash_before_replace, claimed["transaction_id"], 0,
                                                "drain_requested"), FileExistsError)

    crash_after_replace = fixture(base, "crash_after_replace")
    claimed = ledger.begin_fixture(crash_after_replace, identity)
    must_fail(lambda: ledger.transition_fixture(crash_after_replace, claimed["transaction_id"], 0,
                                                "drain_requested", interrupt_after="after_replace"),
              ledger.SimulatedInterruption)
    state = ledger.inspect_fixture(crash_after_replace)
    assert state["transition_present"] and state["state"] == "blocked_partial_or_corrupt_transaction"
    document = json.loads((crash_after_replace / ".ames-update" / "transaction.json").read_text())
    assert document["phase"] == "drain_requested" and document["revision"] == 1
    sentinel(crash_after_replace)

    corrupt = fixture(base, "tampered")
    claimed = ledger.begin_fixture(corrupt, identity)
    path = corrupt / ".ames-update" / "transaction.json"
    altered = json.loads(path.read_text())
    altered["transaction_id"] = "another-transaction"
    path.write_text(json.dumps(altered))
    assert ledger.inspect_fixture(corrupt)["state"] == "blocked_partial_or_corrupt_transaction"
    must_fail(lambda: ledger.begin_fixture(corrupt, identity))

    invalid_phase = fixture(base, "invalid_phase")
    claimed = ledger.begin_fixture(invalid_phase, identity)
    must_fail(lambda: ledger.transition_fixture(invalid_phase, claimed["transaction_id"], 0,
                                                "engine_swap_without_consent"))
    assert ledger.inspect_fixture(invalid_phase)["state"] == "blocked_partial_or_corrupt_transaction"
    sentinel(invalid_phase)

    unknown_file = fixture(base, "unknown_file")
    ledger.begin_fixture(unknown_file, identity)
    (unknown_file / ".ames-update" / "unexpected.lock").write_text("unknown owner")
    assert ledger.inspect_fixture(unknown_file)["state"] == "blocked_partial_or_corrupt_transaction"

    # Cross-process exclusive creation: mandatory in Windows CI; the sandbox
    # may disable spawning on some local development hosts.
    child_script = ("import sys;sys.path.insert(0,sys.argv[1]);"
                    "from issue57_maintenance_ledger import begin_fixture;"
                    "begin_fixture(sys.argv[2],sys.argv[3])")
    try:
        duplicate = subprocess.run([sys.executable, "-c", child_script,
                                    str(module_path.parent), str(root), identity],
                                   capture_output=True, text=True, timeout=12)
    except PermissionError:
        if os.environ.get("GITHUB_ACTIONS", "").lower() == "true":
            raise
        print("SKIP: local sandbox refused child-process launch; Windows CI must prove cross-process claim")
    else:
        assert duplicate.returncode != 0
        assert "existing_transaction_requires_manual_recovery" in duplicate.stderr

    try:
        symlink_root = base / "root_alias"
        symlink_root.symlink_to(root, target_is_directory=True)
    except (OSError, NotImplementedError):
        pass
    else:
        must_fail(lambda: ledger.inspect_fixture(symlink_root))

    for candidate in (root, crash_claim, crash_journal, crash_before_replace, crash_after_replace, corrupt, invalid_phase, unknown_file):
        sentinel(candidate)

print("PASS: Issue57 durable fixture ledger fail-closed on concurrent claim, crash and mismatched identity; never updates a real CLEAN")
