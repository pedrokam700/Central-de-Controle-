import json
import time
from pathlib import Path
from ames.ui_helpers import extract_best_grid, extract_extjs_store_grid
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

    def _collect_remaining_pages(self, frame, grid, sn, remaining_s):
        """Bounded ExtJS paging of the SAME confirmed View/query/store.

        Unsupported/ambiguous paging leaves observed rows intact and partial.
        Never guess server endpoints, reset a query or issue parallel loads.
        """
        try:
            result = frame.evaluate(r"""async args => {
              const rows=[...args.rows], completed=[];
              const meta={status:'partial',completed_pages:completed,reason:null};
              const finish=reason=>({rows,pagination:{...meta,reason}});
              const g=window.Ext && Ext.getCmp && Ext.getCmp(args.id);
              const s=g && g.getStore && g.getStore();
              if(!s || typeof s.loadPage!=='function' || s.buffered)return finish('unsupported_store');
              const size=Number(s.pageSize),total=Number(args.total);
              if(!Number.isSafeInteger(size)||size<1||Number(s.currentPage)!==1||
                 rows.length!==Math.min(size,total))return finish('first_page_unconfirmed');
              completed.push(1);
              if(!Number.isSafeInteger(total)||total<1)return finish('total_unconfirmed');
              const pages=Math.ceil(total/size);
              if(!Number.isSafeInteger(pages)||pages>50||total>5000)return finish('pagination_limit');
              const normal=v=>String(v??'').trim().toUpperCase();
              const extra=s.getProxy && s.getProxy()?.extraParams || {};
              const last=s.lastOptions?.params || {};
              const params={...extra,...last};
              if(normal(params.sn)!==args.sn)return finish('query_parameters_unconfirmed');
              // ExtJS loadPage supplies these from the requested page number.
              for(const key of ['page','start','limit'])delete params[key];
              const queryKey=value=>JSON.stringify(Object.keys(value).filter(k=>!['page','start','limit'].includes(k)).sort().map(k=>[k,value[k]]));
              const confirmedQuery=queryKey(params);
              const columns=()=>g.headerCt?.getGridColumns?g.headerCt.getGridColumns():(g.columns||[]);
              const columnIds=columns().map(c=>c.dataIndex||'');
              if(columnIds.length!==args.headers.length||columnIds.some(v=>!v))return finish('columns_changed');
              const proxyNames=s.getProxy && s.getProxy();
              if(proxyNames && ['pageParam','startParam','limitParam'].some(k=>proxyNames[k] &&
                 !['page','start','limit'].includes(proxyNames[k])))return finish('unsupported_paging_parameters');
              const valid=()=>{
                const current=Ext.getCmp(args.id);
                if(current!==g||g.getStore()!==s||g.isVisible&&!g.isVisible(true))return 'store_changed';
                const input=document.querySelector('input[name="sn"]');
                if(!input||normal(input.value)!==args.sn)return 'query_changed';
                const latest={...(s.getProxy && s.getProxy()?.extraParams||{}),...(s.lastOptions?.params||{})};
                if(normal(latest.sn)!==args.sn||queryKey(latest)!==confirmedQuery)return 'query_changed';
                if(Number(s.getTotalCount())!==total)return 'total_changed';
                if(JSON.stringify(columns().map(c=>c.dataIndex||''))!==JSON.stringify(columnIds))return 'columns_changed';
                return null;
              };
              const signatures=new Set([JSON.stringify(rows)]),deadline=Date.now()+Math.max(0,args.remaining_ms);
              try { for(let page=2;page<=pages;page++){
                const changed=valid();if(changed)return finish(changed);
                if(s.isLoading && s.isLoading())return finish('store_busy');
                const budget=deadline-Date.now();if(budget<=0)return finish('page_timeout');
                const reply=await new Promise(resolve=>{
                  let settled=false;
                  const done=value=>{if(settled)return;settled=true;clearTimeout(timer);resolve(value);};
                  const timer=setTimeout(()=>done({error:'page_timeout'}),budget);
                  try{s.loadPage(page,{params:{...params},callback:(records,operation,success)=>{
                    if(settled)return;
                    if(success!==true)return done({error:'page_load_failed'});
                    if(Number(operation?.page)!==page||normal(operation?.params?.sn)!==args.sn)return done({error:'page_identity_unconfirmed'});
                    const why=valid();if(why)return done({error:why});
                    const next=(records||[]).map(record=>{
                      const data=record.data||record;
                      return Object.fromEntries(args.headers.map((header,i)=>[header,data[columnIds[i]]??null]));
                    });
                    done({rows:next});
                  }});}catch(e){done({error:'page_load_failed'});}
                });
                if(reply.error)return finish(reply.error);
                const next=reply.rows;
                if(next.length!==Math.min(size,total-(page-1)*size))return finish('page_count_mismatch');
                const signature=JSON.stringify(next);
                if(signatures.has(signature))return finish('repeated_page');
                signatures.add(signature);rows.push(...next);completed.push(page);
              }
              } catch(e) {return finish('pagination_observer_failed');}
              meta.status='complete';return finish(null);
            }""", {"id": grid.get("grid_id"), "headers": grid["headers"],
                      "rows": grid["rows"], "total": grid.get("store_total_count"),
                      "sn": sn, "remaining_ms": max(0, int(remaining_s * 1000))})
            combined = {**grid, "rows": result["rows"], "pagination": result["pagination"]}
            combined["coverage"] = classify_3074_page(combined)
            return combined
        except Exception:
            # Retain the already confirmed first page. An observer error does
            # not turn the query into zero or authorize a different target.
            return {**grid, "coverage": classify_3074_page(grid),
                    "pagination": {"status": "partial", "completed_pages": [],
                                   "reason": "pagination_observer_failed"}}

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
                    page_coverage = classify_3074_page(grid)
                    page_partial = page_coverage["status"] == "incomplete_page"
                    page_metadata = {"store_count": grid.get("store_count"),
                                     "store_total_count": grid.get("store_total_count"),
                                     "coverage": page_coverage}

                    query_row = bool(rows and any(_row_contains_query(r, sn) for r in rows))
                    if rows and loading is not True and (fresh or (not response_armed and query_row)):
                        if page_partial and fresh:
                            grid = self._collect_remaining_pages(frame, grid, sn,
                                timeout_s - (time.time() - start))
                            rows = grid["rows"]
                            page_metadata.update(coverage=grid["coverage"], pagination=grid["pagination"])
                        return {
                            "query_sn": sn,
                            "grid_kind": grid["kind"],
                            "grid_id": grid.get("grid_id"),
                            "headers": grid["headers"],
                            "rows": rows,
                            **page_metadata,
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
                                **page_metadata,
                                "attempt": attempt,
                                "no_data": not page_partial,
                                "no_data_reason": "3074_PAGINA_INCOMPLETA" if page_partial else "3074_SEM_VINCULOS",
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
