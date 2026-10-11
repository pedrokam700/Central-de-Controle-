from __future__ import annotations

import hashlib
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGENT = ROOT / "ames" / "agent"
sys.path.insert(0, str(AGENT))

from store import Store  # noqa: E402
import disaster_recovery  # noqa: E402
import hardening  # noqa: E402


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


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
    store.finalize_snapshot(sid)
    return store


def test_backup_verification_and_restore_drill_do_not_touch_live_database():
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        store = prepared_store(root)
        backup_dir = root / "data" / "backups"
        info = store.backup(backup_dir, keep=2, reason="test")
        backup = Path(info["path"])
        live_before = digest(store.path)

        verification = disaster_recovery.verify_backup(backup, include_sha256=True)
        check(verification["integrity"] == "ok", "backup quick_check must be ok")
        check(verification["schema_version"] == 1, "backup must preserve hardening schema")
        check(verification["snapshot_count"] == 1, "backup must preserve snapshot evidence")
        check(len(verification["sha256"]) == 64, "verified backup must expose SHA256 when requested")

        drill = disaster_recovery.restore_drill(backup)
        check(drill["integrity"] == "ok", "restore drill must pass quick_check")
        check(drill["live_database_modified"] is False, "restore drill must be non-destructive")
        check(drill["sha256"] == verification["sha256"], "restore drill copy must preserve bytes")
        check(digest(store.path) == live_before, "restore drill must not change live SQLite bytes")


def test_corrupt_backup_fails_closed():
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        store = prepared_store(root)
        backup = Path(store.backup(root / "backups", keep=2, reason="test")["path"])
        broken = root / "broken.sqlite3"
        broken.write_bytes(backup.read_bytes()[:128])
        try:
            disaster_recovery.verify_backup(broken)
        except Exception:
            pass
        else:
            raise AssertionError("corrupt backup must never be reported as verified")


def test_latest_status_never_exposes_backup_path():
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        store = prepared_store(root)
        backup_dir = root / "backups"
        store.backup(backup_dir, keep=2, reason="test")
        status = disaster_recovery.latest_status(store, backup_dir)
        check(status["available"] is True and status["verified"] is True, "latest backup must be verified")
        check("path" not in status, "public DR status must not expose local filesystem paths")
        check(status["integrity"] == "ok", "public DR status must report integrity")


def test_hardened_agent_requires_pairing_for_restore_drill_and_verifies_new_backups():
    source = (AGENT / "agent_hardened_entry.py").read_text(encoding="utf-8")
    check("entry.a.create_backup = _verified_create_backup" in source, "hardened runtime must verify every new backup")
    check('path == "/api/v1/backup/verify"' in source, "paired backup verify endpoint missing")
    check('path == "/api/v1/backup/restore-drill"' in source, "paired restore drill endpoint missing")
    public_line = source.split("_PUBLIC_API =", 1)[1].split("\n", 1)[0]
    check("backup" not in public_line, "DR endpoints must not be public")


if __name__ == "__main__":
    tests = [
        test_backup_verification_and_restore_drill_do_not_touch_live_database,
        test_corrupt_backup_fails_closed,
        test_latest_status_never_exposes_backup_path,
        test_hardened_agent_requires_pairing_for_restore_drill_and_verifies_new_backups,
    ]
    for test in tests:
        test()
        print("PASS", test.__name__)
    print(f"PASS disaster recovery ({len(tests)} tests)")
