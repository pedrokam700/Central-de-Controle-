"""External drain orchestration over the canonical Issue57 fixture ledger.

No production entrypoint: the existing ledger rejects CLEAN/operational roots.
The transport session is bound to the claim BEFORE requesting agent drain.
This reuses the admission protocol, not a second updater or a second agent.
Compatible relaunchers can enroll in the same fixture transaction; coverage
of installed/legacy origins and browser writers remains an unresolved gate.
The injected process witness MUST come from an independent OS observation;
neither /ready nor the agent's own signed reply can attest its own PID/port.
"""

import hashlib
from importlib.util import module_from_spec, spec_from_file_location
import json
import ntpath
import os
from pathlib import Path
import re
import subprocess
import secrets

from issue57_maintenance_ledger import begin_fixture, inspect_fixture, transition_fixture


def _fixture_slot_model():
    # Reuse the already tested recovery model. Its own marker/temp-directory
    # checks remain mandatory; never route through legacy update_candidate.py.
    path = Path(__file__).resolve().parents[2] / "scripts/issue57_transaction_simulation.py"
    spec = spec_from_file_location("issue57_coordinator_slot_model", path)
    model = module_from_spec(spec)
    spec.loader.exec_module(model)
    return model


_GUARDIAN_INVENTORY_CHECKS = frozenset({
    "running_processes", "hkcu_run", "hkcu_runonce", "hklm_run",
    "hklm_runonce", "hklm_wow_run", "scheduled_tasks", "windows_services",
    "startup_current_user", "startup_common",
})
_GUARDIAN_OBSERVATION_SOURCES = (_GUARDIAN_INVENTORY_CHECKS - {
    "running_processes", "scheduled_tasks", "windows_services"
}) | {"running_process", "scheduled_task", "windows_service"}
_GUARDIAN_INVENTORY_SIGNALS = {
    "guardian_script": "guardian_registration_or_process_observed",
    "agent_launcher": "direct_launcher_registration_or_process_observed",
    "agent_entry": "agent_process_observed_requires_idle_proof",
    "opaque_supervisor_unverified": "opaque_supervisor_command_unverified",
    "named_registration_unverified": "named_registration_unverified",
    "startup_shortcut_unverified": "startup_shortcut_unverified",
}
_GUARDIAN_INVENTORY_BASE_BLOCKERS = frozenset({
    "installed_guardian_cooperation_not_attested", "direct_launcher_not_fenced",
    "other_windows_sessions_not_attested",
})


def inspect_readonly_guardian_inventory(report):
    """Validate the existing read-only Windows inventory as *diagnostic* input.

    This is neither a proof of all sessions nor an authenticated enrollment.
    Never retain/return raw command lines, paths, registry values or PIDs.
    A consistent report still cannot authorize an update.
    """
    try:
        expected = {"schema", "read_only", "checks", "observations",
                    "unreadable_supervisor_processes", "coordination_blockers",
                    "direct_launcher_fenced", "observed_sources_complete",
                    "all_sessions_attested", "installed_guardian_cooperation_attested",
                    "exclusive_maintenance_lease_held", "updater_eligible", "reason"}
        if (type(report) is not dict or set(report) != expected
                or report["schema"] != "ames-windows-guardian-inventory-v1"
                or report["read_only"] is not True
                or any(report[key] is not False for key in (
                    "direct_launcher_fenced", "all_sessions_attested",
                    "installed_guardian_cooperation_attested",
                    "exclusive_maintenance_lease_held", "updater_eligible"))
                or report["reason"] != "read_only_observation_cannot_authorize_process_stop_or_update"):
            raise ValueError()
        checks, observations = report["checks"], report["observations"]
        unreadable = report["unreadable_supervisor_processes"]
        if (type(checks) is not list or type(observations) is not list
                or len(checks) != len(_GUARDIAN_INVENTORY_CHECKS)
                or len(observations) > 20000 or type(unreadable) is not int
                or unreadable < 0):
            raise ValueError()
        checked = {}
        for check in checks:
            if (type(check) is not dict or set(check) != {"source", "checked"}
                    or check["source"] not in _GUARDIAN_INVENTORY_CHECKS
                    or check["source"] in checked or type(check["checked"]) is not bool):
                raise ValueError()
            checked[check["source"]] = check["checked"]
        if set(checked) != _GUARDIAN_INVENTORY_CHECKS:
            raise ValueError()
        blockers = set(_GUARDIAN_INVENTORY_BASE_BLOCKERS)
        if unreadable:
            blockers.add("supervisor_commandline_unreadable")
        if not all(checked.values()):
            blockers.add("inventory_source_incomplete")
        for entry in observations:
            if (type(entry) is not dict or set(entry) not in (
                    {"source", "signal"}, {"source", "signal", "pid"})
                    or entry["source"] not in _GUARDIAN_OBSERVATION_SOURCES
                    or entry["signal"] not in _GUARDIAN_INVENTORY_SIGNALS):
                raise ValueError()
            if entry["source"] == "running_process":
                if ("pid" not in entry or type(entry["pid"]) is not int or entry["pid"] <= 0):
                    raise ValueError()
            elif "pid" in entry:
                raise ValueError()
            blockers.add(_GUARDIAN_INVENTORY_SIGNALS[entry["signal"]])
        reported = report["coordination_blockers"]
        complete = all(checked.values()) and unreadable == 0
        if (type(reported) is not list or len(reported) != len(blockers)
                or any(type(item) is not str for item in reported)
                or set(reported) != blockers
                or report["observed_sources_complete"] is not complete):
            raise ValueError()
        fingerprint = hashlib.sha256(json.dumps(report, sort_keys=True,
            separators=(",", ":"), ensure_ascii=True).encode("utf-8")).hexdigest()
        return {"schema": "ames-readonly-guardian-review-v1", "inventory_sha256": fingerprint,
                "enumerated_sources_complete": complete,
                "observed_signals": len(observations),
                "all_origins_attested": False, "all_sessions_attested": False,
                "update_authorized": False}
    except (TypeError, ValueError, KeyError):
        raise ValueError("readonly_guardian_inventory_unverified") from None


def inspect_readonly_installation_inventory(report, *, selected_root=None):
    """Scrub a CLEAN directory/port inventory for a *read-only* candidate review.

    Candidate paths and PIDs only participate in a private report fingerprint.
    Matching the listener is an observation, not consent, guardian enrollment,
    scope coverage, a stable process lease or authorization to replace code.
    """
    try:
        fields = {"schema", "candidates", "port_8765_verified", "listener_pids",
                  "unmatched_listener_pids", "canonical_agents_outside_scan",
                  "updater_eligible", "reason"}
        if (type(report) is not dict or set(report) != fields
                or report["schema"] != "ames-windows-inventory-v1"
                or report["updater_eligible"] is not False
                or report["reason"] != "inventory_only_no_idle_or_backup_proof"
                or type(report["port_8765_verified"]) is not bool):
            raise ValueError()

        def pids(value):
            if (type(value) is not list or len(value) > 256
                    or any(type(pid) is not int or pid <= 0 for pid in value)
                    or len(value) != len(set(value))):
                raise ValueError()
            return set(value)

        listeners = pids(report["listener_pids"])
        unmatched = pids(report["unmatched_listener_pids"])
        outside = pids(report["canonical_agents_outside_scan"])
        if not unmatched <= listeners:
            raise ValueError()
        candidates = report["candidates"]
        if type(candidates) is not list or len(candidates) > 64:
            raise ValueError()
        names, all_matched = {}, set()
        for entry in candidates:
            expected = {"root", "canonical_entry_exists", "sqlite_exists",
                        "config_exists", "token_exists", "matching_agent_pids",
                        "listener_owner_matches"}
            if (type(entry) is not dict or set(entry) != expected
                    or any(type(entry[key]) is not bool for key in (
                        "canonical_entry_exists", "sqlite_exists", "config_exists",
                        "token_exists", "listener_owner_matches"))):
                raise ValueError()
            root = entry["root"]
            if (type(root) is not str or len(root) > 2048 or "\x00" in root
                    or not re.fullmatch(r"[A-Za-z]:\\[^\r\n]+", root)
                    or ntpath.normpath(root) != root
                    or not re.fullmatch(r"AMES_Central_CLEAN_[^\\/]+",
                                        ntpath.basename(root), flags=re.IGNORECASE)):
                raise ValueError()
            normalized = root.casefold()
            if normalized in names:
                raise ValueError()
            owners = pids(entry["matching_agent_pids"])
            if all_matched & owners:
                raise ValueError()
            all_matched.update(owners)
            expected_match = (report["port_8765_verified"] and len(listeners) == 1
                              and len(owners) == 1 and listeners == owners)
            if entry["listener_owner_matches"] is not expected_match:
                raise ValueError()
            names[normalized] = entry
        if unmatched & (all_matched | outside) or outside & all_matched:
            raise ValueError()
        if (type(selected_root) is not str and selected_root is not None):
            raise ValueError()
        selected = names.get(selected_root.casefold()) if selected_root is not None else None
        if selected_root is not None and selected is None:
            raise ValueError()
        digest = hashlib.sha256(json.dumps(report, sort_keys=True, separators=(",", ":"),
                                                ensure_ascii=True).encode("utf-8")).hexdigest()
        return {"schema": "ames-readonly-installation-review-v1", "inventory_sha256": digest,
                "candidate_count": len(names), "candidate_selected": selected is not None,
                "selected_root_sha256": (hashlib.sha256(selected_root.casefold().encode("utf-8")).hexdigest()
                                         if selected is not None else None),
                "observed_listener_match": (selected["listener_owner_matches"]
                                            if selected is not None else False),
                "other_candidates_or_agents_observed": (len(names) > 1 or bool(outside or unmatched)),
                "port_inventory_checked": report["port_8765_verified"],
                "installed_root_attested": False, "all_accounts_attested": False,
                "update_authorized": False}
    except (TypeError, ValueError, KeyError):
        raise ValueError("readonly_installation_inventory_unverified") from None


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
        self.account_sha256 = self.session_id = None

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
            self.account_sha256, self.session_id = result["account_sha256"], result["session_id"]
            return {"pid": pid, "endpoint_owner_pid": pid,
                    "installation_sha256": self.installation,
                    "start_marker": result["start_marker"]}
        except Exception:
            raise ValueError("independent_windows_witness_unverified:" + reason) from None


class WindowsRelauncherWitness:
    """Independent, code-pinned identity for an explicitly enrolled entrypoint.

    This does not enumerate other accounts, registrations or opaque launchers.
    Unobserved origins remain a veto even when these participants cooperate.
    """
    def __init__(self, role, script, installation_root, maintenance_root,
                 account_sha256, session_id, *, run=subprocess.run):
        if (role not in {"guardian", "launcher"} or type(session_id) is not int
                or not isinstance(account_sha256, str)
                or not re.fullmatch("[0-9a-f]{64}", account_sha256)):
            raise ValueError("relauncher_expected_identity_invalid")
        expected = "KEEP_AGENT_RUNNING.ps1" if role == "guardian" else "START_AGENT_CANONICAL.ps1"
        self.script = Path(script).resolve(strict=True)
        if self.script.name != expected:
            raise ValueError("relauncher_entrypoint_unsupported")
        self.role, self.root = role, Path(installation_root).resolve(strict=True)
        self.maintenance_root = Path(maintenance_root).resolve(strict=True)
        if self.root != self.maintenance_root:
            raise ValueError("relauncher_root_journal_mismatch")
        self.account, self.session, self._run = account_sha256, session_id, run
        self.script_digest = hashlib.sha256(self.script.read_bytes()).hexdigest()
        self.helper_digest = hashlib.sha256(self.script.with_name("ISSUE57_RELAUNCH_ENROLLMENT.ps1").read_bytes()).hexdigest()

    def __call__(self, pid):
        try:
            if os.name != "nt" or type(pid) is not int or pid <= 0:
                raise ValueError()
            result = self._run(["powershell.exe", "-NoProfile", "-NonInteractive", "-File",
                str(Path(__file__).with_name("ISSUE57_PROCESS_WITNESS_READONLY.ps1")),
                "-TargetPid", str(pid), "-ExpectedScript", str(self.script), "-FixtureOnly",
                "-Role", self.role, "-ExpectedRoot", str(self.root),
                "-ExpectedMaintenanceRoot", str(self.maintenance_root)],
                capture_output=True, timeout=20, check=False)
            if result.returncode or len(result.stdout) > 4096:
                raise ValueError()
            body = json.loads(result.stdout)
            root_digest = hashlib.sha256(str(self.root).lower().encode()).hexdigest()
            if (body.get("schema") != "ames-windows-process-witness-v1"
                    or body.get("read_only") is not True
                    or body.get("process_identity_observed") is not True
                    or type(body.get("pid")) is not int or body["pid"] != pid
                    or body.get("endpoint_owner_pid") != 0
                    or body.get("script_sha256") != self.script_digest
                    or body.get("script_path_sha256") != hashlib.sha256(str(self.script).lower().encode()).hexdigest()
                    or body.get("helper_sha256") != self.helper_digest
                    or body.get("account_sha256") != self.account
                    or type(body.get("session_id")) is not int or body["session_id"] != self.session
                    or body.get("root_sha256") != root_digest
                    or body.get("update_authorized") is not False
                    or not isinstance(body.get("start_marker"), str)
                    or not re.fullmatch("[0-9a-f]{64}", body["start_marker"])):
                raise ValueError()
            return {"role": self.role, "pid": pid, "start_marker": body["start_marker"],
                    "account_sha256": self.account, "session_id": self.session,
                    "root_sha256": root_digest, "script_sha256": self.script_digest,
                    "helper_sha256": self.helper_digest}
        except Exception:
            raise ValueError("relauncher_os_identity_unverified") from None


class RelauncherClient:
    """Challenge an OS-witnessed participant over private inherited handles.

    Uses the existing maintenance authentication codec, with separate MAC
    domains. An uncertain exchange permanently invalidates this client.
    """
    def __init__(self, exchange, key, pid, observe_process):
        self._exchange, self._key = exchange, key
        self._observe, self.pid = observe_process, pid
        self.identity = observe_process(pid)
        self._sequence, self._uncertain = 0, False
        self.last_barrier_state = None

    def attest(self, transaction_id, installation_sha256):
        from maintenance_protocol import seal, unseal
        try:
            if self._uncertain or self._observe(self.pid) != self.identity:
                raise ValueError()
            request = {"schema": "ames-relauncher-enrollment-v1", "transaction_id": transaction_id,
                       "installation_sha256": installation_sha256, "root_sha256": self.identity["root_sha256"],
                       "sequence": self._sequence + 1, "operation": "attest", "challenge": secrets.token_hex(32)}
            response = unseal(self._key, self._exchange(seal(self._key, request, "relauncher-request")), "relauncher-response")
            if (set(response) != set(request) | {"pid", "role", "barrier_state", "update_authorized"}
                    or any(response.get(k) != v for k, v in request.items())
                    or type(response["pid"]) is not int or response["pid"] != self.pid
                    or response["role"] != self.identity["role"]
                    or response["barrier_state"] not in {"mutex_and_claim_blocked", "claim_blocks_after_mutex_release"}
                    or response["update_authorized"] is not False
                    or self._observe(self.pid) != self.identity):
                raise ValueError()
            self._sequence += 1
            self.last_barrier_state = response["barrier_state"]
            return dict(self.identity)
        except Exception:
            self._uncertain = True
            raise ValueError("relauncher_enrollment_recovery_required") from None


class BrowserMaintenanceClient:
    """One explicitly registered browser scope over private inherited IPC.

    No heartbeat/empty profile inventory can authorize an update. The bridge
    must be independently enrolled; this is not a public HTTP API.
    """
    def __init__(self, exchange, key, scope_id):
        if not isinstance(scope_id, str) or not re.fullmatch("[0-9a-f]{64}", scope_id):
            raise ValueError("browser_scope_invalid")
        self._exchange, self._key, self.scope_id = exchange, key, scope_id
        self._sequence, self._uncertain = 0, False

    def attest(self, transaction_id, installation_sha256):
        from maintenance_protocol import seal, unseal
        try:
            if self._uncertain:
                raise ValueError()
            request = {"schema": "ames-browser-enrollment-v1", "operation": "attest",
                       "transaction_id": transaction_id, "installation_sha256": installation_sha256,
                       "scope_id": self.scope_id, "sequence": self._sequence + 1,
                       "challenge": secrets.token_hex(32)}
            answer = unseal(self._key, self._exchange(seal(self._key, request, "browser-request")), "browser-response")
            if (set(answer) != set(request) | {"pending_entries", "persistent_claim_held", "writers_fenced", "all_profiles_attested", "update_authorized"}
                    or any(answer.get(k) != v for k, v in request.items())
                    or type(answer["pending_entries"]) is not int or answer["pending_entries"] != 0
                    or answer["persistent_claim_held"] is not True or answer["writers_fenced"] is not True
                    or answer["all_profiles_attested"] is not False or answer["update_authorized"] is not False):
                raise ValueError()
            self._sequence += 1
            return {"transaction_id": transaction_id, "installation_identity_sha256": installation_sha256,
                    "scope_id": self.scope_id, "persistent_claim_held": True,
                    "writer_scope": "cooperative_outbox_and_publication", "all_profiles_attested": False}
        except Exception:
            self._uncertain = True
            raise ValueError("browser_enrollment_recovery_required") from None


class FixtureDrainCoordinator:
    def __init__(self, root, installation_sha256, connect, observe_process):
        self.root = root
        self.claim = begin_fixture(root, installation_sha256)
        self.client = None
        self._observe_process = observe_process
        self._witness = None
        self._relaunchers = []
        self._browser = None
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

    def enroll_relaunchers(self, participants, *, unknown_origins):
        """Bind explicit compatible participants to the SAME journal/claim.

        No discovery by absence: incomplete account/profile/registration scope
        is still unproven. Unknown or legacy signals are never auto-enrolled.
        """
        try:
            if (self.claim["phase"] != "awaiting_external_attestations" or unknown_origins
                    or len(participants) != 2
                    or {p.identity["role"] for p in participants} != {"guardian", "launcher"}):
                raise ValueError("relauncher_inventory_unverified")
            self._assert_witness_stable()
            root_digest = hashlib.sha256(str(Path(self.root).resolve()).lower().encode()).hexdigest()
            identities = [p.attest(self.claim["transaction_id"], self.client.target["installation_sha256"]) for p in participants]
            if (any(p.last_barrier_state != "mutex_and_claim_blocked" for p in participants)
                    or len({p["pid"] for p in identities}) != 2
                    or any(p["root_sha256"] != root_digest for p in identities)
                    or len({(p["account_sha256"], p["session_id"]) for p in identities}) != 1):
                raise ValueError("relauncher_installation_or_session_mismatch")
            receipt = {"transaction_id": self.claim["transaction_id"],
                       "installation_identity_sha256": self.client.target["installation_sha256"],
                       "participants": identities, "all_origins_attested": False}
            self.claim = transition_fixture(self.root, self.claim["transaction_id"], self.claim["revision"],
                                            "relaunchers_enrolled", relauncher_receipt=receipt)
            self._relaunchers = list(participants)
            return {"enrolled_relaunchers": 2, "all_origins_attested": False, "update_authorized": False}
        except Exception:
            self._recovery_required()
            raise

    def enroll_browser(self, participant):
        try:
            if self.claim["phase"] not in {"awaiting_external_attestations", "relaunchers_enrolled"}:
                raise ValueError("browser_enrollment_out_of_order")
            if self.observe()["state"] != "agent_quiescent_only":
                raise ValueError("coordinator_agent_not_quiescent")
            receipt = participant.attest(self.claim["transaction_id"], self.client.target["installation_sha256"])
            self.claim = transition_fixture(self.root, self.claim["transaction_id"], self.claim["revision"],
                                            "browser_enrolled", browser_receipt=receipt)
            self._browser = participant
            return {"enrolled_browser_scopes": 1, "all_profiles_attested": False, "update_authorized": False}
        except Exception:
            self._recovery_required()
            raise

    def _assert_browser_stable(self):
        receipt = self.claim.get("browser_receipt")
        if receipt is not None and (self._browser is None or self._browser.attest(
                self.claim["transaction_id"], self.client.target["installation_sha256"]) != receipt):
            raise ValueError("browser_receipt_mismatch")

    def _assert_relaunchers_stable(self):
        receipt = self.claim.get("relauncher_receipt")
        if receipt is not None:
            identities = [p.attest(self.claim["transaction_id"], self.client.target["installation_sha256"]) for p in self._relaunchers]
            if (identities != receipt["participants"]
                    or any(p.last_barrier_state != "mutex_and_claim_blocked" for p in self._relaunchers)):
                raise ValueError("relauncher_receipt_mismatch")

    def observe(self):
        try:
            self._assert_witness_stable()
            self._assert_relaunchers_stable()
            self._assert_browser_stable()
            persisted = inspect_fixture(self.root)
            if persisted != self.claim or self.claim["phase"] not in {
                    "drain_requested", "awaiting_external_attestations", "relaunchers_enrolled", "browser_enrolled", "backup_verified",
                    "candidate_staged", "fixture_applying"}:
                raise ValueError("coordinator_journal_mismatch")
            result = self.client.request("poll")
            self._assert_witness_stable()
            if result["state"] == "agent_quiescent_only" and self.claim["phase"] == "drain_requested":
                self._transition("awaiting_external_attestations")
            return {"state": result["state"], "phase": self.claim["phase"],
                    "enrolled_relaunchers": len(self._relaunchers),
                    "enrolled_browser_scopes": int(self._browser is not None),
                    "guardian_attested": False, "browser_profiles_attested": False,
                    "update_authorized": False}
        except Exception:
            self._recovery_required()
            raise

    def prepare_backup(self, *, installed_release_asset=None):
        """Create/restore-check a backup bound to THIS fixture transaction.

        Only reads the explicitly marked fixture installation root.
        No caller-selected production source, backup reuse or update approval.
        """
        from issue57_update_preflight import (backup_operational_tree,
                                              rehearse_operational_restore, sha256_file, inventory_known_external)
        try:
            if self.claim["phase"] not in {"awaiting_external_attestations", "relaunchers_enrolled", "browser_enrolled"}:
                raise ValueError("coordinator_backup_out_of_order")
            if self.observe()["state"] != "agent_quiescent_only":
                raise ValueError("coordinator_agent_not_quiescent")
            source = Path(self.root)
            backup = self.backup_directory
            # The ledger has already rejected any operational/CLEAN root.
            # Refuse links before resolving so it cannot escape that fixture.
            if (source.is_symlink() or backup.is_symlink()
                    or (hasattr(source, "is_junction") and source.is_junction())
                    or (hasattr(backup, "is_junction") and backup.is_junction())
                    or backup.resolve().parent != source.resolve().parent
                    or source.resolve() in backup.resolve().parents):
                raise ValueError("coordinator_backup_source_untrusted")
            inventory = inventory_known_external(source, release_asset=installed_release_asset, fixture_controls=True)
            backup_operational_tree(source, backup, external_inventory=inventory)
            after_inventory = inventory_known_external(source, release_asset=installed_release_asset, fixture_controls=True)
            if after_inventory != inventory:
                raise ValueError("external_installation_changed_during_backup")
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
            backup = self.backup_directory
            verify_operational_backup(backup)
            if sha256_file(backup / "runtime-backup-manifest.json") != self.claim["backup_receipt"]["manifest_sha256"]:
                raise ValueError("coordinator_backup_receipt_mismatch")
            self._assert_witness_stable()
            return {"verified": True, "update_authorized": False}
        except Exception:
            self._recovery_required()
            raise

    @property
    def backup_directory(self):
        # Outside the installation, with a transaction-specific, non-reused
        # name. The existing private ACL/capacity/integrity checks still apply.
        return Path(self.root).parent / ("private-backup-" + self.claim["transaction_id"])

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

    def prepare_registration_review(self, *, guardian_inventory=None,
                                    installation_inventory=None, selected_installation_root=None):
        """Prepare a consent-review binding from LIVE evidence, never consent.

        Reuses this coordinator/claim/receipts; no installed-root activation,
        user-supplied attestation booleans, extra journal or process operation.
        The returned digest is tied to the exact transaction/revision/code.
        """
        try:
            if self.claim["phase"] != "candidate_staged":
                raise ValueError("registration_review_requires_staged_candidate")
            self.verify_bound_backup()
            model = _fixture_slot_model()
            slots = model._fixture(self.fixture_slots)
            if (model._phase(slots) is not None or model._fingerprint(slots / "incoming")
                    != self.claim["candidate_receipt"]["slot_sha256"]):
                raise ValueError("registration_review_candidate_changed")
            previous = model._fingerprint(slots / "active")
            inventory = json.loads((self.backup_directory / "runtime-backup-manifest.json").read_text(encoding="utf-8")).get("installation_inventory", {})
            inventory_review = (inspect_readonly_guardian_inventory(guardian_inventory)
                                if guardian_inventory is not None else None)
            if selected_installation_root is not None and installation_inventory is None:
                raise ValueError("installation_selection_without_inventory")
            installation_review = (inspect_readonly_installation_inventory(
                installation_inventory, selected_root=selected_installation_root)
                if installation_inventory is not None else None)
            binding = {"transaction_id": self.claim["transaction_id"], "journal_revision": self.claim["revision"],
                       "installation_sha256": self.client.target["installation_sha256"],
                       "root_sha256": hashlib.sha256(str(Path(self.root).resolve()).lower().encode()).hexdigest(),
                       "process_start_marker": self._witness["start_marker"],
                       "backup_manifest_sha256": self.claim["backup_receipt"]["manifest_sha256"],
                       "release_commit": self.claim["candidate_receipt"]["release_commit"],
                       "candidate_sha256": self.claim["candidate_receipt"]["slot_sha256"],
                       "retained_fixture_code_sha256": previous}
            if inventory_review:
                binding["readonly_guardian_inventory_sha256"] = inventory_review["inventory_sha256"]
            if installation_review:
                binding["readonly_installation_inventory_sha256"] = installation_review["inventory_sha256"]
                if installation_review["candidate_selected"]:
                    binding["selected_installed_root_sha256"] = installation_review["selected_root_sha256"]
            blockers = ["operational_installation_not_enrolled", "all_relaunch_origins_unattested",
                        "browser_profiles_and_unregistered_writers_unattested", "external_locations_unattested",
                        "runtime_environment_unverified", "operational_rollback_unverified",
                        "operator_consent_missing", "factory_physical_validation_pending"]
            if not self._relaunchers:
                blockers.append("compatible_relaunchers_not_enrolled")
            if self._browser is None:
                blockers.append("browser_scope_not_enrolled")
            if not inventory.get("software_release"):
                blockers.append("installed_software_identity_unverified")
            if inventory_review is None:
                blockers.append("readonly_guardian_inventory_not_observed")
            else:
                blockers.append("readonly_guardian_inventory_not_operational_attestation")
                if not inventory_review["enumerated_sources_complete"]:
                    blockers.append("readonly_guardian_inventory_incomplete")
            if installation_review is None:
                blockers.append("readonly_installation_inventory_not_observed")
            else:
                blockers.append("readonly_installation_inventory_not_operational_attestation")
                if not installation_review["candidate_selected"]:
                    blockers.append("readonly_installation_root_not_selected")
                if installation_review["other_candidates_or_agents_observed"]:
                    blockers.append("readonly_installation_ambiguous_candidates")
                if not installation_review["observed_listener_match"]:
                    blockers.append("readonly_installation_listener_not_matched")
            # Recheck live participants AND the exact journal after reading all
            # evidence. A stale review can never be used to clear a barrier.
            if self.observe()["state"] != "agent_quiescent_only" or inspect_fixture(self.root) != self.claim:
                raise ValueError("registration_review_observation_changed")
            review = {"schema": "ames-registration-review-v2", "binding": binding,
                    "blockers": blockers, "readonly_guardian_inventory": inventory_review,
                    "readonly_installation_inventory": installation_review,
                    "cooperative_browser_scope_observed": self._browser is not None,
                    "cooperative_relaunchers_observed": len(self._relaunchers) == 2,
                    "operational_registration_complete": False, "operator_consent_observed": False,
                    "update_authorized": False, "fixture_only": True}
            # Fingerprint all review flags and blockers as well as the binding.
            # This is integrity bookkeeping, NOT authentication or consent.
            review["review_sha256"] = hashlib.sha256(json.dumps(
                review, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
            return review
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
                self._assert_relaunchers_stable()
                self._assert_browser_stable()
                healthy = health_probe(active) is True
                self._assert_witness_stable()
                self._assert_relaunchers_stable()
                self._assert_browser_stable()
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
        backup = Path(root).parent / ("private-backup-" + current["transaction_id"])
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
