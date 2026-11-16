"""F1: recover Home only from an unambiguous existing A-MES OPC session.

Synthetic browser only. This test never starts Chrome, CDP, MES, a local
agent or a factory database. It protects confirmed local replay as-is.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ames" / "factory-engine"))
from ames.navigation import AmesNavigation  # noqa: E402

ROUTE = AmesNavigation.ROUTES["3022"]


class Page:
    def __init__(self, url, *, body="MES active", redirect_to_login=False):
        self.url = url
        self.body = body
        self.redirect_to_login = redirect_to_login
        self.visited = []

    def locator(self, selector):
        if selector == "body":
            return self

        class Missing:
            def count(self):
                return 0
        return Missing()

    def inner_text(self, timeout=700):
        return self.body

    def goto(self, url, **_kwargs):
        self.visited.append(url)
        self.url = "http://mes.local/asymes/login" if self.redirect_to_login else url

    def evaluate(self, script, route):
        assert "location.hash" in script
        self.url = self.url.split("#", 1)[0] + "#" + route


class Context:
    def __init__(self, browser, redirect_to_login=False):
        self.browser = browser
        self.created = []
        self.redirect_to_login = redirect_to_login

    def new_page(self):
        new = Page("about:blank", redirect_to_login=self.redirect_to_login)
        self.created.append(new)
        self.browser.pages.append(new)
        return new


class Browser:
    def __init__(self, *pages, redirect_to_login=False):
        self.pages = list(pages)
        self.context = Context(self, redirect_to_login=redirect_to_login)


class F1HomeRecoveryTests(unittest.TestCase):
    def test_opc_only_recovers_home_in_same_context_no_new_cdp_or_login(self):
        opc = Page("http://mes.local/asymes/opc#UAWIP.form.TrDefectLotByHandView")
        browser = Browser(opc)
        result = AmesNavigation(browser).ensure_3022(timeout_s=0.5)
        self.assertIs(result, browser.context.created[0])
        self.assertEqual(len(browser.context.created), 1)
        self.assertEqual(opc.url, "http://mes.local/asymes/opc#UAWIP.form.TrDefectLotByHandView")
        self.assertEqual(result.visited, ["http://mes.local/asymes/home"])
        self.assertEqual(result.url, "http://mes.local/asymes/home#" + ROUTE)

    def test_existing_home_is_preferred_without_another_tab(self):
        opc = Page("http://mes.local/asymes/opc")
        home = Page("http://mes.local/asymes/home#" + ROUTE)
        browser = Browser(opc, home)
        self.assertIs(AmesNavigation(browser).ensure_3022(timeout_s=0.5), home)
        self.assertEqual(browser.context.created, [])

    def test_existing_opc_with_3022_hash_must_not_count_as_home(self):
        opc = Page("http://mes.local/asymes/opc#" + ROUTE)
        browser = Browser(opc)
        target = AmesNavigation(browser).ensure_3022(timeout_s=0.5)
        self.assertIsNot(target, opc)
        self.assertIn("/asymes/home#", target.url)

    def test_ambiguous_opc_origins_fail_closed_without_creating_tabs(self):
        a = Page("http://mes-a.local/asymes/opc")
        b = Page("http://mes-b.local/asymes/opc")
        browser = Browser(a, b)
        with self.assertRaisesRegex(RuntimeError, "HOME_ORIGIN_AMBIGUOUS"):
            AmesNavigation(browser).ensure_3022(timeout_s=0.5)
        self.assertEqual(browser.context.created, [])
        self.assertEqual(len(browser.pages), 2)

    def test_login_only_requires_manual_login_not_open_another_session(self):
        login = Page("http://mes.local/asymes/login")
        browser = Browser(login)
        with self.assertRaisesRegex(RuntimeError, "LOGIN_AMES_REQUIRED"):
            AmesNavigation(browser).ensure_3022(timeout_s=0.5)
        self.assertEqual(browser.context.created, [])

    def test_home_recovery_redirected_to_login_is_not_ready(self):
        opc = Page("http://mes.local/asymes/opc")
        browser = Browser(opc, redirect_to_login=True)
        with self.assertRaisesRegex(RuntimeError, "LOGIN_AMES_REQUIRED"):
            AmesNavigation(browser).ensure_3022(timeout_s=0.5)
        self.assertEqual(len(browser.context.created), 1)
        self.assertTrue(browser.context.created[0].url.endswith("/login"))

    def test_unknown_tabs_cannot_be_converted_to_home(self):
        browser = Browser(Page("https://intranet.local/home"), Page("about:blank"))
        with self.assertRaisesRegex(RuntimeError, "Aba principal do A-MES"):
            AmesNavigation(browser).ensure_3022(timeout_s=0.5)
        self.assertEqual(browser.context.created, [])

    def test_invalid_opc_lookalike_not_accepted(self):
        browser = Browser(Page("http://mes.local/asymes/opc-extra"))
        with self.assertRaisesRegex(RuntimeError, "Aba principal do A-MES"):
            AmesNavigation(browser).ensure_3022(timeout_s=0.5)
        self.assertEqual(browser.context.created, [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
