"""External drain orchestration over the canonical Issue57 fixture ledger.

No production entrypoint: the existing ledger rejects CLEAN/operational roots.
The transport session is bound to the claim BEFORE requesting agent drain.
This reuses the admission protocol, not a second updater or a second agent.
Windows guardian/browser enrollment remains a mandatory, unresolved gate.
The injected process witness MUST come from an independent OS observation;
neither /ready nor the agent's own signed reply can attest its own PID/port.
"""

import re

from issue57_maintenance_ledger import begin_fixture, inspect_fixture, transition_fixture


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
                    "drain_requested", "awaiting_external_attestations"}:
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
