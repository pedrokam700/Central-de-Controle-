"""External drain orchestration over the canonical Issue57 fixture ledger.

No production entrypoint: the existing ledger rejects CLEAN/operational roots.
The transport session is bound to the claim BEFORE requesting agent drain.
This reuses the admission protocol, not a second updater or a second agent.
Windows guardian/browser enrollment remains a mandatory, unresolved gate.
The injected process witness MUST come from an independent OS observation;
neither /ready nor the agent's own signed reply can attest its own PID/port.
"""

import hashlib
from importlib.util import module_from_spec, spec_from_file_location
import json
import os
from pathlib import Path
import re
import subprocess

from issue57_maintenance_ledger import begin_fixture, inspect_fixture, transition_fixture


def _fixture_slot_model():
    # Reuse the already tested recovery model. Its own marker/temp-directory
    # checks remain mandatory; never route through legacy update_candidate.py.
    path = Path(__file__).resolve().parents[2] / "scripts/issue57_transaction_simulation.py"
    spec = spec_from_file_location("issue57_coordinator_slot_model", path)
    model = module_from_spec(spec)
    spec.loader.exec_module(model)
    return model


class WindowsProcessWitness:
    """Bind the existing OS witness to a selected installation and pinned code.

    No PID/port information from /ready or from a signed IPC reply is trusted
    as OS evidence. This adapter never starts/stops an operational process.
    """

    def __init__(self, installation_sha256, expected_script, expected_script_sha256,
                 port=8765, *, fixture_only=False, run=subprocess.run):
        if (not re.fullmatch("[0-9a-f]{64}", installation_sha256)
                or not re.fullmatch("[0-9a-f]{64}", expected_script_sha256)
                or type(port) is not int or not 1 <= port <= 65535):
            raise ValueError("windows_witness_configuration_invalid")
        if port != 8765 and not fixture_only:
            raise ValueError("windows_witness_port_invalid")
        self.installation = installation_sha256
        self.script = str(Path(expected_script).resolve(strict=True))
        self.script_digest = expected_script_sha256
        self.port, self.fixture_only, self._run = port, fixture_only, run

    def __call__(self, pid):
        reason = "adapter_platform_or_pid_invalid"
        try:
            if os.name != "nt" or type(pid) is not int or pid <= 0:
                raise ValueError()
            arguments = ["powershell.exe", "-NoProfile", "-NonInteractive", "-File",
                         str(Path(__file__).with_name("ISSUE57_PROCESS_WITNESS_READONLY.ps1")),
                         "-TargetPid", str(pid), "-ExpectedScript", self.script,
                         "-Port", str(self.port)]
            if self.fixture_only:
                arguments.append("-FixtureOnly")
            reason = "adapter_observer_execution_failed"
            completed = self._run(arguments, capture_output=True, timeout=20, check=False)
            if completed.returncode != 0 or len(completed.stdout) > 4096:
                raise ValueError()
            reason = "adapter_observer_json_invalid"
            result = json.loads(completed.stdout)
            safe_reasons = {"witness_configuration_failed", "witness_script_inspection_failed",
                            "witness_process_lookup_failed", "witness_listener_lookup_failed",
                            "witness_command_line_parse_failed", "witness_identity_hash_failed",
                            "witness_creation_time_failed", "witness_script_digest_failed",
                            "witness_script_path_digest_failed", "witness_process_marker_failed",
                            "fixture_environment_required", "production_port_mismatch", "script_file_untrusted",
                            "process_unverified", "listener_absent", "port_owner_or_bind_mismatch",
                            "command_line_unparseable", "script_argument_mismatch"}
            if result.get("process_identity_observed") is not True:
                reason = result.get("reason_code") if result.get("reason_code") in safe_reasons else "adapter_os_witness_rejected"
                raise ValueError()
            path_digest = hashlib.sha256(self.script.lower().encode("utf-8")).hexdigest()
            reason = "adapter_observer_contract_mismatch"
            if result.get("script_sha256") != self.script_digest:
                reason = "adapter_script_digest_mismatch"
                raise ValueError()
            if result.get("script_path_sha256") != path_digest:
                reason = "adapter_script_path_mismatch"
                raise ValueError()
            if (result.get("schema") != "ames-windows-process-witness-v1"
                    or result.get("read_only") is not True
                    or result.get("process_identity_observed") is not True
                    or type(result.get("pid")) is not int or result["pid"] != pid
                    or type(result.get("endpoint_owner_pid")) is not int
                    or result["endpoint_owner_pid"] != pid
                    or result.get("script_sha256") != self.script_digest
                    or result.get("script_path_sha256") != path_digest
                    or result.get("update_authorized") is not False
                    or result.get("guardian_attested") is not False
                    or result.get("all_sessions_attested") is not False
                    or not isinstance(result.get("start_marker"), str)
                    or not re.fullmatch("[0-9a-f]{64}", result["start_marker"])):
                raise ValueError()
            return {"pid": pid, "endpoint_owner_pid": pid,
                    "installation_sha256": self.installation,
                    "start_marker": result["start_marker"]}
        except Exception:
            raise ValueError("independent_windows_witness_unverified:" + reason) from None


class FixtureDrainCoordinator:
    def __init__(self, root, installation_sha256, connect, observe_process):
        self.root = root
        self.claim = begin_fixture(root, installation_sha256)
        self.client = None
        self._observe_process = observe_process
        self._witness = None
        try:
            # connect must bind the independently verified process target and
            # a fresh maintenance credential to THIS journal transaction.
            self.client = connect(self.claim["transaction_id"])
            if (self.client.transaction_id != self.claim["transaction_id"]
                    or self.client.target["installation_sha256"] != installation_sha256):
                raise ValueError("coordinator_target_mismatch")
            # The signed agent reply is not its own independent OS witness.
            # Require a stable observed process incarnation AND endpoint owner.
            self._witness = self._attest_process()
            self.client.request("begin")
            self._assert_witness_stable()
            self._transition("drain_requested")
        except Exception:
            self._recovery_required()
            raise

    def _attest_process(self):
        observed = self._observe_process(self.client.target["pid"])
        if (type(observed) is not dict or
                set(observed) != {"pid", "installation_sha256", "start_marker", "endpoint_owner_pid"}
                or type(observed["pid"]) is not int or observed["pid"] <= 0
                or type(observed["endpoint_owner_pid"]) is not int
                or observed["endpoint_owner_pid"] != observed["pid"]
                or observed["pid"] != self.client.target["pid"]
                or observed["installation_sha256"] != self.client.target["installation_sha256"]
                or type(observed["start_marker"]) is not str
                or re.fullmatch("[0-9a-f]{32,64}", observed["start_marker"]) is None):
            raise ValueError("coordinator_process_witness_untrusted")
        return dict(observed)

    def _assert_witness_stable(self):
        if self._attest_process() != self._witness:
            raise ValueError("coordinator_process_incarnation_changed")

    def _transition(self, phase):
        self.claim = transition_fixture(self.root, self.claim["transaction_id"],
                                        self.claim["revision"], phase)

    def _recovery_required(self):
        if self.claim["phase"] != "recovery_required":
            self._transition("recovery_required")

    def observe(self):
        try:
            self._assert_witness_stable()
            persisted = inspect_fixture(self.root)
            if persisted != self.claim or self.claim["phase"] not in {
                    "drain_requested", "awaiting_external_attestations", "backup_verified",
                    "candidate_staged", "fixture_applying"}:
                raise ValueError("coordinator_journal_mismatch")
            result = self.client.request("poll")
            self._assert_witness_stable()
            if result["state"] == "agent_quiescent_only" and self.claim["phase"] == "drain_requested":
                self._transition("awaiting_external_attestations")
            return {"state": result["state"], "phase": self.claim["phase"],
                    "guardian_attested": False, "browser_profiles_attested": False,
                    "update_authorized": False}
        except Exception:
            self._recovery_required()
            raise

    def prepare_backup(self):
        """Create/restore-check a backup bound to THIS fixture transaction.

        Only reads the explicitly marked fixture's persistent-clean subtree.
        No caller-selected production source, backup reuse or update approval.
        """
        from issue57_update_preflight import (backup_operational_tree,
                                              rehearse_operational_restore, sha256_file)
        try:
            if self.claim["phase"] != "awaiting_external_attestations":
                raise ValueError("coordinator_backup_out_of_order")
            if self.observe()["state"] != "agent_quiescent_only":
                raise ValueError("coordinator_agent_not_quiescent")
            source = Path(self.root) / "persistent-clean"
            backup = Path(self.root) / "private-backup"
            # The ledger has already rejected any operational/CLEAN root.
            # Refuse links before resolving so it cannot escape that fixture.
            if (source.is_symlink() or backup.is_symlink()
                    or (hasattr(source, "is_junction") and source.is_junction())
                    or (hasattr(backup, "is_junction") and backup.is_junction())
                    or source.resolve().parent != Path(self.root).resolve()):
                raise ValueError("coordinator_backup_source_untrusted")
            backup_operational_tree(source, backup)
            rehearse_operational_restore(backup)
            if self.observe()["state"] != "agent_quiescent_only":
                raise ValueError("coordinator_agent_not_quiescent")
            receipt = {"transaction_id": self.claim["transaction_id"],
                       "installation_identity_sha256": self.client.target["installation_sha256"],
                       "manifest_sha256": sha256_file(backup / "runtime-backup-manifest.json"),
                       "restoration_verified": True}
            self.claim = transition_fixture(self.root, self.claim["transaction_id"],
                                            self.claim["revision"], "backup_verified",
                                            backup_receipt=receipt)
            return {"backup_verified": True, "bound_to_transaction": True,
                    "browser_profiles_attested": False, "guardian_attested": False,
                    "update_authorized": False}
        except Exception:
            self._recovery_required()
            raise

    def verify_bound_backup(self):
        """Recheck the receipt AND bytes before any future staging/swap step."""
        from issue57_update_preflight import verify_operational_backup, sha256_file
        try:
            if self.claim["phase"] not in {"backup_verified", "candidate_staged", "fixture_applying"}:
                raise ValueError("coordinator_backup_not_bound")
            if self.observe()["state"] != "agent_quiescent_only":
                raise ValueError("coordinator_agent_not_quiescent")
            backup = Path(self.root) / "private-backup"
            verify_operational_backup(backup)
            if sha256_file(backup / "runtime-backup-manifest.json") != self.claim["backup_receipt"]["manifest_sha256"]:
                raise ValueError("coordinator_backup_receipt_mismatch")
            self._assert_witness_stable()
            return {"verified": True, "update_authorized": False}
        except Exception:
            self._recovery_required()
            raise

    @property
    def fixture_slots(self):
        return Path(self.root) / ("issue57-slot-transaction-" + self.claim["transaction_id"]) / "candidate"

    def stage_fixture_candidate(self, archive, expected=None):
        """Pin release/staging to the same backup + journal, fixture only."""
        from issue57_update_preflight import stage_verified_archive, OFFICIAL
        try:
            if self.claim["phase"] != "backup_verified":
                raise ValueError("coordinator_staging_out_of_order")
            self.verify_bound_backup()
            model = _fixture_slot_model()
            slots = model._fixture(self.fixture_slots)
            if not (slots / "active").is_dir() or model._phase(slots) is not None:
                raise ValueError("coordinator_original_slot_unverified")
            model._fingerprint(slots / "active")
            release = dict(OFFICIAL if expected is None else expected)
            stage_verified_archive(archive, slots / "incoming", release)
            # Recheck the drain/backup after potentially long extraction.
            self.verify_bound_backup()
            receipt = {"transaction_id": self.claim["transaction_id"],
                       "backup_manifest_sha256": self.claim["backup_receipt"]["manifest_sha256"],
                       "release_commit": release["commit"], "asset_sha256": release["sha256"],
                       "slot_sha256": model._fingerprint(slots / "incoming")}
            self.claim = transition_fixture(self.root, self.claim["transaction_id"],
                                            self.claim["revision"], "candidate_staged",
                                            candidate_receipt=receipt)
            return {"staged": True, "bound_to_transaction": True, "update_authorized": False}
        except Exception:
            self._recovery_required()
            raise

    def exercise_fixture_update(self, health_probe, *, interrupt_after=None):
        """Apply/health/rollback ONLY the existing marked, disposable model.

        No production stop/start API, no physical PID, no automatic promotion.
        health_probe launches/verifies only software owned by the fixture.
        """
        try:
            if self.claim["phase"] != "candidate_staged" or not callable(health_probe):
                raise ValueError("coordinator_fixture_apply_out_of_order")
            self.verify_bound_backup()
            model = _fixture_slot_model()
            slots = model._fixture(self.fixture_slots)
            if model._fingerprint(slots / "incoming") != self.claim["candidate_receipt"]["slot_sha256"]:
                raise ValueError("coordinator_staged_slot_changed")
            self._transition("fixture_applying")
            def observed_health(active):
                self._assert_witness_stable()
                healthy = health_probe(active) is True
                self._assert_witness_stable()
                return healthy
            result = model.simulate_swap(slots, transaction_id=self.claim["transaction_id"],
                                         health_probe=observed_health, interrupt_after=interrupt_after)
            self.verify_bound_backup()
            phase = "fixture_committed" if result == "committed_old_slot_retained" else "fixture_rolled_back"
            self._transition(phase)
            return {"result": result, "phase": phase, "update_authorized": False}
        except Exception:
            self._recovery_required()
            raise

    @staticmethod
    def recover_fixture_candidate(root, assert_exclusive):
        """Restart-safe recovery without requiring the dead agent to respond.

        An external holder must assert its exclusion at each boundary. This
        method still rejects operational roots through the SAME fixture ledger
        and slot guards; it cannot enroll/stop an installed guardian or PID.
        """
        from issue57_update_preflight import verify_operational_backup, sha256_file
        current = inspect_fixture(root)
        if (current.get("state") != "blocked_persistent_transaction"
                or current.get("phase") not in {"fixture_applying", "recovery_required", "fixture_rolled_back"}
                or "candidate_receipt" not in current or not callable(assert_exclusive)):
            raise ValueError("coordinator_fixture_recovery_unverified")
        if assert_exclusive() is not True:
            raise ValueError("coordinator_recovery_exclusion_unverified")
        backup = Path(root) / "private-backup"
        verify_operational_backup(backup)
        if sha256_file(backup / "runtime-backup-manifest.json") != current["backup_receipt"]["manifest_sha256"]:
            raise ValueError("coordinator_backup_receipt_mismatch")
        slots = Path(root) / ("issue57-slot-transaction-" + current["transaction_id"]) / "candidate"
        model = _fixture_slot_model()
        model._fixture(slots)
        state = model._phase(slots)
        if (state is None or state["transaction_id"] != current["transaction_id"]
                or state["incoming_sha256"] != current["candidate_receipt"]["slot_sha256"]):
            raise ValueError("coordinator_recovery_slot_receipt_mismatch")
        result = model.recover_simulation(slots)
        if result != "rolled_back" or assert_exclusive() is not True:
            raise ValueError("coordinator_fixture_recovery_unverified")
        if current["phase"] != "fixture_rolled_back":
            if current["phase"] == "fixture_applying":
                current = transition_fixture(root, current["transaction_id"], current["revision"], "recovery_required")
            transition_fixture(root, current["transaction_id"], current["revision"], "fixture_rolled_back")
        return {"result": result, "claim_retained": True, "update_authorized": False}

    def cancel_before_update(self):
        # This coordinator cannot perform a swap. Keep the durable claim for
        # explicit recovery even after authenticated cancellation of the fence.
        try:
            self._assert_witness_stable()
        except Exception:
            self._recovery_required()
            raise
        self._recovery_required()
        return self.client.request("cancel")
