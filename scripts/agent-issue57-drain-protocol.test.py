"""T2 isolated IPC tests. No real agent, MES, 8765, tokens or CLEAN roots."""

from contextlib import closing, nullcontext
import json
import hashlib
import multiprocessing
import os
import re
import subprocess
from queue import Queue
from pathlib import Path
import secrets
import sqlite3
import sys
import tempfile
from threading import Lock, Thread
from types import SimpleNamespace
import unittest
import zipfile
from urllib.request import urlopen
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "ames/agent"), str(ROOT / "tools/ames-workstation")]
from maintenance_admission import MaintenanceAdmission, MaintenanceBlocked
from maintenance_protocol import (DrainSession, DrainClient, ProtocolRejected,
                                  SCHEMA, MAX_MESSAGE, seal, unseal, serve_connection)
from issue57_drain_coordinator import FixtureDrainCoordinator, WindowsProcessWitness
import issue57_maintenance_ledger as ledger
from update_readiness import observe

IDENTITY = "a" * 64
TRANSACTION = "b" * 32


def idle_runtime(admission):
    snapshot = admission.snapshot()
    return {"idle_observed": snapshot["inflight_mutations"] == 0,
            "observation_stable": True, "new_admissions_fenced": snapshot["draining"]}


def assert_dual_fixture_mutexes_held():
    """Open existing random CI mutexes, NEVER create/acquire production ones."""
    if not os.environ.get("ISSUE57_DRAIN_FIXTURE_ROOT"):
        return False
    if (os.name != "nt" or os.environ.get("GITHUB_ACTIONS") != "true"
            or os.environ.get("RUNNER_OS") != "Windows"):
        raise RuntimeError("github_windows_runner_fixture_only")
    names = [os.environ.get("ISSUE57_DRAIN_UPDATE_MUTEX", ""),
             os.environ.get("ISSUE57_DRAIN_BOOTSTRAP_MUTEX", "")]
    suffixes = []
    for name, kind in zip(names, ("Update", "Bootstrap")):
        prefix = "Global\\CentralAMES.Issue57Dual" + kind + "Test."
        if not name.startswith(prefix) or not re.fullmatch("[0-9a-f]{32}", name[len(prefix):]):
            raise RuntimeError("production_mutex_name_forbidden")
        suffixes.append(name[len(prefix):])
    if suffixes[0] != suffixes[1]:
        raise RuntimeError("fixture_mutex_scope_mismatch")
    import ctypes
    from ctypes import wintypes
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.OpenMutexW.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.LPCWSTR]
    kernel.OpenMutexW.restype = wintypes.HANDLE
    kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
    kernel.WaitForSingleObject.restype = wintypes.DWORD
    kernel.ReleaseMutex.argtypes = [wintypes.HANDLE]
    kernel.ReleaseMutex.restype = wintypes.BOOL
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel.CloseHandle.restype = wintypes.BOOL
    for name in names:
        handle = kernel.OpenMutexW(0x00100001, False, name)
        if not handle:
            raise RuntimeError("fixture_mutex_not_opened")
        try:
            state = kernel.WaitForSingleObject(handle, 0)
            if state in (0, 0x80):
                kernel.ReleaseMutex(handle)
            if state != 0x102:  # WAIT_TIMEOUT: parent STILL holds this mutex.
                raise RuntimeError("coordinator_exclusion_not_held")
        finally:
            kernel.CloseHandle(handle)
    return True


def ipc_worker(connection, report, key, transaction):
    # Spawned interpreter uses the REAL admission/readiness code, a synthetic
    # SQLite jobs table and OS pipe. It never imports/runs the A-MES agent.
    admission = MaintenanceAdmission()
    mutex_checks = int(assert_dual_fixture_mutexes_held())
    with tempfile.TemporaryDirectory(prefix="issue57-ipc-agent-") as tmp:
        db_path = Path(tmp) / "fixture.sqlite3"
        with closing(sqlite3.connect(db_path)) as db:
            db.execute("CREATE TABLE jobs (status TEXT)")
            db.commit()
        scheduler = SimpleNamespace(snapshot=lambda: {"busy": False, "queued": 0, "normal_jobs": 0})
        def runtime():
            nonlocal mutex_checks
            mutex_checks += int(assert_dual_fixture_mutexes_held())
            return observe(scheduler, {}, Lock(), SimpleNamespace(path=db_path), admission)
        session = DrainSession(admission, runtime, key, IDENTITY, transaction)
        report.send_bytes(json.dumps(session.target).encode())
        serve_connection(connection, session)
        blocked = False
        try:
            with admission.mutation():
                pass
        except MaintenanceBlocked:
            blocked = True
        report.send_bytes(json.dumps({"fenced": admission.snapshot()["draining"],
                                     "new_job_blocked": blocked, "mutex_checks": mutex_checks}).encode())
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


def prepare_candidate_files(coordinator):
    from issue57_drain_coordinator import _fixture_slot_model
    model = _fixture_slot_model()
    slots = coordinator.fixture_slots
    slots.mkdir(parents=True)
    (slots / model.MARKER).write_text(model.MAGIC, encoding="utf-8")
    (slots / "active/ames-agent").mkdir(parents=True)
    def program(version):
        return ("from http.server import HTTPServer,BaseHTTPRequestHandler\n"
                "import json,os\n"
                "class Ready(BaseHTTPRequestHandler):\n"
                " def do_GET(self):\n"
                "  body=json.dumps({'ready':True,'pid':os.getpid(),'version':" + repr(version) + "}).encode()\n"
                "  self.send_response(200 if self.path=='/ready' else 404);self.end_headers();self.wfile.write(body)\n"
                " def log_message(self,*args):pass\n"
                "server=HTTPServer(('127.0.0.1',0),Ready);server.timeout=5\n"
                "print(server.server_port,flush=True);server.handle_request();server.server_close()\n").encode()
    (slots / "active/ames-agent/health_fixture.py").write_bytes(program("old"))
    files = {"ames-agent/health_fixture.py": program("new")}
    commit = "d" * 40
    archive = Path(coordinator.root) / ("AMES_Central_CLEAN_" + commit[:8] + ".zip")
    with zipfile.ZipFile(archive, "w") as output:
        for name, content in files.items():
            output.writestr(name, content)
        output.writestr("CANDIDATE_MANIFEST.json", json.dumps({"sha": commit, "files": {
            name: hashlib.sha256(content).hexdigest() for name, content in files.items()}}))
    return archive, {"tag": "fixture-only", "commit": commit, "asset": archive.name,
                     "sha256": hashlib.sha256(archive.read_bytes()).hexdigest()}


def probe_candidate_http(active, version="new"):
    """Launch ONLY fixture-owned code and confirm /ready PID + version."""
    child = subprocess.Popen([sys.executable, "-u", str(active / "ames-agent/health_fixture.py")],
                             stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    try:
        ready_line = Queue(maxsize=1)
        Thread(target=lambda: ready_line.put(child.stdout.readline(32)), daemon=True).start()
        port = int(ready_line.get(timeout=10))
        if not 1024 < port < 65536 or port == 8765:
            raise ValueError("fixture_health_port_invalid")
        with urlopen("http://127.0.0.1:%d/ready" % port, timeout=5) as response:
            payload = json.loads(response.read(1024))
        child.wait(timeout=10)
        return payload == {"ready": True, "pid": child.pid, "version": version} and child.returncode == 0
    finally:
        if child.poll() is None:
            child.terminate()  # This exact fixture child only.
        child.wait(timeout=10)
        child.stdout.close()


class BoundBackupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix=ledger.FIXTURE_PARENT_PREFIX)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "fixture"
        self.root.mkdir()
        (self.root / ledger.FIXTURE_MARKER).write_text(ledger.FIXTURE_MAGIC, encoding="utf-8")
        self.data = self.root / "persistent-clean/ames-agent/data"
        self.data.mkdir(parents=True)
        self.db_path = self.data / "ames_local.sqlite3"
        with closing(sqlite3.connect(self.db_path)) as db:
            db.execute("CREATE TABLE jobs(status TEXT)")
            db.execute("INSERT INTO jobs VALUES ('completed')")
            db.commit()
        (self.data.parent / "config.json").write_text('{"source_id":"fixture-stable"}')
        (self.data / "local_agent_token").write_bytes(b"private-fixture-token")
        self.admission = MaintenanceAdmission()
        scheduler = SimpleNamespace(snapshot=lambda: {"busy": False, "queued": 0, "normal_jobs": 0})
        def connect(transaction):
            key = secrets.token_bytes(32)
            session = DrainSession(self.admission, lambda: observe(scheduler, {}, Lock(),
                                   SimpleNamespace(path=self.db_path), self.admission), key, IDENTITY, transaction)
            return DrainClient(session.handle, key, session.target, transaction)
        self.coordinator = FixtureDrainCoordinator(self.root, IDENTITY, connect, lambda pid: {
            "pid": pid, "endpoint_owner_pid": pid, "installation_sha256": IDENTITY, "start_marker": "c" * 64})
        self.coordinator.observe()

    def test_backup_and_restore_are_bound_to_same_transaction_and_installation(self):
        result = self.coordinator.prepare_backup()
        self.assertTrue(result["bound_to_transaction"])
        self.assertFalse(result["update_authorized"])
        persisted = ledger.inspect_fixture(self.root)
        self.assertEqual(persisted["phase"], "backup_verified")
        self.assertEqual(persisted["backup_receipt"]["transaction_id"], self.coordinator.client.transaction_id)
        self.assertEqual(persisted["backup_receipt"]["installation_identity_sha256"], IDENTITY)
        self.assertTrue(self.coordinator.verify_bound_backup()["verified"])
        self.assertTrue(self.admission.snapshot()["draining"])
        self.assertEqual((self.data / "local_agent_token").read_bytes(), b"private-fixture-token")

    def test_structurally_valid_replaced_backup_cannot_rewrite_journal_receipt(self):
        from issue57_update_preflight import verify_operational_backup, sha256_file
        self.coordinator.prepare_backup()
        backup = self.root / "private-backup"
        (backup / "config.json").write_text('{"source_id":"substituted-fixture"}')
        manifest = backup / "runtime-backup-manifest.json"
        report = json.loads(manifest.read_text(encoding="utf-8"))
        report["core_sha256"]["config.json"] = sha256_file(backup / "config.json")
        manifest.write_text(json.dumps(report), encoding="utf-8")
        # A self-consistent edited bundle still fails the independent journal binding.
        self.assertTrue(verify_operational_backup(backup)["verified"])
        with self.assertRaisesRegex(ValueError, "coordinator_backup_receipt_mismatch"):
            self.coordinator.verify_bound_backup()
        self.assertEqual(ledger.inspect_fixture(self.root)["phase"], "recovery_required")
        self.assertTrue(self.admission.snapshot()["draining"])

    def test_failed_restore_keeps_claim_and_drain_without_backup_approval(self):
        with patch("issue57_update_preflight.rehearse_operational_restore", side_effect=ValueError("fixture crash")):
            with self.assertRaises(ValueError):
                self.coordinator.prepare_backup()
        persisted = ledger.inspect_fixture(self.root)
        self.assertEqual(persisted["phase"], "recovery_required")
        self.assertNotIn("backup_receipt", persisted)
        self.assertTrue(self.admission.snapshot()["draining"])

    def test_queued_job_blocks_backup_before_any_copy(self):
        with closing(sqlite3.connect(self.db_path)) as db:
            db.execute("UPDATE jobs SET status='queued'")
            db.commit()
        with self.assertRaisesRegex(ValueError, "coordinator_agent_not_quiescent"):
            self.coordinator.prepare_backup()
        self.assertFalse((self.root / "private-backup").exists())
        self.assertEqual(ledger.inspect_fixture(self.root)["phase"], "recovery_required")

    def test_source_link_and_existing_backup_are_never_adopted(self):
        # Existing evidence may belong to another attempt; do not overwrite it.
        backup = self.root / "private-backup"
        backup.mkdir()
        (backup / "evidence.txt").write_bytes(b"retained evidence")
        with self.assertRaises(FileExistsError):
            self.coordinator.prepare_backup()
        self.assertEqual((backup / "evidence.txt").read_bytes(), b"retained evidence")
        self.assertEqual(ledger.inspect_fixture(self.root)["phase"], "recovery_required")

    def test_receipt_from_another_transaction_is_rejected_by_ledger(self):
        self.coordinator.prepare_backup()
        journal = self.root / ".ames-update/transaction.json"
        document = json.loads(journal.read_text(encoding="utf-8"))
        document["backup_receipt"]["transaction_id"] = "e" * 32
        journal.write_text(json.dumps(document), encoding="utf-8")
        self.assertEqual(ledger.inspect_fixture(self.root)["state"], "blocked_partial_or_corrupt_transaction")

    def test_staging_apply_and_real_candidate_ready_share_one_transaction(self):
        self.coordinator.prepare_backup()
        archive, release = prepare_candidate_files(self.coordinator)
        self.assertTrue(self.coordinator.stage_fixture_candidate(archive, release)["bound_to_transaction"])
        result = self.coordinator.exercise_fixture_update(probe_candidate_http)
        self.assertEqual(result["phase"], "fixture_committed")
        self.assertFalse(result["update_authorized"])
        state = json.loads((self.coordinator.fixture_slots / "transaction.json").read_text())
        self.assertEqual(state["transaction_id"], self.coordinator.client.transaction_id)
        self.assertTrue(probe_candidate_http(self.coordinator.fixture_slots / "previous", "old"))
        self.assertEqual((self.data / "local_agent_token").read_bytes(), b"private-fixture-token")

    def test_bad_ready_version_rolls_back_and_preserves_previous_data(self):
        self.coordinator.prepare_backup()
        archive, release = prepare_candidate_files(self.coordinator)
        self.coordinator.stage_fixture_candidate(archive, release)
        result = self.coordinator.exercise_fixture_update(lambda active: probe_candidate_http(active, "unexpected"))
        self.assertEqual(result["phase"], "fixture_rolled_back")
        self.assertTrue(probe_candidate_http(self.coordinator.fixture_slots / "active", "old"))
        self.assertTrue((self.coordinator.fixture_slots / "quarantine").is_dir())
        self.assertEqual((self.data.parent / "config.json").read_text(), '{"source_id":"fixture-stable"}')

    def test_modified_staged_code_is_refused_before_detaching_original(self):
        self.coordinator.prepare_backup()
        archive, release = prepare_candidate_files(self.coordinator)
        self.coordinator.stage_fixture_candidate(archive, release)
        (self.coordinator.fixture_slots / "incoming/ames-agent/health_fixture.py").write_bytes(b"changed")
        with self.assertRaisesRegex(ValueError, "coordinator_staged_slot_changed"):
            self.coordinator.exercise_fixture_update(probe_candidate_http)
        self.assertFalse((self.coordinator.fixture_slots / "previous").exists())
        self.assertTrue(probe_candidate_http(self.coordinator.fixture_slots / "active", "old"))

    def test_invalid_asset_digest_cannot_become_staged_receipt(self):
        self.coordinator.prepare_backup()
        archive, release = prepare_candidate_files(self.coordinator)
        with self.assertRaises(ValueError):
            self.coordinator.stage_fixture_candidate(archive, {**release, "sha256": "0" * 64})
        self.assertNotIn("candidate_receipt", ledger.inspect_fixture(self.root))
        self.assertFalse((self.coordinator.fixture_slots / "incoming").exists())

    def test_interruption_at_each_swap_boundary_recovers_idempotently(self):
        for boundary in ("prepared", "old_detached", "new_promoted", "awaiting_health"):
            with self.subTest(boundary=boundary):
                case = BoundBackupTests()
                case.setUp()
                try:
                    case.coordinator.prepare_backup()
                    archive, release = prepare_candidate_files(case.coordinator)
                    case.coordinator.stage_fixture_candidate(archive, release)
                    with self.assertRaisesRegex(Exception, boundary):
                        case.coordinator.exercise_fixture_update(probe_candidate_http, interrupt_after=boundary)
                    self.assertEqual(ledger.inspect_fixture(case.root)["phase"], "recovery_required")
                    with self.assertRaisesRegex(ValueError, "coordinator_recovery_exclusion_unverified"):
                        FixtureDrainCoordinator.recover_fixture_candidate(case.root, lambda: False)
                    for _ in range(2):
                        recovered = FixtureDrainCoordinator.recover_fixture_candidate(case.root, lambda: True)
                        self.assertEqual(recovered["result"], "rolled_back")
                        self.assertTrue(recovered["claim_retained"])
                    self.assertTrue(probe_candidate_http(case.coordinator.fixture_slots / "active", "old"))
                    self.assertTrue(case.admission.snapshot()["draining"])
                finally:
                    case.doCleanups()


class CrossProcessTests(unittest.TestCase):
    def test_self_reported_identity_without_independent_os_witness_never_drains(self):
        # Even an authentic signed reply is insufficient if an independent
        # witness cannot prove the listener owner and process incarnation.
        for violation in ("missing", "wrong_owner", "wrong_installation", "bad_start"):
            with self.subTest(violation=violation):
                admission = MaintenanceAdmission()
                key = secrets.token_bytes(32)
                with tempfile.TemporaryDirectory(prefix=ledger.FIXTURE_PARENT_PREFIX) as tmp:
                    root = Path(tmp) / "fixture"
                    root.mkdir()
                    (root / ledger.FIXTURE_MARKER).write_text(ledger.FIXTURE_MAGIC, encoding="utf-8")
                    expected = {}
                    def connect(transaction):
                        session = DrainSession(admission, lambda: idle_runtime(admission),
                                               key, IDENTITY, transaction)
                        expected.update(session.target)
                        return DrainClient(session.handle, key, session.target, transaction)
                    def observer(_pid):
                        if violation == "missing":
                            return None
                        witness = {"pid": expected["pid"], "installation_sha256": IDENTITY,
                                   "start_marker": secrets.token_hex(16),
                                   "endpoint_owner_pid": expected["pid"]}
                        if violation == "wrong_owner":
                            witness["endpoint_owner_pid"] += 1
                        elif violation == "wrong_installation":
                            witness["installation_sha256"] = "f" * 64
                        elif violation == "bad_start":
                            witness["start_marker"] = "not-a-process-creation-identity"
                        return witness
                    with self.assertRaisesRegex(ValueError, "coordinator_process_witness_untrusted"):
                        FixtureDrainCoordinator(root, IDENTITY, connect, observer)
                    self.assertFalse(admission.snapshot()["draining"])
                    self.assertEqual(ledger.inspect_fixture(root)["phase"], "recovery_required")

    def run_ipc_case(self, disconnect, root_override=None, witness_change=False):
        context = multiprocessing.get_context("spawn")
        child = channel = report = None
        context_root = (tempfile.TemporaryDirectory(prefix=ledger.FIXTURE_PARENT_PREFIX)
                        if root_override is None else nullcontext(None))
        with context_root as tmp:
            root = Path(tmp) / "fixture" if root_override is None else root_override
            root.mkdir()
            (root / ledger.FIXTURE_MARKER).write_text(ledger.FIXTURE_MAGIC, encoding="utf-8")
            witness_state = {"start_marker": secrets.token_hex(16)}
            def process_witness(pid):
                # The independently launched fixture process is the IPC peer.
                # Production MUST replace this with OS PID/creation/port-owner
                # evidence, and separately enroll the installed guardian.
                if child is None or not child.is_alive():
                    raise ValueError("fixture_process_not_alive")
                return {"pid": child.pid, "installation_sha256": IDENTITY,
                        "start_marker": witness_state["start_marker"],
                        "endpoint_owner_pid": child.pid}
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
                coordinator = FixtureDrainCoordinator(root, IDENTITY, connect, process_witness)
                result = coordinator.observe()
                self.assertEqual(result["state"], "agent_quiescent_only")
                self.assertEqual(result["phase"], "awaiting_external_attestations")
                self.assertFalse(result["guardian_attested"])
                self.assertFalse(result["browser_profiles_attested"])
                self.assertFalse(result["update_authorized"])
                if witness_change:
                    # PID alone is insufficient when a process is replaced.
                    # A different independent start marker must keep the
                    # journal and agent drain closed pending recovery.
                    witness_state["start_marker"] = secrets.token_hex(16)
                    with self.assertRaisesRegex(ValueError, "coordinator_process_incarnation_changed"):
                        coordinator.observe()
                    channel.close()
                elif disconnect:
                    channel.close()
                    with self.assertRaises(ProtocolRejected):
                        coordinator.observe()
                else:
                    coordinator.cancel_before_update()
                    channel.close()
                self.assertTrue(report.poll(10))
                final = json.loads(report.recv_bytes(MAX_MESSAGE))
                mutex_checks = final.pop("mutex_checks")
                if root_override is not None:
                    self.assertGreaterEqual(mutex_checks, 3)
                else:
                    self.assertEqual(mutex_checks, 0)
                fenced = disconnect or witness_change
                self.assertEqual(final, {"fenced": fenced, "new_job_blocked": fenced})
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

    def run_windows_fixture(self):
        # Invoked only from the EXISTING dual-lock Windows fixture, while its
        # PowerShell process holds BOTH random Global mutexes in fixed order.
        self.assertTrue(assert_dual_fixture_mutexes_held())
        root = Path(os.environ["ISSUE57_DRAIN_FIXTURE_ROOT"])
        self.assertFalse(root.exists())
        self.assertEqual(root.name, "fixture")
        self.assertRegex(root.parent.name, r"^issue57-maintenance-ledger-[0-9a-f]{32}$")
        self.assertIn(Path(os.environ["RUNNER_TEMP"]).resolve(), root.resolve().parents)
        marker = root.parent / ".issue57_dual_lock_fixture_ONLY"
        self.assertEqual(marker.read_text(encoding="utf-8"), "ISSUE57_DISPOSABLE_NO_PRODUCTION")
        root.mkdir()
        (root / ledger.FIXTURE_MARKER).write_text(ledger.FIXTURE_MAGIC, encoding="utf-8")
        data = root / "persistent-clean/ames-agent/data"
        data.mkdir(parents=True)
        writer = sqlite3.connect(data / "ames_local.sqlite3")
        writer.execute("PRAGMA journal_mode=WAL")
        writer.execute("CREATE TABLE jobs(status TEXT)")
        writer.execute("INSERT INTO jobs VALUES ('completed')")
        writer.commit()
        (data.parent / "config.json").write_text('{"source_id":"existing-synthetic-origin"}')
        (data / "local_agent_token").write_bytes(b"synthetic-token-preserved")
        (data / "exports").mkdir()
        (data / "exports/report.txt").write_bytes(b"preserved offline report")
        identity = hashlib.sha256(str(root.resolve()).lower().encode("utf-8")).hexdigest()
        peer_script = ROOT / "scripts/issue57_process_witness_fixture.py"
        child = adapter = None
        checks = 0
        def read_line():
            completed = Queue(maxsize=1)
            def read():
                try:
                    completed.put(child.stdout.readline(MAX_MESSAGE + 1))
                except Exception:
                    completed.put(None)
            Thread(target=read, daemon=True).start()
            wire = completed.get(timeout=25)
            if not wire or len(wire) > MAX_MESSAGE or not wire.endswith(b"\n"):
                raise ValueError("fixture_peer_frame_unverified")
            return wire[:-1]
        def connect(transaction):
            nonlocal child, adapter
            key = secrets.token_bytes(32)
            child = subprocess.Popen([sys.executable, "-u", str(peer_script), "--maintenance-fixture-peer"],
                                     stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
            child.stdin.write(json.dumps({"key": key.hex(), "transaction_id": transaction,
                                          "installation_sha256": identity}).encode() + b"\n")
            child.stdin.flush()
            hello = json.loads(read_line())
            self.assertEqual(hello["target"]["pid"], child.pid)
            self.assertNotEqual(hello["port"], 8765)
            adapter = WindowsProcessWitness(identity, peer_script, hashlib.sha256(peer_script.read_bytes()).hexdigest(),
                                            hello["port"], fixture_only=True)
            def exchange(wire):
                child.stdin.write(wire + b"\n")
                child.stdin.flush()
                return read_line()
            return DrainClient(exchange, key, hello["target"], transaction)
        def observed_process(pid):
            nonlocal checks
            self.assertTrue(assert_dual_fixture_mutexes_held())
            checks += 1
            return adapter(pid)
        try:
            coordinator = FixtureDrainCoordinator(root, identity, connect, observed_process)
            self.assertEqual(coordinator.observe()["state"], "agent_quiescent_only")
            self.assertTrue(coordinator.prepare_backup()["bound_to_transaction"])
            self.assertTrue(coordinator.verify_bound_backup()["verified"])
            self.assertEqual(ledger.inspect_fixture(root)["phase"], "backup_verified")
            archive, release = prepare_candidate_files(coordinator)
            coordinator.stage_fixture_candidate(archive, release)
            # Actual candidate process replies /ready with the wrong expected
            # version: rollback must restore the old software, not the data.
            result = coordinator.exercise_fixture_update(lambda active: probe_candidate_http(active, "wrong-version"))
            self.assertEqual(result["phase"], "fixture_rolled_back")
            self.assertTrue(probe_candidate_http(coordinator.fixture_slots / "active", "old"))
            self.assertGreaterEqual(checks, 8)
            child.stdin.close()
            self.assertEqual(json.loads(read_line()), {"fenced": True, "new_job_blocked": True})
            child.wait(timeout=10)
            self.assertEqual(child.returncode, 0)
            # Once the OS no longer witnesses the same process/listener,
            # coordinator recovery is mandatory; the backup/claim survive.
            with self.assertRaises(ValueError):
                coordinator._assert_witness_stable()
            coordinator._recovery_required()
            persisted = ledger.inspect_fixture(root)
            self.assertEqual(persisted["phase"], "recovery_required")
            self.assertEqual(persisted["backup_receipt"]["transaction_id"], coordinator.client.transaction_id)
            self.assertFalse(persisted["update_authorized"])
            self.assertEqual((data / "local_agent_token").read_bytes(), b"synthetic-token-preserved")
            self.assertEqual((data / "exports/report.txt").read_bytes(), b"preserved offline report")
            print("Issue57 authenticated drain: dual mutex + IPC + journal + disconnect fenced; production forbidden")
            print("Issue57 observed maintenance: Win32 identity + mutexes + drain + bound backup; production forbidden")
            print("Issue57 candidate transaction: pinned staging + process ready + rollback + data retained; production forbidden")
        finally:
            writer.close()
            if child is not None:
                if child.stdin and not child.stdin.closed:
                    child.stdin.close()
                if child.poll() is None:
                    child.terminate()  # Only this exact disposable child.
                child.wait(timeout=10)
                child.stdout.close()

    def test_external_coordinator_with_independent_process_and_explicit_cancel(self):
        self.run_ipc_case(False)

    def test_lost_external_coordinator_keeps_agent_fenced_and_journal_blocking(self):
        self.run_ipc_case(True)

    def test_changed_process_incarnation_keeps_drain_and_journal_closed(self):
        self.run_ipc_case(False, witness_change=True)

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
                    FixtureDrainCoordinator(root, IDENTITY, connect,
                                            lambda pid: self.fail("untrusted target reached observer"))
                self.assertEqual(ledger.inspect_fixture(root)["phase"], "recovery_required")


if __name__ == "__main__":
    if sys.argv[1:] == ["--windows-dual-lock-fixture"]:
        CrossProcessTests("run_windows_fixture").debug()
    else:
        unittest.main()
