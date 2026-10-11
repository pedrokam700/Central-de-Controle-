"""Sanitized diagnostics for Central/A-MES workstations.

The payload is intentionally operational metadata only.  It never returns config
contents, MES browser/session state, credentials, local capability tokens or raw
production payloads.
"""
from __future__ import annotations

import os
import platform
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

FORBIDDEN_KEY_FRAGMENTS = (
    "password", "senha", "cookie", "credential", "authorization", "token",
    "session", "wifi", "secret",
)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _safe_backup(info: Any) -> dict | None:
    if not isinstance(info, dict):
        return None
    return {
        "bytes": int(info.get("bytes") or 0),
        "created_at": info.get("created_at") or info.get("modified_at"),
        "reason": info.get("reason"),
    }


def _safe_backup_status(info: Any) -> dict:
    if not isinstance(info, dict):
        return {}
    allowed = (
        "schema", "available", "verified", "integrity", "bytes",
        "schema_version", "snapshot_count", "verified_at", "error",
    )
    return {key: info.get(key) for key in allowed if key in info}


def _db_sizes(path: Path) -> dict:
    def size(candidate: Path) -> int:
        try:
            return int(candidate.stat().st_size)
        except OSError:
            return 0

    return {
        "db_bytes": size(path),
        "wal_bytes": size(Path(str(path) + "-wal")),
        "shm_bytes": size(Path(str(path) + "-shm")),
    }


def _snapshot_summary(store) -> dict:
    with store.connect() as con:
        rows = con.execute(
            "SELECT status,COUNT(*) AS n,MAX(id) AS latest FROM snapshots GROUP BY status"
        ).fetchall()
        jobs = con.execute(
            """SELECT id,kind,status,stage,created_at,started_at,finished_at,error
               FROM jobs ORDER BY created_at DESC LIMIT 12"""
        ).fetchall()
    by_status = {
        str(row["status"]): {"count": int(row["n"]), "latest_id": int(row["latest"]) if row["latest"] is not None else None}
        for row in rows
    }
    recent_jobs = []
    for row in jobs:
        item = dict(row)
        if item.get("error"):
            item["error"] = str(item["error"])[:500]
        recent_jobs.append(item)
    return {"snapshots": by_status, "recent_jobs": recent_jobs}


def _assert_sanitized(value: Any, path: str = "root") -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            lowered = str(key).lower()
            if any(fragment in lowered for fragment in FORBIDDEN_KEY_FRAGMENTS):
                raise RuntimeError(f"diagnostic payload contains forbidden key at {path}.{key}")
            _assert_sanitized(child, f"{path}.{key}")
    elif isinstance(value, (list, tuple)):
        for index, child in enumerate(value):
            _assert_sanitized(child, f"{path}[{index}]")


def build(
    agent,
    *,
    hardening_health: dict | None = None,
    calendar: dict | None = None,
    backup_status: dict | None = None,
) -> dict:
    db_path = Path(agent.DB_PATH)
    snapshot = _snapshot_summary(agent.STORE)
    lines = list(agent.CONFIG.get("configured_lines") or [])
    latest_by_line = agent.STORE.latest_snapshot_ids_by_line(lines)
    latest_backup = agent.STORE.latest_backup_info(agent.BACKUP_DIR)

    payload = {
        "schema": "central-workstation-diagnostics-v1",
        "generated_at": _utc_now(),
        "runtime": {
            "agent_version": str(agent.AGENT_VERSION),
            "candidate_version": str(agent.CANDIDATE_VERSION),
            "python": platform.python_version(),
            "platform": platform.system(),
            "workstation": str(agent.WORKSTATION),
            "workstation_id": str(getattr(agent, "WORKSTATION_ID", "")),
            "pid": os.getpid(),
        },
        "database": {
            **_db_sizes(db_path),
            "latest_complete_by_line": latest_by_line,
            "hardening": hardening_health or {},
        },
        "scheduler": agent.MES.snapshot(),
        "collection": {
            "configured_lines": lines,
            "performance": str(agent.CONFIG.get("performance") or "normal"),
            "monitor_interval_minutes": int(agent.CONFIG.get("monitor_interval_minutes", 30)),
            "auto_3028_ready": bool((agent.CONFIG.get("auto_3028") or {}).get("ready")),
        },
        "connectivity": {
            "ames_reachable": bool(agent._tcp_probe(agent.CONFIG.get("ames_host", "172.29.185.215"), int(agent.CONFIG.get("ames_port", 80)), timeout=1.0)),
            "chrome_cdp_reachable": bool(agent._tcp_probe("127.0.0.1", 9222, timeout=0.5)),
        },
        "calendar": calendar or {},
        "backup": _safe_backup(latest_backup),
        "backup_verification": _safe_backup_status(backup_status),
        **snapshot,
    }
    _assert_sanitized(payload)
    return payload


def public_summary(payload: dict) -> dict:
    """Compact form suitable for a support UI/status card."""
    runtime = payload.get("runtime") or {}
    database = payload.get("database") or {}
    connectivity = payload.get("connectivity") or {}
    backup = payload.get("backup_verification") or {}
    return {
        "schema": payload.get("schema"),
        "generated_at": payload.get("generated_at"),
        "candidate_version": runtime.get("candidate_version"),
        "workstation": runtime.get("workstation"),
        "workstation_id": runtime.get("workstation_id"),
        "sqlite_integrity": (database.get("hardening") or {}).get("integrity"),
        "ames_reachable": connectivity.get("ames_reachable"),
        "chrome_cdp_reachable": connectivity.get("chrome_cdp_reachable"),
        "backup_verified": backup.get("verified"),
        "backup_integrity": backup.get("integrity"),
        "scheduler": payload.get("scheduler"),
        "latest_complete_by_line": database.get("latest_complete_by_line") or {},
    }
