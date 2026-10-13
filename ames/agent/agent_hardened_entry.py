"""Canonical agent entrypoint with production hardening enabled.

Keeps agent_entry.py as the R11/R12 compatibility boundary and layers database
migrations, transactional snapshot visibility, atomic config handling, explicit
operational calendar and loopback authorization on top.
"""
from __future__ import annotations

from urllib.parse import urlparse

import agent_entry as entry
import agent_3012_patch
import hardening
import local_security
import operational_calendar

HARDENING_STATE = hardening.install(entry.a, entry.canonical)
if operational_calendar.migrate_config(entry.a.CONFIG):
    entry.a.write_config(entry.a.CONFIG)
AGENT_TOKEN, AGENT_TOKEN_PATH = local_security.ensure_token(entry.a.BASE_DIR)

# Layer 3012 after the canonical R11/R12 entry has loaded and before the security
# handler subclasses it. This preserves all validated 3028/3074/2114/3022 code.
entry.Handler = agent_3012_patch.install(entry.a, entry.Handler, entry.canonical)

# Preserve the validated 3028 collector itself. Only the time-window provider is
# upgraded: production-day boundary is explicit and distinct from work shifts.
def _today_window():
    return operational_calendar.today_window(entry.a.CONFIG)


def _previous_day_window():
    return operational_calendar.previous_day_window(entry.a.CONFIG)


entry.a.today_window = _today_window
entry.a.previous_day_window = _previous_day_window

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
    _PUBLIC_API = {"/api/v1/health", "/api/v1/hardening/health"}

    def _active_port(self):
        return int(getattr(self.server, "server_port", entry.a.CONFIG.get("port", 8765)))

    def _authorized(self, path):
        if path in self._PUBLIC_API:
            return True
        if not path.startswith("/api/v1/"):
            return True
        return local_security.authorized(self.headers, AGENT_TOKEN, self._active_port())

    def _reject_unauthorized(self):
        self._send(
            {
                "error": "agent_not_paired",
                "message": "Agente local não autorizado. Inicie a Central pelo launcher deste posto.",
                "pairing": "workstation-token-v1",
            },
            401,
        )

    def _cors(self):
        # Preserve the exact origin allowlist from the canonical agent, adding only
        # the local capability header required by hosted Central builds.
        origin = self.headers.get("Origin")
        port = self._active_port()
        allowed = {f"http://127.0.0.1:{port}", f"http://localhost:{port}"}
        allowed.update(
            str(x).rstrip("/")
            for x in (entry.a.CONFIG.get("allowed_origins") or [])
            if str(x).strip()
        )
        if origin and origin.rstrip("/") in allowed:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Access-Control-Allow-Headers", f"Content-Type, {local_security.TOKEN_HEADER}")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Cache-Control", "no-store")

    def do_GET(self):
        path = urlparse(self.path).path
        if not self._authorized(path):
            self._reject_unauthorized()
            return
        if path == "/api/v1/hardening/health":
            try:
                self._send(
                    {
                        "ok": True,
                        "hardening": "H1",
                        "local_security": local_security.public_status(AGENT_TOKEN_PATH),
                        "operational_calendar": operational_calendar.public_contract(entry.a.CONFIG),
                        "current_shift": operational_calendar.shift_for(entry.a.CONFIG),
                        **hardening.health(entry.a.STORE),
                    }
                )
            except Exception as exc:
                self._send({"ok": False, "hardening": "H1", "error": type(exc).__name__, "message": str(exc)}, 500)
            return
        return super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        if not self._authorized(path):
            self._reject_unauthorized()
            return
        return super().do_POST()


# entry.main resolves Handler at runtime, so this preserves the original main and
# server lifecycle while making the hardened runtime explicitly detectable.
entry.Handler = HardenedHandler


def main():
    entry.main()


if __name__ == "__main__":
    main()
