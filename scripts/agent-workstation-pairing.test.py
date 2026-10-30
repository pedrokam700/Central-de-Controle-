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
    def proof(body, **overrides):
        nonce=body.decode('ascii').split('nonce=',1)[1]
        return {**headers(), 'Cookie':f'{p.COOKIE_NAME}={nonce}', **overrides}
    nonce=gate.issue()
    body=('nonce='+nonce).encode('ascii')
    check(p.confirm(proof(body),'127.0.0.1',8765,body,gate),
          'local form with cookie and nonce is authorized')
    check(not p.confirm(proof(body),'127.0.0.1',8765,body,gate),
          'nonce replay must fail')
    nonce=gate.issue()
    body=('nonce='+nonce).encode('ascii')
    edge=proof(body,Origin='null',**{'Sec-Fetch-Site':'same-origin',
         'Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'})
    check(p.confirm(edge,'127.0.0.1',8765,body,gate),
          'Edge Origin:null form with Strict cookie is accepted')
    nonce=gate.issue();body=('nonce='+nonce).encode('ascii')
    missing_origin=proof(body);missing_origin.pop('Origin')
    missing_origin.pop('Sec-Fetch-Site')
    missing_origin.pop('Sec-Fetch-Mode')
    check(p.confirm(missing_origin,'127.0.0.1',8765,body,gate),
          'same-origin cookie+nonce works when browser omits Fetch Metadata')
    nonce=gate.issue();body=('nonce='+nonce).encode('ascii')
    valid=proof(body)
    for unsafe in [
        {k:v for k,v in valid.items() if k!='Cookie'},
        {**valid,'Cookie':p.COOKIE_NAME+'=wrong'},
        {**valid,'Origin':'https://evil.example'},
        {**valid,'Sec-Fetch-Site':'cross-site'},
        {**valid,'Sec-Fetch-Site':'same-site'},
        {**valid,'Sec-Fetch-Mode':'cors'},
        {**valid,'Sec-Fetch-Dest':'iframe'},
        {**valid,'Host':'evil.example'},
    ]:
        check(not p.confirm(unsafe,'127.0.0.1',8765,body,gate),
              'foreign, missing-cookie or ambiguous browser request rejected')
    check(not p.confirm(valid,'192.168.1.9',8765,body,gate),
          'nonloopback client rejected')
    check(p.confirm(valid,'127.0.0.1',8765,body,gate),
          'failed requests do not consume the one-time proof')
    nonce=gate.issue();body=('nonce='+nonce).encode('ascii')
    time[0]=301.0
    check(not p.confirm(proof(body),'127.0.0.1',8765,body,gate),
          'expired local confirmation denied')
    check('SameSite=Strict' in p.confirmation_cookie(nonce) and
          'HttpOnly' in p.confirmation_cookie(nonce),
          'local session proof is SameSite Strict and inaccessible to JS')
    check('Max-Age=0' in p.expired_cookie(),
          'session proof cleared after success')

def test_url_and_html_never_publicly_contain_workstation_token():
    token="local-secret-not-an-ames-password-abcdefghi"
    url=p.destination(token)
    check(url=="https://pedrokam700.github.io/Central-de-Controle-/#ames_agent_token="+token,"only trusted destination")
    html=p.page("safe-nonce")
    check(token.encode() not in html,"GET form must not contain secret")
    check(b'method="post"' in html and b'name="nonce"' in html,"visible explicit confirmation")
    retry=p.retry_page()
    check(b"/workstation/parear" in retry and b"Reiniciar conexao segura" in retry,"rejected nonce offers local recovery")
    check(token.encode() not in retry and b"ames_agent_token" not in retry,"retry never contains secret")
    sec=p.secure_headers()
    check("frame-ancestors 'none'" in sec["Content-Security-Policy"],"anti clickjack")
    check("form-action 'self' https://pedrokam700.github.io" in sec["Content-Security-Policy"],
          "CSP explicitly permits the fixed HTTPS official redirect")
    check("evil.example" not in sec["Content-Security-Policy"] and
          "form-action *" not in sec["Content-Security-Policy"],
          "no wildcard or foreign form redirects")
    check(sec["Referrer-Policy"]=="no-referrer" and "no-store" in sec["Cache-Control"],"non-cacheable secret")
    for invalid in ["", "short"]:
        try: p.destination(invalid)
        except ValueError: pass
        else: raise AssertionError("short token unexpectedly allowed")

if __name__=="__main__":
    test_user_confirmed_session_only(); print("PASS local confirmation, CSRF and nonce replay")
    test_url_and_html_never_publicly_contain_workstation_token();print("PASS trusted HTTPS redirect and safe headers")
