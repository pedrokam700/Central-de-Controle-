from __future__ import annotations

import argparse
import importlib.util
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit
from urllib.request import urlopen

SCHEMA = "central-local-frontend-activation-v1"
STATE_FILE = "FRONTEND_LOCAL_STATE.json"
DEFAULT_CANONICAL_PATH = "/Central-de-Controle-/"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _exact_sha(value: object) -> str:
    text = str(value or "").strip().lower()
    if len(text) != 40 or any(ch not in "0123456789abcdef" for ch in text):
        raise ValueError("frontend SHA must be exact 40-hex commit SHA")
    return text


def _package_root(path: str | Path) -> Path:
    value = Path(path).resolve()
    if (value / "ames-agent").is_dir():
        return value
    if value.name == "ames-agent" and value.is_dir():
        return value.parent
    raise ValueError("Specify the workstation package root or its ames-agent directory")


def _safe_stage_path(value: object) -> str:
    text = str(value or "")
    pure = PurePosixPath(text)
    if not text or text.startswith("/") or "\\" in text or ".." in pure.parts or "\x00" in text:
        raise ValueError("invalid staged frontend path")
    return pure.as_posix()


def _loopback_origin(value: object) -> str:
    text = str(value or "").strip().rstrip("/")
    parsed = urlsplit(text)
    if parsed.scheme != "http" or parsed.hostname != "127.0.0.1" or parsed.port is None:
        raise ValueError("local frontend origin must be http://127.0.0.1:<port>")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("local frontend origin must not contain credentials/query/fragment")
    if parsed.path not in ("", "/"):
        raise ValueError("local frontend origin must not contain a path")
    return f"http://127.0.0.1:{parsed.port}"


def _atomic_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + ".tmp." + uuid.uuid4().hex)
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    parsed = json.loads(temp.read_text(encoding="utf-8"))
    if not isinstance(parsed, dict):
        temp.unlink(missing_ok=True)
        raise ValueError("invalid activation state")
    os.replace(temp, path)


def _proof_server_module():
    path = Path(__file__).with_name("serve-staged-frontend.py")
    spec = importlib.util.spec_from_file_location("central_staged_frontend_server", path)
    if not spec or not spec.loader:
        raise RuntimeError("local frontend proof server module unavailable")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _fetch_health(origin: str, health_path: str) -> dict:
    with urlopen(origin + health_path, timeout=3) as response:
        if response.status != 200:
            raise ValueError("local frontend health is not ready")
        payload = json.loads(response.read().decode("utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("local frontend health payload invalid")
    return payload


def _validate_health(health: dict, verified_stage: dict, expected_sha: str, server_module) -> dict:
    if health.get("schema") != server_module.HEALTH_SCHEMA:
        raise ValueError("local frontend health schema mismatch")
    if str(health.get("frontend_sha") or "").lower() != expected_sha:
        raise ValueError("local frontend health SHA mismatch")
    if health.get("release_identity_sha256") != verified_stage.get("release_identity_sha256"):
        raise ValueError("local frontend health release identity mismatch")
    if health.get("served_from") != "verified-immutable-stage":
        raise ValueError("local frontend health source mismatch")
    if health.get("launcher_default") is not False or health.get("stage_activated") is not False:
        raise ValueError("local frontend proof server must remain non-default/non-activated")
    return health


def _normalize_state(value: dict) -> dict:
    if not isinstance(value, dict) or value.get("schema") != SCHEMA:
        raise ValueError("unsupported local frontend activation state")
    active = value.get("active")
    if active not in (True, False):
        raise ValueError("invalid local frontend activation flag")
    result = dict(value)
    if active:
        result["frontend_sha"] = _exact_sha(value.get("frontend_sha"))
        result["stage_path"] = _safe_stage_path(value.get("stage_path"))
        result["serving_origin"] = _loopback_origin(value.get("serving_origin"))
        canonical_path = str(value.get("canonical_path") or "")
        if canonical_path != DEFAULT_CANONICAL_PATH:
            raise ValueError("unexpected local frontend canonical path")
        expected_url = result["serving_origin"] + DEFAULT_CANONICAL_PATH
        if value.get("canonical_url") != expected_url:
            raise ValueError("local frontend canonical URL mismatch")
        digest = str(value.get("release_identity_sha256") or "")
        if len(digest) != 64 or any(ch not in "0123456789abcdef" for ch in digest.lower()):
            raise ValueError("invalid local frontend release identity digest")
        result["release_identity_sha256"] = digest.lower()
    return result


def read_state(installation: str | Path) -> dict:
    package = _package_root(installation)
    path = package / STATE_FILE
    if not path.exists():
        return {"schema": SCHEMA, "active": False, "reason": "not_configured"}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise ValueError("local frontend activation state is corrupt") from exc
    return _normalize_state(value)


def activate(installation: str | Path, frontend_sha: str, serving_origin: str, *, health_fetch=None) -> dict:
    package = _package_root(installation)
    sha = _exact_sha(frontend_sha)
    origin = _loopback_origin(serving_origin)
    stage_rel = f"frontend-packages/{sha}"
    stage = package / stage_rel
    server_module = _proof_server_module()
    verified = server_module.validate_stage(stage, sha)
    fetcher = health_fetch or (lambda target: _fetch_health(target, server_module.HEALTH_PATH))
    health = fetcher(origin)
    _validate_health(health, verified, sha, server_module)

    state = {
        "schema": SCHEMA,
        "active": True,
        "frontend_sha": sha,
        "stage_path": stage_rel,
        "serving_origin": origin,
        "canonical_path": DEFAULT_CANONICAL_PATH,
        "canonical_url": origin + DEFAULT_CANONICAL_PATH,
        "release_identity_sha256": verified["release_identity_sha256"],
        "activated_at": _now_iso(),
        "activation_source": "verified-loopback-health",
        "launcher_default": False,
    }
    _atomic_json(package / STATE_FILE, state)
    return _normalize_state(state)


def deactivate(installation: str | Path, *, reason: str = "manual") -> dict:
    package = _package_root(installation)
    previous = read_state(package)
    state = {
        "schema": SCHEMA,
        "active": False,
        "reason": str(reason or "manual")[:200],
        "deactivated_at": _now_iso(),
        "previous_frontend_sha": previous.get("frontend_sha"),
        "previous_serving_origin": previous.get("serving_origin"),
        "launcher_default": False,
    }
    _atomic_json(package / STATE_FILE, state)
    return _normalize_state(state)


def main() -> int:
    parser = argparse.ArgumentParser(description="Manage verified local frontend activation state without changing launcher defaults")
    parser.add_argument("operation", choices=["status", "activate", "deactivate"])
    parser.add_argument("installation")
    parser.add_argument("--sha")
    parser.add_argument("--origin")
    parser.add_argument("--reason", default="manual")
    args = parser.parse_args()

    if args.operation == "status":
        result = read_state(args.installation)
    elif args.operation == "activate":
        if not args.sha or not args.origin:
            parser.error("activate requires --sha and --origin")
        result = activate(args.installation, args.sha, args.origin)
    else:
        result = deactivate(args.installation, reason=args.reason)
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
