"""Issue #57: offline staging and CONSISTENT backup primitives (not an updater).

This file is deliberately separate from ames-agent. It never stops/starts a
process, touches the original SQLite/config/token, or promotes staged binaries.
The future transaction coordinator must enforce an exclusive maintenance lease,
guardian quiescence, sync acknowledgment, identity rechecks and power-loss
rollback BEFORE it may use these primitives in a Windows production migration.
"""

from __future__ import annotations

import hashlib
from contextlib import closing
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import sqlite3
import stat
import subprocess
import tempfile
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
MAX_RUNTIME_BACKUP_BYTES = 8 * 1024 * 1024 * 1024
SQLITE_TRANSIENT = {"ames_local.sqlite3-wal", "ames_local.sqlite3-shm",
                    "ames_local.sqlite3-journal"}
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
        # Replace the DACL on the EMPTY, newly created root before copying
        # secrets. Calling icacls /inheritance:r first may strip the runner's
        # ability to read its descriptor, and it preserves explicit broad
        # ACEs anyway. Failure is fatal; never reconfigure existing folders.
        # The script receives only this new directory via env and suppresses
        # native account/path details in every failure.
        acl_script = r"""
$ErrorActionPreference='Stop'
$stage=20
try {
$path=$env:AMES_ISSUE57_NEW_PRIVATE_BACKUP
$item=Get-Item -LiteralPath $path -Force -ErrorAction Stop
if(-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'invalid_backup_root'}
if(@(Get-ChildItem -LiteralPath $path -Force -ErrorAction Stop).Count -ne 0){throw 'backup_root_not_empty'}
$userSid=[Security.Principal.WindowsIdentity]::GetCurrent().User
$stage=30
$acl=[System.IO.Directory]::GetAccessControl($path)
$stage=40
$acl.SetAccessRuleProtection($true,$false)
$stage=50
foreach($ace in @($acl.Access)){[void]$acl.RemoveAccessRuleSpecific($ace)}
$stage=60
$rule=[Security.AccessControl.FileSystemAccessRule]::new(
  $userSid,
  [Security.AccessControl.FileSystemRights]::FullControl,
  ([Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit),
  [Security.AccessControl.PropagationFlags]::None,
  [Security.AccessControl.AccessControlType]::Allow)
$acl.AddAccessRule($rule)
$stage=70
[System.IO.Directory]::SetAccessControl($path,$acl)
$stage=80
$actual=[System.IO.Directory]::GetAccessControl($path)
if(-not $actual.AreAccessRulesProtected){throw 'private_acl_inherits'}
$allowed=@($userSid.Value,'S-1-5-18','S-1-5-32-544')
$ownerAllowed=$false
$stage=90
foreach($ace in @($actual.Access)){
  if($ace.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow){continue}
  $who=$ace.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
  if($who -notin $allowed){throw 'private_acl_untrusted_allow'}
  if($who -eq $userSid.Value){$ownerAllowed=$true}
}
if(-not $ownerAllowed){throw 'private_acl_user_missing'}
}catch{
  # A strictly numeric stage is safe for CI. Do not print native errors:
  # they can expose account names and absolute private paths.
  if($stage -eq 30){
    $category=$_.CategoryInfo.Category.ToString()
    $stage=switch($category){
      'ObjectNotFound' {31;break}
      'PermissionDenied' {32;break}
      'InvalidArgument' {33;break}
      'NotSpecified' {34;break}
      'SecurityError' {35;break}
      'ResourceUnavailable' {36;break}
      default {39}
    }
  }
  exit $stage
}
"""
        env = os.environ.copy()
        env["AMES_ISSUE57_NEW_PRIVATE_BACKUP"] = str(target)
        result = subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", acl_script],
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                env=env, check=False)
        if result.returncode != 0:
            safe_stages = {20, 30, 31, 32, 33, 34, 35, 36, 39, 40, 50, 60, 70, 80, 90}
            stage = str(result.returncode) if result.returncode in safe_stages else "unknown"
            raise ValueError("windows_private_backup_acl_stage_" + stage)
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
    # Without a verified external lease, an identity can change in the middle
    # of the copy. Detect observable source changes even though this alone is
    # NOT sufficient to attest a production maintenance window.
    private_sources = (agent / "config.json", agent / "data/local_agent_token")
    if not all(_regular_file(source) for source in private_sources):
        raise ValueError("private_identity_source_untrusted")
    before = tuple(sha256_file(source) for source in private_sources)
    private_backup_directory(destination)
    consistent_sqlite_backup(agent / "data/ames_local.sqlite3", destination / "ames_local.sqlite3")
    copy_private_identity(agent / "config.json", destination / "config.json")
    copy_private_identity(agent / "data/local_agent_token", destination / "local_agent_token")
    if (not all(_regular_file(source) for source in private_sources) or
            tuple(sha256_file(source) for source in private_sources) != before or
            sha256_file(destination / "config.json") != before[0] or
            sha256_file(destination / "local_agent_token") != before[1]):
        raise ValueError("private_identity_changed_during_backup")
    return {"core_identity_verified": True, "data_tree_complete": False,
            "exclusive_lease_held": False, "update_authorized": False}


def _regular_file(path):
    """Reject POSIX links and Windows reparse points, including junctions."""
    path = Path(path)
    if path.is_symlink() or (hasattr(path, "is_junction") and path.is_junction()):
        return False
    state = path.stat(follow_symlinks=False)
    return (stat.S_ISREG(state.st_mode) and
            not (getattr(state, "st_file_attributes", 0) &
                 getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0)))


def _runtime_inventory(directory, max_bytes):
    """Enumerate every regular agent/data file; exclude DB online journal.

    No unknown directories, links or in-progress files may be silently skipped.
    This is a read-only observation, not proof of an exclusive maintenance lease.
    """
    directory = Path(directory)
    if not directory.is_dir() or directory.is_symlink() or (
            hasattr(directory, "is_junction") and directory.is_junction()):
        raise ValueError("agent_data_directory_untrusted")
    manifest = []
    total = 0
    def fail_walk(error):
        raise error

    for root, dirs, files in os.walk(directory, followlinks=False, onerror=fail_walk):
        dirs.sort(key=str.casefold)
        files.sort(key=str.casefold)
        for name in dirs:
            child = Path(root) / name
            if child.is_symlink() or (hasattr(child, "is_junction") and child.is_junction()):
                raise ValueError("runtime_directory_reparse_point")
        for name in files:
            src = Path(root) / name
            if not _regular_file(src):
                raise ValueError("runtime_file_not_regular")
            rel = src.relative_to(directory).as_posix()
            if rel in ("ames_local.sqlite3", "local_agent_token") or rel in SQLITE_TRANSIENT:
                # The SQLite snapshot and token are stored outside this
                # runtime tree and verified by private core digests.
                continue
            item = src.stat(follow_symlinks=False)
            total += item.st_size
            if total > max_bytes or len(manifest) >= MAX_ENTRIES:
                raise ValueError("runtime_backup_capacity_exceeded")
            manifest.append({"path": rel, "size": item.st_size,
                             "sha256": sha256_file(src)})
    return manifest


def backup_operational_tree(clean_root, destination,
                            max_bytes=MAX_RUNTIME_BACKUP_BYTES):
    """Backup ALL agent/data files in an isolated private directory.

    Only the agent's data subtree is covered. Browser IndexedDB/Firestore
    outbox, other installations, external MES folders and guardian state are
    NOT covered. Caller must still prove an external maintenance lease.

    Never mutates the source installation; never stops processes or installs a
    binary. Any concurrent change/link/unknown SQLite journal fails closed.
    """
    clean_root, destination = Path(clean_root).resolve(), Path(destination).resolve()
    if type(max_bytes) is not int or max_bytes < 1:
        raise ValueError("invalid_runtime_backup_limit")
    agent_data = clean_root / "ames-agent" / "data"
    initial = _runtime_inventory(agent_data, max_bytes)
    # Core function creates private permissions before writing identities.
    backup_core_identity(clean_root, destination)
    output = destination / "ames-agent" / "data"
    output.mkdir(parents=True, exist_ok=False)
    for item in initial:
        src = agent_data / item["path"]
        target = output / item["path"]
        target.parent.mkdir(parents=True, exist_ok=True)
        if not _regular_file(src):
            raise ValueError("runtime_file_changed_during_backup")
        with src.open("rb") as reader, target.open("xb") as writer:
            if os.name != "nt":
                os.chmod(target, 0o600)
            shutil.copyfileobj(reader, writer, length=1024 * 1024)
            writer.flush()
            os.fsync(writer.fileno())
        if target.stat().st_size != item["size"] or sha256_file(target) != item["sha256"]:
            raise ValueError("runtime_backup_integrity_mismatch")
    if _runtime_inventory(agent_data, max_bytes) != initial:
        raise ValueError("runtime_data_changed_during_backup")
    # Fingerprints remain ONLY in the ACL-protected private manifest. Never
    # return or log the token/config digest, even though they are required to
    # catch changes which SQLite quick_check alone cannot detect.
    core = {name: sha256_file(destination / name) for name in
            ("config.json", "local_agent_token", "ames_local.sqlite3")}
    manifest = {"schema": "ames-runtime-backup-v2", "files": initial,
                "core_sha256": core,
                "sqlite_source": "ames-agent/data/ames_local.sqlite3",
                "sqlite_online_backup": "ames_local.sqlite3",
                "identity_copied_separately": ["config.json", "local_agent_token"],
                "excluded_runtime_journals": sorted(SQLITE_TRANSIENT),
                "browser_sync_attested": False, "update_authorized": False}
    (destination / "runtime-backup-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, sort_keys=True, indent=2),
        encoding="utf-8")
    verify_operational_backup(destination)
    return {"agent_data_files_verified": len(initial),
            "agent_data_tree_verified": True,
            "browser_sync_attested": False, "exclusive_lease_held": False,
            "update_authorized": False}


def verify_operational_backup(destination):
    """Reopen backup files independently; no access to the live installation."""
    destination = Path(destination)
    manifest_file = destination / "runtime-backup-manifest.json"
    if not _regular_file(manifest_file):
        raise ValueError("runtime_backup_manifest_invalid")
    report = json.loads(manifest_file.read_text(encoding="utf-8"))
    if report.get("schema") != "ames-runtime-backup-v2" or not isinstance(report.get("files"), list):
        raise ValueError("runtime_backup_manifest_invalid")
    data = destination / "ames-agent" / "data"
    listed = report["files"]
    if len(listed) > MAX_ENTRIES or any(not isinstance(i, dict) or
                                       set(i) != {"path", "size", "sha256"} for i in listed):
        raise ValueError("runtime_backup_manifest_invalid")
    actual = _runtime_inventory(data, MAX_RUNTIME_BACKUP_BYTES)
    if actual != listed:
        raise ValueError("runtime_backup_restore_verification_failed")
    required_core = ("config.json", "local_agent_token", "ames_local.sqlite3")
    core = report.get("core_sha256")
    if (not isinstance(core, dict) or set(core) != set(required_core) or
            any(not isinstance(value, str) or len(value) != 64 or
                any(c not in "0123456789abcdef" for c in value)
                for value in core.values())):
        raise ValueError("runtime_backup_core_manifest_invalid")
    for required in required_core:
        if not (destination / required).is_file() or not _regular_file(destination / required):
            raise ValueError("runtime_backup_identity_incomplete")
        if sha256_file(destination / required) != core[required]:
            raise ValueError("runtime_backup_core_integrity_mismatch")
    with closing(sqlite3.connect((destination / "ames_local.sqlite3").as_uri() + "?mode=ro",
                                 uri=True)) as db:
        if db.execute("PRAGMA quick_check").fetchone() != ("ok",):
            raise ValueError("runtime_backup_sqlite_invalid")
    return {"verified": True, "update_authorized": False}


def rehearse_operational_restore(private_backup, *, interrupt_after=None):
    """Restore a verified agent snapshot ONLY into a disposable temp directory.

    Reconstruct data files, config, local token and a consistent SQLite backup
    independently, then revalidate all contents. Never accept a caller-chosen
    restoration destination or modify a CLEAN/backup directory. A successful
    rehearsal is still NOT an updater lease or proof of external browser data.
    """
    if interrupt_after not in (None, "after_sqlite", "after_first_data_file"):
        raise ValueError("invalid_restore_interruption_point")
    private_backup = Path(private_backup)
    verify_operational_backup(private_backup)
    manifest = json.loads((private_backup / "runtime-backup-manifest.json").read_text(encoding="utf-8"))
    source_data = private_backup / "ames-agent" / "data"

    def copy_checked(source, target, expected_digest=None):
        if not _regular_file(source) or target.exists():
            raise ValueError("restoration_source_or_target_untrusted")
        target.parent.mkdir(parents=True, exist_ok=True)
        with source.open("rb") as reader, target.open("xb") as writer:
            if os.name != "nt":
                os.chmod(target, 0o600)
            shutil.copyfileobj(reader, writer, length=1024 * 1024)
            writer.flush()
            os.fsync(writer.fileno())
        actual = sha256_file(target)
        if actual != sha256_file(source) or (expected_digest is not None and actual != expected_digest):
            raise ValueError("restored_file_digest_mismatch")

    with tempfile.TemporaryDirectory(prefix="issue57-restore-rehearsal-") as fixture:
        target = Path(fixture) / "private-restored-snapshot"
        private_backup_directory(target)  # Windows ACL before copying any secrets.
        restored_data = target / "ames-agent" / "data"
        restored_data.mkdir(parents=True, exist_ok=False)
        copy_checked(private_backup / "ames_local.sqlite3", restored_data / "ames_local.sqlite3")
        if interrupt_after == "after_sqlite":
            raise ValueError("simulated_restore_interruption_after_sqlite")
        copy_checked(private_backup / "config.json", target / "ames-agent" / "config.json")
        copy_checked(private_backup / "local_agent_token", restored_data / "local_agent_token")
        for index, item in enumerate(manifest["files"]):
            copy_checked(source_data / item["path"], restored_data / item["path"], item["sha256"])
            if interrupt_after == "after_first_data_file" and index == 0:
                raise ValueError("simulated_restore_interruption_after_first_data_file")
        # The restored DB is a closed copy; no original SQLite/WAL is accessed.
        with closing(sqlite3.connect((restored_data / "ames_local.sqlite3").as_uri() + "?mode=ro",
                                     uri=True)) as db:
            if db.execute("PRAGMA quick_check").fetchone() != ("ok",):
                raise ValueError("restored_sqlite_quick_check_failed")
        if _runtime_inventory(restored_data, MAX_RUNTIME_BACKUP_BYTES) != manifest["files"]:
            raise ValueError("restored_runtime_tree_mismatch")
        for private_name, source in (("config.json", private_backup / "config.json"),
                                     ("local_agent_token", private_backup / "local_agent_token")):
            dst = (target / "ames-agent" / "config.json" if private_name == "config.json"
                   else restored_data / "local_agent_token")
            if sha256_file(dst) != sha256_file(source):
                raise ValueError("restored_private_identity_mismatch")
        # The input backup is rechecked after the exercise to reject mutation.
        verify_operational_backup(private_backup)
        return {"restored_into_temporary_fixture": True,
                "sqlite_quick_check": True, "runtime_files_verified": len(manifest["files"]),
                "private_identity_verified": True, "external_browser_outbox_attested": False,
                "exclusive_maintenance_lease_held": False, "update_authorized": False}
