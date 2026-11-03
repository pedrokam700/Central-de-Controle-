"""Read-only, fail-closed observation for the future external Windows updater.

This is NOT a maintenance lease: an idle observation races future jobs and the
web-side Firestore outbox is not controlled by this Python process. Nothing in
this module authorizes stopping an agent or modifying a file.
"""

from contextlib import closing
from pathlib import Path
import sqlite3

SCHEMA = "ames-update-readiness-v1"
ACTIVE = frozenset(("queued", "running"))


def observe(scheduler, jobs, jobs_lock, store, admission=None):
    result = {
        "schema": SCHEMA, "state": "blocked", "idle_observed": False,
        "observation_stable": False,
        "update_authorized": False, "maintenance_lease": False,
        "reasons": ["sync_not_attested", "exclusive_lease_unavailable"],
    }
    try:
        if admission is None:
            # An older/not-wired agent cannot assert a safe admission boundary.
            raise ValueError("admission_boundary_missing")
        # Bracket the WHOLE observation, including its first scheduler read.
        # A mutation starting and finishing inside the probe increments the
        # revision twice even if the final inflight count returns to zero.
        fence = admission.snapshot()
        if (type(fence.get("draining")) is not bool or
                type(fence.get("inflight_mutations")) is not int or
                fence["inflight_mutations"] < 0 or
                type(fence.get("admission_revision")) is not int or
                fence["admission_revision"] < 0):
            raise ValueError("admission_boundary_invalid")
        state = scheduler.snapshot()
        if not isinstance(state, dict) or not all(k in state for k in ("busy", "queued", "normal_jobs")):
            raise ValueError("scheduler_contract_missing")
        # A scheduler can return a mutable, shared mapping. Freeze the first
        # reading now, otherwise a later change could alter both references.
        state = dict(state)
        if type(state["busy"]) is not bool:
            raise ValueError("scheduler_busy_invalid")
        with jobs_lock:
            memory_active = sum(1 for job in jobs.values()
                                if isinstance(job, dict) and job.get("status") in ACTIVE)
        # Store.connect() is a read/write connection; a readiness probe must
        # neither create an absent DB nor leave a Windows file handle open.
        db_uri = Path(store.path).resolve().as_uri() + "?mode=ro"
        with closing(sqlite3.connect(db_uri, uri=True, timeout=3)) as conn:
            database_active = conn.execute(
                "SELECT COUNT(*) FROM jobs WHERE status IN ('queued','running')"
            ).fetchone()[0]
        state_after = scheduler.snapshot()
        fence_after = admission.snapshot()
        if (not isinstance(state_after, dict) or
                not all(k in state_after for k in ("busy", "queued", "normal_jobs")) or
                type(state_after["busy"]) is not bool or
                type(fence_after.get("draining")) is not bool or
                type(fence_after.get("inflight_mutations")) is not int or
                fence_after["inflight_mutations"] < 0 or
                type(fence_after.get("admission_revision")) is not int or
                fence_after["admission_revision"] < 0):
            raise ValueError("second_observation_invalid")
        state_after = dict(state_after)
        admission_stable = (fence["admission_revision"] == fence_after["admission_revision"] and
                            fence["draining"] == fence_after["draining"] and
                            fence["inflight_mutations"] == fence_after["inflight_mutations"])
        scheduler_stable = all(state[key] == state_after[key] for key in ("busy", "queued", "normal_jobs"))
        result["observation_stable"] = admission_stable and scheduler_stable
        result["new_admissions_fenced"] = bool(result["observation_stable"] and fence_after["draining"])
        result["inflight_mutations"] = fence_after["inflight_mutations"]
        counts = (state["queued"], state["normal_jobs"], memory_active,
                  database_active, fence["inflight_mutations"],
                  state_after["queued"], state_after["normal_jobs"])
        if any(type(count) is not int or count < 0 for count in counts):
            raise ValueError("invalid_job_count")
        if not admission_stable:
            result["reasons"].insert(0, "admission_changed_during_observation")
        if not scheduler_stable:
            result["reasons"].insert(0, "scheduler_changed_during_observation")
        result["mes_busy"] = state["busy"] or state_after["busy"]
        result["scheduler_queued"] = counts[0]
        result["scheduler_jobs"] = counts[1]
        result["memory_jobs"] = counts[2]
        result["persisted_jobs"] = counts[3]
        if counts[4] or fence_after["inflight_mutations"]:
            result["reasons"].insert(0, "mutation_inflight")
        if result["mes_busy"] or any(counts) or state_after["queued"] or state_after["normal_jobs"]:
            result["reasons"].insert(0, "mes_or_jobs_active")
        elif result["observation_stable"]:
            result["idle_observed"] = True
        # Intentionally remains blocked even when idle: the guardian, browser
        # outbox and new admissions cannot yet be held under one atomic lease.
    except Exception:
        result["reasons"].insert(0, "runtime_state_unverified")
    return result
