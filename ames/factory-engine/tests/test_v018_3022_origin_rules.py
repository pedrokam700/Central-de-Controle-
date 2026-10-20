import unittest
from pathlib import Path

from ames.tela_3022 import (
    normalizar_modo_registro,
    resolver_regra_referencia,
    correlacionar_falha_3022,
)

BASE = Path(__file__).resolve().parents[1]


def loop_rows():
    return [
        {"Working Oper Code":"A5201","Working Oper":"Screw/cover check","Current Oper Code":"A5162","Tran Desc":"END LOT","Tran Time":"2026-10-09 13:50:00+00:00","Hist Seq":"10"},
        {"Working Oper Code":"A5162","Working Oper":"Camera/cover assembly","Current Oper Code":"A5265","Tran Desc":"END LOT","Tran Time":"2026-10-09 14:00:00+00:00","Hist Seq":"11","Station":"TAN10103A516201"},
        {"Working Oper Code":"A7600","Working Oper":"Final appearance","Current Oper Code":"A7600","Tran Desc":"CHANGE CMF","Tran Desc English":"Manually enter bad records on mobile phones","Tran Time":"2026-10-09 15:00:00+00:00","Hist Seq":"12"},
        {"Working Oper Code":"A7600","Working Oper":"Final appearance","Current Oper Code":"A6900","Tran Desc":"REPAIR","TRAN CMF3":"Phone_Bat_Cover","Tran Time":"2026-10-09 15:20:00+00:00","Hist Seq":"13"},
        {"Working Oper Code":"A6900","Working Oper":"Repair","Current Oper Code":"A5201","Tran Desc":"REPAIR END","Tran Time":"2026-10-09 15:50:00+00:00","Hist Seq":"14"},
        {"Working Oper Code":"A5201","Working Oper":"Screw/cover check","Current Oper Code":"A5162","Tran Desc":"END LOT","Tran Time":"2026-10-09 16:00:00+00:00","Hist Seq":"15","Station":"TAN10103A520101"},
        {"Working Oper Code":"A5162","Working Oper":"Camera/cover assembly","Current Oper Code":"A5265","Tran Desc":"END LOT","Tran Time":"2026-10-09 16:10:00+00:00","Hist Seq":"16","Station":"TAN10103A516201"},
        {"Working Oper Code":"A7600","Working Oper":"Final appearance","Current Oper Code":"A7600","Tran Desc":"CHANGE CMF","Tran Desc English":"Manually enter bad records on mobile phones","Tran Time":"2026-10-09 17:00:00+00:00","Hist Seq":"17"},
    ]


class Test3022OriginRules(unittest.TestCase):
    def test_manual_auto_normalization(self):
        self.assertEqual(normalizar_modo_registro("Y"), "MANUAL")
        self.assertEqual(normalizar_modo_registro("Manual"), "MANUAL")
        self.assertEqual(normalizar_modo_registro("N"), "AUTOMATIC")
        self.assertEqual(normalizar_modo_registro("Automatic"), "AUTOMATIC")

    def test_camera_appearance_manual_maps_a5162(self):
        r = resolver_regra_referencia(BASE, product_model="CPH2817", defect_code="CAM", defect_desc="Rear camera impurity / mancha", manual_or_auto="Manual")
        self.assertEqual(r["rule_id"], "CAMERA_APPEARANCE_MANUAL_A5162")
        self.assertEqual(r["reference_stations"], ["A5162"])
        self.assertEqual(r["failure_family"], "CAMERA")

    def test_camera_automatic_does_not_force_appearance_rule(self):
        r = resolver_regra_referencia(BASE, product_model="CPH2817", defect_code="CAM", defect_desc="Rear camera failed", manual_or_auto="Automatic")
        self.assertEqual(r["rule_id"], "FUNCTIONAL_ASSEMBLY_A5150_MIDPOINT")
        self.assertEqual(r["reference_stations"], ["A5150"])
        self.assertEqual(r["reference_confidence"], "OPERATIONAL_ESTIMATE_NOT_CAUSE")

    def test_psensor_receiver_has_provisional_a5100_reference(self):
        r = resolver_regra_referencia(BASE, product_model="CPH2817", defect_code="PS", defect_desc="P-sensor proximity failed", manual_or_auto="Automatic")
        self.assertEqual(r["reference_stations"], ["A5100"])
        self.assertEqual(r["reference_confidence"], "PROVISIONAL_MODEL_DEPENDENT")

    def test_first_camera_failure_uses_old_a5162_not_future_rework(self):
        rec={"product_model":"CPH2817","defect_code":"CAM-IMP","defect_desc":"camera impurity","defect_time":"2026-10-09 15:05:00","manual_or_auto":"Manual"}
        r=correlacionar_falha_3022(BASE, loop_rows(), rec, registration_value="Manual", defect_local_offset_hours=0, event_naive_offset_hours=0)
        self.assertEqual(r["status"], "COMPLETE_REFERENCE")
        self.assertEqual(r["reference_process"]["operation_code"], "A5162")
        self.assertEqual(r["reference_process"]["hist_seq"], 11)
        self.assertEqual(r["reference_selection"]["prior_count"], 1)
        self.assertEqual(r["reference_selection"]["next_process"]["hist_seq"], 16)
        self.assertEqual(r["repair_cycle"]["repair_action_class"], "PHONE_BAT_COVER")
        self.assertEqual(r["repair_cycle"]["return_a5201"]["hist_seq"], 15)
        self.assertEqual(r["repair_cycle"]["next_reference_passage"]["hist_seq"], 16)

    def test_second_camera_failure_uses_new_a5162_cycle(self):
        rec={"product_model":"CPH2817","defect_code":"CAM-IMP","defect_desc":"camera impurity","defect_time":"2026-10-09 17:05:00","manual_or_auto":"Manual"}
        r=correlacionar_falha_3022(BASE, loop_rows(), rec, registration_value="Manual", defect_local_offset_hours=0, event_naive_offset_hours=0)
        self.assertEqual(r["reference_process"]["hist_seq"], 16)
        self.assertEqual(r["reference_selection"]["prior_count"], 2)

    def test_reference_and_previous_process_are_not_the_same_concept(self):
        rec={"product_model":"CPH2817","defect_code":"CAM-IMP","defect_desc":"camera mancha","defect_time":"2026-10-09 15:05:00","manual_or_auto":"Manual"}
        r=correlacionar_falha_3022(BASE, loop_rows(), rec, registration_value="Manual", defect_local_offset_hours=0, event_naive_offset_hours=0)
        self.assertEqual(r["reference_process"]["operation_code"], "A5162")
        # Last completed END LOT is still A5162 in this compact fixture; the API keeps
        # both fields separate so real A7600/test passages never become "origin" by accident.
        self.assertIn("previous_process", r)


if __name__ == '__main__':
    unittest.main()
