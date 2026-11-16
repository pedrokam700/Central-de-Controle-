"""Executable RED contract tests from the cross-module audit of 16/11/2026.

These deliberately fail against the current implementation; they are NOT
wired into CI/installer until the navigation correctness patch is ready.
They use only fake pages/frames, never a real MES/Chrome/SQLite session.

Run: python3 -m unittest scripts/audit/ames_navigation_readiness_red.py -v
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ames" / "factory-engine"))
from ames.navigation import AmesNavigation


class FakeLocator:
    def __init__(self, count=0, visible=False):
        self.n, self.visible = count, visible

    def count(self):
        return self.n

    def is_visible(self, **kwargs):
        return self.visible

    def inner_text(self, **kwargs):
        return ""


class FakeFrame:
    def __init__(self, present=False, visible=False):
        self.present, self.visible = present, visible

    def locator(self, selector):
        return FakeLocator(int(self.present), self.visible)


class FakePage:
    def __init__(self, url, present=False, visible=False):
        self.url = url
        self.frames = [FakeFrame(present, visible)]

    def locator(self, selector):
        return FakeLocator(0, False)


class FakeBrowser:
    def __init__(self, pages):
        self.pages = pages


class NavigationReadinessRed(unittest.TestCase):
    def test_hidden_extjs_control_is_not_a_visible_control(self):
        """RED: _has_visible currently uses count() instead of visibility."""
        page = FakePage("http://mes/asymes/home#UAWIP.form.VwViewLotHistoryView",
                        present=True, visible=False)
        self.assertFalse(
            AmesNavigation._has_visible(page, 'input[name="sn"]'),
            "A hidden ExtJS input exists but is not actionable/visible"
        )

    def test_selector_from_wrong_route_never_proves_correct_view(self):
        """RED: _wait_view accepts selector on a wrong route/frame."""
        page = FakePage(
            "http://mes/asymes/home#UAWIP.form.TrDefectLotByHandView",
            present=True, visible=True
        )
        nav = AmesNavigation(FakeBrowser([page]))
        with self.assertRaisesRegex(RuntimeError, "não confirmou a view"):
            nav._wait_view(page, "UAWIP.form.VwViewLotHistoryView",
                           'input[name="sn"]', timeout_s=0.02)

    def test_3022_route_in_url_without_rendered_controls_is_not_ready(self):
        """RED: ensure_3022 returns a URL-matching page even before ExtJS renders."""
        page = FakePage(
            "http://mes/asymes/home#UAWIP.form.VwViewLotHistoryView",
            present=False, visible=False
        )
        nav = AmesNavigation(FakeBrowser([page]))
        with self.assertRaises(RuntimeError,
                               msg="Route presence alone cannot certify 3022 page readiness"):
            nav.ensure_3022(timeout_s=0.02)


if __name__ == "__main__":
    unittest.main()
