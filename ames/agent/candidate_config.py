from __future__ import annotations

from datetime import datetime
from typing import Any, Dict

import operational_calendar

BASE_ALLOWED = {
    "configured_lines", "line_aliases", "day_start", "production_day_start", "timezone", "work_shifts",
    "monitor_interval_minutes", "performance", "chrome_profile_dir", "ames_host", "ames_port", "ames_start_url",
    "setup_complete", "backup_retention", "auto_backup_on_start", "allowed_origins",
}
CANDIDATE_ALLOWED = BASE_ALLOWED | {"ames_start_date"}
CALENDAR_KEYS = {"day_start", "production_day_start", "timezone", "work_shifts"}


def normalize_start_date(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    try:
        parsed = datetime.fromisoformat(raw[:10]).date()
    except ValueError as exc:
        raise ValueError("ames_start_date deve usar o formato YYYY-MM-DD") from exc
    if parsed > datetime.now().date():
        raise ValueError("ames_start_date nao pode estar no futuro")
    return parsed.isoformat()


def _normalize_calendar(current: Dict[str, Any], changed: Dict[str, Any]) -> Dict[str, Any]:
    """Keep the legacy day_start alias compatible without mixing it with shift boundaries."""
    if not CALENDAR_KEYS.intersection(changed):
        return changed

    candidate = {**current, **changed}
    # `day_start` is only the legacy name of the production-day boundary. It is
    # never a work-shift boundary. Keep both names synchronized during migration.
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


def apply(agent_module, body: Dict[str, Any]) -> Dict[str, Any]:
    changed = {k: v for k, v in dict(body or {}).items() if k in CANDIDATE_ALLOWED}
    if "configured_lines" in changed:
        changed["configured_lines"] = agent_module.normalize_lines(changed.get("configured_lines") or [])
    if "ames_start_date" in changed:
        changed["ames_start_date"] = normalize_start_date(changed.get("ames_start_date"))
    changed = _normalize_calendar(agent_module.CONFIG, changed)

    agent_module.CONFIG.update(changed)
    agent_module.write_config(agent_module.CONFIG)
    agent_module.STORE.record_audit(
        "CONFIG_UPDATE",
        workstation=agent_module.WORKSTATION,
        details={"keys": sorted(changed.keys()), "candidate_extension": True},
    )
    return {"ok": True, "config": agent_module.CONFIG}
