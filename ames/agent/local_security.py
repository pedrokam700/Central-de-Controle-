"""Loopback authorization for the Central A-MES agent.

The token is a workstation capability, not an A-MES/Firebase credential. It is
created locally, never synchronized, and is passed by the launcher in the URL
fragment (which browsers do not send to Vercel/Netlify). The Central moves it to
sessionStorage and sends it only to http://127.0.0.1:8765.
"""
from __future__ import annotations

import hmac
import os
import secrets
from pathlib import Path

TOKEN_HEADER = "X-Central-Agent-Token"
TOKEN_FILE_NAME = "local_agent_token"


def ensure_token(base_dir: str | Path) -> tuple[str, Path]:
    base = Path(base_dir)
    data = base / "data"
    data.mkdir(parents=True, exist_ok=True)
    path = data / TOKEN_FILE_NAME
    if path.exists():
        token = path.read_text(encoding="utf-8").strip()
        if len(token) < 32:
            raise RuntimeError("Token local do agente inválido; restaure o backup ou remova o arquivo para regenerar")
        return token, path

    token = secrets.token_urlsafe(32)
    tmp = path.with_name(path.name + f".tmp.{os.getpid()}")
    try:
        # Best effort atomic creation. A second process must not silently replace
        # a capability that the launcher may already have read.
        with tmp.open("x", encoding="utf-8", newline="\n") as handle:
            handle.write(token + "\n")
            handle.flush()
            os.fsync(handle.fileno())
        try:
            os.replace(tmp, path)
        except OSError:
            if path.exists():
                existing = path.read_text(encoding="utf-8").strip()
                if len(existing) >= 32:
                    return existing, path
            raise
    finally:
        try:
            if tmp.exists():
                tmp.unlink()
        except OSError:
            pass
    return token, path


def local_origin(origin: str | None, port: int) -> bool:
    value = str(origin or "").rstrip("/").lower()
    return value in {f"http://127.0.0.1:{int(port)}", f"http://localhost:{int(port)}"}


def authorized(headers, token: str, port: int) -> bool:
    """Authorize same-origin local UI or an exact workstation capability."""
    if local_origin(headers.get("Origin"), port):
        return True
    supplied = str(headers.get(TOKEN_HEADER) or "")
    return bool(supplied) and hmac.compare_digest(supplied, token)


def public_status(token_path: str | Path) -> dict:
    path = Path(token_path)
    return {
        "mode": "workstation-token-v1",
        "token_present": path.is_file(),
        "token_header": TOKEN_HEADER,
        "token_file": TOKEN_FILE_NAME,
    }
