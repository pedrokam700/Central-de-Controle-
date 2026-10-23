"""External drain orchestration over the canonical Issue57 fixture ledger.

No production entrypoint: the existing ledger rejects CLEAN/operational roots.
The transport session is bound to the claim BEFORE requesting agent drain.
This reuses the admission protocol, not a second updater or a second agent.
Windows guardian/browser enrollment remains a mandatory, unresolved gate.
"""

from issue57_maintenance_ledger import begin_fixture, inspect_fixture, transition_fixture


class FixtureDrainCoordinator:
    def __init__(self, root, installation_sha256, connect):
        self.root = root
        self.claim = begin_fixture(root, installation_sha256)
        self.client = None
        try:
            # connect must bind the independently verified process target and
            # a fresh maintenance credential to THIS journal transaction.
            self.client = connect(self.claim["transaction_id"])
            if (self.client.transaction_id != self.claim["transaction_id"]
                    or self.client.target["installation_sha256"] != installation_sha256):
                raise ValueError("coordinator_target_mismatch")
            self.client.request("begin")
            self._transition("drain_requested")
        except Exception:
            self._recovery_required()
            raise

    def _transition(self, phase):
        self.claim = transition_fixture(self.root, self.claim["transaction_id"],
                                        self.claim["revision"], phase)

    def _recovery_required(self):
        if self.claim["phase"] != "recovery_required":
            self._transition("recovery_required")

    def observe(self):
        try:
            persisted = inspect_fixture(self.root)
            if persisted != self.claim or self.claim["phase"] not in {
                    "drain_requested", "awaiting_external_attestations"}:
                raise ValueError("coordinator_journal_mismatch")
            result = self.client.request("poll")
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
        self._recovery_required()
        return self.client.request("cancel")
