"""2026-10-20 operational reference: functional faults use A5150, not guessed root cause."""
import unittest
from pathlib import Path
from ames.tela_3022 import correlacionar_falha_3022,resolver_regra_referencia
BASE=Path(__file__).resolve().parents[1]

def passage(code,utc,seq):
    return {"Working Oper Code":code,"Current Oper Code":code,
            "Working Oper":code,"Tran Desc":"END LOT","Tran Time":utc,"Hist Seq":str(seq)}
def defect_marker(code,utc,seq,desc="Manually enter bad records on mobile phones"):
    return {"Working Oper Code":code,"Current Oper Code":code,
            "Tran Desc":"CHANGE CMF","Tran Desc English":desc,
            "Tran Time":utc,"Hist Seq":str(seq)}
def record(desc="SIM card anomaly",code="J606-KZ03",time="2026-10-20 11:59:16",mode="Manual"):
    return {"product_model":"CPH2819BR","pcba_sn":"PCBA-TEST",
            "defect_code":code,"defect_desc":desc,"defect_time":time,"manual_or_auto":mode}
def correlate(rows,rec=None):
    return correlacionar_falha_3022(BASE,rows,rec or record(),defect_local_offset_hours=-3,event_naive_offset_hours=0)

class MidpointReferenceTests(unittest.TestCase):
    def test_sim_manual_after_test_has_a5150_estimated_reference(self):
        rows=[passage("A5100","2026-10-20 11:20:00+00:00",1),
              passage("A5150","2026-10-20 11:30:00+00:00",2),
              passage("A5162","2026-10-20 11:35:00+00:00",3),
              passage("A5265","2026-10-20 14:30:00+00:00",4),
              defect_marker("A5265","2026-10-20 14:59:16+00:00",5)]
        result=correlate(rows)
        self.assertEqual(result["status"],"COMPLETE_REFERENCE")
        self.assertEqual(result["reference_rule_id"],"FUNCTIONAL_ASSEMBLY_A5150_MIDPOINT")
        self.assertEqual(result["reference_confidence"],"OPERATIONAL_ESTIMATE_NOT_CAUSE")
        self.assertEqual(result["reference_process"]["operation_code"],"A5150")
        self.assertEqual(result["reference_process"]["event_time_utc"],"2026-10-20T11:30:00+00:00")
        self.assertEqual(result["previous_process"]["operation_code"],"A5265")
    def test_known_functional_families_map_and_process_software_does_not(self):
        for desc,code in [("SIM card anomaly","SIM"),("NFC read failed","NFC"),
                          ("Bluetooth test fail","BLUETOOTH"),("Rear camera failed","CAM"),
                          ("Charging failed","CHARGING"),("j606-kz03","J606-KZ03")]:
            with self.subTest(desc=desc):
                r=resolver_regra_referencia(BASE,product_model="CPH2819BR",
                                            defect_code=code,defect_desc=desc,manual_or_auto="Manual")
                self.assertEqual(r["reference_stations"],["A5150"])
        for desc in ("Process: Skip station","Process: Inconsistent scheme/work order/version"):
            r=resolver_regra_referencia(BASE,product_model="CPH2819BR",
                                        defect_code="9999",defect_desc=desc,manual_or_auto="Automatic")
            self.assertEqual(r["reference_stations"],[])
    def test_assembly_registration_uses_actual_station_not_previous_working_oper(self):
        rows=[passage("A5150","2026-10-20 11:30:00+00:00",1),
              {"Working Oper Code":"A5112","Current Oper Code":"A5130",
               "Tran Desc":"CHANGE CMF","Tran Desc English":"Manually enter bad records on mobile phones",
               "Tran Time":"2026-10-20 14:59:15+00:00","Hist Seq":"2"}]
        result=correlate(rows)
        self.assertEqual(result["status"],"DIRECT_DEFECT_RECORDED_IN_ASSEMBLY")
        self.assertEqual(result["reference_process"]["operation_code"],"A5130")
        self.assertFalse(result["reference_process"]["completion_confirmed"])
        self.assertEqual(result["reference_confidence"],"OBSERVED_DEFECT_STATION_NOT_ROOT_CAUSE")
    def test_direct_assembly_overrides_camera_appearance_when_detected_here(self):
        rows=[passage("A5162","2026-10-20 13:00:00+00:00",1),
              defect_marker("A5117","2026-10-20 14:59:16+00:00",2)]
        r=correlate(rows,record("Camera impurity","CAM-IMP"))
        self.assertEqual(r["reference_process"]["operation_code"],"A5117")
        self.assertEqual(r["reference_rule_id"],"DIRECT_DEFECT_AT_ASSEMBLY_STATION")
    def test_no_assembly_stop_assumption_from_last_endlot_only(self):
        rows=[passage("A5130","2026-10-20 14:45:00+00:00",1)]
        r=correlate(rows)
        self.assertEqual(r["reference_stations"],["A5150"])
        self.assertIsNone(r["reference_process"])
        self.assertEqual(r["status"],"NO_PRIOR_REFERENCE_PASSAGE")
    def test_future_a5150_not_selected_and_rework_can_select_latest_before(self):
        rows=[passage("A5150","2026-10-20 11:00:00+00:00",1),
              passage("A5150","2026-10-20 14:15:00+00:00",2),
              passage("A5150","2026-10-20 16:00:00+00:00",3)]
        r=correlate(rows)
        self.assertEqual(r["reference_process"]["hist_seq"],2)
        self.assertEqual(r["reference_selection"]["prior_count"],2)
        self.assertEqual(r["reference_selection"]["future_count"],1)
    def test_ambiguous_assembly_markers_do_not_force_arbitrary_station(self):
        rows=[passage("A5150","2026-10-20 11:30:00+00:00",1),
              defect_marker("A5103","2026-10-20 14:59:10+00:00",2),
              defect_marker("A5120","2026-10-20 14:59:16+00:00",3)]
        r=correlate(rows)
        self.assertEqual(r["reference_process"]["operation_code"],"A5150")
        self.assertEqual(r["reference_confidence"],"OPERATIONAL_ESTIMATE_NOT_CAUSE")
    def test_camera_appearance_and_sensor_rules_stay_specialized_after_test(self):
        r=resolver_regra_referencia(BASE,product_model="CPH2817",defect_code="CAM",
            defect_desc="camera impurity",manual_or_auto="Manual")
        self.assertEqual(r["reference_stations"],["A5162"])
        r=resolver_regra_referencia(BASE,product_model="CPH2817",defect_code="PS",
            defect_desc="P-sensor proximity failed",manual_or_auto="Automatic")
        self.assertEqual(r["reference_stations"],["A5100"])

if __name__=="__main__":
    unittest.main()
