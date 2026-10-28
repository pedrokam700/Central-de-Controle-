"""Contracts for the physical 2114 shift regression found on 2026-10-14.

These tests intentionally do not claim factory validation.  They prove that:
- shift preparation requires a committed confirmation, not the first visual hit;
- the physical DOM trigger beside Shift is attempted before ExtJS helper fallbacks;
- the composite navigator can degrade 2114 without killing other sources;
- fluxo_2114 returns structured partial evidence when Shift is unavailable;
- one 2114 PCBA error does not abort the remaining 2114 batch;
- a completed checkpoint is refreshed on a new explicit trace instead of posing as a new MES read;
- a partial checkpoint still resumes only the unfinished PCBA work.
"""
from __future__ import annotations

import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENGINE = ROOT / "ames" / "factory-engine"
sys.path.insert(0, str(ENGINE))

from ames import shift_2114  # noqa: E402
from ames.navigation import AmesNavigation  # noqa: E402
from core import fluxo_2114  # noqa: E402
from core.correlacao_falhas import selecionar_ocorrencia_atual, analisar_historico_pcba_atual  # noqa: E402


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
        first_shift = datetime(2026, 10, 14, 10, 0, tzinfo=timezone(timedelta(hours=-3)))
        result = shift_2114.ensure_shift(page, now=first_shift, timeout_s=4.0)
    finally:
        shift_2114.time.time, shift_2114.time.sleep = real_time, real_sleep
    assert result == "1st Shift"
    assert frame.apply_calls >= 3, "must not accept lookup-open or row-selected as committed shift"
    assert frame.confirm_calls == 1, "must re-read without applying before success"
    assert "gridpanel" in shift_2114.SELECT_SHIFT_JS
    assert "itemdblclick" in shift_2114.SELECT_SHIFT_JS
    assert "lookup_open_requested" in shift_2114.SELECT_SHIFT_JS
    assert "physical_dom_trigger" in shift_2114.SELECT_SHIFT_JS
    assert shift_2114.SELECT_SHIFT_JS.index("physical_dom_trigger") < shift_2114.SELECT_SHIFT_JS.index("owner_onTriggerClick"), "physical Shift trigger must be attempted before ExtJS fallback"


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
        last_shift_error = "lookup did not commit"

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
    assert "lookup did not commit" in out["source_error"]


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


def test_completed_checkpoint_is_requeried_on_new_explicit_trace():
    class Tela:
        def __init__(self):
            self.calls = []

        def turno_atual(self):
            return "1st Shift"

        def consultar(self, pcba):
            self.calls.append(pcba)
            return {"query_sn": pcba, "rows": [{"Lot Id": pcba}], "no_data": False, "shift": "1st Shift"}

    tela = Tela()
    with tempfile.TemporaryDirectory() as td:
        checkpoint = Path(td) / "2114.json"
        first = fluxo_2114.executar_fluxo_2114(
            sample_3074("002500000382"), tela, source_sha256="same-source",
            checkpoint_path=checkpoint, include_current=True, pause_s=0,
        )
        second = fluxo_2114.executar_fluxo_2114(
            sample_3074("002500000382"), tela, source_sha256="same-source",
            checkpoint_path=checkpoint, include_current=True, pause_s=0,
        )
    assert first["source_status"] == "COMPLETE"
    assert second["source_status"] == "COMPLETE"
    assert tela.calls == ["002500000382", "002500000382"], "a new trace must submit the SN again"
    assert second["checkpoint_refreshed"] is True
    assert second["checkpoint_resumed"] is False


def test_partial_checkpoint_resumes_only_unfinished_pcba():
    class Tela:
        def __init__(self):
            self.calls = []
            self.fail_second = True

        def turno_atual(self):
            return "1st Shift"

        def consultar(self, pcba):
            self.calls.append(pcba)
            if pcba.endswith("2") and self.fail_second:
                raise RuntimeError("temporary 2114 failure")
            return {"query_sn": pcba, "rows": [], "no_data": True, "shift": "1st Shift"}

    tela = Tela()
    with tempfile.TemporaryDirectory() as td:
        checkpoint = Path(td) / "2114.json"
        first = fluxo_2114.executar_fluxo_2114(
            sample_3074("002500000001", "002500000002"), tela, source_sha256="partial-source",
            checkpoint_path=checkpoint, include_current=True, pause_s=0,
        )
        tela.fail_second = False
        second = fluxo_2114.executar_fluxo_2114(
            sample_3074("002500000001", "002500000002"), tela, source_sha256="partial-source",
            checkpoint_path=checkpoint, include_current=True, pause_s=0,
        )
    assert first["source_status"] == "PARTIAL"
    assert second["source_status"] == "COMPLETE"
    assert tela.calls == ["002500000001", "002500000002", "002500000002"]
    assert second["checkpoint_resumed"] is True
    assert second["checkpoint_refreshed"] is False



def test_2114_exact_lot_without_extjs_load_is_fast():
    """Regression from physical test: visible exact Lot Id is sufficient."""
    from ames import tela_2114
    class SN:
        def count(self): return 1
        @property
        def first(self):return self
        def fill(self,value,**kw):self.value=value
        def focus(self,**kw):pass
    class P:
        frames=[]
        keyboard=type('K',(),{'press':lambda self,key:None})()
        def __init__(self):self.sn=SN()
        def locator(self,selector):return self.sn
    page=P()
    original_grid=tela_2114.extract_best_grid
    original_safe=tela_2114._safe_input_value
    original_shift=shift_2114.ensure_shift
    original_current=shift_2114.current_shift
    original_track=tela_2114.Tela2114._query_response_tracker
    reads=[{'kind':'extjs_store','grid_id':'g','frame_url':'MES','rows':[{'Lot Id':'OTHER-BOARD'}],'store_loading':False},
       {'kind':'extjs_store','grid_id':'g','frame_url':'MES','rows':[
        {'Lot Id':'002527005C0535F300007060','Defect Hist Seq':'0',
          'Defect Code':'GN01-TX02','Defect Description':'Antenna: ANT1 test failed','Defect Type':'MainBoard'},
        {'Lot Id':'002527005C0535F300007060','Defect Hist Seq':'1',
          'Defect Code':'GN01-TX02','Defect Description':'Antenna: ANT1 test failed','Defect Type':'MainBoard'}
       ],'store_loading':False}]
    trace=[]
    def mock_grid(*args,**kwargs):
        trace.append('grid')
        return reads[0] if len(trace)==1 else reads[1]
    try:
        tela_2114.extract_best_grid=mock_grid
        tela_2114._safe_input_value=lambda page,name:'1st Shift' if name=='desc' else ''
        shift_2114.current_shift=lambda now=None:('1','1st Shift')
        shift_2114.ensure_shift=lambda *args,**kw:(_ for _ in ()).throw(AssertionError('lookup already committed'))
        tela_2114.Tela2114._query_response_tracker=staticmethod(lambda *args,**kw:None)
        t=tela_2114.Tela2114.__new__(tela_2114.Tela2114)
        t._page=lambda:page
        result=t.consultar('002527005C0535F300007060',timeout_s=.5)
        assert result['summary']['histories_total']==2, result
        assert result['summary']['mainboard']==2
        assert len(trace)==2,'must finish on first exact-PCBA grid update without waiting for a load event'
    finally:
        tela_2114.extract_best_grid=original_grid
        tela_2114._safe_input_value=original_safe
        shift_2114.ensure_shift=original_shift
        shift_2114.current_shift=original_current
        tela_2114.Tela2114._query_response_tracker=original_track


def test_2114_shift_lookup_on_first_board_only():
    from ames import tela_2114
    original_grid=tela_2114.extract_best_grid
    original_safe=tela_2114._safe_input_value
    original_shift=shift_2114.ensure_shift
    original_current=shift_2114.current_shift
    original_track=tela_2114.Tela2114._query_response_tracker
    state={'shift':'','lookup_count':0}
    class SN:
        def count(self):return 1
        @property
        def first(self):return self
        def fill(self,value,**kw):self.value=value
        def focus(self,**kw):pass
    class P:
        frames=[]
        keyboard=type('K',(),{'press':lambda self,key:None})()
        def __init__(self):self.sn=SN()
        def locator(self,selector):return self.sn
    page=P()
    try:
        tela_2114._safe_input_value=lambda page,name:state['shift'] if name=='desc' else ''
        shift_2114.current_shift=lambda now=None:('1','1st Shift')
        def select(*args,**kw):
            state['lookup_count']+=1
            state['shift']='1st Shift'
            return state['shift']
        shift_2114.ensure_shift=select
        tela_2114.Tela2114._query_response_tracker=staticmethod(lambda *args,**kw:None)
        tela_2114.extract_best_grid=lambda page,**kw:{
            'kind':'extjs_store','grid_id':'grid','rows':[{'Lot Id':page.sn.value,
            'Defect Hist Seq':'0','Defect Code':'GN01-TX02'}],'store_loading':False}
        obj=tela_2114.Tela2114.__new__(tela_2114.Tela2114)
        obj._page=lambda:page
        obj.consultar('BOARD-ONE',timeout_s=.5)
        obj.consultar('BOARD-TWO',timeout_s=.5)
        assert state['lookup_count']==1,'never reopen Shift lookup per PCBA'
    finally:
        tela_2114.extract_best_grid=original_grid
        tela_2114._safe_input_value=original_safe
        shift_2114.ensure_shift=original_shift
        shift_2114.current_shift=original_current
        tela_2114.Tela2114._query_response_tracker=original_track


def test_hist_seq_zero_is_not_replaced_by_grid_position():
    # The physical 2114 has Hist Seq 0/1 for the same antenna failure.
    # The MES grid may be sorted newest-first; 0 must still be older.
    rows = [
        {'Defect Hist Seq': '1', 'Defect Code': 'GN01-TX02',
         'Defect Description': 'Antenna: ANT1 test failed'},
        {'Defect Hist Seq': '0', 'Defect Code': 'GN01-TX02',
         'Defect Description': 'Antenna: ANT1 test failed'},
    ]
    selected = selecionar_ocorrencia_atual('', '', rows)
    assert selected['current_history'] is rows[0]
    assert selected['prior_histories'] == [rows[1]]
    assert selected['current_seq'] == '1'
    result = analisar_historico_pcba_atual('GN01-TX02', 'Antenna: ANT1 test failed', rows)
    assert result['same_repetitions'] == 1, 'reused PCBA must be classified as same failure'
    assert result['status'] == 'MESMA_FALHA_REPETIDA'

def main():
    tests = [
        test_shift_waits_for_committed_confirmation,
        test_navigation_shift_is_nonfatal_unless_strict,
        test_unconfirmed_shift_returns_partial_without_querying_2114,
        test_one_2114_error_does_not_abort_remaining_targets,
        test_completed_checkpoint_is_requeried_on_new_explicit_trace,
        test_partial_checkpoint_resumes_only_unfinished_pcba,
        test_2114_exact_lot_without_extjs_load_is_fast,
        test_2114_shift_lookup_on_first_board_only,
        test_hist_seq_zero_is_not_replaced_by_grid_position,
    ]
    for test in tests:
        test()
        print(f"PASS {test.__name__}")
    print(f"2114 shift/partial contracts: {len(tests)}/{len(tests)} PASS")


if __name__ == "__main__":
    main()
