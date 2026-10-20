import json
import time
from pathlib import Path
from ames.ui_helpers import extract_best_grid
from ames.coverage_3074 import classify_3074_page
from core.normalizacao import normalizar_sn, normalizar_texto

EXPECTED = [
    "Barcode","Sn Type","Batch Id","Sn Seq","Batch Count","Line Id",
    "Operation","Product Model","Product Id","Whether to use","Create Time"
]


def _row_contains_query(row, query_sn):
    query_sn = normalizar_sn(query_sn)
    for key in ("Barcode", "Material SN", "Aut Cmf1", "Aut Cmf2"):
        if normalizar_sn(row.get(key)) == query_sn:
            return True
    return False


def _has_no_data_marker(page):
    """Confirma o estado visual 'No data to display' usado pela grade do MES."""
    for frame in page.frames:
        try:
            body = frame.locator("body").inner_text(timeout=450)
            if "no data to display" in (body or "").lower():
                return True
        except Exception:
            pass
    return False


class Tela3074:
    def __init__(self, browser, base_dir: Path):
        self.browser = browser
        self.base_dir = Path(base_dir)

    def _page(self):
        return self.browser.choose_active_page("3074")

    def _controls(self, page):
        matches = []
        for frame in page.frames:
            try:
                inp = frame.locator('input[name="sn"]:visible')
                if inp.count():
                    matches.append((frame, inp.first))
            except Exception:
                pass
        if len(matches) != 1:
            raise RuntimeError(f"Esperado 1 campo input[name=sn]; encontrados {len(matches)}.")
        frame, campo = matches[0]
        btn = frame.get_by_role("button", name="View", exact=True)
        if not btn.count():
            raise RuntimeError("Botao View nao encontrado no mesmo frame da 3074.")
        return campo, btn.first

    def consultar(
        self,
        sn: str,
        timeout_s: float = 18.0,
        retries: int = 2,
        empty_confirm_s: float = 1.6,
        empty_fallback_s: float = 3.2,
    ):
        """Consulta a 3074 e distingue três estados:
        1) retorno com dados confirmados do SN;
        2) retorno válido sem vínculos (grade vazia);
        3) falha real/timeout.

        A grade vazia deixa de ser tratada como erro. Para não aceitar uma grade
        antiga antes da requisição, o vazio precisa permanecer estável e o store
        ExtJS não pode estar carregando. O marcador visual 'No data to display'
        acelera a confirmação.
        """
        sn = normalizar_sn(sn)
        if not sn:
            raise ValueError("SN vazio.")

        last_error = None

        for attempt in range(1, retries + 1):
            page = self._page()
            campo, view = self._controls(page)

            try:
                campo.click(timeout=4000)
                campo.fill(sn, timeout=4000)
                view.click(timeout=6000)
            except Exception as exc:
                last_error = exc
                time.sleep(0.25)
                continue

            time.sleep(0.12)
            start = time.time()
            empty_since = None
            last_grid = None

            while time.time() - start < timeout_s:
                try:
                    grid = extract_best_grid(page, EXPECTED, ("3074", "Barcode", "Sn Query"))
                    last_grid = grid
                    rows = grid.get("rows", [])
                    loading = grid.get("store_loading")

                    if rows and any(_row_contains_query(r, sn) for r in rows):
                        completeness=classify_3074_page(grid)
                        if completeness["status"]=="incomplete_page":
                            # Do not silently publish a first page as the entire
                            # 3074 PCBA/material binding history. No automatic
                            # pagination without physical MES validation.
                            last_error=RuntimeError(
                                "3074_INCOMPLETE_PAGE: "+
                                str(completeness["returned"])+"/"+
                                str(completeness["reported_total"])+
                                " linhas presentes; paginação precisa verificação")
                            break
                        return {
                            "query_sn": sn,
                            "grid_kind": grid["kind"],
                            "grid_id": grid.get("grid_id"),
                            "headers": grid["headers"],
                            "rows": rows,
                            "attempt": attempt,
                            "no_data": False,
                            "coverage_status": "observed_rows_not_population_proof",
                            "returned_record_count": completeness["returned"],
                            "reported_total_count": completeness["reported_total"],
                        }

                    # Se a grade está vazia e o store terminou de carregar, inicia
                    # a confirmação do estado vazio.
                    if not rows and loading is not True:
                        if empty_since is None:
                            empty_since = time.time()

                        empty_age = time.time() - empty_since
                        visual_no_data = _has_no_data_marker(page)

                        # Com marcador visual explícito, ~2s estáveis bastam.
                        # Sem marcador, usa janela maior para evitar falso vazio.
                        if (
                            (visual_no_data and empty_age >= empty_confirm_s)
                            or empty_age >= empty_fallback_s
                        ):
                            return {
                                "query_sn": sn,
                                "grid_kind": grid["kind"],
                                "grid_id": grid.get("grid_id"),
                                "headers": grid["headers"],
                                "rows": [],
                                "attempt": attempt,
                                "no_data": True,
                                "no_data_reason": "3074_SEM_VINCULOS",
                            }
                    else:
                        empty_since = None

                except Exception as exc:
                    last_error = exc

                time.sleep(0.12)

            last_error = RuntimeError(
                f"A grade nao confirmou o SN {sn} dentro de {timeout_s:.0f}s"
                + (f"; ultima grade tinha {len(last_grid.get('rows', []))} linhas" if last_grid else "")
            )
            time.sleep(0.2)

        raise RuntimeError(f"3074 sem retorno confirmado para {sn}. Ultimo erro: {last_error}")


def componentes_serializados(rows, pcba_consultada=None):
    pcba_consultada = normalizar_sn(pcba_consultada or "")
    saida, seen = [], set()
    for r in rows:
        barcode = normalizar_sn(r.get("Barcode"))
        tipo = str(r.get("Sn Type") or "").strip()
        if not barcode or barcode == pcba_consultada:
            continue
        if "pcba" in normalizar_texto(tipo):
            continue
        if barcode not in seen:
            seen.add(barcode)
            saida.append({"item_sn": barcode, "item_type": tipo, "row": r})
    return saida


def pcbas_historicas(rows):
    out, seen = [], set()
    for r in rows:
        barcode = normalizar_sn(r.get("Barcode"))
        tipo = normalizar_texto(r.get("Sn Type") or "")
        if barcode and "pcba" in tipo and barcode not in seen:
            seen.add(barcode)
            out.append(barcode)
    return out


def salvar_json(obj, path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    tmp.replace(path)
    return path
