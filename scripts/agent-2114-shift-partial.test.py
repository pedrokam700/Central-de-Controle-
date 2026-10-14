"""Contracts for the physical 2114 shift regression found on 2026-10-14.

These tests intentionally do not claim factory validation.  They prove that:
- shift preparation requires a committed confirmation, not the first visual hit;
- the composite navigator can degrade 2114 without killing other sources;
- fluxo_2114 returns structured partial evidence when Shift is unavailable;
- one 2114 PCBA error does not abort the remaining 2114 batch.
"""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENGINE = ROOT / "ames" / "factory-engine"
sys.path.insert(0, str(ENGINE))

from ames import shift_2114  # noqa: E402
from ames.navigation import AmesNavigation  # noqa: E402
from core import fluxo_2114  # noqa: E402


class FakeClock:
    def __init__(self):
        self.value = 100.0

    def time(self):
        self.value += 0.05
        return self.value

    def sleep(self, seconds):
        self.value += float(seconds)


class FakeFrame:
    def __init__(self):
        self.apply_calls = 0
        self.confirm_calls = 0

    def evaluate(self, _script, args):
        if args["apply"]:
            self.apply_calls += 1
            if self.apply_calls == 1:
                return {"ok": False, "reason": "lookup_open_requested"}
            if self.apply_calls == 2:
                return {"ok": False, "reason": "grid_selected_waiting_commit"}
            return {"ok": True, "reason": "confirmed", "strategy": "lookup_grid"}
        self.confirm_calls += 1
        return {"ok": True, "reason": "confirmed", "strategy": "existing_dom"}


class FakePage:
    def __init__(self, frame):
        self.frames = [frame]


def sample_3074(*pcbas):
    return {
        "items": [
            {
                "pcba_sn": pcba,
                "defect_traces": [
                    {
                        "status": "COMPLETE",
                        "defect": {
                            "defect_time": "2026-10-14T10:00:00",
                            "defect_code": "GN12-TT01",
                            "defect_desc": "Earpiece: receiver noise/intermittent",
                            "line": "TAN10102",
                            "product_model": "CPH2819",
                        },
                        "trace_3074": {"results": []},
                    }
                ],
            }
            for pcba in pcbas
        ]
    }


def test_shift_waits_for_committed_confirmation():
    frame = FakeFrame()
    page = FakePage(frame)
    clock = FakeClock()
    real_time, real_sleep = shift_2114.time.time, shift_2114.time.sleep
    shift_2114.time.time, shift_2114.time.sleep = clock.time, clock.sleep
    try:
        result = shift_2114.ensure_shift(page, timeout_s=4.0)
    finally:
        shift_2114.time.time, shift_2114.time.sleep = real_time, real_sleep
    assert result == "1st Shift"
    assert frame.apply_calls >= 3, "must not accept lookup-open or row-selected as committed shift"
    assert frame.confirm_calls == 1, "must re-read without applying before success"
    assert "gridpanel" in shift_2114.SELECT_SHIFT_JS
    assert "itemdblclick" in shift_2114.SELECT_SHIFT_JS
    assert "lookup_open_requested" in shift_2114.SELECT_SHIFT_JS


def test_navigation_shift_is_nonfatal_unless_strict():
    original = shift_2114.ensure_shift
    shift_2114.ensure_shift = lambda _page: (_ for _ in ()).throw(RuntimeError("combo_missing"))
    nav = AmesNavigation(browser=object())
    try:
        assert nav.ensure_current_shift_2114(page=object()) is None
        try:
            nav.ensure_current_shift_2114(page=object(), strict=True)
        except RuntimeError as exc:
            assert "combo_missing" in str(exc)
        else:
            raise AssertionError("strict=True must preserve hard failure")
    finally:
        shift_2114.ensure_shift = original


def test_unconfirmed_shift_returns_partial_without_querying_2114():
    class Tela:
        calls = 0

        def turno_atual(self):
            return fluxo_2114.SHIFT_UNCONFIRMED

        def consultar(self, _pcba):
            self.calls += 1
            raise AssertionError("no 2114 SN may be submitted without a confirmed Shift")

    tela = Tela()
    with tempfile.TemporaryDirectory() as td:
        checkpoint = Path(td) / "2114.json"
        out = fluxo_2114.executar_fluxo_2114(
            sample_3074("002500000001"),
            tela,
            source_sha256="source",
            checkpoint_path=checkpoint,
            include_current=True,
            pause_s=0,
        )
        assert checkpoint.exists()
    assert tela.calls == 0
    assert out["status"] == "partial"
    assert out["source_status"] == "ERROR"
    assert out["processed_pcba_count"] == 0
    assert out["pcba_error_count"] == 1
    assert out["pcbas"][0]["status"] == "ERROR"
    assert "3074/3022 podem continuar" in out["source_error"]


def test_one_2114_error_does_not_abort_remaining_targets():
    class Tela:
        def __init__(self):
            self.calls = []

        def turno_atual(self):
            return "1st Shift"

        def consultar(self, pcba):
            self.calls.append(pcba)
            if pcba.endswith("1"):
                raise RuntimeError("physical source error")
            return {"rows": [], "no_data": True, "shift": "1st Shift"}

    tela = Tela()
    out = fluxo_2114.executar_fluxo_2114(
        sample_3074("002500000001", "002500000002"),
        tela,
        source_sha256="source-2",
        include_current=True,
        pause_s=0,
    )
    assert tela.calls == ["002500000001", "002500000002"]
    assert out["status"] == "partial"
    assert out["source_status"] == "PARTIAL"
    assert out["processed_pcba_count"] == 1
    assert out["pcba_error_count"] == 1
    assert [row["status"] for row in out["pcbas"]] == ["ERROR", "COMPLETE"]


def main():
    tests = [
        test_shift_waits_for_committed_confirmation,
        test_navigation_shift_is_nonfatal_unless_strict,
        test_unconfirmed_shift_returns_partial_without_querying_2114,
        test_one_2114_error_does_not_abort_remaining_targets,
    ]
    for test in tests:
        test()
        print(f"PASS {test.__name__}")
    print(f"2114 shift/partial contracts: {len(tests)}/{len(tests)} PASS")


if __name__ == "__main__":
    main()
