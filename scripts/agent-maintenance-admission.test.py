"""Issue #57 safety regression: an update drain must fence new local writes.

Purely disposable fixtures; NEVER touches the real 8765 port or factory data.
"""
import importlib.util
import math
from pathlib import Path
import shutil
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ames" / "agent"))
from maintenance_admission import MaintenanceAdmission, MaintenanceBlocked


class BarrierTests(unittest.TestCase):
    def test_accepted_background_worker_remains_counted_across_threads(self):
        fence = MaintenanceAdmission()
        with fence.mutation():
            ticket = fence.reserve_background_work()
            self.assertEqual(fence.snapshot()['inflight_mutations'], 2)
        self.assertEqual(fence.snapshot()['inflight_mutations'], 1)
        lease = fence.begin_drain()
        try:
            self.assertFalse(fence.wait_for_quiescence(lease, .01))
            with self.assertRaises(MaintenanceBlocked):
                with fence.mutation():
                    self.fail('new job admitted during background drain')
            thread = threading.Thread(target=ticket.finish)
            thread.start()
            thread.join(2)
            self.assertFalse(thread.is_alive())
            self.assertTrue(fence.wait_for_quiescence(lease, 1))
        finally:
            fence.release_drain(lease)

    def test_background_ticket_requires_parent_admission_and_one_finish(self):
        fence = MaintenanceAdmission()
        with self.assertRaises(ValueError):
            fence.reserve_background_work()
        with fence.mutation():
            ticket = fence.reserve_background_work()
        ticket.finish()
        with self.assertRaisesRegex(ValueError, 'already_finished'):
            ticket.finish()
        self.assertEqual(fence.snapshot()['inflight_mutations'], 0)

    def test_quiescence_wait_times_out_without_releasing_fence(self):
        fence = MaintenanceAdmission()
        entered, release = threading.Event(), threading.Event()

        def existing_mutation():
            with fence.mutation():
                entered.set()
                self.assertTrue(release.wait(3))

        worker = threading.Thread(target=existing_mutation)
        worker.start()
        self.assertTrue(entered.wait(2))
        lease = fence.begin_drain()
        try:
            self.assertFalse(fence.wait_for_quiescence(lease, .01))
            self.assertTrue(fence.snapshot()['draining'])
            with self.assertRaises(MaintenanceBlocked):
                with fence.mutation():
                    self.fail('new admission during timed-out drain')
            release.set()
            self.assertTrue(fence.wait_for_quiescence(lease, 2))
            # Zero admitted writers under the lease is NOT update permission.
            self.assertTrue(fence.snapshot()['draining'])
            self.assertEqual(fence.snapshot()['inflight_mutations'], 0)
        finally:
            release.set()
            worker.join(2)
            self.assertFalse(worker.is_alive())
            fence.release_drain(lease)

    def test_quiescence_requires_current_lease_and_bounded_timeout(self):
        fence = MaintenanceAdmission()
        lease = fence.begin_drain()
        try:
            self.assertTrue(fence.wait_for_quiescence(lease, 0))
            with self.assertRaises(ValueError):
                fence.wait_for_quiescence(object(), 0)
            for bad in (-.1, 61, math.nan, math.inf, -math.inf, True, '1'):
                with self.subTest(timeout=repr(bad)), self.assertRaises(ValueError):
                    fence.wait_for_quiescence(lease, bad)
        finally:
            fence.release_drain(lease)
        with self.assertRaises(ValueError):
            fence.wait_for_quiescence(lease, 0)

    def test_quiescence_rejects_lease_revoked_while_waiting(self):
        fence = MaintenanceAdmission()
        entered, release = threading.Event(), threading.Event()

        def existing_mutation():
            with fence.mutation():
                entered.set()
                self.assertTrue(release.wait(3))

        worker = threading.Thread(target=existing_mutation)
        worker.start()
        self.assertTrue(entered.wait(2))
        lease = fence.begin_drain()
        result = []

        def observer():
            try:
                result.append(fence.wait_for_quiescence(lease, 2))
            except ValueError:
                result.append('lease_revoked')

        observer_thread = threading.Thread(target=observer)
        observer_thread.start()
        # Revoking the lease must wake observers; none may report success.
        fence.release_drain(lease)
        observer_thread.join(2)
        release.set()
        worker.join(2)
        self.assertFalse(observer_thread.is_alive())
        self.assertFalse(worker.is_alive())
        self.assertEqual(result, ['lease_revoked'])

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

    def test_agent_worker_remains_admitted_until_job_finalization(self):
        with tempfile.TemporaryDirectory() as folder:
            agent_dir = Path(folder) / 'ames-agent'
            agent_dir.mkdir()
            agent_file = agent_dir / 'agent.py'
            shutil.copyfile(ROOT / 'ames' / 'agent' / 'agent.py', agent_file)
            spec = importlib.util.spec_from_file_location('issue57_tracked_agent', agent_file)
            agent = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(agent)
            running, complete = threading.Event(), threading.Event()

            def simulated_worker(_job_id, _cfg):
                running.set()
                self.assertTrue(complete.wait(3))

            agent._launch_new_mes_job('analysis', {}, simulated_worker)
            lease = None
            try:
                self.assertTrue(running.wait(2))
                lease = agent.MAINTENANCE.begin_drain()
                self.assertFalse(agent.MAINTENANCE.wait_for_quiescence(lease, .01))
                self.assertGreaterEqual(agent.MAINTENANCE.snapshot()['inflight_mutations'], 1)
                complete.set()
                self.assertTrue(agent.MAINTENANCE.wait_for_quiescence(lease, 2))
            finally:
                complete.set()
                if lease is not None:
                    agent.MAINTENANCE.release_drain(lease)

    def test_worker_thread_start_failure_does_not_leak_ticket(self):
        with tempfile.TemporaryDirectory() as folder:
            agent_dir = Path(folder) / 'ames-agent'
            agent_dir.mkdir()
            agent_file = agent_dir / 'agent.py'
            shutil.copyfile(ROOT / 'ames' / 'agent' / 'agent.py', agent_file)
            spec = importlib.util.spec_from_file_location('issue57_failed_thread_agent', agent_file)
            agent = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(agent)
            with patch.object(agent.threading.Thread, 'start', side_effect=RuntimeError('fixture_start_failure')):
                with self.assertRaisesRegex(RuntimeError, 'fixture_start_failure'):
                    agent._launch_new_mes_job('analysis', {}, lambda *_: None)
            self.assertEqual(agent.MAINTENANCE.snapshot()['inflight_mutations'], 0)
            # The queued database job intentionally remains: a future
            # readiness observation must fail closed instead of erasing it.
            with agent.STORE.connect() as connection:
                self.assertEqual(connection.execute('SELECT COUNT(*) FROM jobs WHERE status=\'queued\'').fetchone()[0], 1)


if __name__ == "__main__":
    unittest.main()
