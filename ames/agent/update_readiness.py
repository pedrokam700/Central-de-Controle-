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


def observe(scheduler, jobs, jobs_lock, store):
    result = {
        "schema": SCHEMA, "state": "blocked", "idle_observed": False,
        "update_authorized": False, "maintenance_lease": False,
        "reasons": ["sync_not_attested", "exclusive_lease_unavailable"],
    }
    try:
        state = scheduler.snapshot()
        if not isinstance(state, dict) or not all(k in state for k in ("busy", "queued", "normal_jobs")):
            raise ValueError("scheduler_contract_missing")
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
        counts = (state["queued"], state["normal_jobs"], memory_active, database_active)
        if any(type(count) is not int or count < 0 for count in counts):
            raise ValueError("invalid_job_count")
        result["mes_busy"] = bool(state["busy"])
        result["scheduler_queued"] = counts[0]
        result["scheduler_jobs"] = counts[1]
        result["memory_jobs"] = counts[2]
        result["persisted_jobs"] = counts[3]
        if result["mes_busy"] or any(counts):
            result["reasons"].insert(0, "mes_or_jobs_active")
        else:
            result["idle_observed"] = True
        # Intentionally remains blocked even when idle: the guardian, browser
        # outbox and new admissions cannot yet be held under one atomic lease.
    except Exception:
        result["reasons"].insert(0, "runtime_state_unverified")
    return result
