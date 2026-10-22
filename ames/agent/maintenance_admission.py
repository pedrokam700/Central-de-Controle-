"""In-process write-admission fence for a future A-MES updater.

This is deliberately *not* an updater authorization. It does not attest the
browser/Firestore outbox, coordinate the Windows guardian, persist a lease or
authorize stopping/replacing the agent. No HTTP endpoint can activate it.

The fence is useful now because an observed idle state alone cannot prevent a
new request or scheduled MES job from being admitted during an update drain.
"""

from contextlib import contextmanager
from threading import Condition, local


class MaintenanceBlocked(RuntimeError):
    """An attempted new mutation was rejected while the agent is draining."""


class MaintenanceAdmission:
    def __init__(self):
        self._condition = Condition()
        self._thread = local()
        self._inflight = 0
        self._lease = None
        # Monotonic in-process epoch for read-only readiness observations.
        # An operation starting AND finishing during a probe must not appear
        # as a continuously idle interval just because both counts are zero.
        self._revision = 0

    @contextmanager
    def mutation(self):
        """Count an accepted mutation through its admission side effects.

        Nested admissions on the same thread are permitted even if draining
        started after the outer admission; this lets an in-flight HTTP request
        finish persisting its job instead of stranding a half-written request.
        """
        depth = getattr(self._thread, "depth", 0)
        if not depth:
            with self._condition:
                if self._lease is not None:
                    raise MaintenanceBlocked("maintenance_draining")
                self._inflight += 1
                self._revision += 1
        self._thread.depth = depth + 1
        try:
            yield
        finally:
            self._thread.depth -= 1
            if not depth:
                with self._condition:
                    self._inflight -= 1
                    self._revision += 1
                    self._condition.notify_all()

    def begin_drain(self):
        """Fence future admissions; does not claim the agent is idle.

        Only the eventual local, independently authorized coordinator may use
        this internal primitive after its other safety gates are implemented.
        """
        with self._condition:
            if self._lease is not None:
                raise MaintenanceBlocked("already_draining")
            self._lease = object()
            self._revision += 1
            return self._lease

    def release_drain(self, lease):
        with self._condition:
            if lease is None or lease is not self._lease:
                raise ValueError("invalid_maintenance_lease")
            self._lease = None
            self._revision += 1
            self._condition.notify_all()

    def snapshot(self):
        with self._condition:
            return {
                "draining": self._lease is not None,
                "inflight_mutations": self._inflight,
                "admission_revision": self._revision,
                "policy": "in-process-admission-v1",
            }


MAINTENANCE = MaintenanceAdmission()
