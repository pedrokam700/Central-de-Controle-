"""T2 isolated IPC tests. No real agent, MES, 8765, tokens or CLEAN roots."""

from contextlib import closing
import json
import multiprocessing
from pathlib import Path
import secrets
import sqlite3
import sys
import tempfile
from threading import Lock
from types import SimpleNamespace
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "ames/agent"), str(ROOT / "tools/ames-workstation")]
from maintenance_admission import MaintenanceAdmission, MaintenanceBlocked
from maintenance_protocol import (DrainSession, DrainClient, ProtocolRejected,
                                  SCHEMA, MAX_MESSAGE, seal, unseal, serve_connection)
from issue57_drain_coordinator import FixtureDrainCoordinator
import issue57_maintenance_ledger as ledger
from update_readiness import observe

IDENTITY = "a" * 64
TRANSACTION = "b" * 32


def idle_runtime(admission):
    snapshot = admission.snapshot()
    return {"idle_observed": snapshot["inflight_mutations"] == 0,
            "observation_stable": True, "new_admissions_fenced": snapshot["draining"]}


def ipc_worker(connection, report, key, transaction):
    # Spawned interpreter uses the REAL admission/readiness code, a synthetic
    # SQLite jobs table and OS pipe. It never imports/runs the A-MES agent.
    admission = MaintenanceAdmission()
    with tempfile.TemporaryDirectory(prefix="issue57-ipc-agent-") as tmp:
        db_path = Path(tmp) / "fixture.sqlite3"
        with closing(sqlite3.connect(db_path)) as db:
            db.execute("CREATE TABLE jobs (status TEXT)")
            db.commit()
        scheduler = SimpleNamespace(snapshot=lambda: {"busy": False, "queued": 0, "normal_jobs": 0})
        session = DrainSession(admission, lambda: observe(scheduler, {}, Lock(),
                               SimpleNamespace(path=db_path), admission), key, IDENTITY, transaction)
        report.send_bytes(json.dumps(session.target).encode())
        serve_connection(connection, session)
        blocked = False
        try:
            with admission.mutation():
                pass
        except MaintenanceBlocked:
            blocked = True
        report.send_bytes(json.dumps({"fenced": admission.snapshot()["draining"],
                                     "new_job_blocked": blocked}).encode())
        report.close()


class ProtocolTests(unittest.TestCase):
    def setUp(self):
        self.admission = MaintenanceAdmission()
        self.key = secrets.token_bytes(32)
        self.runtime = lambda: idle_runtime(self.admission)
        self.session = DrainSession(self.admission, lambda: self.runtime(), self.key, IDENTITY, TRANSACTION)
        self.client = DrainClient(self.session.handle, self.key, self.session.target, TRANSACTION)

    def request(self, **overrides):
        return {"schema": SCHEMA, "transaction_id": TRANSACTION, "target": self.session.target,
                "sequence": 1, "operation": "begin", **overrides}

    def assert_fenced(self):
        self.assertTrue(self.admission.snapshot()["draining"])
        with self.assertRaises(MaintenanceBlocked):
            with self.admission.mutation():
                self.fail("admitted a new writer")

    def test_begin_poll_cancel_and_no_update_authorization(self):
        for op in ("begin", "poll"):
            result = self.client.request(op)
            self.assertEqual(result["state"], "agent_quiescent_only")
            self.assertIs(result["update_authorized"], False)
            self.assert_fenced()
        self.assertEqual(self.client.request("cancel")["state"], "cancelled_before_update")
        with self.admission.mutation():
            pass
        with self.assertRaises(ProtocolRejected):
            self.client.request("begin")

    def test_background_writer_drains_without_cancellation(self):
        with self.admission.mutation():
            ticket = self.admission.reserve_background_work()
        self.assertEqual(self.client.request("begin")["state"], "draining")
        self.assertEqual(self.client.request("poll")["state"], "draining")
        self.assert_fenced()
        ticket.finish()
        self.assertEqual(self.client.request("poll")["state"], "agent_quiescent_only")
        self.assert_fenced()

    def test_wrong_key_and_oversized_invalid_payload_do_not_begin(self):
        wrong = seal(secrets.token_bytes(32), self.request(), "request")
        for wire in (wrong, b"x" * (MAX_MESSAGE + 1), b"{}", b"null", b"[", b"\xff"):
            with self.subTest(length=len(wire)), self.assertRaises(ProtocolRejected):
                self.session.handle(wire)
        self.assertFalse(self.admission.snapshot()["draining"])

    def test_pid_reuse_other_root_other_transaction_and_unknown_fields_rejected(self):
        for patch in ({"pid": True}, {"pid": self.session.target["pid"] + 1},
                      {"agent_instance": "c" * 64}, {"installation_sha256": "d" * 64}):
            with self.subTest(patch=patch), self.assertRaises(ProtocolRejected):
                self.session.handle(seal(self.key, self.request(target={**self.session.target, **patch}), "request"))
        for patch in ({"transaction_id": "e" * 32}, {"sequence": True}, {"sequence": 2},
                      {"schema": "legacy"}, {"update_authorized": True}, {"operation": "install"}):
            with self.subTest(patch=patch), self.assertRaises(ProtocolRejected):
                self.session.handle(seal(self.key, self.request(**patch), "request"))
        self.assertFalse(self.admission.snapshot()["draining"])

    def test_replay_out_of_order_and_response_reflection_never_release(self):
        wire = seal(self.key, self.request(), "request")
        reply = self.session.handle(wire)
        for forged in (wire, reply, seal(self.key, self.request(sequence=3, operation="cancel"), "request")):
            with self.assertRaises(ProtocolRejected):
                self.session.handle(forged)
            self.assert_fenced()

    def test_runtime_missing_busy_and_error_remain_blocked(self):
        self.runtime = lambda: {}
        self.assertEqual(self.client.request("begin")["state"], "draining")
        self.runtime = lambda: {"idle_observed": False, "observation_stable": True, "new_admissions_fenced": True}
        self.assertEqual(self.client.request("poll")["state"], "draining")
        self.runtime = lambda: (_ for _ in ()).throw(RuntimeError("private details"))
        self.assertEqual(self.client.request("poll")["state"], "runtime_unverified")
        self.assert_fenced()

    def test_queued_sqlite_job_prevents_quiescence_despite_zero_writers(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "fixture.sqlite3"
            with closing(sqlite3.connect(path)) as db:
                db.execute("CREATE TABLE jobs(status TEXT)")
                db.execute("INSERT INTO jobs VALUES ('queued')")
                db.commit()
            scheduler = SimpleNamespace(snapshot=lambda: {"busy": False, "queued": 0, "normal_jobs": 0})
            self.runtime = lambda: observe(scheduler, {}, Lock(), SimpleNamespace(path=path), self.admission)
            self.assertEqual(self.client.request("begin")["state"], "draining")
            self.assert_fenced()

    def test_lost_acknowledgement_never_automatically_retries_or_releases(self):
        calls = []
        def lost_ack(wire):
            calls.append(wire)
            self.session.handle(wire)
            raise TimeoutError("sensitive transport details")
        client = DrainClient(lost_ack, self.key, self.session.target, TRANSACTION)
        for op in ("begin", "cancel", "poll"):
            with self.assertRaisesRegex(ProtocolRejected, "^maintenance_recovery_required$"):
                client.request(op)
            self.assert_fenced()
        self.assertEqual(len(calls), 1)

    def test_tampered_and_replayed_response_never_prove_idle(self):
        def tampered(wire):
            body = unseal(self.key, self.session.handle(wire), "response")
            body["sequence"] += 1
            return seal(self.key, body, "response")
        client = DrainClient(tampered, self.key, self.session.target, TRANSACTION)
        with self.assertRaises(ProtocolRejected):
            client.request("begin")
        self.assert_fenced()

    def test_independent_key_required_and_no_automatic_live_registration(self):
        for key in (b"", b"short", "text", b"a" * 31, b"a" * 33):
            with self.assertRaises(ProtocolRejected):
                DrainSession(self.admission, self.runtime, key, IDENTITY, TRANSACTION)
        for name in ("agent.py", "agent_hardened_entry.py", "agent_entry.py"):
            self.assertNotIn("maintenance_protocol", (ROOT / "ames/agent" / name).read_text(encoding="utf-8"))


class CrossProcessTests(unittest.TestCase):
    def run_ipc_case(self, disconnect):
        context = multiprocessing.get_context("spawn")
        child = channel = report = None
        with tempfile.TemporaryDirectory(prefix=ledger.FIXTURE_PARENT_PREFIX) as tmp:
            root = Path(tmp) / "fixture"
            root.mkdir()
            (root / ledger.FIXTURE_MARKER).write_text(ledger.FIXTURE_MAGIC, encoding="utf-8")
            def connect(transaction_id):
                nonlocal child, channel, report
                channel, worker_channel = context.Pipe(duplex=True)
                report, worker_report = context.Pipe(duplex=False)
                key = secrets.token_bytes(32)
                child = context.Process(target=ipc_worker, args=(worker_channel, worker_report, key, transaction_id))
                child.start()
                worker_channel.close()
                worker_report.close()
                self.assertTrue(report.poll(15), "fixture process did not initialize")
                target = json.loads(report.recv_bytes(MAX_MESSAGE))
                self.assertEqual(target["pid"], child.pid)
                def exchange(wire):
                    channel.send_bytes(wire)
                    if not channel.poll(10):
                        raise TimeoutError()
                    return channel.recv_bytes(MAX_MESSAGE)
                return DrainClient(exchange, key, target, transaction_id)
            try:
                coordinator = FixtureDrainCoordinator(root, IDENTITY, connect)
                result = coordinator.observe()
                self.assertEqual(result["state"], "agent_quiescent_only")
                self.assertEqual(result["phase"], "awaiting_external_attestations")
                self.assertFalse(result["guardian_attested"])
                self.assertFalse(result["browser_profiles_attested"])
                self.assertFalse(result["update_authorized"])
                if disconnect:
                    channel.close()
                    with self.assertRaises(ProtocolRejected):
                        coordinator.observe()
                else:
                    coordinator.cancel_before_update()
                    channel.close()
                self.assertTrue(report.poll(10))
                final = json.loads(report.recv_bytes(MAX_MESSAGE))
                self.assertEqual(final, {"fenced": disconnect, "new_job_blocked": disconnect})
                child.join(10)
                self.assertEqual(child.exitcode, 0)
                persisted = ledger.inspect_fixture(root)
                self.assertEqual(persisted["phase"], "recovery_required")
                self.assertTrue(persisted["claim_present"])
                self.assertFalse(persisted["update_authorized"])
                # No credential, target PID or raw process identity in journal.
                document = (root / ".ames-update/transaction.json").read_text()
                self.assertNotIn("agent_instance", document)
                self.assertNotIn("mac", document)
            finally:
                if channel is not None:
                    channel.close()
                if child is not None:
                    child.join(10)
                    if child.is_alive():
                        child.terminate()  # This exact spawned fixture only.
                        child.join(10)
                if report is not None:
                    report.close()

    def test_external_coordinator_with_independent_process_and_explicit_cancel(self):
        self.run_ipc_case(False)

    def test_lost_external_coordinator_keeps_agent_fenced_and_journal_blocking(self):
        self.run_ipc_case(True)

    def test_unreachable_or_wrong_installation_records_recovery_without_clearing_claim(self):
        for wrong_target in (False, True):
            with tempfile.TemporaryDirectory(prefix=ledger.FIXTURE_PARENT_PREFIX) as tmp:
                root = Path(tmp) / "fixture"
                root.mkdir()
                (root / ledger.FIXTURE_MARKER).write_text(ledger.FIXTURE_MAGIC, encoding="utf-8")
                def connect(transaction):
                    if not wrong_target:
                        raise OSError("unavailable")
                    return SimpleNamespace(transaction_id=transaction, target={"installation_sha256": "f" * 64})
                with self.assertRaises((OSError, ValueError)):
                    FixtureDrainCoordinator(root, IDENTITY, connect)
                self.assertEqual(ledger.inspect_fixture(root)["phase"], "recovery_required")


if __name__ == "__main__":
    unittest.main()
