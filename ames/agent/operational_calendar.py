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
    "2": {"label": "2º Turno", "start": "17:30", "end": "03:30"},
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
    # A pre-20/10/2026 template shipped 17:30–07:30 incorrectly. Upgrade
    # that exact old template without replacing independently customized shifts.
    if isinstance(raw_shifts, dict):
        old_1 = raw_shifts.get("1") or {}
        old_2 = raw_shifts.get("2") or {}
        if (isinstance(old_1, dict) and isinstance(old_2, dict) and
            old_1.get("label") == "1º Turno" and old_1.get("start") == "07:30" and old_1.get("end") == "17:30" and
            old_2.get("label") == "2º Turno" and old_2.get("start") == "17:30" and old_2.get("end") == "07:30"):
            raw_shifts = {**raw_shifts, "2": {**old_2, "end": "03:30"}}
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

    # Exception dates are operational policy, never silently inferred from weekends.
    def dates(field: str) -> frozenset[str]:
        raw = config.get(field) or []
        if not isinstance(raw, list) or len(raw) > 730:
            raise ValueError(f"{field} deve ser uma lista de datas YYYY-MM-DD")
        result = set()
        for value in raw:
            if not isinstance(value, str):
                raise ValueError(f"{field} inválido")
            try:
                parsed = datetime.strptime(value, "%Y-%m-%d").date()
            except ValueError as exc:
                raise ValueError(f"{field} inválido: esperado YYYY-MM-DD") from exc
            if parsed.isoformat() != value:
                raise ValueError(f"{field} inválido: esperado YYYY-MM-DD")
            result.add(value)
        return frozenset(result)

    closed = dates("non_production_dates")
    extra = dates("extra_production_dates")
    if closed & extra:
        raise ValueError("Uma data não pode ser produção e parada simultaneamente")
    return {
        "timezone": timezone,
        "production_day_start": production_day_start,
        "work_shifts": shifts,
        "legacy_day_start": config.get("day_start"),
        "non_production_dates": closed,
        "extra_production_dates": extra,
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
    if config.get("work_shifts") != current["work_shifts"]:
        # Persist only missing schedules or the exact recognized legacy template.
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
    """Last fully closed production window, not simply yesterday's date."""
    calendar = normalized(config)
    start_today, _ = today_window(config, now)
    candidate = datetime.fromisoformat(start_today) - timedelta(days=1)
    for _ in range(731):
        date = candidate.date().isoformat()
        open_day = (candidate.weekday() < 5 and date not in calendar["non_production_dates"]) or date in calendar["extra_production_dates"]
        if open_day:
            end = candidate + timedelta(days=1)
            return candidate.isoformat(timespec="minutes"), end.isoformat(timespec="minutes")
        candidate -= timedelta(days=1)
    raise ValueError("Calendário sem dia produtivo anterior confirmado")


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
        "non_production_dates": sorted(value["non_production_dates"]),
        "extra_production_dates": sorted(value["extra_production_dates"]),
        "semantics": {
            "production_day_start": "3028 today/previous-day window boundary",
            "work_shifts": "2114/operational shift classification",
        },
    }
