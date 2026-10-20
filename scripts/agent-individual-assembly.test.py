"""Live individual SN lookup must never traverse every historical 3074 item."""
import sys
import unittest
import importlib
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"ames"/"factory-engine"))
sys.path.insert(0,str(ROOT/"ames"/"agent"))
from core import correlacao_falhas, temporal_3074
from ames import tela_3074 as original_3074
import engine_bridge

DEFECT="2026-10-19 10:00:00"
def r(sn,b,u="",status="Y",typ="Screen"):
    return {"Barcode":sn,"Sn Type":typ,"Bind Time":b,"Unbind Time":u,
            "Iss Status":status,"Operation":"A5162","Line Id":"TAN10103","Product Model":"CPH2817"}
class Browser:
    def __init__(self,*args):self._target=object()
    def connect(self):return self
    def disconnect(self):pass
class Navigation:
    def __init__(self,*args):pass
    def ensure_3074(self):pass
    def ensure_2114(self):return object()
    def ensure_current_shift_2114(self,*args):return "1st Shift"
class Screen3074:
    calls=[]
    def __init__(self,*args):pass
    def consultar(self,sn):
        Screen3074.calls.append(sn)
        if sn=="CUR":return {"rows":[
          r("M1","2026-10-19T12:00:00Z","2026-10-19T14:00:00Z","N"),
          r("M2","2026-10-19T16:00:00Z","","Y"),
          r("M3","2026-10-19T12:00:00Z","","N"),
          r("UNRELATED","2026-10-01T12:00:00Z","2026-10-02T12:00:00Z","N",typ="PCBA")]}
        if sn=="M1":return {"rows":[r("OLD","2026-10-10T12:00:00Z",typ="PCBA"),
                                     r("CUR","2026-10-19T12:00:00Z",typ="PCBA")]}
        raise AssertionError("unexpected 3074 query "+sn)
class Screen2114:
    anchor=True
    calls=[]
    def __init__(self,*args):pass
    def consultar(self,sn):
        Screen2114.calls.append(sn)
        row={"Defect Hist Seq":"0","Defect Code":"D1",
             "Defect Description":"Camera: Offset","Repair Status":"N",
             "Defect Time":DEFECT if Screen2114.anchor else ""}
        return {"rows":[row],"no_data":False,"model":"CPH2817"}
def fake_module(name):
    if name=="ames.browser":return SimpleNamespace(AmesBrowser=Browser)
    if name=="ames.navigation":return SimpleNamespace(AmesNavigation=Navigation)
    if name=="ames.tela_3074":return SimpleNamespace(Tela3074=Screen3074,componentes_serializados=original_3074.componentes_serializados,pcbas_historicas=original_3074.pcbas_historicas)
    if name=="ames.tela_2114":return SimpleNamespace(Tela2114=Screen2114)
    if name=="ames.tela_3022":return SimpleNamespace(Tela3022=object)
    if name=="core.correlacao_falhas":return correlacao_falhas
    if name=="core.temporal_3074":return temporal_3074
    raise AssertionError("unplanned import: "+name)
class IndividualAssemblyTests(unittest.TestCase):
    def setUp(self):
        Screen3074.calls=[]
        Screen2114.calls=[]
        Screen2114.anchor=True
    def lookup(self):
        with patch.object(engine_bridge.importlib,"import_module",side_effect=fake_module),patch.object(engine_bridge,"session_object",side_effect=lambda x:x):
            return engine_bridge.run_individual_lookup(ROOT/"ames"/"factory-engine","CUR",include_3022=False)
    def test_restricts_live_item_queries_to_latest_2114_fault_instant(self):
        output=self.lookup()
        self.assertEqual(Screen3074.calls,["CUR","M1"])
        self.assertEqual(Screen2114.calls,["CUR","OLD"],"unrelated PCBA history must not be queried")
        self.assertEqual(output["trace_3074"]["material_selection"]["status"],"selected_at_latest_2114_candidate")
        self.assertEqual([c["item_sn"] for c in output["trace_3074"]["components"]],["M1"])
        self.assertEqual(output["trace_3074"]["component_usage"][0]["previous_pcbas"],["OLD"])
        self.assertEqual(output["trace_3074"]["component_usage"][0]["station_3022_evidence"]["status"],"not_confirmed")
        self.assertEqual(output["summary"]["raw_historical_component_candidates"],3)
        self.assertEqual(output["summary"]["serialized_components"],1)
    def test_without_valid_2114_defect_clock_no_material_query(self):
        Screen2114.anchor=False
        out=self.lookup()
        self.assertEqual(Screen3074.calls,["CUR"])
        self.assertEqual(out["trace_3074"]["components"],[])
        self.assertEqual(out["trace_3074"]["component_usage"],[])
        self.assertEqual(out["trace_3074"]["material_selection"]["status"],"no_defect_anchor")
        self.assertTrue(out["warnings"])

if __name__=="__main__":unittest.main()
