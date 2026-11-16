"""Regressions for route/surface/visible-field readiness in the existing MES navigator.

All pages, frames and the clock are synthetic. No real Chrome/CDP, A-MES,
network, SQLite or production files are opened.
"""
from __future__ import annotations

import itertools
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ames" / "factory-engine"))
from ames.navigation import AmesNavigation  # noqa: E402


class Element:
    def __init__(self, visible):
        self.visible = visible

    def is_visible(self, timeout=0):
        return self.visible


class Locator:
    def __init__(self, visible=()):
        self.visible = list(visible)

    def count(self):
        return len(self.visible)

    def nth(self, index):
        return Element(self.visible[index])

    @property
    def first(self):
        return Element(self.visible[0] if self.visible else False)


class Body:
    def inner_text(self, timeout=0):
        return "A-MES workspace"


class Frame:
    def __init__(self, selectors=None):
        self.selectors = selectors or {}

    def locator(self, selector):
        return Locator(self.selectors.get(selector, []))


class Page:
    def __init__(self, url, selectors=None):
        self.url = url
        self.frames = [Frame(selectors)]

    def locator(self, selector):
        if selector == "body":
            return Body()
        return self.frames[0].locator(selector)

    def evaluate(self, _script, route):
        self.url = self.url.split("#", 1)[0] + "#" + route

    def goto(self, url, **_kwargs):
        self.url = url


class Context:
    def __init__(self, browser):
        self.browser = browser
        self.created = []

    def new_page(self):
        page = Page("about:blank", {'input[name="snImei"]:visible': [True]})
        self.created.append(page)
        self.browser.pages.append(page)
        return page


class Browser:
    def __init__(self, pages):
        self.pages = list(pages)
        self.context = Context(self)


class NavigationReadinessTests(unittest.TestCase):
    def test_hidden_present_control_does_not_mean_visible(self):
        page = Page("http://mes/asymes/home", {"input[name=sn]": [False]})
        self.assertFalse(AmesNavigation._has_visible(page, "input[name=sn]"))

    def test_visible_control_after_hidden_one_is_recognized(self):
        page = Page("http://mes/asymes/home", {"input[name=sn]": [False, True]})
        self.assertTrue(AmesNavigation._has_visible(page, "input[name=sn]"))

    def test_another_view_input_cannot_confirm_requested_route(self):
        page = Page(
            "http://mes/asymes/home#UAWIP.form.VwFpyInquireView",
            {'input[name="sn"]:visible': [True]},
        )
        nav = AmesNavigation(Browser([page]))
        # Advancing synthetic time makes timeout immediate, without real sleeps.
        clock = itertools.count(0, 0.06)
        with patch("ames.navigation.time.time", side_effect=lambda: next(clock)), \
             patch("ames.navigation.time.sleep"):
            with self.assertRaisesRegex(RuntimeError, "não confirmou a view"):
                nav._wait_view(page, "UAWIP.form.VwAutoScanSnView",
                               'input[name="sn"]:visible', timeout_s=0.10)

    def test_correct_route_and_visible_field_is_accepted(self):
        page = Page(
            "http://mes/asymes/home#UAWIP.form.VwAutoScanSnView",
            {'input[name="sn"]:visible': [True]},
        )
        nav = AmesNavigation(Browser([page]))
        self.assertIs(nav._wait_view(page, "UAWIP.form.VwAutoScanSnView",
                                     'input[name="sn"]:visible', timeout_s=0.1), page)

    def test_2114_home_lookalike_is_not_accepted_as_opc(self):
        route = "UAWIP.form.TrDefectLotByHandView"
        home = Page("http://mes/asymes/home#" + route,
                    {'input[name="snImei"]:visible': [True]})
        browser = Browser([home])
        nav = AmesNavigation(browser)
        target = nav.ensure_2114(timeout_s=0.1)
        self.assertIsNot(target, home)
        self.assertEqual(len(browser.context.created), 1)
        self.assertIn("/asymes/opc#" + route, target.url)


if __name__ == "__main__":
    unittest.main()
