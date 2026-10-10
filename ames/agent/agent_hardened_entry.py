"""Canonical agent entrypoint with production hardening enabled.

Keeps agent_entry.py as the R11/R12 compatibility boundary and layers database
migrations, transactional snapshot visibility and atomic config handling on top.
"""
from __future__ import annotations

from urllib.parse import urlparse

import agent_entry as entry
import hardening

HARDENING_STATE = hardening.install(entry.a, entry.canonical)

# ingest_3028_live builds its response dashboard before the hardening wrapper marks
# the new snapshots complete. Refresh only that response projection afterwards;
# no MES query or collector is re-run.
_original_live_ingest = entry.a.ingest_3028_live

def _hardened_live_ingest(*args, **kwargs):
    result = _original_live_ingest(*args, **kwargs)
    if isinstance(result, dict):
        ids = result.get("snapshot_ids") or {}
        if isinstance(ids, dict) and ids:
            result = dict(result)
            result["dashboard"] = entry.a.STORE.team_dashboard(list(ids.keys()))
    return result

entry.a.ingest_3028_live = _hardened_live_ingest


class HardenedHandler(entry.Handler):
    def do_GET(self):
        if urlparse(self.path).path == "/api/v1/hardening/health":
            try:
                self._send({"ok": True, "hardening": "H1", **hardening.health(entry.a.STORE)})
            except Exception as exc:
                self._send({"ok": False, "hardening": "H1", "error": type(exc).__name__, "message": str(exc)}, 500)
            return
        return super().do_GET()


# entry.main resolves Handler at runtime, so this preserves the original main and
# server lifecycle while making the hardened runtime explicitly detectable.
entry.Handler = HardenedHandler


def main():
    entry.main()


if __name__ == "__main__":
    main()
