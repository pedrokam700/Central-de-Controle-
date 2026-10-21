"""Security gate: no cross-origin token disclosure, replay, expired confirmation."""
from __future__ import annotations
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"ames"/"agent"))
import workstation_pairing as p

def check(condition,message):
    if not condition: raise AssertionError(message)

def headers(site="same-origin",origin="http://127.0.0.1:8765",mode="navigate"):
    return {"Host":"127.0.0.1:8765","Origin":origin,"Sec-Fetch-Site":site,"Sec-Fetch-Mode":mode}

def test_user_confirmed_session_only():
    time=[0.0]
    gate=p.PairingGate(now=lambda:time[0])
    nonce=gate.issue()
    body=("nonce="+nonce).encode("ascii")
    check(p.confirm(headers(),"127.0.0.1",8765,body,gate),"confirmed local form should work")
    check(not p.confirm(headers(),"127.0.0.1",8765,body,gate),"nonce replay must fail")
    nonce=gate.issue()
    check(not p.confirm(headers(site="cross-site"),"127.0.0.1",8765,("nonce="+nonce).encode(),gate),"cross-site denied")
    check(not p.confirm(headers(origin="https://central-cora-v2.vercel.app"),"127.0.0.1",8765,("nonce="+nonce).encode(),gate),"HTTPS caller can't post directly")
    check(not p.confirm(headers(mode="cors"),"127.0.0.1",8765,("nonce="+nonce).encode(),gate),"XHR denied")
    # Real Edge/Chromium can omit Origin on top-level local POSTs.
    # Fetch Metadata must prove SAME ORIGIN when Origin is missing.
    no_origin=headers();no_origin.pop("Origin")
    check(p.confirm(no_origin,"127.0.0.1",8765,("nonce="+nonce).encode(),gate),
          "same-origin local form with omitted Origin must succeed")
    nonce=gate.issue()
    for forged in (
       {**headers(),"Origin":"null"},
       {**headers(),"Origin":"https://attacker.example"},
       {**headers(),"Sec-Fetch-Site":"cross-site"},
       {**no_origin,"Sec-Fetch-Site":"cross-site"},
       {**no_origin,"Sec-Fetch-Site":"none"},
       {k:v for k,v in no_origin.items() if k!="Sec-Fetch-Site"},
       {**no_origin,"Sec-Fetch-Mode":"cors"}
    ):
        check(not p.confirm(forged,"127.0.0.1",8765,("nonce="+nonce).encode(),gate),
              "cross-site or ambiguous browser request must be rejected")
    check(p.confirm(headers(),"127.0.0.1",8765,("nonce="+nonce).encode(),gate),
          "invalid probes must not consume the one-time nonce")
    nonce=gate.issue()
    check(not p.confirm(headers(),"192.168.1.9",8765,("nonce="+nonce).encode(),gate),"nonloopback denied")
    check(not p.confirm({**headers(),"Host":"malicious.example"},"127.0.0.1",8765,("nonce="+nonce).encode(),gate),"DNS rebinding denied")
    check(p.confirm(headers(),"127.0.0.1",8765,("nonce="+nonce).encode(),gate),"invalid probes must not consume nonce")
    nonce=gate.issue()
    time[0]=301.0
    check(not p.confirm(headers(),"127.0.0.1",8765,("nonce="+nonce).encode(),gate),"expired form denied")
    check(not p.confirm(headers(),"127.0.0.1",8765,b"nonce=not-issued",gate),"unknown nonce denied")

def test_url_and_html_never_publicly_contain_workstation_token():
    token="local-secret-not-an-ames-password-abcdefghi"
    url=p.destination(token)
    check(url=="https://pedrokam700.github.io/Central-de-Controle/#ames_agent_token="+token,"only trusted destination")
    html=p.page("safe-nonce")
    check(token.encode() not in html,"GET form must not contain secret")
    check(b'method="post"' in html and b'name="nonce"' in html,"visible explicit confirmation")
    retry=p.retry_page()
    check(b"/workstation/parear" in retry and b"Reiniciar conexao segura" in retry,"rejected nonce offers local recovery")
    check(token.encode() not in retry and b"ames_agent_token" not in retry,"retry never contains secret")
    sec=p.secure_headers()
    check("frame-ancestors 'none'" in sec["Content-Security-Policy"],"anti clickjack")
    check(sec["Referrer-Policy"]=="no-referrer" and "no-store" in sec["Cache-Control"],"non-cacheable secret")
    for invalid in ["", "short"]:
        try: p.destination(invalid)
        except ValueError: pass
        else: raise AssertionError("short token unexpectedly allowed")

if __name__=="__main__":
    test_user_confirmed_session_only(); print("PASS local confirmation, CSRF and nonce replay")
    test_url_and_html_never_publicly_contain_workstation_token();print("PASS trusted HTTPS redirect and safe headers")
