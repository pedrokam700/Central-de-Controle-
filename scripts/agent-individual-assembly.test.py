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
    fail_3074=False
    def __init__(self,*args):pass
    def ensure_3074(self):
        if self.fail_3074:raise RuntimeError("3074 view unavailable")
    def ensure_2114(self):return object()
    def ensure_current_shift_2114(self,*args):return "1st Shift"
    def ensure_3022(self):return object()
class Screen3074:
    calls=[]
    response_mode="normal"
    def __init__(self,*args):pass
    def consultar(self,sn):
        Screen3074.calls.append(sn)
        if self.response_mode=="timeout":raise TimeoutError("3074 query timed out")
        if self.response_mode=="invalid":return {"unexpected":"not a grid"}
        if self.response_mode=="unproven_empty":return {"rows":[]}
        if self.response_mode=="confirmed_empty":return {"rows":[],"no_data":True}
        if self.response_mode=="components_only" and sn=="CUR":
            return {"rows":[r("M2","2026-10-19T16:00:00Z","","Y")]}
        if sn=="CUR":return {"rows":[
          r("M1","2026-10-19T12:00:00Z","2026-10-19T14:00:00Z","N"),
          r("M2","2026-10-19T16:00:00Z","","Y"),
          r("M3","2026-10-19T12:00:00Z","","N"),
          r("UNRELATED","2026-10-01T12:00:00Z","2026-10-02T12:00:00Z","N",typ="PCBA")]}
        if sn=="M1":return {"rows":[r("OLD","2026-10-10T12:00:00Z",typ="PCBA"),
                                     r("CUR","2026-10-19T12:00:00Z",typ="PCBA")]}
        if sn=="M2":return {"rows":[r("CUR","2026-10-19T16:00:00Z",typ="PCBA")]}
        raise AssertionError("unexpected 3074 query "+sn)
class Screen2114:
    anchor=True
    no_history=False
    calls=[]
    def __init__(self,*args):pass
    def consultar(self,sn):
        Screen2114.calls.append(sn)
        if self.no_history:return {"rows":[],"no_data":True,"model":"CPH2817"}
        row={"Defect Hist Seq":"0","Defect Code":"D1",
             "Defect Description":"Camera: Offset","Repair Status":"N",
             "Defect Time":DEFECT if Screen2114.anchor else ""}
        return {"rows":[row],"no_data":False,"model":"CPH2817"}
class Screen3022:
    calls=[]
    def __init__(self,*args):pass
    def consultar(self,sn):
        Screen3022.calls.append(sn)
        return {"rows":[{"Working Oper":"A5150","Tran Time":"2026-10-19 11:00:00"}],"process_passages":[]}
def fake_module(name):
    if name=="ames.browser":return SimpleNamespace(AmesBrowser=Browser)
    if name=="ames.navigation":return SimpleNamespace(AmesNavigation=Navigation)
    if name=="ames.tela_3074":return SimpleNamespace(Tela3074=Screen3074,componentes_serializados=original_3074.componentes_serializados,pcbas_historicas=original_3074.pcbas_historicas)
    if name=="ames.tela_2114":return SimpleNamespace(Tela2114=Screen2114)
    if name=="ames.tela_3022":return SimpleNamespace(Tela3022=Screen3022)
    if name=="core.correlacao_falhas":return correlacao_falhas
    if name=="core.temporal_3074":return temporal_3074
    raise AssertionError("unplanned import: "+name)
class IndividualAssemblyTests(unittest.TestCase):
    def setUp(self):
        Screen3074.calls=[]
        Screen3074.response_mode="normal"
        Navigation.fail_3074=False
        Screen2114.calls=[]
        Screen2114.anchor=True
        Screen2114.no_history=False
        Screen3022.calls=[]
    def lookup(self,include_3022=False,sn="CUR"):
        with patch.object(engine_bridge.importlib,"import_module",side_effect=fake_module),patch.object(engine_bridge,"session_object",side_effect=lambda x:x):
            return engine_bridge.run_individual_lookup(ROOT/"ames"/"factory-engine",sn,include_3022=include_3022)
    def test_type_classifier_requires_consistent_evidence_without_2114(self):
        classify=engine_bridge.classify_individual_sn_target
        related=[r("OLD","2026-10-19T12:00:00Z",typ="PCBA"),r("NEW","2026-10-19T14:00:00Z",typ="PCBA")]
        materials=[r("M2","2026-10-19T12:00:00Z",typ="Rear Camera")]
        self.assertEqual(classify("CUR",related,False)["type"],"MATERIAL_SN")
        self.assertEqual(classify("CUR",materials,False)["type"],"PCBA")
        self.assertEqual(classify("CUR",materials+related,False)["type"],"SN_INDETERMINADO")
        self.assertEqual(classify("CUR",[],False)["type"],"SN_INDETERMINADO")
        self.assertEqual(classify("CUR",[{"Barcode":"CUR","Sn Type":"PCBA"}],False)["type"],"PCBA")
        self.assertEqual(classify("CUR",materials+related,True)["type"],"PCBA")
        self.assertEqual(classify("CUR",[{"Barcode":"OLD"}],False)["type"],"SN_INDETERMINADO")
    def test_without_2114_component_only_3074_still_identifies_pcba(self):
        Screen2114.no_history=True
        Screen3074.response_mode="components_only"
        out=self.lookup()
        self.assertEqual(out["detected_type"],"PCBA")
        self.assertEqual(out["detected_type_basis"],"3074_ONLY_LINKED_COMPONENTS")
        self.assertEqual([c["item_sn"] for c in out["trace_3074"]["components"]],["M2"])
        self.assertIsNone(out["trace_2114"]["current_failure"])
    def test_without_2114_material_lookup_still_identifies_material(self):
        Screen2114.no_history=True
        out=self.lookup(sn="M1")
        self.assertEqual(out["detected_type"],"MATERIAL_SN")
        self.assertEqual(out["detected_type_basis"],"3074_ONLY_RELATED_PCBAS")
        self.assertIsNotNone(out["material_investigation"])
    def test_without_2114_mixed_grid_keeps_type_unproven(self):
        Screen2114.no_history=True
        out=self.lookup()
        self.assertEqual(out["detected_type"],"SN_INDETERMINADO")
        self.assertEqual(out["detected_type_basis"],"3074_MIXED_ROW_TYPES")
        self.assertEqual(out["trace_3074"]["components"],[])
    def test_current_new_mounting_supersedes_old_failure_materials(self):
        output=self.lookup()
        self.assertEqual(Screen3074.calls,["CUR","M2"])
        self.assertEqual(Screen2114.calls,["CUR"],"old failure material must not be traversed in new cycle")
        self.assertEqual(output["trace_3074"]["material_selection"]["status"],"current_mounting_new_cycle")
        self.assertEqual([c["item_sn"] for c in output["trace_3074"]["components"]],["M2"])
        self.assertEqual(output["trace_3074"]["component_usage"][0]["previous_pcbas"],[])
        self.assertEqual(output["trace_3074"]["component_usage"][0]["station_3022_evidence"]["status"],"unavailable")
        self.assertEqual(output["summary"]["raw_historical_component_candidates"],3)
        self.assertEqual(output["summary"]["serialized_components"],1)
    def test_without_valid_2114_defect_clock_only_current_mounting_is_queried(self):
        Screen2114.anchor=False
        out=self.lookup()
        self.assertEqual(Screen3074.calls,["CUR","M2"])
        self.assertEqual([c["item_sn"] for c in out["trace_3074"]["components"]],["M2"])
        self.assertEqual(out["trace_3074"]["component_usage"][0]["previous_pcbas"],[])
        self.assertEqual(out["trace_3074"]["material_selection"]["status"],"current_mounting_unanchored")
    def test_timeout_3074_does_not_abort_2114_or_3022_or_claim_zero_materials(self):
        Screen3074.response_mode="timeout"
        out=self.lookup(include_3022=True)
        self.assertEqual(Screen3074.calls,["CUR"])
        self.assertEqual(Screen2114.calls,["CUR"])
        self.assertEqual(Screen3022.calls,["CUR"])
        self.assertEqual(out["detected_type"],"PCBA")
        self.assertIsNotNone(out["trace_2114"]["current_failure"])
        self.assertEqual(out["trace_3022"]["pcbas"][0]["status"],"COMPLETE")
        self.assertEqual(out["trace_3074"]["status"],"error")
        self.assertEqual(out["trace_3074"]["error"],"3074_TIMEOUT")
        self.assertEqual(out["trace_3074"]["material_selection"]["status"],"not_collected")
        self.assertIsNone(out["trace_3074"]["query_row_count"])
        self.assertIsNone(out["summary"]["3074_rows"])
        self.assertIsNone(out["summary"]["reused_components"])
        self.assertFalse(out["trace_3074"]["query_no_data_confirmed"])
    def test_3074_navigation_failure_keeps_2114_history_and_explicit_diagnostic(self):
        Navigation.fail_3074=True
        out=self.lookup()
        self.assertEqual(Screen3074.calls,[])
        self.assertEqual(Screen2114.calls,["CUR"])
        self.assertEqual(out["trace_3074"]["error"],"3074_NAVIGATION_FAILED")
        self.assertEqual(out["trace_3074"]["query_stage"],"navigation")
        self.assertEqual(out["summary"]["2114_histories"],1)
    def test_malformed_3074_payload_cannot_prove_empty_grid(self):
        Screen3074.response_mode="invalid"
        out=self.lookup()
        self.assertEqual(out["trace_3074"]["error"],"3074_GRID_NOT_CONFIRMED")
        self.assertFalse(out["trace_3074"]["query_no_data_confirmed"])
        self.assertIsNone(out["trace_3074"]["query_row_count"])
        self.assertEqual(out["summary"]["2114_histories"],1)
    def test_empty_3074_without_no_data_proof_is_an_error_not_confirmed_zero(self):
        Screen3074.response_mode="unproven_empty"
        out=self.lookup()
        self.assertEqual(out["trace_3074"]["status"],"error")
        self.assertEqual(out["trace_3074"]["error"],"3074_GRID_NOT_CONFIRMED")
        self.assertIsNone(out["summary"]["3074_rows"])
        self.assertFalse(out["trace_3074"]["query_no_data_confirmed"])
        self.assertEqual(out["summary"]["2114_histories"],1)
    def test_explicit_confirmed_zero_3074_keeps_independent_2114(self):
        Screen3074.response_mode="confirmed_empty"
        out=self.lookup()
        self.assertEqual(out["trace_3074"]["status"],"complete")
        self.assertEqual(out["trace_3074"]["query_row_count"],0)
        self.assertTrue(out["trace_3074"]["query_no_data_confirmed"])
        self.assertEqual(out["summary"]["2114_histories"],1)

if __name__=="__main__":unittest.main()
