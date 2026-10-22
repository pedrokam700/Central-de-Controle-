"""Issue #57 safety regression: an update drain must fence new local writes.

Purely disposable fixtures; NEVER touches the real 8765 port or factory data.
"""
import importlib.util
from pathlib import Path
import shutil
import sys
import tempfile
import threading
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ames" / "agent"))
from maintenance_admission import MaintenanceAdmission, MaintenanceBlocked


class BarrierTests(unittest.TestCase):
    def test_monotonic_revision_tracks_outer_mutations_and_drain(self):
        fence = MaintenanceAdmission()
        r0 = fence.snapshot()['admission_revision']
        with fence.mutation():
            r1 = fence.snapshot()['admission_revision']
            self.assertEqual(r1, r0 + 1)
            with fence.mutation():
                self.assertEqual(fence.snapshot()['admission_revision'], r1)
        self.assertEqual(fence.snapshot()['admission_revision'], r0 + 2)
        lease = fence.begin_drain()
        self.assertEqual(fence.snapshot()['admission_revision'], r0 + 3)
        with self.assertRaises(MaintenanceBlocked):
            with fence.mutation():
                pass
        self.assertEqual(fence.snapshot()['admission_revision'], r0 + 3)
        fence.release_drain(lease)
        self.assertEqual(fence.snapshot()['admission_revision'], r0 + 4)

    def test_drain_fences_new_mutations_without_cancelling_old_ones(self):
        fence = MaintenanceAdmission()
        entered, finish, done = threading.Event(), threading.Event(), threading.Event()

        def old_request():
            with fence.mutation():
                entered.set()
                self.assertTrue(finish.wait(3))
                # Already admitted request can persist its queued job.
                with fence.mutation():
                    self.assertEqual(fence.snapshot()["inflight_mutations"], 1)
            done.set()

        worker = threading.Thread(target=old_request)
        worker.start()
        self.assertTrue(entered.wait(2))
        lease = fence.begin_drain()
        try:
            self.assertTrue(fence.snapshot()["draining"])
            self.assertEqual(fence.snapshot()["inflight_mutations"], 1)
            with self.assertRaises(MaintenanceBlocked):
                with fence.mutation():
                    self.fail("new writer must not enter")
            self.assertEqual(fence.snapshot()["inflight_mutations"], 1)
            finish.set()
            self.assertTrue(done.wait(2))
            self.assertEqual(fence.snapshot()["inflight_mutations"], 0)
            # No claim of updater readiness merely from zero active writers.
            with self.assertRaises(MaintenanceBlocked):
                fence.begin_drain()
            with self.assertRaises(ValueError):
                fence.release_drain(object())
        finally:
            finish.set()
            worker.join(2)
            fence.release_drain(lease)
        with fence.mutation():
            self.assertEqual(fence.snapshot()["inflight_mutations"], 1)
        self.assertFalse(fence.snapshot()["draining"])

    def test_concurrent_open_close_and_drain_no_gap(self):
        fence = MaintenanceAdmission()
        go = threading.Event()
        successes = []
        blocked = []

        def contestant():
            go.wait(2)
            try:
                with fence.mutation():
                    successes.append(1)
                    time.sleep(.002)
            except MaintenanceBlocked:
                blocked.append(1)

        threads = [threading.Thread(target=contestant) for _ in range(40)]
        for thread in threads:
            thread.start()
        lease = fence.begin_drain()
        go.set()
        for thread in threads:
            thread.join(3)
            self.assertFalse(thread.is_alive())
        self.assertEqual(len(successes), 0)
        self.assertEqual(len(blocked), 40)
        self.assertEqual(fence.snapshot()["inflight_mutations"], 0)
        fence.release_drain(lease)

    def test_agent_job_admission_in_fixture_is_blocked_before_sqlite(self):
        with tempfile.TemporaryDirectory() as folder:
            agent_dir = Path(folder) / "ames-agent"
            agent_dir.mkdir()
            agent_file = agent_dir / "agent.py"
            shutil.copyfile(ROOT / "ames" / "agent" / "agent.py", agent_file)
            spec = importlib.util.spec_from_file_location("issue57_fenced_agent", agent_file)
            agent = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(agent)
            lease = agent.MAINTENANCE.begin_drain()
            try:
                with self.assertRaises(MaintenanceBlocked):
                    agent.start_job({"lines": ["TAN10101"]})
                self.assertIsNone(agent.start_job({}, monitor=True))
                # Store.connect() is itself a context manager that closes its
                # SQLite handle. Wrapping it in closing() breaks on Windows.
                with agent.STORE.connect() as connection:
                    self.assertEqual(connection.execute("SELECT COUNT(*) FROM jobs").fetchone()[0], 0)
                self.assertFalse(agent.MES.snapshot()["busy"])
            finally:
                agent.MAINTENANCE.release_drain(lease)


if __name__ == "__main__":
    unittest.main()
