"""Contract: copied local Central tabs authenticate GET/POST without a fragment.

The local browser omits Origin on same-origin fetch GET. Only a proven
same-origin loopback Host + Fetch Metadata may bypass the workstation token;
cross-site/opaque/foreign-host requests remain denied. No MES or SQLite usage.
"""
from __future__ import annotations

import http.client
import http.server
import sys
import threading
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'ames' / 'agent'))
from local_security import authorized

SECRET = 'unit-test-only-workstation-capability-abcdef123456'


def browser_headers(host='127.0.0.1:8765', site='same-origin',
                    mode='cors', dest='empty', origin=None, capability=None):
    headers = {'Host': host, 'Sec-Fetch-Site': site,
               'Sec-Fetch-Mode': mode, 'Sec-Fetch-Dest': dest}
    if origin is not None:
        headers['Origin'] = origin
    if capability is not None:
        headers['X-Central-Agent-Token'] = capability
    return headers


class LoopbackOriginContract(unittest.TestCase):
    def test_pasted_same_origin_tab_without_fragment(self):
        for host in ('127.0.0.1:8765', 'localhost:8765'):
            with self.subTest(host=host):
                self.assertTrue(authorized(browser_headers(host=host), SECRET, 8765))
                self.assertTrue(authorized(browser_headers(host=host, dest=''), SECRET, 8765))

    def test_existing_launcher_token_and_original_origin_continue(self):
        self.assertTrue(authorized({'X-Central-Agent-Token': SECRET}, SECRET, 8765))
        self.assertTrue(authorized({'Origin': 'http://127.0.0.1:8765'}, SECRET, 8765))
        self.assertTrue(authorized({'Origin': 'http://localhost:8765'}, SECRET, 8765))
        self.assertTrue(authorized(browser_headers(origin='https://pedrokam700.github.io',
                          capability=SECRET, site='cross-site'), SECRET, 8765))

    def test_foreign_or_ambiguous_requests_cannot_use_same_origin_exception(self):
        rejected = [
            browser_headers(host='attacker.example:8765'),
            browser_headers(site='cross-site'),
            browser_headers(site='same-site'),
            browser_headers(site='none'),
            browser_headers(site=''),
            browser_headers(mode='navigate'),
            browser_headers(mode='no-cors'),
            browser_headers(mode=''),
            browser_headers(dest='image'),
            browser_headers(dest='document'),
            browser_headers(origin='null'),
            browser_headers(origin='https://evil.example'),
            browser_headers(origin='https://pedrokam700.github.io'),
            {'Host': '127.0.0.1:8765'},
            {'Origin': 'null', 'Host': '127.0.0.1:8765',
             'Sec-Fetch-Site':'same-origin', 'Sec-Fetch-Mode':'cors'},
            browser_headers(capability='wrong-workstation-token'),
        ]
        # The final request has independently sufficient same-origin metadata.
        # A bad token must not invalidate a proven local page.
        rejected.pop()
        for headers in rejected:
            with self.subTest(headers=headers):
                self.assertFalse(authorized(headers, SECRET, 8765))
        self.assertFalse(authorized({'X-Central-Agent-Token': 'wrong'}, SECRET, 8765))

    def test_http_get_and_post_local_metadata_no_origin(self):
        token = SECRET
        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass
            def reply(self):
                ok = authorized(self.headers, token, self.server.server_port)
                self.send_response(200 if ok else 401)
                self.send_header('Content-Length','0')
                self.end_headers()
            def do_GET(self):
                self.reply()
            def do_POST(self):
                self.reply()
        server = http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
        thread = threading.Thread(target=server.serve_forever,daemon=True)
        thread.start()
        try:
            port = server.server_port
            def call(method, meta):
                con = http.client.HTTPConnection('127.0.0.1',port,timeout=3)
                con.request(method,'/api/v1/v2/snapshots',
                            headers={'Host':f'127.0.0.1:{port}',**meta})
                res = con.getresponse()
                status = res.status
                res.read()
                con.close()
                return status
            safe = {'Sec-Fetch-Site':'same-origin','Sec-Fetch-Mode':'cors',
                    'Sec-Fetch-Dest':'empty'}
            for method in ('GET','POST'):
                self.assertEqual(call(method,safe),200)
                self.assertEqual(call(method,{**safe,'Sec-Fetch-Site':'cross-site'}),401)
                self.assertEqual(call(method,{**safe,'Origin':'null'}),401)
                self.assertEqual(call(method,{}),401)
            self.assertEqual(call('GET',{'X-Central-Agent-Token':SECRET}),200)
        finally:
            server.shutdown()
            server.server_close()


if __name__ == '__main__':
    unittest.main(verbosity=2)
