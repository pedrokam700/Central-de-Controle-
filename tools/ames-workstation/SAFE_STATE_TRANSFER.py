"""Offline state transfer for a *stopped* and independently attested A-MES agent.

This helper does not stop processes, assert a maintenance lease, or approve an
upgrade. The PowerShell coordinator owns those gates. Source data is read-only;
the verified backup survives both successful and failed switches.
"""

from __future__ import annotations

import argparse
from contextlib import closing
import json
import os
from pathlib import Path
import shutil
import sqlite3
import sys

from issue57_update_preflight import (
    MAX_RUNTIME_BACKUP_BYTES,
    _regular_file,
    _runtime_inventory,
    backup_operational_tree,
    copy_private_identity,
    rehearse_operational_restore,
    sha256_file,
    verify_operational_backup,
)


def _safe_root(value: str) -> Path:
    candidate = Path(value)
    if not candidate.is_absolute() or candidate.is_symlink() or (
        hasattr(candidate, "is_junction") and candidate.is_junction()
    ):
        raise ValueError("installation_root_untrusted")
    root = candidate.resolve(strict=True)
    if not root.is_dir():
        raise ValueError("installation_root_missing")
    return root


def _check_isolation(old: Path, new: Path, backup: Path) -> None:
    if old == new or old in new.parents or new in old.parents:
        raise ValueError("installation_roots_overlap")
    if backup.exists() or backup.is_symlink():
        raise ValueError("backup_target_already_exists")
    # Reserve backups immediately beside the NEW installation, not inside either
    # operational tree or a transient per-launch temp folder.
    if backup.parent.resolve(strict=True) != new.parent:
        raise ValueError("backup_target_must_be_sibling_of_candidate")


def _check_pristine(new: Path) -> None:
    agent = new / "ames-agent"
    if agent.is_symlink() or (hasattr(agent, "is_junction") and agent.is_junction()) or not agent.is_dir():
        raise ValueError("candidate_agent_directory_untrusted")
    config = new / "ames-agent/config.json"
    data = new / "ames-agent/data"
    if config.exists() or config.is_symlink() or (data.exists() and (
        data.is_symlink() or not data.is_dir() or any(data.iterdir())
    )):
        raise ValueError("candidate_already_has_operational_state_use_new_extraction")
    for name in ("CANDIDATE_MANIFEST.json", "ames-agent/agent_hardened_entry.py"):
        if not (new / name).is_file():
            raise ValueError("candidate_incomplete")


def _copy_checked(source: Path, dest: Path) -> None:
    if not _regular_file(source) or dest.exists() or dest.is_symlink():
        raise ValueError("transfer_source_or_destination_untrusted")
    dest.parent.mkdir(parents=True, exist_ok=True)
    copy_private_identity(source, dest)


def _validate_sqlite(path: Path) -> None:
    with closing(sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)) as db:
        if db.execute("PRAGMA quick_check").fetchone() != ("ok",):
            raise ValueError("staged_sqlite_quick_check_failed")


def _source_identity(path: Path) -> str:
    with closing(sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)) as db:
        row = db.execute("SELECT value FROM schema_meta WHERE key='ames_source_id'").fetchone()
    if not row or not isinstance(row[0], str) or len(row[0]) < 8:
        raise ValueError("sqlite_source_identity_missing")
    return row[0]


def preflight(old_root: str, new_root: str) -> dict:
    old, new = _safe_root(old_root), _safe_root(new_root)
    if old == new or old in new.parents or new in old.parents:
        raise ValueError("installation_roots_overlap")
    _check_pristine(new)
    for item in ("ames-agent/config.json", "ames-agent/data/local_agent_token",
                 "ames-agent/data/ames_local.sqlite3"):
        if not _regular_file(old / item):
            raise ValueError("old_installation_missing_critical_state")
    _runtime_inventory(old / "ames-agent/data", MAX_RUNTIME_BACKUP_BYTES)
    return {"candidate_pristine": True, "old_runtime_present": True}


def stage(old_root: str, new_root: str, backup_root: str) -> dict:
    old, new = _safe_root(old_root), _safe_root(new_root)
    backup = Path(backup_root)
    if not backup.is_absolute():
        raise ValueError("backup_target_must_be_absolute")
    _check_isolation(old, new, backup)
    preflight(str(old), str(new))
    # The coordinator MUST have stopped agent, guardian, scheduled collectors
    # and competing writers before calling this method. Online SQLite backup
    # handles any residual WAL consistently without copying WAL/SHM verbatim.
    backup_operational_tree(old, backup)
    verify_operational_backup(backup)
    rehearse_operational_restore(backup)
    manifest = json.loads((backup / "runtime-backup-manifest.json").read_text(encoding="utf-8"))
    output = new / "ames-agent/data"
    output.mkdir(parents=True, exist_ok=True)
    _copy_checked(backup / "ames_local.sqlite3", output / "ames_local.sqlite3")
    _copy_checked(backup / "local_agent_token", output / "local_agent_token")
    _copy_checked(backup / "config.json", new / "ames-agent/config.json")
    for item in manifest["files"]:
        _copy_checked(backup / "ames-agent/data" / item["path"], output / item["path"])
    if _runtime_inventory(output, MAX_RUNTIME_BACKUP_BYTES) != manifest["files"]:
        raise ValueError("staged_data_inventory_mismatch")
    for name, dest in (("ames_local.sqlite3", output / "ames_local.sqlite3"),
                       ("local_agent_token", output / "local_agent_token"),
                       ("config.json", new / "ames-agent/config.json")):
        if sha256_file(dest) != manifest["core_sha256"][name]:
            raise ValueError("staged_core_identity_mismatch")
    _validate_sqlite(output / "ames_local.sqlite3")
    if _source_identity(backup / "ames_local.sqlite3") != _source_identity(output / "ames_local.sqlite3"):
        raise ValueError("staged_source_identity_mismatch")
    verify_operational_backup(backup)
    # This receipt never contains tokens or config contents. The private
    # backup retains the full manifests and independently verified restore.
    return {"backup_verified": True, "restore_rehearsed": True,
            "source_unchanged": True, "staged_identity_verified": True,
            "runtime_files": len(manifest["files"]),
            "windows_physical_gate": "pending"}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("preflight", "stage"))
    parser.add_argument("--old-root", required=True)
    parser.add_argument("--new-root", required=True)
    parser.add_argument("--backup-root")
    args = parser.parse_args(argv)
    try:
        if args.command == "preflight":
            result = preflight(args.old_root, args.new_root)
        else:
            if not args.backup_root:
                raise ValueError("backup_root_required")
            result = stage(args.old_root, args.new_root, args.backup_root)
        print(json.dumps({"ok": True, **result}))
        return 0
    except (OSError, ValueError, sqlite3.Error) as error:
        # Paths, config and token never appear in error output.
        print(json.dumps({"ok": False, "reason": str(error).split(":", 1)[0]}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
