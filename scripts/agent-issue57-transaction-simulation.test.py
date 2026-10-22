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


with tempfile.TemporaryDirectory() as folder:
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

    accidental = base / 'not_a_fixture'
    accidental.mkdir()
    try:
        model.recover_simulation(accidental)
        raise AssertionError('markerless path must be rejected')
    except ValueError:
        pass
print('PASS: pre/post rename power loss and failed health preserve last-good slot')
