"""Integration test: the real local HTTP protocol, no mocked callback arguments.

Reproduces a browser same-origin form POST without an Origin header, and
confirms cross-site / missing fetch metadata do NOT issue workstation tokens.
"""
from __future__ import annotations
import http.client
import http.server
import re
import sys
import threading
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"ames"/"agent"))
import workstation_pairing as pairing

TOKEN="integration-only-fake-workstation-token-123456789"

class LocalHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def reply(self,status,body=b"",headers=None):
        self.send_response(status)
        for name,value in pairing.secure_headers().items():
            self.send_header(name,value)
        for name,value in (headers or {}).items():
            self.send_header(name,value)
        self.send_header("Content-Length",str(len(body)))
        self.end_headers()
        if body:self.wfile.write(body)
    def do_GET(self):
        if self.path != pairing.PAIR_PATH:return self.reply(404)
        if not pairing.local_address(self.headers,self.client_address[0],self.server.server_port):
            return self.reply(403)
        nonce=pairing.GATE.issue()
        return self.reply(200,pairing.page(nonce),{"Content-Type":"text/html; charset=utf-8",
                                                  "Set-Cookie":pairing.confirmation_cookie(nonce)})
    def do_POST(self):
        if self.path != pairing.PAIR_PATH:return self.reply(404)
        data=self.rfile.read(int(self.headers.get("Content-Length","0")))
        if not pairing.confirm(self.headers,self.client_address[0],self.server.server_port,data):
            return self.reply(403,pairing.retry_page(),{"Content-Type":"text/html; charset=utf-8"})
        return self.reply(303,headers={"Location":pairing.destination(TOKEN),
                                      "Set-Cookie":pairing.expired_cookie()})

def request(port,verb,body=None,headers=None):
    conn=http.client.HTTPConnection("127.0.0.1",port,timeout=5)
    conn.request(verb,pairing.PAIR_PATH,body=body,headers=headers or {})
    resp=conn.getresponse()
    status=resp.status; h=dict(resp.getheaders()); content=resp.read()
    conn.close()
    return status,h,content

def run():
    srv=http.server.ThreadingHTTPServer(("127.0.0.1",0),LocalHandler)
    threading.Thread(target=srv.serve_forever,daemon=True).start()
    try:
        port=srv.server_port
        def new_proof():
            status,headers,html=request(port,"GET",headers={"Host":f"127.0.0.1:{port}"})
            assert status==200 and b"Autorizar e abrir a Central" in html
            assert TOKEN.encode() not in html
            cookie=headers["Set-Cookie"].split(";",1)[0]
            assert "SameSite=Strict" in headers["Set-Cookie"]
            nonce=re.search(rb'name="nonce" value="([^"]+)"',html).group(1)
            return nonce,cookie
        def form(nonce,cookie=None,headers=None):
            body=b"nonce="+nonce
            h={"Content-Type":"application/x-www-form-urlencoded",
               "Host":f"127.0.0.1:{port}",
               "Sec-Fetch-Site":"same-origin","Sec-Fetch-Mode":"navigate"}
            if cookie:h["Cookie"]=cookie
            h.update(headers or {})
            return request(port,"POST",body,h)
        nonce,cookie=new_proof()
        status,headers,body=form(nonce,cookie)
        assert status==303 and headers["Location"]==pairing.destination(TOKEN)
        assert "Max-Age=0" in headers["Set-Cookie"]
        assert not body
        assert form(nonce,cookie)[0]==403
        nonce,cookie=new_proof()
        edge={"Origin":"null","Sec-Fetch-Site":"same-origin",
              "Sec-Fetch-Mode":"navigate","Sec-Fetch-Dest":"document"}
        assert form(nonce,cookie,edge)[0]==303
        nonce,cookie=new_proof()
        # A valid local form remains authorized without Origin/Fetch Metadata.
        assert form(nonce,cookie,{"Sec-Fetch-Site":"",
                                  "Sec-Fetch-Mode":""})[0]==303
        for unsafe in [
            {"Origin":"https://evil.example"},
            {"Sec-Fetch-Site":"cross-site"},
            {"Sec-Fetch-Site":"same-site"},
            {"Sec-Fetch-Mode":"cors"},
            {"Sec-Fetch-Dest":"iframe"},
            {"Host":"attacker.example"},
        ]:
            nonce,cookie=new_proof()
            status,headers,body=form(nonce,cookie,unsafe)
            assert status==403 and TOKEN.encode() not in body
            assert form(nonce,cookie)[0]==303
        nonce,cookie=new_proof()
        assert form(nonce)[0]==403  # nonce alone cannot authorize
        assert form(nonce,"central_pair_confirm=wrong")[0]==403
        assert form(nonce,cookie)[0]==303
        print("PASS: HTTP local GET cookie+nonce -> POST/303 across missing/opaque Origin")
        print("PASS: cross-site, cookie-less, foreign Host and replay remain 403")
    finally:
        srv.shutdown();srv.server_close()

if __name__=="__main__":run()
