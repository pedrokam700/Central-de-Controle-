"""Synthetic legacy A-MES: used only by the Windows port arbitration gate."""
import argparse
import json
import os
import socket
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

p=argparse.ArgumentParser();p.add_argument('--latent',action='store_true');a=p.parse_args()
if a.latent:
    time.sleep(180)
    raise SystemExit(0)
root=str(Path(__file__).resolve().parent.parent)
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        body={'ok':True,'ready':True,'pid':os.getpid(),'agent_version':'synthetic-legacy','candidate_version':'synthetic','agent_build':'CLEAN-V4-3012'}
        if self.path.endswith('/v2/capabilities'):body={'native_console':True,'package_root':root,'scheduler':{'policy':'synthetic'}}
        elif self.path.endswith('/hardening/health'):body={'ok':True,'hardening':'H1','integrity':'ok','schema_version':1,'local_security':{'mode':'workstation-token-v1'}}
        data=json.dumps(body).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
    def log_message(self,*args):pass
class Server(ThreadingHTTPServer):
    allow_reuse_address=False
    def server_bind(self):
        if hasattr(socket,'SO_EXCLUSIVEADDRUSE'):self.socket.setsockopt(socket.SOL_SOCKET,socket.SO_EXCLUSIVEADDRUSE,1)
        super().server_bind()
Server(('127.0.0.1',8765),Handler).serve_forever()
