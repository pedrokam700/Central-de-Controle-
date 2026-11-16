"""F2-final: 3022 readiness is a real Home/ExtJS input, not a hash or stale tab.

No CDP, A-MES, network, operational SQLite, View button or user input is used.
"""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"ames"/"factory-engine"))
from ames.tela_3022 import Tela3022  # noqa: E402

ENGINE=ROOT/"ames"/"factory-engine"
ROUTE="UAWIP.form.VwViewLotHistoryView"


class Frame:
    def __init__(self, ext):
        self.ext=ext

    def evaluate(self, _script):
        return self.ext


class Page:
    def __init__(self, url, ext=True):
        self.url=url
        self.frames=[Frame(ext)]


class Browser:
    def __init__(self, pages):
        self.pages=pages
        self.active_calls=0

    def choose_active_page(self,hint):
        self.active_calls+=1
        return self.pages[-1]


class Control:
    def __init__(self, visible=True):
        self.visible=visible
        self.waited=0

    def wait_for(self, state="visible", timeout=350):
        self.waited+=1
        if not self.visible:
            raise RuntimeError("input not yet visible")


def tela(browser):
    return Tela3022(browser,ENGINE)


class Test3022RealViewReady(unittest.TestCase):
    def test_selects_only_3022_home_not_last_opc_or_other_route(self):
        correct=Page("http://mes.local/asymes/home#"+ROUTE)
        stale_opc=Page("http://mes.local/asymes/opc#"+ROUTE)
        other=Page("http://mes.local/asymes/home#UAWIP.form.VwAutoScanSnView")
        browser=Browser([correct,stale_opc,other])
        self.assertIs(tela(browser)._page(),correct)
        self.assertEqual(browser.active_calls,0)

    def test_opc_only_never_looks_like_ready_3022_home(self):
        opc=Page("http://mes.local/asymes/opc#"+ROUTE)
        with self.assertRaisesRegex(RuntimeError,"VIEW_3022_NOT_READY"):
            tela(Browser([opc]))._page()

    def test_stale_home_other_route_never_looks_ready(self):
        page=Page("http://mes.local/asymes/home#UAWIP.form.VwAutoScanSnView")
        with self.assertRaisesRegex(RuntimeError,"VIEW_3022_NOT_READY"):
            tela(Browser([page]))._page()

    def test_login_and_empty_browser_fail_closed(self):
        for pages in ([Page("http://mes.local/asymes/login")],[]):
            with self.subTest(pages=pages):
                with self.assertRaisesRegex(RuntimeError,"VIEW_3022_NOT_READY"):
                    tela(Browser(pages))._page()

    def test_hash_alone_with_no_extjs_cannot_be_ready(self):
        page=Page("http://mes.local/asymes/home#"+ROUTE,ext=False)
        collector=tela(Browser([page]))
        fake=Control()
        collector._query_control=lambda _page:fake
        with self.assertRaisesRegex(RuntimeError,"VIEW_3022_NOT_READY"):
            collector.ensure_ready_3022(timeout_s=0.02)
        self.assertEqual(fake.waited,0)

    def test_extjs_without_usable_sn_field_cannot_be_ready(self):
        page=Page("http://mes.local/asymes/home#"+ROUTE,ext=True)
        collector=tela(Browser([page]))
        collector._query_control=lambda _page:None
        with self.assertRaisesRegex(RuntimeError,"VIEW_3022_NOT_READY"):
            collector.ensure_ready_3022(timeout_s=0.02)

    def test_correct_home_extjs_and_actionable_sn_returns_without_view_click(self):
        page=Page("http://mes.local/asymes/home#"+ROUTE,ext=True)
        collector=tela(Browser([page]))
        control=Control()
        collector._query_control=lambda _page:control
        self.assertIs(collector.ensure_ready_3022(timeout_s=0.2),page)
        self.assertEqual(control.waited,1)

    def test_non_actionable_field_is_pending_not_confirmed(self):
        page=Page("http://mes.local/asymes/home#"+ROUTE,ext=True)
        collector=tela(Browser([page]))
        control=Control(visible=False)
        collector._query_control=lambda _page:control
        with self.assertRaisesRegex(RuntimeError,"VIEW_3022_NOT_READY"):
            collector.ensure_ready_3022(timeout_s=0.02)
        self.assertGreaterEqual(control.waited,1)


if __name__=="__main__":
    unittest.main(verbosity=2)
