"""Export-safe support diagnostics.

Local diagnostics are protected by workstation pairing and may include technical
error text useful on the machine. This module creates a second, stricter payload
for sharing with support: allowlisted metadata only, no free-form job errors, no
job IDs, no local paths, no production identifiers and no raw MES content.
"""
from __future__ import annotations

import hashlib
from typing import Any


def _short_hash(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:12]


def _pick(source: Any, keys: tuple[str, ...]) -> dict:
    if not isinstance(source, dict):
        return {}
    return {key: source.get(key) for key in keys if key in source}


def assert_export_safe(payload: Any) -> None:
    """Structural guard: exported support payload must stay free of sensitive domains."""
    forbidden_key_fragments = (
        "password", "senha", "cookie", "credential", "authorization", "token", "secret",
        "pcba", "material_sn", "imei", "raw", "payload", "comment", "error_text", "path",
    )
    forbidden_value_markers = ("DO_NOT_LEAK", "Bearer ", "X-Central-Agent-Token")

    def walk(value: Any, path: str = "root") -> None:
        if isinstance(value, dict):
            for key, child in value.items():
                lowered = str(key).lower()
                if any(fragment in lowered for fragment in forbidden_key_fragments):
                    raise RuntimeError(f"Support diagnostic forbidden key: {path}.{key}")
                walk(child, f"{path}.{key}")
        elif isinstance(value, (list, tuple)):
            for index, child in enumerate(value):
                walk(child, f"{path}[{index}]")
        elif isinstance(value, str):
            if any(marker.lower() in value.lower() for marker in forbidden_value_markers):
                raise RuntimeError(f"Support diagnostic forbidden value at {path}")

    walk(payload)


def build(local: dict) -> dict:
    if not isinstance(local, dict) or local.get("schema") != "central-workstation-diagnostics-v1":
        raise TypeError("Diagnóstico local incompatível")

    runtime = local.get("runtime") or {}
    database = local.get("database") or {}
    hardening = database.get("hardening") or {}
    scheduler = local.get("scheduler") or {}
    collection = local.get("collection") or {}
    connectivity = local.get("connectivity") or {}
    backup = local.get("backup_verification") or {}
    calendar = local.get("calendar") or {}
    snapshots = local.get("snapshots") or {}
    recent_jobs = local.get("recent_jobs") or []

    safe_jobs = []
    for item in recent_jobs[:12]:
        if not isinstance(item, dict):
            continue
        safe_jobs.append(_pick(item, ("kind", "status", "stage", "created_at", "started_at", "finished_at")))

    migration_registry = hardening.get("migration_registry") or {}
    payload = {
        "schema": "central-support-diagnostics-v1",
        "generated_at": local.get("generated_at"),
        "runtime": {
            "agent_version": runtime.get("agent_version"),
            "candidate_version": runtime.get("candidate_version"),
            "python": runtime.get("python"),
            "platform": runtime.get("platform"),
            "workstation_ref": _short_hash(runtime.get("workstation")),
            "workstation_id_ref": _short_hash(runtime.get("workstation_id")),
        },
        "database": {
            "db_bytes": database.get("db_bytes"),
            "wal_bytes": database.get("wal_bytes"),
            "shm_bytes": database.get("shm_bytes"),
            "integrity": hardening.get("integrity"),
            "schema_version": hardening.get("schema_version"),
            "collecting_snapshots": hardening.get("collecting_snapshots"),
            "error_snapshots": hardening.get("error_snapshots"),
            "migration_registry": _pick(migration_registry, ("schema", "latest_version", "migrations")),
        },
        "backup": _pick(
            backup,
            ("schema", "available", "verified", "integrity", "bytes", "schema_version", "snapshot_count", "verified_at", "error"),
        ),
        "scheduler": _pick(scheduler, ("busy", "queued", "policy", "running_kind")),
        "collection": {
            "configured_lines": list(collection.get("configured_lines") or []),
            "performance": collection.get("performance"),
            "monitor_interval_minutes": collection.get("monitor_interval_minutes"),
            "auto_3028_ready": collection.get("auto_3028_ready"),
        },
        "connectivity": _pick(connectivity, ("ames_reachable", "chrome_cdp_reachable")),
        "calendar": _pick(calendar, ("schema", "timezone", "production_day_start", "work_shifts")),
        "snapshots": snapshots if isinstance(snapshots, dict) else {},
        "recent_jobs": safe_jobs,
    }
    assert_export_safe(payload)
    return payload
