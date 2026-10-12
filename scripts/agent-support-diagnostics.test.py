from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGENT = ROOT / "ames" / "agent"
sys.path.insert(0, str(AGENT))

import support_diagnostics  # noqa: E402


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def local_fixture():
    return {
        "schema": "central-workstation-diagnostics-v1",
        "generated_at": "2026-10-11T13:00:00+00:00",
        "runtime": {
            "agent_version": "0.5.23",
            "candidate_version": "0.5.25-rc1",
            "python": "3.12.0",
            "platform": "Windows",
            "workstation": "FACTORY-PC-SECRET-NAME",
            "pid": 123,
        },
        "database": {
            "db_bytes": 100,
            "wal_bytes": 20,
            "shm_bytes": 10,
            "latest_complete_by_line": {"TAN10101": 99},
            "hardening": {
                "integrity": "ok",
                "schema_version": 1,
                "collecting_snapshots": 0,
                "error_snapshots": 1,
                "migration_registry": {
                    "schema": "central-sqlite-migrations-v1",
                    "latest_version": 1,
                    "migrations": [{"version": 1, "migration_id": "0001_snapshot_lifecycle", "checksum": "safe"}],
                },
                "migration_state": {"internal": "DO_NOT_EXPORT"},
            },
        },
        "scheduler": {"busy": True, "queued": 2, "policy": "fifo-monitor-skip-v1", "running_kind": "deep_trace", "running_id": "PRIVATE-JOB-ID"},
        "collection": {"configured_lines": ["TAN10101"], "performance": "balanced", "monitor_interval_minutes": 30, "auto_3028_ready": True},
        "connectivity": {"ames_reachable": True, "chrome_cdp_reachable": True},
        "calendar": {"schema": "central-operational-calendar-v1", "timezone": "America/Sao_Paulo", "production_day_start": "07:00", "work_shifts": []},
        "backup_verification": {"schema": "central-backup-status-v1", "available": True, "verified": True, "integrity": "ok", "bytes": 100, "schema_version": 1, "snapshot_count": 1},
        "snapshots": {"complete": {"count": 1, "latest_id": 99}},
        "recent_jobs": [
            {
                "id": "PRIVATE-JOB-ID",
                "kind": "deep_trace",
                "status": "error",
                "stage": "3022",
                "created_at": "2026-10-11",
                "started_at": "2026-10-11",
                "finished_at": "2026-10-11",
                "error": "password=DO_NOT_LEAK PCBA=002527000000 token=X-Central-Agent-Token",
                "payload": {"raw": "DO_NOT_LEAK"},
            }
        ],
    }


def test_support_export_is_allowlist_not_recursive_copy():
    payload = support_diagnostics.build(local_fixture())
    check(payload["schema"] == "central-support-diagnostics-v1", "support schema mismatch")
    check(payload["runtime"]["workstation_ref"] != "FACTORY-PC-SECRET-NAME", "workstation name must be pseudonymized")
    check(len(payload["runtime"]["workstation_ref"]) == 12, "workstation reference must be short stable hash")
    text = json.dumps(payload, ensure_ascii=False)
    for forbidden in ("DO_NOT_LEAK", "PRIVATE-JOB-ID", "002527000000", "X-Central-Agent-Token", "FACTORY-PC-SECRET-NAME"):
        check(forbidden not in text, f"support export leaked {forbidden}")
    check(payload["recent_jobs"] == [{
        "kind": "deep_trace",
        "status": "error",
        "stage": "3022",
        "created_at": "2026-10-11",
        "started_at": "2026-10-11",
        "finished_at": "2026-10-11",
    }], "support jobs must contain status metadata only")
    support_diagnostics.assert_export_safe(payload)


def test_support_export_rejects_wrong_source_schema():
    try:
        support_diagnostics.build({"schema": "other"})
    except TypeError:
        pass
    else:
        raise AssertionError("support export must reject unknown local diagnostic schema")


def test_support_guard_detects_future_sensitive_regression():
    payload = support_diagnostics.build(local_fixture())
    payload["runtime"]["token_hint"] = "abc"
    try:
        support_diagnostics.assert_export_safe(payload)
    except RuntimeError:
        pass
    else:
        raise AssertionError("support guard must detect future forbidden keys")


def test_support_endpoint_is_paired_not_public():
    source = (AGENT / "agent_hardened_entry.py").read_text(encoding="utf-8")
    check('path == "/api/v1/diagnostics/support"' in source, "support endpoint missing")
    public_line = source.split("_PUBLIC_API =", 1)[1].split("\n", 1)[0]
    check("diagnostics/support" not in public_line, "support endpoint must require workstation pairing")
    check("support_diagnostics.build(_local_diagnostics())" in source, "endpoint must use allowlisted support projection")


if __name__ == "__main__":
    tests = [
        test_support_export_is_allowlist_not_recursive_copy,
        test_support_export_rejects_wrong_source_schema,
        test_support_guard_detects_future_sensitive_regression,
        test_support_endpoint_is_paired_not_public,
    ]
    for test in tests:
        test()
        print("PASS", test.__name__)
    print(f"PASS support diagnostics ({len(tests)} tests)")
