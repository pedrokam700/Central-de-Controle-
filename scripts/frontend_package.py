from __future__ import annotations

import argparse
import hashlib
import json
import os
import stat
import zipfile
from pathlib import Path
from typing import Iterable

MANIFEST_NAME = "FRONTEND_PACKAGE_MANIFEST.json"
SCHEMA = "central-immutable-frontend-v1"
FIXED_ZIP_TIME = (2026, 1, 1, 0, 0, 0)
FORBIDDEN_NAMES = {
    "config.json",
    "ames_local.sqlite3",
    "local_agent_token",
    "workstation_identity.json",
}


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _safe_rel(path: Path, root: Path) -> str:
    rel = path.relative_to(root).as_posix()
    if rel.startswith("../") or rel.startswith("/") or ".." in Path(rel).parts:
        raise ValueError(f"unsafe frontend package path: {rel}")
    return rel


def _tree(root: Path) -> list[Path]:
    if not root.is_dir():
        raise ValueError(f"static dist does not exist: {root}")
    files = sorted((path for path in root.rglob("*") if path.is_file()), key=lambda p: p.relative_to(root).as_posix())
    if not files:
        raise ValueError("static dist is empty")
    for path in files:
        if path.name in FORBIDDEN_NAMES:
            raise ValueError(f"forbidden runtime/private file in frontend package: {path.name}")
    return files


def _read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise ValueError(f"invalid JSON: {path}") from exc


def build_manifest(root: Path, expected_sha: str) -> dict:
    expected_sha = str(expected_sha or "").strip()
    if len(expected_sha) != 40 or any(ch not in "0123456789abcdefABCDEF" for ch in expected_sha):
        raise ValueError("expected frontend SHA must be a 40-character git SHA")

    release_build = _read_json(root / "release-build.json")
    if str(release_build.get("sha") or "") != expected_sha:
        raise ValueError(
            f"release-build SHA mismatch: expected {expected_sha}, got {release_build.get('sha')!r}"
        )
    identity_path = root / "release-identity.json"
    identity_bytes = identity_path.read_bytes()
    identity_sha = sha256_bytes(identity_bytes)
    declared_identity_sha = str(release_build.get("release_identity_sha256") or "")
    if identity_sha != declared_identity_sha:
        raise ValueError(
            f"release identity digest mismatch: release-build={declared_identity_sha}, actual={identity_sha}"
        )

    canonical = root / "Central-de-Controle-" / "index.html"
    if not canonical.is_file():
        raise ValueError("canonical Central-de-Controle-/index.html missing from static dist")

    files = _tree(root)
    entries = []
    for path in files:
        rel = _safe_rel(path, root)
        data = path.read_bytes()
        entries.append({"path": rel, "bytes": len(data), "sha256": sha256_bytes(data)})

    manifest = {
        "schema": SCHEMA,
        "frontend_sha": expected_sha.lower(),
        "central_build": release_build.get("build"),
        "release_identity_schema": release_build.get("release_identity_schema"),
        "release_identity_sha256": identity_sha,
        "canonical_path": "/Central-de-Controle-/",
        "file_count": len(entries),
        "files": entries,
        "runtime_private_data_included": False,
        "activation": "package_only_not_launcher_default",
    }
    return manifest


def _zip_entry(name: str, data: bytes) -> tuple[zipfile.ZipInfo, bytes]:
    info = zipfile.ZipInfo(name, FIXED_ZIP_TIME)
    info.compress_type = zipfile.ZIP_DEFLATED
    info.create_system = 3
    info.external_attr = (stat.S_IFREG | 0o644) << 16
    return info, data


def build_package(root: Path, output: Path, expected_sha: str) -> dict:
    root = root.resolve()
    output = output.resolve()
    manifest = build_manifest(root, expected_sha)
    manifest_bytes = (json.dumps(manifest, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")

    output.parent.mkdir(parents=True, exist_ok=True)
    temp = output.with_suffix(output.suffix + ".tmp")
    try:
        with zipfile.ZipFile(temp, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            info, data = _zip_entry(MANIFEST_NAME, manifest_bytes)
            archive.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
            for item in manifest["files"]:
                data = (root / item["path"]).read_bytes()
                info, payload = _zip_entry("frontend/" + item["path"], data)
                archive.writestr(info, payload, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
        os.replace(temp, output)
    finally:
        if temp.exists():
            temp.unlink()

    verification = verify_package(output, expected_sha=expected_sha)
    verification["package_sha256"] = sha256_file(output)
    return verification


def verify_package(package: Path, *, expected_sha: str | None = None) -> dict:
    package = package.resolve()
    with zipfile.ZipFile(package, "r") as archive:
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise ValueError("duplicate member in frontend package")
        if MANIFEST_NAME not in names:
            raise ValueError("frontend package manifest missing")
        for name in names:
            pure = Path(name)
            if name.startswith("/") or ".." in pure.parts:
                raise ValueError(f"unsafe member in frontend package: {name}")
        manifest = json.loads(archive.read(MANIFEST_NAME).decode("utf-8"))
        if manifest.get("schema") != SCHEMA:
            raise ValueError("unsupported frontend package schema")
        if expected_sha and str(manifest.get("frontend_sha")) != str(expected_sha).lower():
            raise ValueError("frontend package SHA does not match expected SHA")
        files = manifest.get("files")
        if not isinstance(files, list) or not files:
            raise ValueError("frontend package file manifest is empty")
        expected_members = {MANIFEST_NAME}
        for item in files:
            rel = str(item.get("path") or "")
            member = "frontend/" + rel
            expected_members.add(member)
            try:
                payload = archive.read(member)
            except KeyError as exc:
                raise ValueError(f"frontend package member missing: {member}") from exc
            if len(payload) != int(item.get("bytes", -1)):
                raise ValueError(f"frontend package size mismatch: {member}")
            if sha256_bytes(payload) != item.get("sha256"):
                raise ValueError(f"frontend package hash mismatch: {member}")
        extra = set(names) - expected_members
        if extra:
            raise ValueError(f"unexpected frontend package members: {sorted(extra)}")
        if "frontend/release-build.json" not in expected_members:
            raise ValueError("release-build.json missing from immutable frontend")
        if "frontend/release-identity.json" not in expected_members:
            raise ValueError("release-identity.json missing from immutable frontend")
        if "frontend/Central-de-Controle-/index.html" not in expected_members:
            raise ValueError("canonical Central index missing from immutable frontend")
    return {
        "schema": manifest["schema"],
        "frontend_sha": manifest["frontend_sha"],
        "file_count": manifest["file_count"],
        "release_identity_sha256": manifest["release_identity_sha256"],
        "verified": True,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build/verify immutable Central frontend package")
    sub = parser.add_subparsers(dest="command", required=True)

    build = sub.add_parser("build")
    build.add_argument("--dist", required=True)
    build.add_argument("--output", required=True)
    build.add_argument("--sha", required=True)

    verify = sub.add_parser("verify")
    verify.add_argument("--package", required=True)
    verify.add_argument("--sha")

    args = parser.parse_args()
    if args.command == "build":
        result = build_package(Path(args.dist), Path(args.output), args.sha)
    else:
        result = verify_package(Path(args.package), expected_sha=args.sha)
        result["package_sha256"] = sha256_file(Path(args.package))
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
