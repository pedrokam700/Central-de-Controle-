"""Fail-closed contract; no MES, network or production SQLite is opened."""
import pathlib
import sqlite3
import sys
import tempfile
import threading
from contextlib import closing

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'ames' / 'agent'))
import update_readiness
from maintenance_admission import MaintenanceAdmission


class Scheduler:
    def __init__(self, **kwargs):
        self.value = dict(busy=False, queued=0, normal_jobs=0)
        self.value.update(kwargs)

    def snapshot(self):
        return self.value


class Store:
    def __init__(self, path):
        self.path = path

    def connect(self):
        return sqlite3.connect(self.path)


with tempfile.TemporaryDirectory() as folder:
    store = Store(str(pathlib.Path(folder) / 'test.sqlite3'))
    with closing(store.connect()) as db:
        db.execute('CREATE TABLE jobs(status TEXT)')
        db.commit()
    lock = threading.Lock()
    fence = MaintenanceAdmission()
    def observe(scheduler, jobs=None, current_store=store):
        return update_readiness.observe(scheduler, jobs or {}, lock, current_store, fence)

    idle = observe(Scheduler())
    assert idle['idle_observed'] and not idle['update_authorized']
    assert idle['observation_stable'] is True
    assert idle['new_admissions_fenced'] is False
    assert idle['inflight_mutations'] == 0
    assert 'exclusive_lease_unavailable' in idle['reasons']
    assert 'sync_not_attested' in idle['reasons']
    assert not observe(Scheduler(busy=True))['idle_observed']
    assert not observe(Scheduler(normal_jobs=1))['idle_observed']
    assert not observe(Scheduler(queued=1))['idle_observed']
    assert not observe(Scheduler(), {'x': {'status': 'running'}})['idle_observed']

    class SchedulerChangedDuringProbe(Scheduler):
        def __init__(self):
            super().__init__()
            self.calls = 0

        def snapshot(self):
            self.calls += 1
            if self.calls == 2:
                # Mutate the SAME dict object returned by the first snapshot.
                self.value['normal_jobs'] = 1
            return self.value

    moving = observe(SchedulerChangedDuringProbe())
    assert not moving['idle_observed'] and not moving['observation_stable']
    assert 'scheduler_changed_during_observation' in moving['reasons']

    class CompletedMutationDuringProbe(Scheduler):
        def __init__(self):
            super().__init__()
            self.calls = 0

        def snapshot(self):
            self.calls += 1
            if self.calls == 2:
                # Two boundary transitions while every queue and final count
                # remains zero. One-time snapshots previously missed this.
                with fence.mutation():
                    pass
            return self.value

    observed_revision = fence.snapshot()['admission_revision']
    changed = observe(CompletedMutationDuringProbe())
    assert fence.snapshot()['admission_revision'] == observed_revision + 2
    assert changed['inflight_mutations'] == 0
    assert not changed['idle_observed'] and not changed['observation_stable']
    assert 'admission_changed_during_observation' in changed['reasons']

    class DrainChangedDuringProbe(CompletedMutationDuringProbe):
        def snapshot(self):
            self.calls += 1
            if self.calls == 2:
                ticket = fence.begin_drain()
                fence.release_drain(ticket)
            return self.value

    changed_drain = observe(DrainChangedDuringProbe())
    assert not changed_drain['idle_observed']
    assert 'admission_changed_during_observation' in changed_drain['reasons']
    with fence.mutation():
        active = observe(Scheduler())
        assert active['inflight_mutations'] == 1
        assert 'mutation_inflight' in active['reasons']
        assert not active['idle_observed']
    lease = fence.begin_drain()
    try:
        drained = observe(Scheduler())
        assert drained['new_admissions_fenced'] is True
        assert drained['update_authorized'] is False
    finally:
        fence.release_drain(lease)
    with closing(store.connect()) as db:
        db.execute("INSERT INTO jobs VALUES ('queued')")
        db.commit()
    assert not observe(Scheduler())['idle_observed']
    unknown = observe(Scheduler(), current_store=Store(str(pathlib.Path(folder) / 'missing.sqlite3')))
    assert unknown['reasons'][0] == 'runtime_state_unverified'
    assert not unknown['update_authorized']
    missing_fence = update_readiness.observe(Scheduler(), {}, lock, store)
    assert missing_fence['reasons'][0] == 'runtime_state_unverified'
    assert missing_fence['update_authorized'] is False
    class LegacyFence:
        def snapshot(self):
            return {'draining': False, 'inflight_mutations': 0}

    legacy = update_readiness.observe(Scheduler(), {}, lock, store, LegacyFence())
    assert not legacy['idle_observed']
    assert not legacy['observation_stable']
    assert legacy['reasons'][0] == 'runtime_state_unverified'
print('PASS: update readiness observes jobs but never grants an unsafe lease')
