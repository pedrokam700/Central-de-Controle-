"""Real HTTP proof of the delivered static method under Windows MIME faults.

Read the actual method without importing/initializing the operational agent.
Only the test process' MIME registry and a disposable localhost server are used.
"""
import ast,contextlib,http.server,mimetypes,pathlib,tempfile,threading,unittest,urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[2]
class MIME(unittest.TestCase):
 def test_Javascript_modules_remain_executable_despite_OS_file_associations(self):
  tree=ast.parse((ROOT/'ames/agent/agent.py').read_text())
  method=next(n for n in ast.walk(tree) if isinstance(n,ast.FunctionDef) and n.name=='_send_static')
  namespace={'Path':pathlib.Path,'mimetypes':mimetypes}
  exec(compile(ast.fix_missing_locations(ast.Module(body=[method],type_ignores=[])),'real-agent-static-method','exec'),namespace)
  with tempfile.TemporaryDirectory() as folder:
   folder=pathlib.Path(folder)
   for name,body in [('entry.mjs',b'export const fixture="SYNTHETIC";'),('dependency.js',b'window.fixture="SYNTHETIC";'),('style.css',b'body{color:black}')]:
    (folder/name).write_bytes(body)
   class Handler(http.server.BaseHTTPRequestHandler):
    _send_static=namespace['_send_static']
    def _cors(self):self.send_header('Cache-Control','no-store')
    def do_GET(self):self._send_static(folder/self.path.lstrip('/'))
    def log_message(self,*args):pass
   server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
   worker=threading.Thread(target=server.serve_forever,daemon=True);worker.start()
   previous={ext:mimetypes.guess_type('x'+ext)[0] for ext in ('.mjs','.js')}
   try:
    for ext in previous:mimetypes.add_type('text/plain',ext)
    for name in ('entry.mjs','dependency.js'):
     with self.subTest(name=name),urllib.request.urlopen('http://127.0.0.1:'+str(server.server_port)+'/'+name,timeout=5) as response:
      self.assertIn(response.headers.get_content_type(),('application/javascript','text/javascript'))
      self.assertEqual(response.read(),(folder/name).read_bytes())
    with urllib.request.urlopen('http://127.0.0.1:'+str(server.server_port)+'/style.css',timeout=5) as response:self.assertEqual(response.headers.get_content_type(),'text/css')
   finally:
    for ext,typ in previous.items():mimetypes.add_type(typ or 'application/octet-stream',ext)
    server.shutdown();server.server_close();worker.join(timeout=3)
if __name__=='__main__':unittest.main()
