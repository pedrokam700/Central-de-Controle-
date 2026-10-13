import unittest

from ames.tela_3022 import (
    preparar_foco_montagem_teste,
    selecionar_passagem_anterior,
    selecionar_processo_anterior,
    extrair_passagens_processo,
)


class Test3022Focus(unittest.TestCase):
    def test_a5700_concluido_separa_foco_de_packing_sem_apagar_raw(self):
        rows = [
            {"Working Oper Code": "A5265", "Working Oper": "First test", "Current Oper Code": "A5700", "Tran Desc": "END LOT", "Tran Time": "2026-10-09 08:00:00", "Hist Seq":"1"},
            {"Working Oper Code": "A5700", "Working Oper": "Final test", "Current Oper Code": "K6070", "Tran Desc": "END LOT", "Tran Time": "2026-10-09 09:00:00", "Hist Seq":"2"},
            {"Working Oper Code": "K6070", "Working Oper": "Packing", "Current Oper Code": "K6081", "Tran Desc": "END LOT", "Tran Time": "2026-10-09 09:10:00", "Hist Seq":"3"},
        ]
        r = preparar_foco_montagem_teste(rows)
        self.assertTrue(r["boundary_found"])
        self.assertTrue(r["a5700_completed"])
        self.assertEqual(r["phase_status"], "AFTER_A5700")
        self.assertEqual(r["all_count"], 3)
        self.assertEqual(r["focus_count"], 2)
        self.assertEqual(r["post_test_count"], 1)
        self.assertEqual(r["boundary_hist_seq"], 2)

    def test_chegar_em_a5700_nao_significa_concluir_a5700(self):
        # Caso real observado: A7600 END LOT -> Current Oper=A5700. A unidade
        # chegou ao A5700, mas ainda não existe Working Oper=A5700 concluído.
        rows = [
            {"Working Oper Code":"A5240","Current Oper Code":"A7600","Tran Desc":"END LOT","Tran Time":"2026-10-09 15:20:07+00:00","Hist Seq":"39"},
            {"Working Oper Code":"A5117","Current Oper Code":"A7600","Tran Desc":"END LOT","Tran Time":"2026-10-09 15:23:27+00:00","Hist Seq":"40"},
            {"Working Oper Code":"A7600","Current Oper Code":"A5700","Tran Desc":"END LOT","Tran Time":"2026-10-09 15:25:23+00:00","Hist Seq":"41"},
        ]
        r = preparar_foco_montagem_teste(rows)
        self.assertTrue(r["a5700_reached"])
        self.assertFalse(r["a5700_completed"])
        self.assertFalse(r["boundary_found"])
        self.assertEqual(r["phase_status"], "AT_A5700")
        self.assertEqual(r["focus_count"], 3)
        self.assertEqual(r["post_test_count"], 0)

    def test_fqc_em_a5700_nao_fecha_fronteira_antes_do_end_lot(self):
        rows = [
            {"Working Oper Code":"A7600","Current Oper Code":"A5700","Tran Desc":"END LOT","Tran Time":"2026-09-18 03:39:20+00:00","Hist Seq":"60"},
            {"Working Oper Code":"A5700","Current Oper Code":"A5700","Tran Desc":"CHANGE CMF","TRAN CMF3":"抽检结果：OK","Tran Time":"2026-09-18 03:51:41+00:00","Hist Seq":"61"},
            {"Working Oper Code":"A5700","Current Oper Code":"K6070","Tran Desc":"END LOT","Tran Time":"2026-09-18 04:10:20+00:00","Hist Seq":"62"},
            {"Working Oper Code":"K6070","Current Oper Code":"K6070","Tran Desc":"MO_MAPPING","Tran Time":"2026-09-18 04:10:20+00:00","Hist Seq":"63"},
        ]
        r = preparar_foco_montagem_teste(rows)
        self.assertTrue(r["boundary_found"])
        self.assertEqual(r["boundary_hist_seq"], 62)
        self.assertEqual(r["focus_count"], 3)
        self.assertEqual(r["post_test_count"], 1)

    def test_sem_a5700_nao_esconde_nada(self):
        rows = [
            {"Working Oper Code": "A5202", "Current Oper Code":"A5265", "Tran Desc":"END LOT", "Tran Time": "2026-10-09 08:00:00"},
            {"Working Oper Code": "A5265", "Current Oper Code":"A5360", "Tran Desc":"END LOT", "Tran Time": "2026-10-09 09:00:00"},
            {"Working Oper Code": "A5360", "Current Oper Code":"A6900", "Tran Desc":"REPAIR", "Tran Time": "2026-10-09 10:00:00"},
        ]
        r = preparar_foco_montagem_teste(rows)
        self.assertFalse(r["boundary_found"])
        self.assertFalse(r["a5700_reached"])
        self.assertEqual(r["phase_status"], "BEFORE_A5700")
        self.assertEqual(r["focus_count"], 3)
        self.assertEqual(r["post_test_count"], 0)

    def test_transicao_real_a5700_working_oper_e_hist_seq(self):
        rows = [
            {"Working Oper Code": "K6070", "Current Oper Code": "K6081", "Tran Desc":"END LOT", "Tran Time": "2026-09-18 04:10:21", "Hist Seq": "64"},
            {"Working Oper Code": "K6070", "Current Oper Code": "K6070", "Tran Desc":"MO_MAPPING", "Tran Time": "2026-09-18 04:10:20", "Hist Seq": "63"},
            {"Working Oper Code": "A5700", "Current Oper Code": "K6070", "Tran Desc":"END LOT", "Tran Time": "2026-09-18 04:10:20", "Hist Seq": "62"},
            {"Working Oper Code": "A5700", "Current Oper Code": "A5700", "Tran Desc":"CHANGE CMF", "Tran Time": "2026-09-18 03:51:41", "Hist Seq": "61"},
            {"Working Oper Code": "A7600", "Current Oper Code": "A5700", "Tran Desc":"END LOT", "Tran Time": "2026-09-18 03:39:20", "Hist Seq": "60"},
        ]
        r = preparar_foco_montagem_teste(rows)
        self.assertTrue(r["boundary_found"])
        self.assertEqual(r["boundary_hist_seq"], 62)
        self.assertEqual(r["boundary_event_time"], "2026-09-18 04:10:20")
        self.assertEqual(r["focus_count"], 3)
        self.assertEqual(r["post_test_count"], 2)

    def test_process_passages_ignora_change_cmf_repair_e_mapping(self):
        rows = [
            {"Working Oper Code":"A5202","Working Oper":"Assembly current","Current Oper Code":"A5279","Tran Desc":"END LOT","Tran Time":"2026-09-28 18:00:00","Hist Seq":"10"},
            {"Working Oper Code":"A5360","Working Oper":"Antenna test","Current Oper Code":"A5360","Tran Desc":"CHANGE CMF","TRAN CMF3":"FAIL","Tran Time":"2026-09-28 18:10:00","Hist Seq":"11"},
            {"Working Oper Code":"A5360","Working Oper":"Antenna test","Current Oper Code":"A6900","Tran Desc":"REPAIR","Tran Time":"2026-09-28 18:20:00","Hist Seq":"12"},
            {"Working Oper Code":"A6900","Working Oper":"Export Repair","Current Oper Code":"A6900","Tran Desc":"MO_MAPPING","Tran Time":"2026-09-28 18:30:00","Hist Seq":"13"},
        ]
        p = extrair_passagens_processo(rows)
        self.assertEqual(len(p), 1)
        self.assertEqual(p[0]["operation_code"], "A5202")

    def test_defect_time_utc_menos3_escolhe_ultimo_end_lot_anterior(self):
        rows = [
            {"Working Oper Code":"A5202","Working Oper":"Assembly current","Current Oper Code":"A5279","Tran Desc":"END LOT","Tran Time":"2026-09-28 19:50:00+00:00","Hist Seq":"10"},
            {"Working Oper Code":"A5360","Working Oper":"Antenna test","Current Oper Code":"A5360","Tran Desc":"CHANGE CMF","TRAN CMF3":"FAIL","Tran Time":"2026-09-28 20:01:00+00:00","Hist Seq":"11"},
            {"Working Oper Code":"A5279","Working Oper":"Screw adsorption","Current Oper Code":"A5160","Tran Desc":"END LOT","Tran Time":"2026-09-28 20:10:00+00:00","Hist Seq":"12"},
        ]
        # 17:01 BRT == 20:01 UTC. Deve pegar 19:50 UTC, não o END LOT futuro.
        r = selecionar_processo_anterior(rows, "2026-09-28 17:01:00", defect_local_offset_hours=-3)
        self.assertEqual(r["status"], "COMPLETE")
        self.assertEqual(r["process"]["operation_code"], "A5202")
        self.assertEqual(r["process"]["hist_seq"], 10)

    def test_defect_time_ignora_packing_depois_de_a5700_por_padrao(self):
        rows = [
            {"Working Oper Code":"A5700","Working Oper":"ASSY Semi-FG Stock","Current Oper Code":"K6070","Tran Desc":"END LOT","Tran Time":"2026-09-29 10:00:00+00:00","Hist Seq":"30"},
            {"Working Oper Code":"K6070","Working Oper":"Packing step","Current Oper Code":"K6081","Tran Desc":"END LOT","Tran Time":"2026-09-29 10:05:00+00:00","Hist Seq":"31"},
        ]
        r = selecionar_processo_anterior(rows, "2026-09-29 08:00:00", defect_local_offset_hours=-3)  # 11:00 UTC
        self.assertEqual(r["process"]["operation_code"], "A5700")

    def test_legacy_station_filter_still_works(self):
        rows = [
            {"Working Oper Code": "A5162", "Current Oper Code":"A5265", "Tran Time": "2026-10-09 08:00:00"},
            {"Working Oper Code": "A5162", "Current Oper Code":"A5265", "Tran Time": "2026-10-09 10:00:00"},
            {"Working Oper Code": "A5162", "Current Oper Code":"A5265", "Tran Time": "2026-10-09 12:00:00"},
        ]
        r = selecionar_passagem_anterior(rows, "2026-10-09 11:00:00", posto_codigo="A5162")
        self.assertEqual(r["Tran Time"], "2026-10-09 10:00:00")


if __name__ == "__main__":
    unittest.main()
