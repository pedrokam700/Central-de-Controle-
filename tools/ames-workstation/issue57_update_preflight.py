"""Issue #57: offline staging and CONSISTENT backup primitives (not an updater).

This file is deliberately separate from ames-agent. It never stops/starts a
process, touches the original SQLite/config/token, or promotes staged binaries.
The future transaction coordinator must enforce an exclusive maintenance lease,
guardian quiescence, sync acknowledgment, identity rechecks and power-loss
rollback BEFORE it may use these primitives in a Windows production migration.
"""

from __future__ import annotations

import hashlib
import csv
import io
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import sqlite3
import stat
import subprocess
import uuid
import zipfile


OFFICIAL = {
    "tag": "ames-v0.5.39-multipc-20261022",
    "commit": "b283b1764432f5d90486d38a7553b30542a5c118",
    "asset": "AMES_Central_CLEAN_b283b176.zip",
    "sha256": "4407332be1d7e6ed78ee11ad2cf7dca893d2ba9c72e55bf4b93d453892cc482a",
}
MAX_UNCOMPRESSED = 300 * 1024 * 1024
MAX_ENTRIES = 10000
ROOT_FILES = {
    "CANDIDATE_MANIFEST.json", "LOCAL_BUNDLE_MANIFEST.json",
    "LEIA_PRIMEIRO.txt", "FRONTEND_GATE.json", "01_INSTALAR_UMA_VEZ.bat",
    "05_ABRIR_CHROME_AMES.bat", "START_LOCAL_CANDIDATE.ps1",
    "09_REPARAR_DEPENDENCIAS.bat", "00_INICIAR_AQUI.bat",
    "INICIAR_POSTO_CENTRAL_V2.bat", "INICIAR_CENTRAL_AMES.cmd",
}
PREFIXES = {"ames-agent", "factory-engine", "frontend", "suporte", "network", "evidence"}
PRIVATE = {"config.json", "local_agent_token", "cookies.json", "session.json", ".env"}


def sha256_file(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as reader:
        for chunk in iter(lambda: reader.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def safe_member(info):
    path = PurePosixPath(info.filename)
    parts = path.parts
    if (info.is_dir() or info.filename.startswith("/") or "\\" in info.filename or
            "//" in info.filename or "/./" in info.filename or ":" in info.filename or
            not parts or any(part in ("", ".", "..") for part in parts) or
            any(part.lower() in {".venv", "__pycache__"} or part.endswith((".", " ")) for part in parts) or
            (len(parts) > 1 and parts[0] == "ames-agent" and parts[1] == "data") or
            path.name.lower() in PRIVATE or
            path.suffix.lower() in {".sqlite", ".sqlite3", ".db", ".log", ".key", ".pem"}):
        raise ValueError("unsafe_or_private_release_member")
    if (len(parts) == 1 and parts[0] not in ROOT_FILES) or (len(parts) > 1 and parts[0] not in PREFIXES):
        raise ValueError("release_member_not_allowlisted")
    # Unix symlinks in a ZIP are never extracted as files; Windows links are
    # similarly forbidden by this source-agnostic mode check.
    mode = (info.external_attr >> 16) & 0xFFFF
    if stat.S_IFMT(mode) == stat.S_IFLNK:
        raise ValueError("release_symlink_forbidden")
    return path


def verify_archive(asset, expected=OFFICIAL):
    asset = Path(asset)
    if asset.name != expected["asset"] or sha256_file(asset) != expected["sha256"]:
        raise ValueError("official_asset_identity_or_sha256_mismatch")
    with zipfile.ZipFile(asset) as archive:
        infos = archive.infolist()
        if len(infos) > MAX_ENTRIES or sum(i.file_size for i in infos) > MAX_UNCOMPRESSED:
            raise ValueError("oversized_release_archive")
        members = [safe_member(info).as_posix() for info in infos]
        if len(set(name.casefold() for name in members)) != len(members):
            raise ValueError("duplicate_release_member")
        if "CANDIDATE_MANIFEST.json" not in members:
            raise ValueError("candidate_manifest_missing")
        manifest = json.loads(archive.read("CANDIDATE_MANIFEST.json"))
        files = manifest.get("files")
        if manifest.get("sha") != expected["commit"] or not isinstance(files, dict):
            raise ValueError("release_commit_or_manifest_invalid")
        if set(members) != set(files) | {"CANDIDATE_MANIFEST.json"}:
            raise ValueError("unmanifested_or_missing_release_files")
        for info in infos:
            if info.filename == "CANDIDATE_MANIFEST.json":
                continue
            with archive.open(info) as reader:
                digest = hashlib.sha256()
                for chunk in iter(lambda: reader.read(1024 * 1024), b""):
                    digest.update(chunk)
            if digest.hexdigest() != files[info.filename]:
                raise ValueError("release_file_digest_mismatch")
        return len(members)


def stage_verified_archive(asset, target, expected=OFFICIAL):
    """Create a NEW isolated tree; never copy into a live CLEAN tree."""
    asset, target = Path(asset).resolve(), Path(target).resolve()
    if target.exists() or target == asset.parent or target in asset.parents:
        raise ValueError("staging_target_must_be_new_and_isolated")
    count = verify_archive(asset, expected)
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_name("." + target.name + ".incomplete." + uuid.uuid4().hex)
    tmp.mkdir(mode=0o700)
    try:
        with zipfile.ZipFile(asset) as archive:
            for info in archive.infolist():
                rel = safe_member(info)
                out = tmp.joinpath(*rel.parts)
                out.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(info) as reader, out.open("xb") as writer:
                    shutil.copyfileobj(reader, writer)
                    writer.flush()
                    os.fsync(writer.fileno())
        (tmp / "STAGING_VERIFIED.json").write_text(json.dumps({
            "schema": "ames-official-staging-v1", "tag": expected["tag"],
            "commit": expected["commit"], "asset_sha256": expected["sha256"],
            "entry_count": count, "update_authorized": False,
        }), encoding="utf-8")
        os.replace(tmp, target)
    except BaseException:
        # Own unique temp tree ONLY; never touch an existing installation.
        shutil.rmtree(tmp)
        raise
    return {"staged": True, "entries": count, "update_authorized": False}


def consistent_sqlite_backup(source, backup):
    """SQLite online backup + quick_check + in-memory restoration rehearsal.

    Source is opened read-only. Destination must not exist. No modification of
    original database, WAL, source identity, schema or job history is performed.
    """
    source, backup = Path(source), Path(backup)
    if not source.is_file() or source.is_symlink() or backup.exists():
        raise ValueError("sqlite_backup_requires_existing_source_and_new_destination")
    source, backup = source.resolve(), backup.resolve()
    if source == backup or source.parent == backup.parent:
        raise ValueError("sqlite_backup_must_be_outside_live_data_directory")
    backup.parent.mkdir(parents=True, exist_ok=True)
    src = sqlite3.connect(source.as_uri() + "?mode=ro", uri=True, timeout=5)
    try:
        dst = sqlite3.connect(backup)
        try:
            src.backup(dst, pages=64, sleep=.05)
            dst.commit()
            result = dst.execute("PRAGMA quick_check").fetchone()
            if result != ("ok",):
                raise ValueError("sqlite_quick_check_failed")
            restored = sqlite3.connect(":memory:")
            try:
                dst.backup(restored)
                if restored.execute("PRAGMA quick_check").fetchone() != ("ok",):
                    raise ValueError("sqlite_restoration_rehearsal_failed")
            finally:
                restored.close()
        finally:
            dst.close()
    except BaseException:
        if backup.exists():
            backup.unlink()  # own incomplete backup ONLY
        raise
    finally:
        src.close()
    return {"verified": True, "restore_rehearsed": True,
            "bytes": backup.stat().st_size, "update_authorized": False}


def private_backup_directory(target):
    """Create a private, never-reused backup root (no secrets in output)."""
    target = Path(target)
    target.mkdir(mode=0o700, parents=False, exist_ok=False)
    if os.name == "nt":
        # Restrict inheritance BEFORE writing any SQLite/token/config bytes.
        # Failure is fatal. Future pilot must verify this on actual Windows ACLs.
        owner = subprocess.run(["whoami", "/user", "/fo", "csv", "/nh"],
                               capture_output=True, text=True, check=True)
        row = next(csv.reader(io.StringIO(owner.stdout)))
        if len(row) < 2 or not row[1].startswith("S-1-"):
            raise ValueError("windows_user_sid_not_verified")
        subprocess.run(["icacls", str(target), "/inheritance:r",
                        "/grant:r", f"*{row[1]}:(OI)(CI)F"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    else:
        target.chmod(0o700)
    return target


def copy_private_identity(source, target):
    """No logs or digests of the copied local token/config are returned."""
    source, target = Path(source), Path(target)
    if not source.is_file() or source.is_symlink() or target.exists():
        raise ValueError("private_identity_requires_regular_file_and_new_target")
    content = source.read_bytes()
    with target.open("xb") as writer:
        if os.name != "nt":
            os.chmod(target, 0o600)
        writer.write(content)
        writer.flush()
        os.fsync(writer.fileno())
    if target.read_bytes() != content:
        raise ValueError("private_identity_copy_mismatch")
    return True


def backup_core_identity(clean_root, private_destination):
    """Test primitive for SQLite/config/token. DOES NOT cover all data-dir files.

    This intentionally cannot authorize an update. Queues and snapshots in
    SQLite are preserved, but external checkpoint/export files and sync outbox
    still need a full idle-attested inventory/backup before a real swap.
    """
    clean_root = Path(clean_root).resolve()
    destination = Path(private_destination).resolve()
    if destination == clean_root or clean_root in destination.parents:
        raise ValueError("backup_location_inside_live_installation")
    agent = clean_root / "ames-agent"
    for rel in ("config.json", "data/local_agent_token", "data/ames_local.sqlite3"):
        if not (agent / rel).is_file():
            raise ValueError("missing_critical_identity_file")
    private_backup_directory(destination)
    consistent_sqlite_backup(agent / "data/ames_local.sqlite3", destination / "ames_local.sqlite3")
    copy_private_identity(agent / "config.json", destination / "config.json")
    copy_private_identity(agent / "data/local_agent_token", destination / "local_agent_token")
    return {"core_identity_verified": True, "data_tree_complete": False,
            "exclusive_lease_held": False, "update_authorized": False}
