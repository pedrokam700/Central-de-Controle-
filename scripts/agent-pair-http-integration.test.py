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
        return self.reply(200,pairing.page(pairing.GATE.issue()),{"Content-Type":"text/html; charset=utf-8"})
    def do_POST(self):
        if self.path != pairing.PAIR_PATH:return self.reply(404)
        data=self.rfile.read(int(self.headers.get("Content-Length","0")))
        if not pairing.confirm(self.headers,self.client_address[0],self.server.server_port,data):
            return self.reply(403,pairing.retry_page(),{"Content-Type":"text/html; charset=utf-8"})
        return self.reply(303,headers={"Location":pairing.destination(TOKEN)})

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
        def new_nonce():
            code,headers,html=request(port,"GET")
            assert code==200 and b"Autorizar e abrir a Central" in html
            assert TOKEN.encode() not in html
            return re.search(rb'name="nonce" value="([^"]+)"',html).group(1)
        def form(nonce,headers=None):
            body=b"nonce="+nonce
            default={"Content-Type":"application/x-www-form-urlencoded",
                     "Sec-Fetch-Site":"same-origin","Sec-Fetch-Mode":"navigate"}
            default.update(headers or {})
            return request(port,"POST",body,default)
        nonce=new_nonce()
        status,headers,body=form(nonce)
        assert status==303 and headers["Location"].endswith("#ames_agent_token="+TOKEN)
        assert headers["Cache-Control"]=="no-store, max-age=0"
        assert status==303 and not body
        status,headers,body=form(nonce)
        assert status==403 and b"Reiniciar conexao segura" in body
        assert TOKEN.encode() not in body
        for injected in [
            {"Origin":"https://evil.example","Sec-Fetch-Site":"cross-site"},
            {"Sec-Fetch-Site":"cross-site"},
            {"Sec-Fetch-Site":"none"}
        ]:
            nonce=new_nonce()
            code,headers,body=form(nonce,injected)
            assert code==403 and b"Reiniciar conexao segura" in body
        print("PASS: HTTP GET->POST same-origin without Origin issues 303 once")
        print("PASS: external, ambiguous and replayed forms remain 403; no secret in responses")
    finally:
        srv.shutdown();srv.server_close()

if __name__=="__main__":run()
