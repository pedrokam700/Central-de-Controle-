"""Explicit operational calendar for the A-MES workstation.

Production-day windows and shift classification are different concepts. The
legacy `day_start` value is preserved as a migration fallback and is never
silently reinterpreted as a shift boundary.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict
from zoneinfo import ZoneInfo

DEFAULT_TIMEZONE = "America/Sao_Paulo"
DEFAULT_PRODUCTION_DAY_START = "07:00"
DEFAULT_SHIFTS = {
    "1": {"label": "1º Turno", "start": "07:30", "end": "17:30"},
    "2": {"label": "2º Turno", "start": "17:30", "end": "07:30"},
}


def _clock(value: Any, field: str) -> tuple[int, int]:
    text = str(value or "").strip()
    try:
        hour_text, minute_text = text.split(":", 1)
        hour, minute = int(hour_text), int(minute_text)
    except Exception as exc:
        raise ValueError(f"{field} inválido: esperado HH:MM") from exc
    if hour < 0 or hour > 23 or minute < 0 or minute > 59:
        raise ValueError(f"{field} inválido: esperado HH:MM")
    return hour, minute


def normalized(config: Dict[str, Any]) -> Dict[str, Any]:
    timezone = str(config.get("timezone") or DEFAULT_TIMEZONE).strip()
    try:
        ZoneInfo(timezone)
    except Exception as exc:
        raise ValueError(f"timezone inválido: {timezone}") from exc

    production_day_start = str(
        config.get("production_day_start") or config.get("day_start") or DEFAULT_PRODUCTION_DAY_START
    ).strip()
    _clock(production_day_start, "production_day_start")

    raw_shifts = config.get("work_shifts")
    shifts = {}
    for key, fallback in DEFAULT_SHIFTS.items():
        raw = raw_shifts.get(key, {}) if isinstance(raw_shifts, dict) else {}
        item = {
            "label": str(raw.get("label") or fallback["label"]),
            "start": str(raw.get("start") or fallback["start"]),
            "end": str(raw.get("end") or fallback["end"]),
        }
        _clock(item["start"], f"work_shifts.{key}.start")
        _clock(item["end"], f"work_shifts.{key}.end")
        shifts[key] = item

    return {
        "timezone": timezone,
        "production_day_start": production_day_start,
        "work_shifts": shifts,
        "legacy_day_start": config.get("day_start"),
    }


def migrate_config(config: Dict[str, Any]) -> bool:
    """Add explicit calendar fields without changing legacy collection windows."""
    current = normalized(config)
    changed = False
    if not config.get("timezone"):
        config["timezone"] = current["timezone"]
        changed = True
    if not config.get("production_day_start"):
        config["production_day_start"] = current["production_day_start"]
        changed = True
    if not isinstance(config.get("work_shifts"), dict):
        config["work_shifts"] = current["work_shifts"]
        changed = True
    return changed


def _local_now(config: Dict[str, Any], now: datetime | None = None) -> datetime:
    calendar = normalized(config)
    zone = ZoneInfo(calendar["timezone"])
    if now is None:
        return datetime.now(zone)
    if now.tzinfo is None:
        # Tests/legacy callers may provide naive local wall time. Interpret it in
        # the configured plant timezone instead of workstation implicit timezone.
        return now.replace(tzinfo=zone)
    return now.astimezone(zone)


def today_window(config: Dict[str, Any], now: datetime | None = None) -> tuple[str, str]:
    calendar = normalized(config)
    current = _local_now(config, now)
    hour, minute = _clock(calendar["production_day_start"], "production_day_start")
    start = current.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if current < start:
        start -= timedelta(days=1)
    return start.isoformat(timespec="minutes"), current.isoformat(timespec="minutes")


def previous_day_window(config: Dict[str, Any], now: datetime | None = None) -> tuple[str, str]:
    start_today, _ = today_window(config, now)
    end = datetime.fromisoformat(start_today)
    start = end - timedelta(days=1)
    return start.isoformat(timespec="minutes"), end.isoformat(timespec="minutes")


def shift_for(config: Dict[str, Any], moment: datetime | None = None) -> Dict[str, Any]:
    calendar = normalized(config)
    current = _local_now(config, moment)
    minute_of_day = current.hour * 60 + current.minute

    for key in ("1", "2"):
        item = calendar["work_shifts"][key]
        sh, sm = _clock(item["start"], f"work_shifts.{key}.start")
        eh, em = _clock(item["end"], f"work_shifts.{key}.end")
        start, end = sh * 60 + sm, eh * 60 + em
        inside = start <= minute_of_day < end if start < end else (minute_of_day >= start or minute_of_day < end)
        if inside:
            return {"id": key, **item, "timezone": calendar["timezone"]}
    return {"id": None, "label": "Fora dos turnos configurados", "timezone": calendar["timezone"]}


def public_contract(config: Dict[str, Any]) -> Dict[str, Any]:
    value = normalized(config)
    return {
        "timezone": value["timezone"],
        "production_day_start": value["production_day_start"],
        "work_shifts": value["work_shifts"],
        "semantics": {
            "production_day_start": "3028 today/previous-day window boundary",
            "work_shifts": "2114/operational shift classification",
        },
    }
