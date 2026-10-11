from __future__ import annotations

import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGENT = ROOT / "ames" / "agent"
sys.path.insert(0, str(AGENT))

from store import Store  # noqa: E402
import hardening  # noqa: E402
import retention_policy  # noqa: E402


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def prepared_store(root: Path) -> Store:
    store = Store(root / "data" / "ames_local.sqlite3")
    store.initialize()
    hardening.install_store_guards(store)
    sid = store.create_snapshot(window_id=None, source_kind="test", source_name="fixture")
    with store.connect() as con:
        con.execute(
            "INSERT INTO line_metrics(snapshot_id,line,product_model,quantity,fpy,check_fpy) VALUES(?,?,?,?,?,?)",
            (sid, "TAN10101", "CPH0001", 10, 99.0, 99.5),
        )
        con.execute(
            "INSERT INTO jobs(id,kind,status,created_at,progress,config_json) VALUES('j1','test','done','2026-01-01T00:00:00+00:00',100,'{}')"
        )
    store.finalize_snapshot(sid)
    return store


def test_retention_is_observe_only_and_never_deletes_evidence():
    source = (AGENT / "retention_policy.py").read_text(encoding="utf-8").upper()
    check("DELETE FROM" not in source, "observe-only retention module must contain no DELETE SQL")
    contract = retention_policy.public_contract(backup_keep=10)
    check(contract["mode"] == "observe_only", "retention must stay observe-only")
    check(contract["destructive_cleanup_enabled"] is False, "destructive cleanup must be disabled")
    check(contract["approval_required_before_delete"] is True, "approval must be explicit before deletion")


def test_inventory_classifies_evidence_without_candidate_deletion():
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        store = prepared_store(root)
        inventory = retention_policy.inventory(store, root / "backups", backup_keep=7)
        check(inventory["mode"] == "observe_only", "inventory must preserve observe-only mode")
        check(inventory["destructive_cleanup_enabled"] is False, "inventory must not enable deletion")
        by_table = {row["table"]: row for row in inventory["datasets"]}
        check(by_table["snapshots"]["rows"] == 1, "snapshot inventory missing")
        check(by_table["snapshots"]["class"] == "structured_evidence", "snapshot class mismatch")
        check(by_table["snapshots"]["delete_enabled"] is False, "evidence deletion must remain disabled")
        check(by_table["jobs"]["rows"] == 1, "technical jobs inventory missing")
        check(by_table["jobs"]["policy"] == "review_period_required", "jobs must require approved period")
        check(inventory["backups"]["configured_keep_count"] == 7, "existing backup retention count must be visible")


def test_all_critical_mes_evidence_is_preserve_until_approved():
    critical = {
        "snapshots", "line_metrics", "defect_entities", "defect_observations", "pcba_history",
        "history_contexts", "material_reuse", "process_events", "snapshot_payloads"
    }
    policies = {spec["table"]: spec["policy"] for spec in retention_policy.DATASETS}
    missing = critical - policies.keys()
    check(not missing, f"critical datasets missing from retention governance: {sorted(missing)}")
    for table in critical:
        check(policies[table] == "preserve_until_approved", f"{table} must not receive implicit retention period")


def test_retention_endpoint_is_paired_not_public():
    source = (AGENT / "agent_hardened_entry.py").read_text(encoding="utf-8")
    check('path == "/api/v1/retention/plan"' in source, "retention plan endpoint missing")
    public_line = source.split("_PUBLIC_API =", 1)[1].split("\n", 1)[0]
    check("retention" not in public_line, "retention inventory must require workstation pairing")


if __name__ == "__main__":
    tests = [
        test_retention_is_observe_only_and_never_deletes_evidence,
        test_inventory_classifies_evidence_without_candidate_deletion,
        test_all_critical_mes_evidence_is_preserve_until_approved,
        test_retention_endpoint_is_paired_not_public,
    ]
    for test in tests:
        test()
        print("PASS", test.__name__)
    print(f"PASS retention policy ({len(tests)} tests)")
