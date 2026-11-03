import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from core.temporal_3074 import (montagem_principal_da_consulta,
    ciclos_fisicos_do_material, falhas_durante_vinculos_do_material,
    montagens_atual_e_ultima_falha)


DEFECT = "2026-10-22 10:00:00"  # factory -03:00 -> 13:00 UTC


def component(sn, bind, unbind="", status="N"):
    return {"Barcode": sn, "Sn Type": "Rear Camera", "Bind Time": bind,
            "Unbind Time": unbind, "Iss Status": status, "Operation": "A5150"}


class MountingCycles(unittest.TestCase):
    def test_all_unlinked_reconstructs_last_failure_not_empty(self):
        old = component("CAM-OLD", "2026-10-22 09:00:00", "2026-10-22 15:00:00")
        result = montagem_principal_da_consulta([old], "BOARD", DEFECT)
        self.assertEqual(result["state"], "last_failure_assembly")
        self.assertEqual([v["item_sn"] for v in result["components"]], ["CAM-OLD"])

    def test_new_cycle_only_current_y_is_main(self):
        old = component("CAM-OLD", "2026-10-22 09:00:00", "2026-10-22 15:00:00")
        new = component("CAM-NEW", "2026-10-23 09:00:00", status="Y")
        result = montagem_principal_da_consulta([old, new], "BOARD", DEFECT)
        self.assertEqual(result["state"], "current_new_cycle")
        self.assertEqual([v["item_sn"] for v in result["components"]], ["CAM-NEW"])
        self.assertEqual([v["item_sn"] for v in result["history"]], ["CAM-OLD"])

    def test_compare_keeps_old_lcd_at_last_failure_and_new_lcd_current(self):
        old = component("LCD-OLD", "2026-10-22 09:00:00", "2026-10-22 15:00:00")
        new = component("LCD-NEW", "2026-10-23 09:00:00", status="Y")
        scopes = montagens_atual_e_ultima_falha([old, new], "BOARD", DEFECT)
        self.assertEqual([x['item_sn'] for x in scopes['current']['components']], ['LCD-NEW'])
        self.assertEqual([x['item_sn'] for x in scopes['last_failure']['components']], ['LCD-OLD'])
        self.assertEqual(scopes['comparison']['only_last_failure'], ['LCD-OLD'])
        self.assertEqual(scopes['comparison']['only_current'], ['LCD-NEW'])

    def test_compare_does_not_invent_current_when_only_historical_exists(self):
        old = component('LCD-OLD', '2026-10-22 09:00:00', '2026-10-22 15:00:00')
        scopes = montagens_atual_e_ultima_falha([old], 'BOARD', DEFECT)
        self.assertEqual(scopes['current']['components'], [])
        self.assertEqual([x['item_sn'] for x in scopes['last_failure']['components']], ['LCD-OLD'])

    def test_current_same_cycle_has_no_duplicate_old_assembly(self):
        live = component("CAM-LIVE", "2026-10-22 09:00:00", status="Y")
        result = montagem_principal_da_consulta([live, dict(live)], "BOARD", DEFECT)
        self.assertEqual(result["state"], "current_same_cycle")
        self.assertEqual(len(result["components"]), 1)

    def test_current_mounting_without_2114_failure_is_present_but_unanchored(self):
        live = component("CAM-NO-FAILURE", "2026-10-23 09:00:00", status="Y")
        result = montagem_principal_da_consulta([live], "BOARD", None)
        self.assertEqual(result["state"], "current_cycle_unanchored")
        self.assertEqual([v["item_sn"] for v in result["components"]], ["CAM-NO-FAILURE"])

    def test_ambiguous_y_cannot_make_old_failure_the_main_cycle(self):
        unknown = component("CAM-UNKNOWN", "", status="Y")
        old = component("CAM-OLD", "2026-10-22 09:00:00", "2026-10-22 15:00:00")
        result = montagem_principal_da_consulta([unknown, old], "BOARD", DEFECT)
        self.assertEqual(result["state"], "indeterminate")
        self.assertEqual(result["components"], [])
        self.assertEqual(result["candidates"][0]["item_sn"], "CAM-UNKNOWN")

    def test_unlinked_missing_unbind_time_stays_candidate(self):
        row = component("CAM-N", "2026-10-22 09:00:00", status="N")
        result = montagem_principal_da_consulta([row], "BOARD", DEFECT)
        self.assertEqual(result["state"], "last_failure_assembly")
        self.assertEqual(result["components"], [])
        self.assertEqual(result["candidates"][0]["temporal_reason"],
                         "unlinked_now_missing_unbind_time")

    def test_conflicting_open_y_intervals_are_not_silently_deduplicated(self):
        first = component("CAM-1", "2026-10-23 09:00:00", status="Y")
        second = component("CAM-1", "2026-10-23 10:00:00", status="Y")
        result = montagem_principal_da_consulta([first, second], "BOARD", DEFECT)
        self.assertEqual(result["state"], "indeterminate")
        self.assertEqual(len(result["candidates"]), 2)


class MaterialLookup(unittest.TestCase):
    @staticmethod
    def row(pcba, bind, unbind="", status="N"):
        return {"Barcode": pcba, "Sn Type": "PCBA", "Bind Time": bind,
                "Unbind Time": unbind, "Iss Status": status}

    @staticmethod
    def fault(code, when, seq):
        return {"Defect Code": code, "Defect Description": "Camera not working",
                "Defect Time": when, "Defect Hist Seq": str(seq)}

    def test_one_material_two_pcba_failures_temporally_proven(self):
        rows = [self.row("BOARD-A", "2026-10-20 09:00:00", "2026-10-21 18:00:00"),
                self.row("BOARD-B", "2026-10-22 09:00:00", "", "Y")]
        cycles = ciclos_fisicos_do_material(rows)
        histories = {"BOARD-A": [self.fault("GN-CAM", "2026-10-21 10:00:00", 1)],
                     "BOARD-B": [self.fault("GN-CAM", "2026-10-22 10:00:00", 2)]}
        linked = falhas_durante_vinculos_do_material(cycles, histories)
        self.assertEqual([v["pcba_sn"] for v in linked["proven"]], ["BOARD-A", "BOARD-B"])
        self.assertEqual(linked["candidates"], [])

    def test_fault_before_binding_or_after_unbinding_not_attributed(self):
        row = self.row("BOARD-A", "2026-10-20 09:00:00", "2026-10-21 18:00:00")
        hist = [self.fault("EARLY", "2026-10-19 10:00:00", 1),
                self.fault("LATE", "2026-10-22 10:00:00", 2)]
        result = falhas_durante_vinculos_do_material(ciclos_fisicos_do_material([row]), {"BOARD-A": hist})
        self.assertEqual(result["proven"], [])
        self.assertEqual(len(result["excluded"]), 2)

    def test_unknown_unbind_on_n_remains_candidate_and_duplicate_rows_not_uses(self):
        row = self.row("BOARD-A", "2026-10-20 09:00:00", status="N")
        cycles = ciclos_fisicos_do_material([row, dict(row)])
        self.assertEqual(len(cycles), 1)
        self.assertEqual(cycles[0]["event_count"], 2)
        linked = falhas_durante_vinculos_do_material(cycles, {"BOARD-A": [self.fault("CAM", "2026-10-21 10:00:00", 1)]})
        self.assertEqual(len(linked["candidates"]), 1)
        self.assertEqual(linked["proven"], [])

    def test_rebinding_same_pcba_counts_distinct_physical_cycles(self):
        first = self.row("BOARD-A", "2026-10-20 09:00:00", "2026-10-20 18:00:00")
        again = self.row("BOARD-A", "2026-10-21 09:00:00", "", "Y")
        cycles = ciclos_fisicos_do_material([first, again])
        self.assertEqual(len(cycles), 2)

    def test_conflicting_y_n_snapshot_without_unbind_cannot_prove_failure(self):
        old = self.row("BOARD-A", "2026-10-20 09:00:00", status="N")
        current = self.row("BOARD-A", "2026-10-20 09:00:00", status="Y")
        cycles = ciclos_fisicos_do_material([old, current])
        self.assertTrue(cycles[0]["status_conflict"])
        linked = falhas_durante_vinculos_do_material(cycles,
            {"BOARD-A": [self.fault("CAM", "2026-10-21 10:00:00", 1)]})
        self.assertEqual(linked["proven"], [])
        self.assertEqual(len(linked["candidates"]), 1)


if __name__ == "__main__":
    unittest.main()
