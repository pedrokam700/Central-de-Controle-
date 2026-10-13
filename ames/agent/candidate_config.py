from __future__ import annotations

from datetime import datetime
from typing import Any, Dict

BASE_ALLOWED = {
    "configured_lines", "line_aliases", "day_start", "monitor_interval_minutes", "performance",
    "chrome_profile_dir", "ames_host", "ames_port", "ames_start_url", "setup_complete",
    "backup_retention", "auto_backup_on_start", "allowed_origins",
}
CANDIDATE_ALLOWED = BASE_ALLOWED | {"ames_start_date"}


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


def apply(agent_module, body: Dict[str, Any]) -> Dict[str, Any]:
    changed = {k: v for k, v in dict(body or {}).items() if k in CANDIDATE_ALLOWED}
    if "configured_lines" in changed:
        changed["configured_lines"] = agent_module.normalize_lines(changed.get("configured_lines") or [])
    if "ames_start_date" in changed:
        changed["ames_start_date"] = normalize_start_date(changed.get("ames_start_date"))
    agent_module.CONFIG.update(changed)
    agent_module.write_config(agent_module.CONFIG)
    agent_module.STORE.record_audit(
        "CONFIG_UPDATE",
        workstation=agent_module.WORKSTATION,
        details={"keys": sorted(changed.keys()), "candidate_extension": True},
    )
    return {"ok": True, "config": agent_module.CONFIG}
