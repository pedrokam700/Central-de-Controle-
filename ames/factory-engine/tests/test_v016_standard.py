from reports.relatorio_v016 import _is_camera, _build_indicators_v016


def _views_for_usage():
    rows = [
        {"PCBA":"P1","Defect Time":"2026-10-07 10:00:00","_pcba_use_index":1,"Falhas registradas 2114":1,"Falhas anteriores 2114":0,"Mesma falha anterior":0,"Mesma família anterior":0,"Linha":"L1","Situação reparo atual":"OK"},
        {"PCBA":"P2","Defect Time":"2026-10-07 10:01:00","_pcba_use_index":2,"Falhas registradas 2114":1,"Falhas anteriores 2114":0,"Mesma falha anterior":0,"Mesma família anterior":0,"Linha":"L1","Situação reparo atual":"OK"},
        {"PCBA":"P3","Defect Time":"2026-10-07 10:02:00","_pcba_use_index":0,"Falhas registradas 2114":1,"Falhas anteriores 2114":0,"Mesma falha anterior":0,"Mesma família anterior":0,"Linha":"L2","Situação reparo atual":"OK"},
    ]
    return {"analise_rows":rows,"materiais":[],"reusos":[],"material_summary_rows":[],"hist_material_rows":[],"hist_pcba_rows":[]}


def test_v016_separa_primeiro_uso_de_uso_nao_determinado():
    ind = _build_indicators_v016(_views_for_usage())
    k = dict(ind["pcba_kpis"])
    assert k["PCBA em 1º uso"] == 1
    assert k["PCBA em 2º uso"] == 1
    assert k["PCBA uso não determinado"] == 1


def test_v016_reconhece_camera_em_chines():
    assert _is_camera("后置摄像头3")


def test_v016_dois_usos_uma_falha_nao_vira_duas_falhas():
    ind = _build_indicators_v016(_views_for_usage())
    k = dict(ind["pcba_kpis"])
    assert k["PCBAs 2º+ uso com só 1 falha 2114"] == 1
