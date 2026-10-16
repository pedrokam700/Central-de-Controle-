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


class Button:
    def click(self, **kwargs):
        pass


class Page:
    frames = [object()]


class Browser:
    pass


class PostViewFieldLifetimeTests(unittest.TestCase):
    def test_fresh_result_survives_query_field_replacement_after_view(self):
        field = Field()
        page = Page()
        frame = page.frames[0]
        before = {"grid_id": "history", "headers": ["Tran Time"], "rows": [], "store_loading": False}
        after = {"grid_id": "history", "headers": ["Tran Time"], "rows": [history_row()], "store_loading": False}
        grids = iter([before, after])

        with tempfile.TemporaryDirectory() as td:
            base = Path(td)
            (base / "config").mkdir()
            (base / "config" / "selectors.json").write_text(
                '{"3022":{"view_texts":["View"],"expected_headers":["Tran Time"]}}',
                encoding="utf-8",
            )
            tela = collector.Tela3022(Browser(), base)
            tela._page = lambda: page
            tela._query_control = lambda _page: field
            tela._header_fields = lambda *_args: []
            tela._grid_store_token = lambda *_args: "store-1"

            def history(_frame, _grid_id, action, _token):
                if action == "read":
                    return {"changes": 1, "loads": 1, "success": True}
                return None

            tela._history_response = history

            with patch.object(collector, "find_button", return_value=(frame, Button(), None)), \
                 patch.object(collector, "extract_extjs_store_grid", side_effect=lambda *_a, **_k: next(grids)):
                result = tela.consultar("0025276382", timeout_s=.5, empty_confirm_s=.05)

        self.assertEqual(field.reads, 1, "query field must not be read again after View")
        self.assertEqual(result["rows"][0]["Tran Time"], "2026-10-16 10:32:11")
        self.assertTrue(result["query_diagnostics"]["target_confirmed_before_submit"])
        self.assertTrue(result["query_diagnostics"]["refresh_proven"])
        self.assertEqual(result["query_diagnostics"]["status"], "CONFIRMED")


if __name__ == "__main__":
    unittest.main()
