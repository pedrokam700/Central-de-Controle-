import json
import time
from pathlib import Path
from ames.ui_helpers import extract_best_grid, extract_extjs_store_grid
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
        return frame, campo, btn.first

    def _store_response(self, frame, grid_id, action, token):
        """Observa o store visível da 3074 só durante uma consulta View.

        Uma consulta de PCBA pode devolver apenas Barcode de *componentes*; nesse
        caso igualdade Barcode==PCBA não prova nada. Uma carga nova da grade
        previamente identificada prova que as linhas pertencem à consulta
        disparada. Sem essa prova, NÃO aceitar dados de uma grade antiga.
        """
        return frame.evaluate(r"""args => {
          const root = globalThis.__ames3074Responses || (globalThis.__ames3074Responses = {});
          const dispose = st => {
            if (!st || !st.store) return;
            for (const [name, fn] of st.listeners || []) {
              try { st.store.un(name, fn); } catch(e) {}
            }
          };
          if (args.action === 'dispose') {
            dispose(root[args.token]); delete root[args.token]; return null;
          }
          if (args.action === 'arm') {
            dispose(root[args.token]); delete root[args.token];
            const g = window.Ext && Ext.getCmp && Ext.getCmp(args.id);
            const s = g && g.getStore && g.getStore();
            if (!s || !s.on || !s.un) throw new Error('3074 store nao observavel');
            const st = {store:s, id:args.id, beforeloads:0, loads:0, changes:0,
                        success:null, listeners:[],
                        pending_before_view:!!((s.isLoading && s.isLoading()) || s.loading === true)};
            const on = (name, fn) => { s.on(name, fn); st.listeners.push([name, fn]); };
            on('beforeload', () => { st.beforeloads++; });
            on('load', (_store, _records, success) => {
              st.loads++; st.success = success !== false;
            });
            on('datachanged', () => { st.changes++; });
            root[args.token] = st;
          }
          const st = root[args.token];
          if (!st) return null;
          const g = window.Ext && Ext.getCmp && Ext.getCmp(st.id);
          const current = g && g.getStore && g.getStore();
          return {pending_before_view:st.pending_before_view,
                  beforeloads:st.beforeloads, loads:st.loads,
                  changes:st.changes, success:st.success,
                  store_rebound:!!current && current !== st.store,
                  grid_disappeared:!g};
        }""", {"id": grid_id, "action": action, "token": token})

    def consultar(
        self,
        sn: str,
        timeout_s: float = 18.0,
        retries: int = 2,
        empty_confirm_s: float = 1.6,
        empty_fallback_s: float = 3.2,
    ):
        """Consulta 3074 com prova de refresh do store ExtJS após View.

        PCBA pode retornar somente linhas de materiais. Grade antiga ou vazio
        não atualizado não são evidência de zero nem de vínculos atuais.
        """
        sn = normalizar_sn(sn)
        if not sn:
            raise ValueError("SN vazio.")

        last_error = None

        for attempt in range(1, retries + 1):
            page = self._page()
            frame, campo, view = self._controls(page)
            response_token = f"q3074-{time.perf_counter_ns()}-{attempt}"
            armed_grid_id = None
            response_armed = False

            try:
                campo.click(timeout=4000)
                campo.fill(sn, timeout=4000)
                if normalizar_sn(campo.input_value(timeout=750)) != sn:
                    raise RuntimeError("3074_QUERY_INPUT_NOT_CONFIRMED")
                # Somente a grid visível do frame da própria consulta. Nada
                # de aceitar por engano a grade oculta de uma aba anterior.
                try:
                    before = extract_extjs_store_grid(page, EXPECTED, frame=frame, visible_only=True)
                    armed_grid_id = before["grid_id"]
                    response_proof = self._store_response(frame, armed_grid_id, "arm", response_token)
                    response_armed = True
                except Exception:
                    # Fallback legado apenas para linha que contém o SN exato.
                    # Sem refresh comprovado não pode concluir retorno de
                    # componentes nem zero de vínculos.
                    try:
                        self._store_response(frame, armed_grid_id, "dispose", response_token)
                    except Exception:
                        pass
                    armed_grid_id = None
                # A previous remote load can finish after the next View and
                # impersonate its refresh. Do not submit until the old store
                # request has ended; existing retries may then try again.
                if response_armed and response_proof.get("pending_before_view"):
                    raise RuntimeError("3074_PREVIOUS_QUERY_PENDING")
                view.click(timeout=6000)
            except Exception as exc:
                last_error = exc
                if response_armed:
                    try:
                        self._store_response(frame, armed_grid_id, "dispose", response_token)
                    except Exception:
                        pass
                time.sleep(0.25)
                continue

            time.sleep(0.12)
            start = time.time()
            empty_since = None
            last_grid = None

            try:
              while time.time() - start < timeout_s:
                try:
                    if response_armed:
                        grid = extract_extjs_store_grid(page, EXPECTED, frame=frame, visible_only=True)
                        proof = self._store_response(frame, armed_grid_id, "status", response_token) or {}
                        fresh = grid.get("grid_id") != armed_grid_id or proof.get("store_rebound")
                        fresh = fresh or (proof.get("loads", 0) > 0 and proof.get("success") is True)
                        # Com requisicao remota pendente, uma alteracao parcial
                        # de dados anterior ao evento load nao comprova sucesso.
                        fresh = fresh or (proof.get("changes", 0) > 0
                                          and proof.get("beforeloads", 0) == 0
                                          and proof.get("success") is not False)
                    else:
                        grid = extract_best_grid(page, EXPECTED, ("3074", "Barcode", "Sn Query"))
                        fresh = False
                    last_grid = grid
                    rows = grid.get("rows", [])
                    loading = grid.get("store_loading")

                    query_row = bool(rows and any(_row_contains_query(r, sn) for r in rows))
                    if rows and loading is not True and (fresh or (not response_armed and query_row)):
                        return {
                            "query_sn": sn,
                            "grid_kind": grid["kind"],
                            "grid_id": grid.get("grid_id"),
                            "headers": grid["headers"],
                            "rows": rows,
                            "attempt": attempt,
                            "no_data": False,
                            "query_confirmation": "STORE_REFRESH_AFTER_VIEW" if fresh else "EXACT_QUERY_ROW",
                        }

                    # Se a grade está vazia e o store terminou de carregar, inicia
                    # a confirmação do estado vazio.
                    if not rows and loading is not True and fresh:
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
                                "query_confirmation": "STORE_REFRESH_AFTER_VIEW",
                            }
                    else:
                        empty_since = None

                except Exception as exc:
                    last_error = exc

                time.sleep(0.12)
            finally:
                if response_armed:
                    try:
                        self._store_response(frame, armed_grid_id, "dispose", response_token)
                    except Exception:
                        pass

            last_error = RuntimeError(
                f"A grade nao confirmou atualizacao da consulta 3074 dentro de {timeout_s:.0f}s"
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
