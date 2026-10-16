import json
import time
from datetime import date, datetime
from pathlib import Path
from ames.ui_helpers import find_text_input, find_button, extract_best_grid
from core.normalizacao import normalizar_sn


class Tela3012:
    def __init__(self, browser, base_dir: Path):
        self.browser = browser
        self.base_dir = Path(base_dir)
        cfg = json.loads((self.base_dir / "config" / "selectors.json").read_text(encoding="utf-8"))
        self.cfg = cfg["3012"]

    def _page(self):
        return self.browser.choose_active_page("3012")

    @staticmethod
    def _fmt_data(valor):
        if isinstance(valor, (datetime, date)):
            return valor.strftime("%Y-%m-%d")
        return str(valor)

    def consultar(self, pcba_sn, data_inicio, data_fim):
        pcba_sn = normalizar_sn(pcba_sn)
        page = self._page()

        _, sn_input, _ = find_text_input(
            page,
            labels=self.cfg["sn_labels"],
            name_contains=self.cfg["sn_name_contains"],
            frame_hints=("3012", "Defect Repair", "SN")
        )
        sn_input.click()
        sn_input.fill(pcba_sn)

        # Datas sao deliberadamente conservadoras: se houver ambiguidade, paramos
        # e usamos o inspector para fixar os seletores em vez de preencher campo errado.
        _, start_input, _ = find_text_input(
            page,
            labels=self.cfg["start_labels"],
            name_contains=("start", "begin"),
            frame_hints=("3012", "Defect Time Start")
        )
        _, end_input, _ = find_text_input(
            page,
            labels=self.cfg["end_labels"],
            name_contains=("end",),
            frame_hints=("3012", "Defect Time End")
        )
        start_input.fill(self._fmt_data(data_inicio))
        end_input.fill(self._fmt_data(data_fim))

        _, view, _ = find_button(
            page,
            texts=self.cfg["view_texts"],
            frame_hints=("3012", "Defect Repair")
        )
        view.click()

        inicio = time.time()
        ultima_exc = None
        while time.time() - inicio < 15:
            try:
                grid = extract_best_grid(
                    page,
                    expected_headers=self.cfg["expected_headers"],
                    frame_hints=("3012", "Defect Repair")
                )
                if grid["rows"]:
                    return {"query_sn": pcba_sn, "headers": grid["headers"], "rows": grid["rows"]}
            except Exception as exc:
                ultima_exc = exc
            time.sleep(0.5)
        raise RuntimeError(f"A 3012 nao retornou dados legiveis. Ultimo erro: {ultima_exc}")
