"""A-MES 3074 immutable occurrence-bound material scope; no physical MES calls."""
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"ames"/"factory-engine"))
sys.path.insert(0,str(ROOT/"ames"/"agent"))
from core.temporal_3074 import (componentes_no_momento_da_falha, corroborar_posto_3022)
from core.varredura_3074 import executar_varredura
import engine_bridge

DEFECT="2026-10-19 10:00:00"  # America/Sao_Paulo = 13:00Z
def row(sn,bind,unbind="",status="Y",typ="Screen",operation="A5162"):
    return {"Barcode":sn,"Sn Type":typ,"Bind Time":bind,
            "Unbind Time":unbind,"Iss Status":status,"Operation":operation,
            "Line Id":"TAN10103","Product Model":"CPH2817"}
GRID=[
    row("OLD","2026-10-19T09:00:00Z","2026-10-19T11:00:00Z","N"),
    row("M1","2026-10-19T12:00:00Z","2026-10-19T14:00:00Z","N"),
    row("M1","2026-10-19T12:00:00Z","2026-10-19T14:00:00Z","N",operation="A5200"),
    row("M2","2026-10-19T15:00:00Z","","Y"),  # remounted AFTER defect
    row("M3","2026-10-19T12:00:00Z","","N"),  # unbound now; unknown when
    row("M4","2026-10-19T12:00:00Z","2026-10-19T13:00:00Z","N"),
    row("M5","","","Y"),
    row("M6","2026-10-19T12:00:00Z","","Y",typ="Camera",operation="A5300"),
]
class Fake3074:
    def __init__(self):self.calls=[]
    def consultar(self,sn):
        self.calls.append(sn)
        if sn=="CUR":return {"rows":GRID}
        if sn=="M1":return {"rows":[row("OLDPCB","2026-10-10T10:00:00Z",typ="PCBA"),
                                      row("CUR","2026-10-19T12:00:00Z",typ="PCBA")]}
        if sn=="M6":return {"rows":[row("CUR","2026-10-19T12:00:00Z",typ="PCBA")]}
        raise AssertionError("out-of-scope 3074 material query: "+sn)

class AssemblyScopeTests(unittest.TestCase):
    def test_only_items_present_at_defect_even_after_at_unlinks_and_new_reassembly(self):
        result=componentes_no_momento_da_falha(GRID,"CUR",DEFECT)
        self.assertEqual({v["item_sn"] for v in result["active"]},{"M1","M6"})
        self.assertEqual(result["summary"]["ended_before_defect"],1)
        self.assertEqual(result["summary"]["bound_after_defect"],1)
        self.assertEqual(result["summary"]["boundary_ambiguous"],1)
        self.assertEqual(result["summary"]["time_unknown"],2)
        m1=next(x for x in result["active"] if x["item_sn"]=="M1")
        self.assertEqual(m1["iss_status_now"],"N")
        self.assertEqual(set(m1.get("binding_operations",[])),{"A5162","A5200"})
    def test_deep_scan_queries_only_selected_items_and_reuses_prior_pcba(self):
        fake=Fake3074()
        result=executar_varredura(fake,"CUR",DEFECT,pause_s=0)
        self.assertEqual(fake.calls,["CUR","M1","M6"])
        self.assertEqual(result["assembly_scope"]["selected_items"],2)
        self.assertEqual(result["assembly_scope"]["status"],"incomplete")
        m1=next(r for r in result["results"] if r["item_sn"]=="M1")
        self.assertEqual(m1["previous_pcbas"],["OLDPCB"])
        self.assertEqual(m1["status"],"SEGUNDO_USO_NO_MOMENTO_DA_FALHA")
        self.assertEqual(m1["binding_operation"],"A5162")
    def test_unverified_material_query_never_promotes_previous_boards(self):
        class Bad(Fake3074):
            def consultar(self,sn):
                if sn=="M1":
                    self.calls.append(sn)
                    return {"rows":[row("OLDPCB","2026-10-10T10:00:00Z",typ="PCBA")]}
                return super().consultar(sn)
        result=executar_varredura(Bad(),"CUR",DEFECT,pause_s=0)
        item=next(x for x in result["results"] if x["item_sn"]=="M1")
        self.assertFalse(item["current_pcba_confirmed"])
        self.assertIsNone(item["previous_pcba_count"])
        self.assertEqual(item["previous_pcbas"],[])
        self.assertEqual(item["unverified_previous_pcbas"],["OLDPCB"])
    def test_station_requires_same_pcba_completed_working_oper_inside_interval(self):
        item={"binding_operation":"A5162","bind_time_utc":"2026-10-19T12:00:00+00:00"}
        events=[
          {"pcba_sn":"OTHER","working_oper_code":"A5162","tran_desc":"END LOT","event_time":"2026-10-19T12:20:00Z"},
          {"pcba_sn":"CUR","operation_code":"A5162","tran_desc":"END LOT","event_time":"2026-10-19T12:21:00Z"},
          {"pcba_sn":"CUR","working_oper_code":"A5162","tran_desc":"REPAIR","event_time":"2026-10-19T12:22:00Z"},
          {"pcba_sn":"CUR","working_oper_code":"A5162","tran_desc":"END LOT","event_time":"2026-10-19T14:20:00Z"},
        ]
        self.assertEqual(corroborar_posto_3022(item,events,"CUR",DEFECT)["status"],"not_confirmed")
        events.append({"pcba_sn":"CUR","working_oper_code":"A5162","tran_desc":"END LOT","event_time":"2026-10-19T12:30:00Z"})
        valid=corroborar_posto_3022(item,events,"CUR",DEFECT)
        self.assertEqual(valid["status"],"corroborated")
        self.assertEqual(valid["station_3074"],"A5162")
    def test_invalid_or_contradictory_timestamps_fail_closed(self):
        bad=[row("X","2026-10-19T13:30:00Z","2026-10-19T11:00:00Z"),
             row("Y","not a date","","Y")]
        result=componentes_no_momento_da_falha(bad,"CUR",DEFECT)
        self.assertEqual(result["active"],[])
        self.assertEqual(result["summary"]["time_unknown"],2)

if __name__=="__main__":unittest.main()
