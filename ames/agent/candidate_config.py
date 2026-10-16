from __future__ import annotations

import ipaddress
import re
import threading
from datetime import datetime
from typing import Any, Dict
from urllib.parse import urlparse

import operational_calendar

BASE_ALLOWED = {
    "configured_lines", "line_aliases", "day_start", "production_day_start", "timezone", "work_shifts",
    "monitor_interval_minutes", "performance", "chrome_profile_dir", "ames_host", "ames_port", "ames_start_url",
    "setup_complete", "backup_retention", "auto_backup_on_start", "allowed_origins",
}
CANDIDATE_ALLOWED = BASE_ALLOWED | {"ames_start_date"}
CALENDAR_KEYS = {"day_start", "production_day_start", "timezone", "work_shifts"}
PERFORMANCE_VALUES = {"fast", "balanced", "safe"}
_START_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_HOST_RE = re.compile(r"^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(?:\.(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?))*$")
_LOOPBACK_HOSTS = {"localhost", "127.0.0.1", "::1"}
_CONFIG_LOCK = threading.Lock()


def normalize_start_date(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    if not _START_DATE_RE.fullmatch(raw):
        raise ValueError("ames_start_date deve usar exatamente o formato YYYY-MM-DD")
    try:
        parsed = datetime.strptime(raw, "%Y-%m-%d").date()
    except ValueError as exc:
        raise ValueError("ames_start_date invalida") from exc
    if parsed > datetime.now().date():
        raise ValueError("ames_start_date nao pode estar no futuro")
    return parsed.isoformat()


def _int_range(value: Any, name: str, minimum: int, maximum: int) -> int:
    if isinstance(value, bool):
        raise ValueError(f"{name} deve ser numerico")
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{name} deve ser um inteiro") from exc
    if parsed < minimum or parsed > maximum:
        raise ValueError(f"{name} deve ficar entre {minimum} e {maximum}")
    return parsed


def _bool(value: Any, name: str) -> bool:
    if not isinstance(value, bool):
        raise ValueError(f"{name} deve ser true ou false")
    return value


def _host(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw or any(ch.isspace() for ch in raw) or any(ch in raw for ch in "/\\@") or "://" in raw:
        raise ValueError("ames_host deve conter apenas host/IP, sem protocolo, caminho ou credenciais")
    try:
        ipaddress.ip_address(raw)
        return raw
    except ValueError:
        pass
    if not _HOST_RE.fullmatch(raw):
        raise ValueError("ames_host invalido")
    return raw.lower()


def _profile_dir(value: Any) -> str:
    raw = str(value or "").strip()
    if "\x00" in raw or len(raw) > 4096:
        raise ValueError("chrome_profile_dir invalido")
    return raw


def _origin(value: Any) -> str:
    raw = str(value or "").strip().rstrip("/")
    parsed = urlparse(raw)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError(f"allowed_origins contem origem invalida: {raw or '(vazia)'}")
    if parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.params:
        raise ValueError("allowed_origins nao aceita credenciais, query ou fragmento")
    if parsed.path not in {"", "/"}:
        raise ValueError("allowed_origins deve conter somente a origem, sem caminho")
    host = parsed.hostname.lower()
    if parsed.scheme == "http" and host not in _LOOPBACK_HOSTS:
        raise ValueError("origem HTTP remota nao permitida; use HTTPS")
    try:
        port = parsed.port
    except ValueError as exc:
        raise ValueError("porta invalida em allowed_origins") from exc
    default_port = (parsed.scheme == "https" and port in {None, 443}) or (parsed.scheme == "http" and port in {None, 80})
    authority = host if default_port else f"{host}:{port}"
    if ":" in host and host not in {"localhost"} and not host.startswith("["):
        authority = f"[{host}]" if default_port else f"[{host}]:{port}"
    return f"{parsed.scheme}://{authority}"


def _origins(value: Any) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, (list, tuple)):
        raise ValueError("allowed_origins deve ser uma lista")
    if len(value) > 16:
        raise ValueError("allowed_origins aceita no maximo 16 origens")
    out: list[str] = []
    seen = set()
    for item in value:
        origin = _origin(item)
        if origin not in seen:
            seen.add(origin)
            out.append(origin)
    return out


def _line_aliases(agent_module, value: Any) -> Dict[str, str]:
    if not isinstance(value, dict):
        raise ValueError("line_aliases deve ser um objeto")
    if len(value) > 50:
        raise ValueError("line_aliases excedeu o limite de 50 aliases")
    out: Dict[str, str] = {}
    for alias, target in value.items():
        key = str(alias or "").strip()
        if not key or len(key) > 80 or "\x00" in key:
            raise ValueError("line_aliases contem nome invalido")
        normalized = agent_module.normalize_line_id(target)
        if not normalized:
            raise ValueError(f"line_aliases sem linha valida para {key}")
        out[key] = normalized
    return out


def _start_url(value: Any, effective_host: str) -> str:
    raw = str(value or "").strip()
    parsed = urlparse(raw)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("ames_start_url deve ser uma URL HTTP/HTTPS valida")
    if parsed.username or parsed.password or parsed.fragment:
        raise ValueError("ames_start_url nao aceita credenciais ou fragmento")
    try:
        _ = parsed.port
    except ValueError as exc:
        raise ValueError("ames_start_url contem porta invalida") from exc
    if effective_host and parsed.hostname.lower() != effective_host.lower():
        raise ValueError("ames_start_url deve apontar para o mesmo host configurado em ames_host")
    if len(raw) > 2048:
        raise ValueError("ames_start_url excedeu o limite permitido")
    return raw


def _normalize_calendar(current: Dict[str, Any], changed: Dict[str, Any]) -> Dict[str, Any]:
    """Keep the legacy day_start alias compatible without mixing it with shift boundaries."""
    if not CALENDAR_KEYS.intersection(changed):
        return changed

    candidate = {**current, **changed}
    if "production_day_start" in changed:
        candidate["day_start"] = changed["production_day_start"]
    elif "day_start" in changed:
        candidate["production_day_start"] = changed["day_start"]

    normalized = operational_calendar.normalized(candidate)
    changed["timezone"] = normalized["timezone"]
    changed["production_day_start"] = normalized["production_day_start"]
    changed["day_start"] = normalized["production_day_start"]
    changed["work_shifts"] = normalized["work_shifts"]
    return changed


def _apply_locked(agent_module, incoming: Dict[str, Any]) -> Dict[str, Any]:
    changed = {k: v for k, v in incoming.items() if k in CANDIDATE_ALLOWED}

    if "configured_lines" in changed:
        lines = agent_module.normalize_lines(changed.get("configured_lines") or [])
        if not lines:
            raise ValueError("configured_lines deve conter ao menos uma linha")
        if len(lines) > 20:
            raise ValueError("configured_lines excedeu o limite de 20 linhas")
        changed["configured_lines"] = lines
    if "line_aliases" in changed:
        changed["line_aliases"] = _line_aliases(agent_module, changed["line_aliases"])
    if "ames_start_date" in changed:
        changed["ames_start_date"] = normalize_start_date(changed.get("ames_start_date"))
    if "monitor_interval_minutes" in changed:
        changed["monitor_interval_minutes"] = _int_range(changed["monitor_interval_minutes"], "monitor_interval_minutes", 5, 1440)
    if "backup_retention" in changed:
        changed["backup_retention"] = _int_range(changed["backup_retention"], "backup_retention", 1, 100)
    if "ames_port" in changed:
        changed["ames_port"] = _int_range(changed["ames_port"], "ames_port", 1, 65535)
    if "performance" in changed:
        perf = str(changed["performance"] or "").strip().lower()
        if perf == "normal":
            perf = "balanced"
        if perf not in PERFORMANCE_VALUES:
            raise ValueError("performance deve ser fast, balanced ou safe")
        changed["performance"] = perf
    if "chrome_profile_dir" in changed:
        changed["chrome_profile_dir"] = _profile_dir(changed["chrome_profile_dir"])
    if "ames_host" in changed:
        changed["ames_host"] = _host(changed["ames_host"])
    if "allowed_origins" in changed:
        changed["allowed_origins"] = _origins(changed["allowed_origins"])
    if "setup_complete" in changed:
        changed["setup_complete"] = _bool(changed["setup_complete"], "setup_complete")
    if "auto_backup_on_start" in changed:
        changed["auto_backup_on_start"] = _bool(changed["auto_backup_on_start"], "auto_backup_on_start")

    changed = _normalize_calendar(agent_module.CONFIG, changed)
    effective_host = str(changed.get("ames_host") or agent_module.CONFIG.get("ames_host") or "").strip()
    # Host and navigation URL are one configuration unit. Changing only the host
    # while leaving a URL aimed at the previous MES can make probes and browser
    # navigation disagree. Validate the effective pair whenever either side is
    # edited and fail closed unless both describe the same host.
    if "ames_start_url" in changed or "ames_host" in changed:
        effective_url = changed.get("ames_start_url", agent_module.CONFIG.get("ames_start_url"))
        changed["ames_start_url"] = _start_url(effective_url, effective_host)

    ignored = sorted(k for k in incoming if k not in CANDIDATE_ALLOWED)
    next_config = {**agent_module.CONFIG, **changed}

    # Persist first. If the atomic disk write fails, the process keeps the exact
    # previous in-memory config and the caller receives the write failure.
    agent_module.write_config(next_config)
    agent_module.CONFIG.clear()
    agent_module.CONFIG.update(next_config)

    audit_warning = None
    try:
        agent_module.STORE.record_audit(
            "CONFIG_UPDATE",
            workstation=agent_module.WORKSTATION,
            details={"keys": sorted(changed.keys()), "ignored_keys": ignored, "candidate_extension": True},
        )
    except Exception as exc:
        # The configuration is already durably committed. Do not tell the user it
        # failed and invite a duplicate write only because audit logging failed.
        audit_warning = type(exc).__name__

    return {"ok": True, "config": dict(agent_module.CONFIG), "ignored_keys": ignored, "audit_warning": audit_warning}


def apply(agent_module, body: Dict[str, Any]) -> Dict[str, Any]:
    incoming = dict(body or {})
    with _CONFIG_LOCK:
        return _apply_locked(agent_module, incoming)
