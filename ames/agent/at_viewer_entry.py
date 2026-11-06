"""Opt-in, read-mostly local AT portal. NEVER start the general Central server here.

Only an authenticated individual SN lookup and its own job result are exposed.
No monitor, trace, settings, bulk collection, backup, import or team data API.
"""
from __future__ import annotations

import json
import os
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, unquote

import agent_hardened_entry as hardened
from at_profiles import AtProfiles, AtSessions

AGENT = hardened.entry.a
ROOT = AGENT.BASE_DIR.parent
CENTRAL_STATIC = ROOT / "frontend" / "Central-de-Controle-"
AT_STATIC = CENTRAL_STATIC / "ames" / "at-viewer"
USERS_FILE = ROOT / "accounts" / "at_offline_accounts.json"


def is_at_route_allowed(method: str, path: str) -> bool:
    """Closed list: no user-selected name or path may grant an arbitrary API."""
    if method == "POST":
        return path == "/api/v1/sn-lookup"
    if method == "GET":
        return path.startswith("/api/v1/jobs/") and (
            path.count("/") == 4 and not path.endswith("/cancel"))
    return False


class AtViewerHandler(hardened.HardenedHandler):
    sessions: AtSessions | None = None

    def _session_token(self):
        for cookie in self.headers.get("Cookie", "").split(";"):
            key, _, value = cookie.strip().partition("=")
            if key == "central_at_session":
                return value
        return ""

    def _identity(self):
        return self.sessions.current(self._session_token()) if self.sessions else None

    def _same_origin_write(self):
        origin = self.headers.get("Origin", "").rstrip("/")
        host = self.headers.get("Host", "").lower()
        expected = {f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}"}
        return self.headers.get("X-AT-Request") == "1" and host in expected and (
            origin == "http://" + host or not origin and self.headers.get("Sec-Fetch-Site") == "same-origin")

    def _authorized(self, path):
        # Never inherit the general agent's same-origin authorization bypass.
        return bool(self._identity() and "sn" in self._identity()["permissions"] and
                    is_at_route_allowed(self.command, path))

    def do_OPTIONS(self):
        # The AT surface is strictly local and never accepts cross-site API calls.
        return self._send_at({"error": "at_permission_denied"}, 405)

    def _send_at(self, payload, status=200, *, cookie=None):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'none'")
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send(self, obj, status=200):
        # At the moment the real job is accepted, bind the id to the current
        # authenticated session BEFORE the client receives its 202 response.
        if self.command == "POST" and urlparse(self.path).path == "/api/v1/sn-lookup" and status == 202:
            jid = obj.get("id") if isinstance(obj, dict) else None
            if jid and self.sessions:
                self.sessions.job_created(self._session_token(), jid)
        super()._send(obj, status)

    def do_GET(self):
        path = urlparse(self.path).path
        if path in {"/", "/at", "/at/", "/at/index.html"}:
            return self._send_static(AT_STATIC / "index.html")
        if path.startswith("/at/"):
            target = (AT_STATIC / unquote(path[len("/at/"):])).resolve()
            if AT_STATIC.resolve() not in target.parents or target.suffix not in {".js", ".mjs", ".css", ".svg"}:
                return self._send_at({"error": "not_found"}, 404)
            return self._send_static(target)
        # Read-only JavaScript dependencies for the existing red alert renderer.
        # HTML app, service worker and main Central bootstrap are blocked.
        if path.startswith("/Central-de-Controle-/ames/"):
            target = (CENTRAL_STATIC / unquote(path.removeprefix("/Central-de-Controle-/"))).resolve()
            if CENTRAL_STATIC.resolve() not in target.parents or target.suffix not in {".js", ".mjs", ".json", ".css"}:
                return self._send_at({"error": "not_found"}, 404)
            return self._send_static(target)
        if path == "/api/v1/at/session":
            identity = self._identity()
            return self._send_at({"ok": bool(identity), "user": identity}, 200 if identity else 401)
        if not self._authorized(path):
            return self._send_at({"error": "at_permission_denied"}, 403)
        if path.startswith("/api/v1/jobs/"):
            jid = path.rsplit("/", 1)[-1]
            if not self.sessions.owns_job(self._session_token(), jid):
                return self._send_at({"error": "job_not_owned"}, 403)
        return super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        if not self._same_origin_write():
            return self._send_at({"error": "invalid_origin"}, 403)
        if path == "/api/v1/at/login":
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 < size <= 2048 or self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
                    return self._send_at({"error": "invalid_login"}, 400)
                fields = json.loads(self.rfile.read(size).decode("utf-8"))
                if not isinstance(fields, dict) or set(fields) != {"username", "password"}:
                    return self._send_at({"error": "invalid_login"}, 400)
                login = self.sessions.login(fields["username"], fields["password"])
                if not login:
                    return self._send_at({"error": "invalid_credentials"}, 401)
                token, identity = login
                return self._send_at({"ok": True, "user": identity}, cookie=
                    "central_at_session=" + token + "; HttpOnly; SameSite=Strict; Path=/api/v1; Max-Age=28800")
            except (ValueError, TypeError, UnicodeError):
                return self._send_at({"error": "invalid_login"}, 400)
        if path == "/api/v1/at/logout":
            self.sessions.logout(self._session_token())
            return self._send_at({"ok": True}, cookie=
                "central_at_session=; HttpOnly; SameSite=Strict; Path=/api/v1; Max-Age=0")
        if not self._authorized(path):
            return self._send_at({"error": "at_permission_denied"}, 403)
        # Only the four explicit keys supported by the individual query; no
        # request may smuggle a trace mode, bulk SNs or station configuration.
        if path == "/api/v1/sn-lookup":
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 < size <= 2048:
                    return self._send_at({"error": "invalid_sn"}, 400)
                body = json.loads(self.rfile.read(size).decode("utf-8"))
                sn = str(body.get("sn", "")).strip()
                if set(body) != {"sn"} or not 4 <= len(sn) <= 100 or not sn.isascii() or not all(c.isalnum() or c in "-_.#" for c in sn):
                    return self._send_at({"error": "invalid_sn"}, 400)
                # The parent reads the request body. Supply the sanitized body
                # through a one-use override and let its validated MES job run.
                self._at_verified_body = {"sn": sn, "include_3022": True, "include_3012": True}
                return super().do_POST()
            except (TypeError, ValueError, UnicodeError, AttributeError):
                return self._send_at({"error": "invalid_sn"}, 400)
        return self._send_at({"error": "at_permission_denied"}, 403)

    def _body(self):
        if hasattr(self, "_at_verified_body"):
            return self._at_verified_body
        return super()._body()


def main():
    if not USERS_FILE.is_file():
        raise SystemExit("AT_SETUP_REQUIRED: instale os perfis aprovados em accounts/at_offline_accounts.json")
    profiles = AtProfiles(USERS_FILE)
    if not profiles.list_public():
        raise SystemExit("AT_SETUP_REQUIRED: nenhuma conta de técnico disponível")
    AtViewerHandler.sessions = AtSessions(profiles)
    # Never bind an AT viewer to a LAN address or start a scheduled collector.
    port = int(os.environ.get("CENTRAL_AT_PORT", "8765"))
    server = ThreadingHTTPServer(("127.0.0.1", port), AtViewerHandler)
    print(f"Central AT local: http://127.0.0.1:{port}/at/")
    try:
        server.serve_forever(poll_interval=0.4)
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
