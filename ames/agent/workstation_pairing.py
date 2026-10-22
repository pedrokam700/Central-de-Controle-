"""Explicit, one-time, local-only authorization for the official HTTPS Central.

The public GET only renders a confirmation form. POST requires a one-time nonce
from that same form, same-origin navigation and a loopback client, then redirects
to the ONE approved HTTPS origin with the local capability in a URL fragment.
No endpoint returns the token as JSON and no MES or SQLite data is exposed.
"""
from __future__ import annotations
import html
import hmac
import ipaddress
import secrets
import threading
import time
from urllib.parse import quote, parse_qs

PAIR_PATH = "/workstation/parear"
OFFICIAL_CENTRAL = "https://pedrokam700.github.io/Central-de-Controle-/"
TTL_SECONDS = 300
MAX_NONCES = 24

class PairingGate:
    def __init__(self, now=time.monotonic):
        self._now = now
        self._pending = {}
        self._lock = threading.Lock()

    def issue(self):
        with self._lock:
            now = self._now()
            self._pending = {key:value for key,value in self._pending.items() if value > now}
            if len(self._pending) >= MAX_NONCES:
                # Never grow unbounded even on untrusted repeated GET requests.
                self._pending.pop(next(iter(self._pending)))
            nonce = secrets.token_urlsafe(32)
            self._pending[nonce] = now + TTL_SECONDS
        return nonce

    def consume(self, nonce):
        with self._lock:
            deadline = self._pending.pop(str(nonce), None)
        return deadline is not None and self._now() < deadline


GATE = PairingGate()

def local_address(headers, address, port):
    host = str(headers.get("Host") or "").lower()
    if host not in {f"127.0.0.1:{port}",f"localhost:{port}"}:
        return False
    try:
        return ipaddress.ip_address(address).is_loopback
    except ValueError:
        return False

def confirm(headers, address, port, form_body, gate=GATE):
    if not local_address(headers,address,port):
        return False
    origin = str(headers.get("Origin") or "").strip().rstrip("/").lower()
    site = str(headers.get("Sec-Fetch-Site") or "").lower()
    mode = str(headers.get("Sec-Fetch-Mode") or "").lower()
    dest = str(headers.get("Sec-Fetch-Dest") or "").lower()
    user = str(headers.get("Sec-Fetch-User") or "").strip()
    # Edge 127 was observed sending Origin: null from this *local* form even
    # with Sec-Fetch-Site: same-origin. A generic opaque Origin is NOT trusted:
    # the narrow exception additionally requires an explicit user-initiated,
    # top-level same-origin navigation. Host, loopback and one-time nonce are
    # independently enforced. This is not an exception for cross-site forms.
    local_origins = {f"http://127.0.0.1:{port}", f"http://localhost:{port}"}
    if origin == "null":
        if not (site == "same-origin" and mode == "navigate"
                and dest == "document" and user == "?1"):
            return False
    elif origin:
        if origin not in local_origins:
            return False
        if site not in {"same-origin", "none", ""}:
            return False
    elif site != "same-origin":
        # If Origin is omitted entirely, browser Fetch Metadata must confirm
        # same-origin. Missing BOTH is never accepted.
        return False
    # All supported flows require a regular navigation, never an XHR API.
    if mode not in {"navigate", ""}:
        return False
    try:
        data = parse_qs(form_body.decode("ascii"),strict_parsing=True)
        fields = data.get("nonce") or []
        if len(fields) != 1 or len(fields[0]) > 128:
            return False
        return gate.consume(fields[0])
    except (ValueError,UnicodeError):
        return False

def destination(token):
    if not isinstance(token,str) or len(token)<32:
        raise ValueError("Invalid workstation token")
    return OFFICIAL_CENTRAL + "#ames_agent_token=" + quote(token,safe="")

def page(nonce):
    safe = html.escape(nonce, quote=True)
    return ("""<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Conectar este PC · Central</title>
<style>body{font:15px system-ui,sans-serif;background:#f6f7fa;color:#172030;margin:0;padding:28px}
main{max-width:480px;margin:9vh auto;background:#fff;padding:30px;border:1px solid #d9e0e8;border-radius:16px}
h1{font-size:23px;margin:0 0 13px}p{line-height:1.55;color:#4d5b6b}
button{background:#172030;color:#fff;border:0;border-radius:9px;padding:13px 18px;font-weight:700;cursor:pointer}
small{display:block;margin-top:16px;color:#657184;line-height:1.5}</style></head>
<body><main><h1>Conectar este computador</h1>
<p>O agente local foi encontrado. Confirme para autorizar esta instalação a abrir a Central oficial em HTTPS.</p>
<p>A autorização vale apenas para este navegador e este computador. Não compartilhe o endereço de pareamento.</p>
<form method="post" action="/workstation/parear">
<input type="hidden" name="nonce" value="%s">
<button type="submit">Autorizar e abrir a Central</button></form>
<small>Nenhuma senha do A-MES, banco SQLite ou credencial de rede é enviada para a Central.</small>
</main></body></html>""" % safe).encode("utf-8")

def retry_page():
    """Clear actionable recovery on stale/invalid confirmation; no token exposure."""
    return b"""<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Repetir conexao local</title>
<style>body{font:15px system-ui,sans-serif;background:#f6f7fa;color:#172030;margin:0;padding:28px}
main{max-width:460px;margin:10vh auto;background:#fff;padding:28px;border:1px solid #d9e0e8;border-radius:14px}
h1{font-size:22px}p{line-height:1.55}a{display:inline-block;padding:12px 16px;background:#172030;color:white;border-radius:8px;text-decoration:none}</style>
</head><body><main><h1>Confirmacao nao concluida</h1>
<p>A autorizacao expirou ou foi recusada. Abra novamente a confirmacao local sem trocar de computador.</p>
<a href="/workstation/parear">Reiniciar conexao segura</a>
<p>Se voltar a aparecer HTTP 403, verifique se o agente oficial esta ativo na porta 8765.</p>
</main></body></html>"""

def secure_headers():
    return {
        "Cache-Control":"no-store, max-age=0",
        "Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
        "X-Frame-Options":"DENY",
        "X-Content-Type-Options":"nosniff",
        "Referrer-Policy":"no-referrer",
    }
