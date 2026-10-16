from pathlib import Path
p=Path('ames/factory-engine/ames/tela_3022.py')
t=p.read_text(encoding='utf-8')
old=r'''        before = extract_extjs_store_grid(page, self.cfg["expected_headers"],
                                          frame=query_frame, visible_only=True)
        grid_id = before["grid_id"]
        before_sig = _grid_signature_3022(before)
        telemetry["before_grid"] = before_sig
        self._active_response = (query_frame, grid_id)
        self._history_response(query_frame, grid_id, "arm")
        mark("submit")
        view.click(timeout=5000)
        mark("view_clicked")
'''
new=r'''        before = extract_extjs_store_grid(page, self.cfg["expected_headers"],
                                          frame=query_frame, visible_only=True)
        grid_id = before["grid_id"]
        store_token = self._grid_store_token(query_frame, grid_id)
        before_sig = _grid_signature_3022(before)
        telemetry["before_grid"] = before_sig
        telemetry["before_binding"] = {"grid_id": grid_id, "store_token": store_token}
        response_token = f"q-{time.perf_counter_ns()}"
        self._active_response = (query_frame, response_token)
        self._history_response(query_frame, grid_id, "arm", response_token)
        mark("submit")
        view.click(timeout=5000)
        mark("view_clicked")
'''
if t.count(old)!=1: raise SystemExit(f'before block mismatch: {t.count(old)}')
t=t.replace(old,new)
old=r'''                grid = extract_extjs_store_grid(page, self.cfg["expected_headers"],
                                                frame=query_frame, visible_only=True, grid_id=grid_id)
                last_grid = grid
                mark("first_grid")
                rows = grid.get("rows") or []
                loading = grid.get("store_loading")
                if rows:
                    mark("first_rows_observed")
                telemetry["after_grid"] = _grid_signature_3022(grid)
                telemetry["grid_changed"] = before_sig != telemetry["after_grid"]  # telemetry only
                telemetry["store_loading"] = loading
                response = grid.get("store_response") or {}  # same JS turn as rows/loading
                telemetry["store_response"] = response
                if response.get("success") is False:
                    raise RuntimeError("3022 consulta falhou na store")
                refreshed = bool(response.get("changes") or response.get("loads"))
                telemetry["refresh_proven"] = refreshed
                if loading is True or refreshed:
                    mark("response_started_observed")
                query_context_ok = normalizar_sn(campo.input_value(timeout=600)) == pcba_sn
                telemetry["query_context_ok"] = query_context_ok
                if not refreshed or loading is True or not query_context_ok:
                    empty_since = None
                    time.sleep(0.12)
                    continue

                mark("grid_ready")
'''
new=r'''                rebound = False
                rebound_reason = None
                try:
                    grid = extract_extjs_store_grid(page, self.cfg["expected_headers"],
                                                    frame=query_frame, visible_only=True, grid_id=grid_id)
                except Exception:
                    grid = extract_extjs_store_grid(page, self.cfg["expected_headers"],
                                                    frame=query_frame, visible_only=True)
                    if grid.get("grid_id") != grid_id:
                        rebound = True
                        rebound_reason = "GRID_REPLACED_AFTER_VIEW"
                        grid_id = grid.get("grid_id")
                current_store_token = self._grid_store_token(query_frame, grid.get("grid_id"))
                if store_token and current_store_token and current_store_token != store_token:
                    rebound = True
                    rebound_reason = rebound_reason or "STORE_REBOUND_AFTER_VIEW"
                if rebound:
                    telemetry["binding_rebinds"] = telemetry.get("binding_rebinds", 0) + 1
                    telemetry["binding_rebound"] = True
                    telemetry["binding_rebound_reason"] = rebound_reason
                    mark("binding_rebound_observed")
                    store_token = current_store_token

                last_grid = grid
                mark("first_grid")
                rows = grid.get("rows") or []
                loading = grid.get("store_loading")
                if rows:
                    mark("first_rows_observed")
                telemetry["after_grid"] = _grid_signature_3022(grid)
                telemetry["after_binding"] = {"grid_id": grid.get("grid_id"), "store_token": current_store_token}
                telemetry["grid_changed"] = before_sig != telemetry["after_grid"]
                telemetry["store_loading"] = loading
                response = self._history_response(query_frame, None, "read", response_token) or {}
                telemetry["store_response"] = response
                if response.get("success") is False:
                    raise RuntimeError("3022 consulta falhou na store")
                store_event = bool(response.get("changes") or response.get("loads"))
                refreshed = store_event or rebound or bool(telemetry.get("binding_rebound"))
                telemetry["refresh_proven"] = refreshed
                telemetry["refresh_evidence"] = (rebound_reason if rebound else
                                                   telemetry.get("binding_rebound_reason") if telemetry.get("binding_rebound") else
                                                   "STORE_DATASET_EVENT" if store_event else None)
                if loading is True or refreshed:
                    mark("response_started_observed")
                query_context_ok = normalizar_sn(campo.input_value(timeout=600)) == pcba_sn
                telemetry["query_context_ok"] = query_context_ok
                if not refreshed or loading is True or not query_context_ok:
                    empty_since = None
                    time.sleep(0.12)
                    continue

                mark("grid_ready")
'''
if t.count(old)!=1: raise SystemExit(f'poll block mismatch: {t.count(old)}')
t=t.replace(old,new)
old='                confirmation = "STORE_RESPONSE_CONFIRMED"\n                telemetry["confirmation"] = confirmation\n'
new='                confirmation = telemetry.get("refresh_evidence") or "STORE_RESPONSE_CONFIRMED"\n                telemetry["confirmation"] = confirmation\n'
if t.count(old)!=1: raise SystemExit(f'confirmation mismatch: {t.count(old)}')
t=t.replace(old,new)
p.write_text(t,encoding='utf-8')
