"""Prove recovery around each rename boundary in an entirely disposable tree."""
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
import tempfile

path = Path(__file__).with_name('issue57_transaction_simulation.py')
spec = spec_from_file_location('issue57_transaction_simulation', path)
model = module_from_spec(spec)
spec.loader.exec_module(model)


def fixture(root):
    root.mkdir()
    (root / model.MARKER).write_text(model.MAGIC)
    (root / 'active').mkdir()
    (root / 'active' / 'agent.py').write_text('original')
    (root / 'incoming').mkdir()
    (root / 'incoming' / 'agent.py').write_text('verified new')
    (root / 'persistent').mkdir()
    (root / 'persistent' / 'sqlite-preservation-marker').write_text('no changes')


with tempfile.TemporaryDirectory(prefix=model.FIXTURE_PARENT_PREFIX) as folder:
    base = Path(folder)
    for step in ('prepared', 'old_detached', 'new_promoted', 'awaiting_health'):
        root = base / step
        fixture(root)
        try:
            model.simulate_swap(root, interrupt_after=step)
            raise AssertionError('expected simulated interruption')
        except model.SimulatedPowerLoss:
            pass
        assert model.recover_simulation(root) == 'rolled_back'
        assert (root / 'active' / 'agent.py').read_text() == 'original'
        assert (root / 'persistent' / 'sqlite-preservation-marker').read_text() == 'no changes'
        if step in ('new_promoted', 'awaiting_health'):
            assert (root / 'quarantine' / 'agent.py').read_text() == 'verified new'

    bad_health = base / 'bad_health'
    fixture(bad_health)
    assert model.simulate_swap(bad_health, health_ok=False) == 'rolled_back'
    assert (bad_health / 'active' / 'agent.py').read_text() == 'original'

    good = base / 'good'
    fixture(good)
    assert model.simulate_swap(good, health_ok=True) == 'committed_old_slot_retained'
    assert (good / 'active' / 'agent.py').read_text() == 'verified new'
    assert (good / 'previous' / 'agent.py').read_text() == 'original'
    assert model.recover_simulation(good) == 'committed_old_slot_retained'
    assert (good / 'persistent' / 'sqlite-preservation-marker').read_text() == 'no changes'

    # Retry recovery after interruption during rollback itself, not only swap.
    for boundary in ('candidate_quarantined', 'old_restored'):
        root = base / ('recovery_' + boundary)
        fixture(root)
        try:
            model.simulate_swap(root, interrupt_after='awaiting_health')
            raise AssertionError('expected power loss before recovery')
        except model.SimulatedPowerLoss:
            pass
        try:
            model.recover_simulation(root, interrupt_after=boundary)
            raise AssertionError('expected power loss inside recovery')
        except model.SimulatedPowerLoss:
            pass
        assert model.recover_simulation(root) == 'rolled_back'
        assert (root / 'active' / 'agent.py').read_text() == 'original'
        assert (root / 'quarantine' / 'agent.py').read_text() == 'verified new'
        assert (root / 'persistent' / 'sqlite-preservation-marker').read_text() == 'no changes'

    # Tampered last-good slot must never be blindly promoted by recovery.
    altered = base / 'altered_previous'
    fixture(altered)
    try:
        model.simulate_swap(altered, interrupt_after='awaiting_health')
    except model.SimulatedPowerLoss:
        pass
    (altered / 'previous' / 'agent.py').write_text('corrupted last good')
    try:
        model.recover_simulation(altered)
        raise AssertionError('mismatched last-good slot must fail closed')
    except ValueError as exc:
        assert 'identity_mismatch' in str(exc)
    assert (altered / 'active' / 'agent.py').read_text() == 'verified new'

    altered_new = base / 'altered_candidate'
    fixture(altered_new)
    try:
        model.simulate_swap(altered_new, interrupt_after='awaiting_health')
    except model.SimulatedPowerLoss:
        pass
    (altered_new / 'active' / 'agent.py').write_text('unverified candidate')
    try:
        model.recover_simulation(altered_new)
        raise AssertionError('unverified candidate must never be quarantined as valid')
    except ValueError as exc:
        assert 'candidate_slot_identity' in str(exc)
    assert (altered_new / 'previous' / 'agent.py').read_text() == 'original'

    corrupt_journal = base / 'journal_tamper'
    fixture(corrupt_journal)
    try:
        model.simulate_swap(corrupt_journal, interrupt_after='awaiting_health')
    except model.SimulatedPowerLoss:
        pass
    import json
    path = corrupt_journal / 'transaction.json'
    state = json.loads(path.read_text())
    state['old_sha256'] = 'not-an-identity'
    path.write_text(json.dumps(state))
    try:
        model.recover_simulation(corrupt_journal)
        raise AssertionError('untrusted journal must never authorize rollback')
    except ValueError:
        pass
    assert (corrupt_journal / 'previous' / 'agent.py').read_text() == 'original'

    clean_named = base / 'AMES_Central_CLEAN_accidental'
    fixture(clean_named)
    try:
        model.simulate_swap(clean_named)
        raise AssertionError('CLEAN-named folder is outside fixture protocol')
    except ValueError:
        pass

    accidental = base / 'not_a_fixture'
    accidental.mkdir()
    try:
        model.recover_simulation(accidental)
        raise AssertionError('markerless path must be rejected')
    except ValueError:
        pass
print('PASS: pre/post rename power loss and failed health preserve last-good slot')
