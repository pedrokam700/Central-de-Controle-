"""Independent, offline AT user identities and narrowly-scoped permissions.

No MES/SQLite workstation data is copied into the portable account profile.
Passwords are never stored or exported as plaintext. This module does not
grant workstation-token, administrator, or arbitrary API capabilities.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import tempfile
import threading
import time
from pathlib import Path

SCHEMA = "central-at-offline-accounts-v1"
_USERNAME = re.compile(r"^[a-z0-9_.-]{3,40}$")
_SCREENS = frozenset({"sn"})  # Extend only alongside a separately audited AT API/view.
_PROHIBITED = frozenset({"trace", "monitor", "users", "config", "backup", "collector", "admin"})
_ROLES = frozenset({'technician', 'repair_assistant', 'custom'})
_KDF_N = 1 << 14
_LOCK = threading.RLock()


def _normalized_username(value: str) -> str:
    name = str(value or "").strip().lower()
    if not _USERNAME.fullmatch(name):
        raise ValueError("Usuário deve ter 3–40 caracteres: letras, números, ponto, hífen ou _")
    return name


def _permissions(value) -> list[str]:
    if not isinstance(value, (list, tuple, set)) or len(value) > 16:
        raise ValueError("Permissões inválidas")
    permissions = sorted(set(str(item).strip() for item in value))
    if any(item not in _SCREENS or item in _PROHIBITED for item in permissions):
        raise ValueError("Permissão indisponível para perfis AT")
    if "sn" not in permissions:
        raise ValueError("O perfil AT precisa manter a Consulta por SN")
    return permissions


def _hashed_password(password: str) -> dict:
    if not isinstance(password, str) or not 10 <= len(password) <= 256:
        raise ValueError("Senha deve ter entre 10 e 256 caracteres")
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=_KDF_N, r=8, p=1, dklen=32)
    return {"scheme": "scrypt-n16384-r8-p1", "salt": base64.b64encode(salt).decode("ascii"),
            "digest": base64.b64encode(digest).decode("ascii")}


def _valid_verifier(verifier: dict) -> bool:
    if not isinstance(verifier, dict) or verifier.get("scheme") != "scrypt-n16384-r8-p1":
        return False
    try:
        return len(base64.b64decode(verifier["salt"], validate=True)) == 16 and len(
            base64.b64decode(verifier["digest"], validate=True)) == 32
    except (KeyError, TypeError, ValueError):
        return False


def _verify(password: str, verifier: dict) -> bool:
    if not _valid_verifier(verifier) or not isinstance(password, str) or len(password) > 256:
        return False
    salt = base64.b64decode(verifier["salt"])
    expected = base64.b64decode(verifier["digest"])
    supplied = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=_KDF_N, r=8, p=1, dklen=32)
    return hmac.compare_digest(supplied, expected)


def _load(path: Path) -> dict:
    if not path.exists():
        return {"schema": SCHEMA, "users": {}}
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict) or raw.get("schema") != SCHEMA or not isinstance(raw.get("users"), dict):
        raise ValueError("Arquivo de perfis AT inválido")
    for username, record in raw["users"].items():
        if _normalized_username(username) != username or not isinstance(record, dict):
            raise ValueError("Identidade AT inválida")
        if not _valid_verifier(record.get("password")):
            raise ValueError("Senha AT não verificável")
        _permissions(record.get("permissions", []))
        if record.get('role', 'technician') not in _ROLES:
            raise ValueError('Tipo de perfil AT inválido')
        if not isinstance(record.get("enabled"), bool):
            raise ValueError("Estado da conta AT inválido")
    return raw


def _atomic_save(path: Path, data: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    temp = None
    try:
        with tempfile.NamedTemporaryFile(prefix=".at-users-", suffix=".tmp", dir=path.parent,
                                         delete=False) as writer:
            temp = Path(writer.name)
            if os.name != "nt":
                os.chmod(temp, 0o600)
            writer.write(raw)
            writer.flush()
            os.fsync(writer.fileno())
        os.replace(temp, path)
    finally:
        if temp and temp.exists():
            temp.unlink()


class AtProfiles:
    def __init__(self, path: str | Path):
        self.path = Path(path)

    def list_public(self) -> list[dict]:
        with _LOCK:
            state = _load(self.path)
            return [{"username": key, "name": value["name"], "role": value.get('role', 'technician'),
                     "permissions": list(value["permissions"]),
                     "enabled": value["enabled"]} for key, value in sorted(state["users"].items())]

    def save_user(self, *, username: str, name: str, password: str | None = None,
                  permissions=None, enabled: bool = True, role: str = 'technician') -> dict:
        username = _normalized_username(username)
        name = str(name or "").strip()
        if not 1 <= len(name) <= 100 or any(ord(c) < 32 for c in name):
            raise ValueError("Nome de funcionário inválido")
        if type(enabled) is not bool:
            raise ValueError("Estado de conta inválido")
        if role not in _ROLES:
            raise ValueError('Tipo de perfil inválido')
        permission_set = _permissions(permissions if permissions is not None else ["sn"])
        with _LOCK:
            state = _load(self.path)
            existing = state["users"].get(username)
            if not existing and password is None:
                raise ValueError("Nova conta exige senha")
            verifier = _hashed_password(password) if password is not None else existing["password"]
            state["users"][username] = {"name": name, "password": verifier, "role": role,
                                          "permissions": permission_set, "enabled": enabled}
            _atomic_save(self.path, state)
        return {"username": username, "name": name, "role": role,
                "permissions": permission_set, "enabled": enabled}

    def export_for_at(self) -> bytes:
        # The password verifiers are deliberately included: the disconnected
        # AT workstation must be able to verify logins without reaching Pedro.
        # Admin authority is NOT included in any exported account.
        with _LOCK:
            state = _load(self.path)
            return json.dumps(state, sort_keys=True, ensure_ascii=False,
                              separators=(",", ":")).encode("utf-8")

    def authenticate(self, username: str, password: str) -> dict | None:
        try:
            username = _normalized_username(username)
        except ValueError:
            return None
        with _LOCK:
            record = _load(self.path)["users"].get(username)
        if not record or not record["enabled"] or not _verify(password, record["password"]):
            return None
        return {"username": username, "name": record["name"], "role": record.get('role', 'technician'),
                "permissions": list(record["permissions"])}


class AtSessions:
    """Process-local sessions; a restart always invalidates former cookies."""
    def __init__(self, profiles: AtProfiles, ttl: int = 8 * 3600):
        self.profiles, self.ttl = profiles, ttl
        self._sessions: dict[str, tuple[float, dict]] = {}
        self._failures: dict[str, tuple[int, float]] = {}
        self._jobs: dict[str, str] = {}
        self._lock = threading.RLock()

    def login(self, username: str, password: str) -> tuple[str, dict] | None:
        key = str(username or "").strip().lower()
        with self._lock:
            attempts, blocked_until = self._failures.get(key, (0, 0.0))
            if blocked_until:
                if blocked_until > time.monotonic():
                    return None
                self._failures.pop(key, None)
                attempts = 0
        identity = self.profiles.authenticate(key, password)
        with self._lock:
            if identity is None:
                attempts += 1
                self._failures[key] = (attempts, time.monotonic() + 60 if attempts >= 5 else 0.0)
                return None
            self._failures.pop(key, None)
            token = secrets.token_urlsafe(32)
            self._sessions[token] = (time.monotonic() + self.ttl, identity)
            return token, identity

    def current(self, token: str) -> dict | None:
        if not token:
            return None
        with self._lock:
            expires, identity = self._sessions.get(token, (0.0, None))
            if expires <= time.monotonic():
                self._sessions.pop(token, None)
                return None
        # Deactivation and permission changes apply even before session expiry.
        with _LOCK:
            account = _load(self.profiles.path)["users"].get(identity["username"])
        if not account or not account["enabled"]:
            self.logout(token)
            return None
        return {"username": identity["username"], "name": account["name"],
                "role": account.get('role', 'technician'),
                "permissions": list(account["permissions"])}

    def job_created(self, token: str, job_id: str):
        with self._lock:
            if token in self._sessions:
                self._jobs[str(job_id)] = token

    def owns_job(self, token: str, job_id: str) -> bool:
        with self._lock:
            return bool(token) and self._jobs.get(str(job_id)) == token and self.current(token) is not None

    def logout(self, token: str):
        with self._lock:
            self._sessions.pop(token, None)
            self._jobs = {k: v for k, v in self._jobs.items() if v != token}


class AtAdminGate:
    """A separate, non-exportable administrator password for account management."""
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self._sessions: dict[str, float] = {}
        self._failures: dict[str, tuple[int, float]] = {}
        self._lock = threading.RLock()

    def configured(self) -> bool:
        return self.path.is_file()

    def setup(self, password: str):
        with self._lock:
            if self.configured():
                raise ValueError("Senha administrativa já configurada")
            _atomic_save(self.path, {"schema": "central-at-admin-password-v1",
                                     "password": _hashed_password(password)})

    def login(self, password: str) -> str | None:
        with self._lock:
            attempts, blocked_until = self._failures.get('admin', (0, 0.0))
            if blocked_until:
                if blocked_until > time.monotonic():
                    return None
                attempts = 0
                self._failures.pop('admin', None)
            if not self.configured():
                return None
            data = json.loads(self.path.read_text(encoding='utf-8'))
            if data.get('schema') != 'central-at-admin-password-v1' or not _verify(password, data.get('password')):
                attempts += 1
                self._failures['admin'] = (attempts, time.monotonic() + 60 if attempts >= 5 else 0.0)
                return None
            self._failures.clear()
            token = secrets.token_urlsafe(32)
            self._sessions[token] = time.monotonic() + 3600
            return token

    def current(self, token: str) -> bool:
        if not token:
            return False
        with self._lock:
            expires = self._sessions.get(token, 0.0)
            if expires < time.monotonic():
                self._sessions.pop(token, None)
                return False
            return True

    def logout(self, token: str):
        with self._lock:
            self._sessions.pop(token, None)
