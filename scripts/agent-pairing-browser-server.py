"""Real workstation pairing code served to a headless Chromium browser.

Uses only an in-memory fake workstation capability and an ephemeral loopback
port; no MES cookies, accounts, SQLite or real PC configuration are accessed.
"""
from __future__ import annotations
import http.server
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ames" / "agent"))
import workstation_pairing as pairing

TOKEN = "synthetic-only-workstation-token-for-browser-tests-abcdefgh"

class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_args):
        return

    def respond(self, status, body=b"", headers=None):
        self.send_response(status)
        for key, value in pairing.secure_headers().items():
            self.send_header(key, value)
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if body:
            self.wfile.write(body)

    def do_GET(self):
        if self.path != pairing.PAIR_PATH:
            return self.respond(404)
        if not pairing.local_address(self.headers, self.client_address[0], self.server.server_port):
            return self.respond(403)
        nonce = pairing.GATE.issue()
        return self.respond(200, pairing.page(nonce), {
            "Content-Type": "text/html; charset=utf-8",
            "Set-Cookie": pairing.confirmation_cookie(nonce),
        })

    def do_POST(self):
        if self.path != pairing.PAIR_PATH:
            return self.respond(404)
        if self.headers.get("Content-Type", "").split(";")[0].strip().lower() != "application/x-www-form-urlencoded":
            return self.respond(415)
        n = int(self.headers.get("Content-Length") or 0)
        if not 0 < n <= 512:
            return self.respond(413)
        body = self.rfile.read(n)
        if not pairing.confirm(self.headers, self.client_address[0], self.server.server_port, body):
            return self.respond(403, pairing.retry_page(), {"Content-Type":"text/html; charset=utf-8"})
        return self.respond(303, headers={
            "Location": pairing.destination(TOKEN),
            "Set-Cookie": pairing.expired_cookie(),
        })

if __name__ == "__main__":
    server=http.server.ThreadingHTTPServer(("127.0.0.1",0),Handler)
    print(server.server_port,flush=True)
    server.serve_forever()
