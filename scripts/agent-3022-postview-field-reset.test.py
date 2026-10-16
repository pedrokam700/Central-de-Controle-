from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
ENGINE = ROOT / "ames" / "factory-engine"
sys.path.insert(0, str(ENGINE))
from ames import tela_3022 as collector  # noqa: E402


def history_row(label="new"):
    return {
        "Hist Seq": 1,
        "Working Oper Code": "A5162",
        "Working Oper": "Camera inspection",
        "Current Oper Code": "A5201",
        "Current Oper": "Assembly",
        "Station": "A5162",
        "Tran Desc": "END LOT",
        "Tran Time": "2026-10-16 10:32:11",
        "Tran User Id": label,
        "Shift": "DAY",
        "Cutoff Date": "2026-10-16",
        "TRAN CMF3": "raw preserved",
    }


class Field:
    def __init__(self):
        self.value = ""
        self.reads = 0

    def wait_for(self, **kwargs):
        pass

    def fill(self, value, **kwargs):
        self.value = value

    def input_value(self, **kwargs):
        self.reads += 1
        if self.reads > 1:
            raise RuntimeError("physical A-MES replaced query field after View")
        return self.value


class TransientField:
    def wait_for(self, **kwargs):
        raise RuntimeError("locator detached while ExtJS recreated SN field")


class Button:
    def click(self, **kwargs):
        pass


class Page:
    frames = [object()]


class Browser:
    pass


class PostViewFieldLifetimeTests(unittest.TestCase):
    def _build_tela(self, td):
        base = Path(td)
        (base / "config").mkdir()
        (base / "config" / "selectors.json").write_text(
            '{"3022":{"view_texts":["View"],"expected_headers":["Tran Time"]}}',
            encoding="utf-8",
        )
        return collector.Tela3022(Browser(), base)

    def _fresh_history(self, tela, page, frame, field_provider):
        before = {"grid_id": "history", "headers": ["Tran Time"], "rows": [], "store_loading": False}
        after = {"grid_id": "history", "headers": ["Tran Time"], "rows": [history_row()], "store_loading": False}
        grids = iter([before, after])
        tela._page = lambda: page
        tela._query_control = field_provider
        tela._header_fields = lambda *_args: []
        tela._grid_store_token = lambda *_args: "store-1"

        def history(_frame, _grid_id, action, _token):
            if action == "read":
                return {"changes": 1, "loads": 1, "success": True}
            return None

        tela._history_response = history
        return patch.object(collector, "find_button", return_value=(frame, Button(), None)), \
               patch.object(collector, "extract_extjs_store_grid", side_effect=lambda *_a, **_k: next(grids))

    def test_fresh_result_survives_query_field_replacement_after_view(self):
        field = Field()
        page = Page()
        frame = page.frames[0]

        with tempfile.TemporaryDirectory() as td:
            tela = self._build_tela(td)
            button_patch, grid_patch = self._fresh_history(tela, page, frame, lambda _page: field)
            with button_patch, grid_patch:
                result = tela.consultar("0025276382", timeout_s=.5, empty_confirm_s=.05)

        self.assertEqual(field.reads, 1, "query field must not be read again after View")
        self.assertEqual(result["rows"][0]["Tran Time"], "2026-10-16 10:32:11")
        self.assertTrue(result["query_diagnostics"]["target_confirmed_before_submit"])
        self.assertTrue(result["query_diagnostics"]["refresh_proven"])
        self.assertEqual(result["query_diagnostics"]["status"], "CONFIRMED")

    def test_transient_pre_submit_field_is_re_resolved_until_live_field_is_stable(self):
        page = Page()
        frame = page.frames[0]
        stable = Field()
        fields = iter([TransientField(), TransientField(), TransientField(), stable])
        calls = {"n": 0}

        def current_field(_page):
            calls["n"] += 1
            return next(fields)

        with tempfile.TemporaryDirectory() as td:
            tela = self._build_tela(td)
            button_patch, grid_patch = self._fresh_history(tela, page, frame, current_field)
            with button_patch, grid_patch:
                result = tela.consultar("0025276382", timeout_s=.5, empty_confirm_s=.05)

        self.assertEqual(calls["n"], 4)
        self.assertEqual(result["query_diagnostics"]["input_retries"], 3)
        self.assertTrue(result["query_diagnostics"]["target_confirmed_before_submit"])
        self.assertEqual(result["query_diagnostics"]["status"], "CONFIRMED")

    def test_ext_transition_never_falls_back_to_stale_generic_locator(self):
        class Frame:
            def evaluate(self, *_args, **_kwargs):
                return {"ext": True, "field": None}

        class ExtPage:
            frames = [Frame()]

        with tempfile.TemporaryDirectory() as td:
            tela = self._build_tela(td)
            with patch.object(collector, "find_text_input", side_effect=AssertionError("generic fallback must not run")):
                self.assertIsNone(tela._query_control(ExtPage()))


if __name__ == "__main__":
    unittest.main()
