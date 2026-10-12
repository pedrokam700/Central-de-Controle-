"""Stable local workstation identity for future multi-collector authority.

The identity is generated once and persisted beside the local operational data.
It is intentionally unrelated to hostname, user account or MES credentials. If an
existing identity file becomes invalid we fail closed instead of silently creating
a new collector identity.
"""
from __future__ import annotations

import json
import os
import re
import socket
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCHEMA = "central-workstation-identity-v1"
ID_RE = re.compile(r"^ws_[0-9a-f]{32}$")


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _validate(payload: Any) -> dict:
    if not isinstance(payload, dict):
        raise RuntimeError("Workstation identity inválida")
    if payload.get("schema") != SCHEMA:
        raise RuntimeError("Workstation identity schema inválido")
    workstation_id = str(payload.get("workstation_id") or "")
    if not ID_RE.fullmatch(workstation_id):
        raise RuntimeError("Workstation identity id inválido")
    created_at = str(payload.get("created_at") or "")
    if not created_at:
        raise RuntimeError("Workstation identity sem created_at")
    return {
        "schema": SCHEMA,
        "workstation_id": workstation_id,
        "created_at": created_at,
    }


def load(path: str | Path) -> dict:
    candidate = Path(path)
    try:
        raw = candidate.read_text(encoding="utf-8")
        payload = json.loads(raw)
    except Exception as exc:
        raise RuntimeError("Workstation identity existente não pôde ser lida") from exc
    return _validate(payload)


def _atomic_write(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    data = json.dumps(payload, ensure_ascii=False, sort_keys=True, indent=2) + "\n"
    try:
        with tmp.open("w", encoding="utf-8", newline="\n") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
    finally:
        try:
            tmp.unlink(missing_ok=True)
        except OSError:
            pass


def ensure(data_dir: str | Path) -> dict:
    path = Path(data_dir) / "workstation_identity.json"
    if path.exists():
        identity = load(path)
        return {**identity, "path": str(path), "created": False}
    payload = {
        "schema": SCHEMA,
        "workstation_id": "ws_" + uuid.uuid4().hex,
        "created_at": _utc_now(),
    }
    _atomic_write(path, payload)
    identity = load(path)
    return {**identity, "path": str(path), "created": True}


def public_status(identity: dict) -> dict:
    clean = _validate(identity)
    return {
        **clean,
        "hostname": socket.gethostname(),
        "identity_kind": "random_local_capability",
        "stable": True,
    }
