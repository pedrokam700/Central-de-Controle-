"""Runtime CORS policy for the local Central A-MES agent.

Configuration writes are already validated by candidate_config. This module is a
second fail-closed boundary for old workstation configs created before those
validators existed. It never mutates config and never expands permissions.
"""
from __future__ import annotations

from typing import Any, Dict, Iterable, Set

import candidate_config
import workstation_pairing


def evaluate(config: Dict[str, Any] | None, port: int) -> Dict[str, Any]:
    safe_port = int(port)
    local = {
        f"http://127.0.0.1:{safe_port}",
        f"http://localhost:{safe_port}",
    }
    configured = (config or {}).get("allowed_origins") or []
    if not isinstance(configured, (list, tuple)):
        configured = [configured]

    # One exact GitHub Pages owner origin, never arbitrary github.io or wildcard.\n    # Private APIs still require the local workstation capability token.\n    official = workstation_pairing.OFFICIAL_CENTRAL.split("/Central-de-Controle/")[0]\n    allowed: Set[str] = set(local) | {official}
    rejected = 0
    remote = 0
    duplicates = 0
    for raw in configured[:64]:
        try:
            origin = candidate_config._origin(raw)
        except (TypeError, ValueError):
            rejected += 1
            continue
        if origin in allowed:
            duplicates += 1
            continue
        allowed.add(origin)
        if not origin.startswith("http://127.0.0.1:") and not origin.startswith("http://localhost:"):
            remote += 1

    return {
        "allowed": allowed,
        "summary": {
            "ok": rejected == 0,
            "local_origins": len(local),
            "configured_entries": min(len(configured), 64),
            "remote_origins": remote,
            "official_github_pages_origin": official,
            "rejected_entries": rejected,
            "duplicate_entries": duplicates,
            "mode": "loopback-plus-explicit-https",
        },
    }


def allowed_origins(config: Dict[str, Any] | None, port: int) -> Set[str]:
    return set(evaluate(config, port)["allowed"])


def public_status(config: Dict[str, Any] | None, port: int) -> Dict[str, Any]:
    return dict(evaluate(config, port)["summary"])
