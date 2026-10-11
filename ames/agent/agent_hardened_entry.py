"""Canonical agent entrypoint with production hardening enabled.

Keeps agent_entry.py as the R11/R12 compatibility boundary and layers database
migrations, transactional snapshot visibility, atomic config handling, explicit
operational calendar, local authorization and non-destructive DR verification on
top of the validated collector runtime.
"""
from __future__ import annotations

from urllib.parse import urlparse

import agent_entry as entry
import diagnostics
import disaster_recovery
import hardening
import local_security
import migrations
import operational_calendar

HARDENED_CANDIDATE_VERSION = "0.5.25-rc1"
entry.a.CANDIDATE_VERSION = HARDENED_CANDIDATE_VERSION

HARDENING_STATE = hardening.install(entry.a, entry.canonical)
MIGRATION_STATE = migrations.apply(entry.a.STORE)
HARDENING_STATE = {**HARDENING_STATE, "migration_registry": MIGRATION_STATE}
if operational_calendar.migrate_config(entry.a.CONFIG):
    entry.a.write_config(entry.a.CONFIG)
AGENT_TOKEN, AGENT_TOKEN_PATH = local_security.ensure_token(entry.a.BASE_DIR)

# Preserve the validated 3028 collector itself. Only the time-window provider is
# upgraded: production-day boundary is explicit and distinct from work shifts.
def _today_window():
    return operational_calendar.today_window(entry.a.CONFIG)


def _previous_day_window():
    return operational_calendar.previous_day_window(entry.a.CONFIG)


entry.a.today_window = _today_window
entry.a.previous_day_window = _previous_day_window

# Every newly-created backup must prove that SQLite can open it and that the
# minimum operational schema is present. This wraps backup only; no live DB restore
# and no MES collector behavior changes.
_original_create_backup = entry.a.create_backup


def _verified_create_backup(reason="manual"):
    info = _original_create_backup(reason)
    verification = disaster_recovery.verify_backup(info["path"])
    entry.a.STORE.record_audit(
        "DATABASE_BACKUP_VERIFIED",
        workstation=entry.a.WORKSTATION,
        details={
            "reason": reason,
            "integrity": verification["integrity"],
            "bytes": verification["bytes"],
            "schema_version": verification["schema_version"],
            "snapshot_count": verification["snapshot_count"],
        },
    )
    return {
        **info,
        "verified": True,
        "integrity": verification["integrity"],
        "schema_version": verification["schema_version"],
        "snapshot_count": verification["snapshot_count"],
    }


entry.a.create_backup = _verified_create_backup

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

    def _dr_status(self):
        return disaster_recovery.latest_status(entry.a.STORE, entry.a.BACKUP_DIR)

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
                        "candidate_version": HARDENED_CANDIDATE_VERSION,
                        "local_security": local_security.public_status(AGENT_TOKEN_PATH),
                        "operational_calendar": operational_calendar.public_contract(entry.a.CONFIG),
                        "migration_registry": migrations.public_contract(),
                        "migration_state": MIGRATION_STATE,
                        "backup": self._dr_status(),
                        "current_shift": operational_calendar.shift_for(entry.a.CONFIG),
                        **hardening.health(entry.a.STORE),
                    }
                )
            except Exception as exc:
                self._send({"ok": False, "hardening": "H1", "error": type(exc).__name__, "message": str(exc)}, 500)
            return
        if path == "/api/v1/diagnostics":
            try:
                hardening_health = {
                    **hardening.health(entry.a.STORE),
                    "migration_registry": migrations.public_contract(),
                    "migration_state": MIGRATION_STATE,
                }
                calendar = operational_calendar.public_contract(entry.a.CONFIG)
                self._send({
                    "ok": True,
                    "diagnostics": diagnostics.build(
                        entry.a,
                        hardening_health=hardening_health,
                        calendar=calendar,
                        backup_status=self._dr_status(),
                    ),
                })
            except Exception as exc:
                self._send({"ok": False, "error": type(exc).__name__, "message": str(exc)}, 500)
            return
        return super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        if not self._authorized(path):
            self._reject_unauthorized()
            return
        if path == "/api/v1/backup/verify":
            try:
                backup = disaster_recovery.latest_backup_path(entry.a.STORE, entry.a.BACKUP_DIR)
                if backup is None:
                    self._send({"ok": False, "error": "backup_not_found"}, 404)
                    return
                result = disaster_recovery.verify_backup(backup, include_sha256=True)
                self._send({"ok": True, "verification": result})
            except Exception as exc:
                self._send({"ok": False, "error": type(exc).__name__, "message": str(exc)}, 500)
            return
        if path == "/api/v1/backup/restore-drill":
            try:
                backup = disaster_recovery.latest_backup_path(entry.a.STORE, entry.a.BACKUP_DIR)
                if backup is None:
                    self._send({"ok": False, "error": "backup_not_found"}, 404)
                    return
                result = disaster_recovery.restore_drill(backup)
                entry.a.STORE.record_audit(
                    "DATABASE_RESTORE_DRILL",
                    workstation=entry.a.WORKSTATION,
                    details={
                        "integrity": result["integrity"],
                        "bytes": result["bytes"],
                        "schema_version": result["schema_version"],
                        "snapshot_count": result["snapshot_count"],
                        "live_database_modified": result["live_database_modified"],
                    },
                )
                self._send({"ok": True, "restore_drill": result})
            except Exception as exc:
                self._send({"ok": False, "error": type(exc).__name__, "message": str(exc)}, 500)
            return
        return super().do_POST()


# entry.main resolves Handler at runtime, so this preserves the original main and
# server lifecycle while making the hardened runtime explicitly detectable.
entry.Handler = HardenedHandler


def main():
    entry.main()


if __name__ == "__main__":
    main()
