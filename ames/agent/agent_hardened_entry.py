"""Canonical agent entrypoint with production hardening enabled.

Keeps agent_entry.py as the R11/R12 compatibility boundary and layers database
migrations, transactional snapshot visibility, atomic config handling, explicit
operational calendar and loopback authorization on top.
"""
from __future__ import annotations

import os
from urllib.parse import urlparse, unquote, parse_qs
from pathlib import Path

import agent_entry as entry
import agent_3012_patch
import base_paging_backend
import candidate_config
import hardening
import local_security
import operational_calendar
import origin_policy
import performance_indexes
import source_capture
import sn_lookup_context
import workstation_pairing
import workstation_autostart

HARDENING_STATE = hardening.install(entry.a, entry.canonical)
PERFORMANCE_INDEX_STATE = performance_indexes.install(entry.a.STORE)
# Derive conservative 3022 SN context from already collected results only.
# This does not navigate A-MES and never replaces the validated collectors.
sn_lookup_context.install(entry.a)
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
    # Only the minimal startup probes are public. Detailed hardening diagnostics
    # include local integrity state and therefore require same-origin/token auth.
    _PUBLIC_API = {"/api/v1/ready", "/api/v1/health"}

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
        origin = self.headers.get("Origin")
        allowed = origin_policy.allowed_origins(entry.a.CONFIG, self._active_port())
        if origin and origin.rstrip("/") in allowed:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Access-Control-Allow-Headers", f"Content-Type, {local_security.TOKEN_HEADER}")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Cache-Control", "no-store")

    def _pair_response(self, status, payload=b"", headers=None):
        self.send_response(status)
        for key, value in workstation_pairing.secure_headers().items():
            self.send_header(key, value)
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        if payload:
            self.wfile.write(payload)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == workstation_pairing.PAIR_PATH:
            if not workstation_pairing.local_address(self.headers, self.client_address[0], self._active_port()):
                self._pair_response(403)
                return
            body = workstation_pairing.page(workstation_pairing.GATE.issue())
            self._pair_response(200, body, {"Content-Type": "text/html; charset=utf-8"})
            return
        static_root = (entry.a.BASE_DIR.parent / "frontend").resolve()
        if path == "/" and static_root.is_dir():
            path = "/Central-de-Controle-/index.html"
        if path == "/Central-de-Controle-/":
            path += "index.html"
        if path.startswith("/Central-de-Controle-/") or path == "/release-build.json":
            target = (static_root / unquote(path).lstrip("/")).resolve()
            if static_root in target.parents and target.is_file() and target.suffix in {".html", ".js", ".mjs", ".css", ".json", ".svg", ".png", ".webmanifest"}:
                self._send_static(target)
            else:
                self._send({"error":"static_not_found"},404)
            return
        if not self._authorized(path):
            self._reject_unauthorized()
            return
        if path == "/api/v1/source-captures":
            # Auth checked above, and no raw MES/AT content in this response.
            # The caller must name the exact immutable parent revision.
            q=parse_qs(urlparse(self.path).query)
            try:
                self._send(source_capture.capture_manifest(
                    entry.a.STORE,
                    snapshot_id=(q.get('snapshot_id') or [None])[0],
                    line=(q.get('line') or [None])[0],
                    snapshot_revision=(q.get('snapshot_revision') or [None])[0],
                    content_hash=(q.get('content_hash') or [None])[0],
                    source_view=(q.get('source_view') or [None])[0],
                    before=(q.get('before') or [None])[0],
                    limit=(q.get('limit') or ['20'])[0],
                ))
            except (ValueError,TypeError,OverflowError):
                self._send({'error':'invalid_source_capture_scope'},400)
            return
        if path == "/api/v1/saved-sn-history":
            # Metadata-only index; raw SN search result is only returned when the
            # caller supplies the exact local job ID + current entry hash.
            # This endpoint is behind the existing workstation token/origin gate.
            q=parse_qs(urlparse(self.path).query)
            job_id=(q.get('job_id') or [None])[0]
            if job_id is not None:
                try:
                    payload=entry.a.STORE.open_saved_sn_lookup(
                        job_id,(q.get('entry_hash') or [''])[0]
                    )
                    self._send(payload)
                except RuntimeError:
                    self._send({'error':'saved_sn_result_changed'},409)
                except (ValueError,TypeError):
                    self._send({'error':'invalid_or_missing_saved_sn_result'},400)
            else:
                try:
                    self._send(entry.a.STORE.saved_sn_lookups(
                        sn=(q.get('sn') or [None])[0],
                        start=(q.get('start') or [None])[0],
                        end=(q.get('end') or [None])[0],
                        before=(q.get('before') or [None])[0],
                        limit=(q.get('limit') or [20])[0],
                    ))
                except (ValueError,TypeError):
                    self._send({'error':'invalid_saved_sn_query'},400)
            return
        if path == "/api/v1/v2/history-candidates":
            q = parse_qs(urlparse(self.path).query)
            try:
                cursor = (q.get("before") or [None])[0]
                limit = (q.get("limit") or ["20"])[0]
                start, _ = operational_calendar.today_window(entry.a.CONFIG)
                self._send(entry.a.STORE.historical_candidates(cursor, limit, start))
            except (TypeError, ValueError) as exc:
                self._send({"error": "invalid_history_query", "message": str(exc)}, 400)
            return
        if path == "/api/v1/v2/snapshots":
            # Strong temporal guard at the source, not just a UI filter.
            # History/advanced queries remain in SQLite but cannot become Today.
            start, _ = operational_calendar.today_window(entry.a.CONFIG)
            line_ids = entry.a.STORE.operational_snapshot_ids_by_line(
                entry.a.CONFIG.get("configured_lines") or [], start
            )
            heads = [
                entry.canonical.manifest(entry.canonical.export_revision(
                    entry.a.STORE, sid, line, entry.a.trace_insights
                ))
                for line, sid in line_ids.items()
            ]
            self._send({
                "schema": entry.canonical.SCHEMA, "scope": "today",
                "operational_date": start[:10], "period_start_at": start,
                "snapshots": heads,
            })
            return
        if path == "/api/v1/base":
            q = parse_qs(urlparse(self.path).query)
            dataset = (q.get("dataset") or ["defects"])[0]
            sid = (q.get("snapshot_id") or [None])[0]
            line = entry.a.normalize_line_id((q.get("line") or [None])[0])
            if line and line not in entry.canonical.LINES:
                self._send({"error": "invalid_line"}, 400)
                return
            try:
                self._send(base_paging_backend.page(
                    entry.a.STORE,
                    dataset,
                    snapshot_id=sid,
                    line=line or None,
                    configured_lines=entry.a.CONFIG.get("configured_lines") or [],
                    limit=(q.get("limit") or [100])[0],
                    offset=(q.get("offset") or [0])[0],
                ))
            except (TypeError, ValueError) as exc:
                self._send({"error": "invalid_base_query", "message": str(exc)}, 400)
            return
        if path == "/api/v1/local-history":
            q=parse_qs(urlparse(self.path).query);line=(q.get('line') or [''])[0]
            if line not in entry.canonical.LINES:
                self._send({'error':'invalid_line'},400);return
            sid=(q.get('snapshot_id') or [None])[0]
            revision=(q.get('snapshot_revision') or [None])[0]
            try:
                if sid:
                    self._send(entry.canonical.read_revision(entry.a.STORE,int(sid),line,int(revision)) if revision is not None else
                               entry.canonical.export_revision(entry.a.STORE,int(sid),line,entry.a.trace_insights))
                else:
                    if revision is not None:raise ValueError('Snapshot required for revision')
                    self._send(entry.canonical.history_index(entry.a.STORE,line))
            except (ValueError,RuntimeError) as exc:self._send({'error':str(exc)},400)
            return
        if path == "/api/v1/ready":
            self._send(
                {
                    "ok": True,
                    "ready": True,
                    "agent_build": "CANONICAL-R11-BATCH",
                    # A minimal public version indicator (no token, SQLite or MES).
                    # The web UI can distinguish an older local engine whose
                    # form handler still rejects valid Edge submissions.
                    "workstation_pairing_flow": 3,  # GitHub Pages official origin + one-time local confirmation
                    "agent_version": entry.a.AGENT_VERSION,
                    "candidate_version": entry.a.CANDIDATE_VERSION,
                    "pid": os.getpid(),
                }
            )
            return
        if path == "/api/v1/workstation/autostart":
            try:
                self._send(workstation_autostart.status())
            except Exception as exc:
                self._send({"ok": False, "error": type(exc).__name__}, 503)
            return
        if path == "/api/v1/hardening/health":
            try:
                self._send(
                    {
                        "ok": True,
                        "hardening": "H1",
                        "local_security": local_security.public_status(AGENT_TOKEN_PATH),
                        "origin_policy": origin_policy.public_status(entry.a.CONFIG, self._active_port()),
                        "operational_calendar": operational_calendar.public_contract(entry.a.CONFIG),
                        "current_shift": operational_calendar.shift_for(entry.a.CONFIG),
                        "ames_start_date": entry.a.CONFIG.get("ames_start_date") or None,
                        "performance_indexes": performance_indexes.health(entry.a.STORE),
                        **hardening.health(entry.a.STORE),
                    }
                )
            except Exception as exc:
                self._send({"ok": False, "hardening": "H1", "error": type(exc).__name__, "message": str(exc)}, 500)
            return
        return super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        if path == workstation_pairing.PAIR_PATH:
            if self.headers.get("Content-Type", "").split(";")[0].strip().lower() != "application/x-www-form-urlencoded":
                self._pair_response(415)
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                self._pair_response(400)
                return
            if not 0 < length <= 512:
                self._pair_response(413)
                return
            submitted = self.rfile.read(length)
            if not workstation_pairing.confirm(
                self.headers, self.client_address[0], self._active_port(), submitted
            ):
                # Do not disclose whether it was a nonce, origin or Host failure;
                # show a same-origin retry page, never a capability or credentials.
                self._pair_response(403, workstation_pairing.retry_page(), {
                    "Content-Type": "text/html; charset=utf-8"
                })
                return
            # Fixed official HTTPS destination; never available as JSON.
            self._pair_response(303, headers={
                "Location": workstation_pairing.destination(AGENT_TOKEN)
            })
            return
        if not self._authorized(path):
            self._reject_unauthorized()
            return
        if path == "/api/v1/workstation/autostart":
            try:
                body = self._body()
                if not isinstance(body, dict) or set(body) != {"enabled"} or type(body["enabled"]) is not bool:
                    raise ValueError("Only enabled=true/false is allowed")
                self._send(workstation_autostart.configure(body["enabled"]))
            except (ValueError, OSError) as exc:
                self._send({"ok": False, "error": type(exc).__name__, "message": str(exc)}, 400)
            except Exception as exc:
                self._send({"ok": False, "error": type(exc).__name__}, 500)
            return
        if path == "/api/v1/config":
            try:
                self._send(candidate_config.apply(entry.a, self._body()))
            except ValueError as exc:
                self._send({"error": "invalid_config", "message": str(exc)}, 400)
            except Exception as exc:
                self._send({"error": type(exc).__name__, "message": str(exc)}, 500)
            return
        return super().do_POST()


entry.Handler = HardenedHandler
import fastlane_runtime_guard
fastlane_runtime_guard.install(entry)


def main():
    entry.main()


if __name__ == "__main__":
    main()
