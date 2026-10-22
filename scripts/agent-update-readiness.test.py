"""Fail-closed contract; no MES, network or production SQLite is opened."""
import pathlib
import sqlite3
import sys
import tempfile
import threading
from contextlib import closing

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'ames' / 'agent'))
import update_readiness


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
    idle = update_readiness.observe(Scheduler(), {}, lock, store)
    assert idle['idle_observed'] and not idle['update_authorized']
    assert 'exclusive_lease_unavailable' in idle['reasons']
    assert 'sync_not_attested' in idle['reasons']
    assert not update_readiness.observe(Scheduler(busy=True), {}, lock, store)['idle_observed']
    assert not update_readiness.observe(Scheduler(normal_jobs=1), {}, lock, store)['idle_observed']
    assert not update_readiness.observe(Scheduler(queued=1), {}, lock, store)['idle_observed']
    assert not update_readiness.observe(Scheduler(), {'x': {'status': 'running'}}, lock, store)['idle_observed']
    with closing(store.connect()) as db:
        db.execute("INSERT INTO jobs VALUES ('queued')")
        db.commit()
    assert not update_readiness.observe(Scheduler(), {}, lock, store)['idle_observed']
    unknown = update_readiness.observe(Scheduler(), {}, lock, Store(str(pathlib.Path(folder) / 'missing.sqlite3')))
    assert unknown['reasons'][0] == 'runtime_state_unverified'
    assert not unknown['update_authorized']
print('PASS: update readiness observes jobs but never grants an unsafe lease')
