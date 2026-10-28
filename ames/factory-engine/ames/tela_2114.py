import time
from pathlib import Path

from ames.ui_helpers import extract_best_grid
from core.normalizacao import normalizar_sn


EXPECTED_HEADERS = [
    "Lot Id",
    "Defect Hist Seq",
    "Defect Location",
    "Defect Material ID",
    "Defect Code",
    "Defect Description",
    "Defect Oper",
    "Repair Status",
    "TestTools Auto Defect Or Defect By Hand",
    "Defect Type",
]

SHIFT_UNCONFIRMED = "SHIFT_UNCONFIRMED"


def _safe_input_value(page, name):
    try:
        loc = page.locator(f'input[name="{name}"]:visible')
        if loc.count():
            return (loc.first.input_value(timeout=800) or "").strip()
    except Exception:
        pass
    return ""


def _lot_matches(row, pcba_sn):
    return normalizar_sn(row.get("Lot Id")) == normalizar_sn(pcba_sn)


def _classify_defect_type(raw):
    value = str(raw or "").strip()
    norm = value.replace(" ", "").replace("-", "_").lower()
    if norm in ("phone_disassembly", "phonedisassembly"):
        return {
            "class": "PHONE_DISASSEMBLY",
            "meaning_pt": "Aparelho desmontado e retornado ao fluxo/linha.",
        }
    if norm in ("mainboard", "main_board"):
        return {
            "class": "MAINBOARD",
            "meaning_pt": "Falha atribuída à placa principal no fluxo de reparo de placa.",
        }
    return {
        "class": "OTHER",
        "meaning_pt": "",
    }


def resumir_historico(rows):
    out = {
        "histories_total": len(rows),
        "phone_disassembly": 0,
        "mainboard": 0,
        "other_defect_type": 0,
        "repair_status_y": 0,
        "repair_status_n": 0,
        "repair_status_other": 0,
    }
    for row in rows:
        c = _classify_defect_type(row.get("Defect Type"))
        if c["class"] == "PHONE_DISASSEMBLY":
            out["phone_disassembly"] += 1
        elif c["class"] == "MAINBOARD":
            out["mainboard"] += 1
        else:
            out["other_defect_type"] += 1

        rs = str(row.get("Repair Status") or "").strip().upper()
        if rs == "Y":
            out["repair_status_y"] += 1
        elif rs == "N":
            out["repair_status_n"] += 1
        else:
            out["repair_status_other"] += 1
    return out


class Tela2114:
    """
    Leitura segura da AWIP2114 - Tr Defect Lot By Hand.

    IMPORTANTE:
    - não clica Confirm, Update ou Cancel;
    - não altera registros;
    - assume a 2114 já aberta no OPC;
    - a consulta individual continua estrita: só envia SN depois de o Shift estar
      realmente confirmado no campo principal da 2114.
    """

    def __init__(self, browser, base_dir: Path):
        self.browser = browser
        self.base_dir = Path(base_dir)

    def _page(self):
        # A 2114 roda dentro do OPC e o usuario pode ter mais de uma aba do MES
        # aberta. Nao aceitamos silenciosamente uma aba errada/stale.
        candidates = []
        for page in self.browser.pages:
            try:
                sn = page.locator('input[name="snImei"]:visible')
                if sn.count() != 1:
                    continue
                marker = f"{page.url} {page.title()}".lower()
                # O hash/DOM da pagina real contém TrDefectLotByHand/AWIP2114.
                if ("trdefectlotbyhand" not in marker and "awip2114" not in marker):
                    try:
                        body = page.locator('body').inner_text(timeout=700)[:2500].lower()
                    except Exception:
                        body = ""
                    if "awip2114-tr defect lot by hand" not in body:
                        continue
                try:
                    focused = bool(page.evaluate("document.hasFocus()"))
                except Exception:
                    focused = False
                candidates.append((page, focused))
            except Exception:
                continue

        if not candidates:
            raise RuntimeError(
                "Nenhuma aba valida da AWIP2114 foi encontrada. "
                "Abra OPC > AWIP2114-Tr Defect Lot By Hand e tente novamente."
            )

        if len(candidates) == 1:
            return candidates[0][0]

        focused = [page for page, is_focused in candidates if is_focused]
        if len(focused) == 1:
            return focused[0]

        # Melhor falhar de forma clara do que consultar uma das abas duplicadas.
        urls = " | ".join(page.url for page, _ in candidates)
        raise RuntimeError(
            f"Foram encontradas {len(candidates)} abas 2114 validas. "
            "Feche as abas duplicadas e deixe somente a 2114 que deseja automatizar. "
            f"Abas: {urls}"
        )

    def turno_confirmado(self):
        """Return only a physically committed Shift value, never a fabricated one."""
        page = self._page()
        return _safe_input_value(page, "desc")

    def turno_atual(self):
        """Return a committed Shift, making one bounded real selection attempt.

        The composite flow used to inspect the field after an earlier best-effort
        navigation attempt. If that first attempt was transient, 2114 was marked
        unavailable without ever retrying at the moment the source actually ran.
        This method now retries the real lookup once and still degrades explicitly
        to SHIFT_UNCONFIRMED instead of fabricating a value.
        """
        confirmed = self.turno_confirmado()
        if confirmed:
            self.last_shift_error = None
            return confirmed
        try:
            from ames.shift_2114 import ensure_shift
            selected = ensure_shift(self._page(), timeout_s=8.0)
            confirmed = self.turno_confirmado()
            if confirmed:
                self.last_shift_error = None
                return confirmed
            self.last_shift_error = f"Shift {selected or ''} não permaneceu confirmado no campo principal."
        except Exception as exc:
            self.last_shift_error = f"{type(exc).__name__}: {exc}"
        return SHIFT_UNCONFIRMED

    @staticmethod
    def _query_response_tracker(page, grid, action):
        """Observe ExtJS load AFTER Enter; a stale empty grid is not no-data.

        Read-only listener; never clicks Confirm/Update or modifies MES rows.
        """
        grid_id = str((grid or {}).get("grid_id") or "").strip()
        frame_url = str((grid or {}).get("frame_url") or "")
        if not grid_id:
            return None
        frames = [frame for frame in page.frames if frame.url == frame_url]
        if len(frames) != 1:
            return None
        frame = frames[0]
        try:
            reply = frame.evaluate("""args => {
              if (!window.Ext || !Ext.getCmp) return null;
              const grid = Ext.getCmp(args.id);
              const store = grid && grid.getStore && grid.getStore();
              if (!store) return null;
              if (args.action === 'arm') {
                const old = store.__ames2114Reply;
                if (old && old.listener && store.un) store.un('load', old.listener);
                const marker = {loads:0, success:null};
                marker.listener = function(s, records, success) {
                  marker.loads++;
                  marker.success = success === false ? false : true;
                };
                store.on('load', marker.listener);
                store.__ames2114Reply = marker;
              }
              const current = store.__ames2114Reply;
              if (!current) return null;
              if (args.action === 'dispose') {
                if (current.listener && store.un) store.un('load', current.listener);
                delete store.__ames2114Reply;
              }
              return {loads:current.loads, success:current.success};
            }""", {"id": grid_id, "action": action})
            return (frame, grid_id, reply) if action == "arm" and reply else reply
        except Exception:
            return None

    def consultar(self, pcba_sn, timeout_s=15.0, empty_confirm_s=1.8):
        pcba_sn = normalizar_sn(pcba_sn)
        if not pcba_sn:
            raise ValueError("PCBA/SN vazio.")

        page = self._page()

        sn = page.locator('input[name="snImei"]:visible')
        if sn.count() != 1:
            raise RuntimeError(
                f"Esperado 1 campo SN/IMEI name=snImei na 2114; encontrados {sn.count()}."
            )
        sn = sn.first

        from ames.shift_2114 import ensure_shift
        # The composite preflight already gets the full bounded wait.  Individual
        # queries retry briefly so a transient lookup can recover without spending
        # 8 seconds per PCBA when the source is genuinely unavailable.
        ensure_shift(page, timeout_s=min(3.0, max(1.5, float(timeout_s) / 4.0)))
        shift_desc = _safe_input_value(page, "desc")
        if not shift_desc:
            raise RuntimeError(
                "Shift da 2114 não está selecionado/legível após tentativa automática."
            )

        # Observe the matching 2114 store BEFORE scan. An empty ExtJS
        # grid left over from another query is not a valid no-data response.
        try:
            before = extract_best_grid(
                page, expected_headers=EXPECTED_HEADERS,
                frame_hints=("2114", "Tr Defect Lot By Hand", "Defect History"))
        except Exception:
            before = None
        marker = self._query_response_tracker(page, before, "arm")
        armed_grid = before if marker else None

        # O comportamento da 2114 é de scan: preencher e Enter.
        # Usamos preenchimento/foco direto para que o balão visual do
        # MES Operations Assistant não bloqueie a automação.
        sn.fill(pcba_sn, timeout=3000, force=True)
        sn.focus(timeout=3000)
        page.keyboard.press("Enter")

        start = time.time()
        empty_since = None
        last_grid = None
        last_error = None

        while time.time() - start < timeout_s:
            try:
                grid = extract_best_grid(
                    page,
                    expected_headers=EXPECTED_HEADERS,
                    frame_hints=("2114", "Tr Defect Lot By Hand", "Defect History"),
                )
                last_grid = grid
                rows = grid.get("rows") or []
                loading = grid.get("store_loading")

                # Proteção contra grade antiga: só aceita retorno com a PCBA pesquisada.
                matching = [r for r in rows if _lot_matches(r, pcba_sn)]
                reply = self._query_response_tracker(page, armed_grid, "status") if armed_grid else None
                confirmed_response = bool(reply and reply.get("loads", 0) >= 1 and reply.get("success") is not False)
                if matching and (armed_grid is None or confirmed_response):
                    enriched = []
                    for row in matching:
                        item = dict(row)
                        defect_type = _classify_defect_type(item.get("Defect Type"))
                        item["Defect Type Class"] = defect_type["class"]
                        item["Defect Type Meaning PT"] = defect_type["meaning_pt"]
                        enriched.append(item)

                    result = {
                        "query_sn": pcba_sn,
                        "shift": shift_desc,
                        "model": _safe_input_value(page, "prodModel"),
                        "color": _safe_input_value(page, "color"),
                        "material": _safe_input_value(page, "matId"),
                        "mfg_order": _safe_input_value(page, "orderId"),
                        "grid_kind": grid.get("kind"),
                        "grid_id": grid.get("grid_id"),
                        "headers": grid.get("headers") or [],
                        "rows": enriched,
                        "summary": resumir_historico(enriched),
                        "no_data": False,
                    }
                    return result

                # Vazio estável é um resultado válido, mas não aceitamos imediatamente.
                # Never classify an old/absent/foreign grid as MES no data.
                # A request-local successful ExtJS load and a verified empty
                # store are necessary; otherwise report partial/error for retry.
                store_empty = (
                    grid.get("kind") == "extjs_store"
                    and grid.get("grid_id")
                    and grid.get("store_total_count") == 0
                    and grid.get("store_count") == 0
                    and loading is False
                    and confirmed_response
                )
                if not rows and store_empty:
                    if empty_since is None:
                        empty_since = time.time()
                    if time.time() - empty_since >= empty_confirm_s:
                        return {
                            "query_sn": pcba_sn,
                            "shift": shift_desc,
                            "model": _safe_input_value(page, "prodModel"),
                            "color": _safe_input_value(page, "color"),
                            "material": _safe_input_value(page, "matId"),
                            "mfg_order": _safe_input_value(page, "orderId"),
                            "grid_kind": grid.get("kind"),
                            "grid_id": grid.get("grid_id"),
                            "headers": grid.get("headers") or [],
                            "rows": [],
                            "summary": resumir_historico([]),
                            "no_data": True,
                        }
                else:
                    empty_since = None

            except Exception as exc:
                last_error = exc

            time.sleep(0.15)

        # No successful post-scan response means unknown coverage, never 0.
        if armed_grid:
            self._query_response_tracker(page, armed_grid, "dispose")
        rows_count = len((last_grid or {}).get("rows") or [])
        raise RuntimeError(
            f"2114 não confirmou a PCBA {pcba_sn} dentro de {timeout_s:.0f}s. "
            f"Última grade: {rows_count} linhas. Último erro: {last_error}"
        )
