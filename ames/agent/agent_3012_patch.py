from __future__ import annotations

from datetime import datetime, timedelta
from urllib.parse import parse_qs, urlparse

import ames_3012_live
import ames_3012_strategy
import repair_3012
import local_sn
import production_shift
import map_3012


EXACT_SN_HISTORY_START = datetime(2026, 1, 24, 0, 0, 0)


def exact_sn_history_window(now=None):
    """Factory-confirmed lifetime window for individual 3012 SN queries."""
    current = now or datetime.now()
    if current.tzinfo:
        current = current.replace(tzinfo=None)
    start = EXACT_SN_HISTORY_START
    end = (current + timedelta(days=1)).replace(hour=23, minute=59, second=59, microsecond=0)
    return start, end


def install(a, BaseHandler, canonical):
    """Layer 3012 read-only repair history on the canonical agent without touching 3028."""
    repair_3012.ensure_schema(a.STORE)
    collect_3012 = a.mes_call(ames_3012_live.collect_live_3012)

    def parse_mes_time(value):
        text = str(value or "").strip()
        if not text:
            return None
        for candidate in (text, text.replace("Z", "+00:00")):
            try:
                dt = datetime.fromisoformat(candidate)
                return dt.replace(tzinfo=None) if dt.tzinfo else dt
            except Exception:
                pass
        for pattern in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y/%m/%d %H:%M:%S", "%Y-%m-%d"):
            try:
                return datetime.strptime(text[:19] if "%H" in pattern else text[:10], pattern)
            except Exception:
                pass
        return None

    def configured_start_date():
        configured = parse_mes_time(a.CONFIG.get("ames_start_date"))
        if configured:
            return configured.replace(hour=0, minute=0, second=0, microsecond=0)
        # Broad/background queries keep the existing compatibility fallback.
        return (datetime.now() - timedelta(days=180)).replace(hour=0, minute=0, second=0, microsecond=0)

    def individual_window(result):
        # Individual SN lookup always covers the factory history baseline through
        # the end of tomorrow. Historical 2114 timestamps are evidence, not a
        # reason to truncate the requested 3012 window.
        return exact_sn_history_window()

    def individual_targets(result, sn):
        targets = []; seen = set()
        def add(value):
            value = str(value or "").strip()
            if value and value not in seen:
                seen.add(value); targets.append(value)
        if (result or {}).get("detected_type") == "PCBA":
            add(sn)
        for value in (((result or {}).get("trace_3074") or {}).get("related_pcbas") or []):
            add(value)
        for item in ((result or {}).get("trace_3074") or {}).get("reused_components") or []:
            for ev in item.get("previous_pcba_evidence") or []:
                add(ev.get("pcba_sn"))
        if not targets:
            add(sn)
        maximum = max(1, int(a.CONFIG.get("3012_individual_max_pcbas", 25) or 25))
        return targets[:maximum], max(0, len(targets) - maximum)

    def collect_cached_exact(targets, start, end):
        return ames_3012_strategy.collect_exact_sn_cached(
            store=a.STORE,
            collector=collect_3012,
            cdp_url=str(a.CONFIG.get("chrome_cdp") or "http://127.0.0.1:9222"),
            ames_host=str(a.CONFIG.get("ames_host") or "172.29.185.215"),
            sns=targets,
            start_at=start,
            end_at=end,
            checkpoint_dir=a.DATA_DIR / "checkpoints" / "3012",
            workstation=a.WORKSTATION,
            fallback_chunk_days=max(1, int(a.CONFIG.get("3012_sn_chunk_days", 90) or 90)),
        )

    def run_sn_lookup(job_id, cfg):
        sn = str(cfg.get("sn") or "").strip()
        include_3022 = bool(cfg.get("include_3022", True))
        include_3012 = bool(cfg.get("include_3012", True))
        job = a._job_update(job_id, status="running", stage="3074", progress=5, started_at=a.utc_now(), message=f"Consultando SN {sn}")
        a._persist_job(job)
        try:
            engine = a.ENGINE_DIR or a.discover_engine(a.CONFIG, a.BASE_DIR)
            if not engine:
                raise RuntimeError("Motor V0.16 nao encontrado para consulta individual")
            def cb(stage, progress, message):
                nonlocal job
                job = a._job_update(job_id, stage=stage, progress=min(82, float(progress)), message=message)
                a._persist_job(job)
            result = dict(a.run_individual_lookup(engine, sn, include_3022=include_3022, line_callback=cb) or {})
            try:
                import json
                settings = json.loads((engine / "config" / "settings.json").read_text(encoding="utf-8"))
                offset = float((settings.get("mes_time") or {}).get("grid_naive_utc_offset_hours", 0))
            except (OSError, ValueError, TypeError):
                offset = 0
            production_shift.enrich_sn(result, grid_offset=offset)
            warnings = list(result.get("warnings") or [])
            if include_3022:
                try:
                    production_shift.correlate_sn(result, engine, grid_offset=offset)
                except Exception as exc:
                    warnings.append(f"Correlacao turno 3022 indisponivel: {exc}")
            if include_3012:
                targets, omitted = individual_targets(result, sn)
                if omitted:
                    warnings.append(f"3012: {omitted} PCBAs relacionadas ficaram fora da consulta rápida; use a consulta histórica para ampliar.")
                start, end = individual_window(result)
                job = a._job_update(job_id, stage="3012", progress=88, message=f"3012 · histórico/cache de {len(targets)} PCBA(s)")
                a._persist_job(job)
                try:
                    payload = collect_cached_exact(targets, start, end)
                    result["trace_3012"] = payload
                    by_pcba = {}
                    for row in payload.get("rows") or []:
                        by_pcba.setdefault(str(row.get("pcba_sn") or ""), []).append(row)
                    for material in (result.get("trace_3074") or {}).get("reused_components") or []:
                        for evidence in material.get("previous_pcba_evidence") or []:
                            pcba = str(evidence.get("pcba_sn") or "")
                            evidence["repair_evidence_3012"] = [
                                {**r, "source_view": "3012", "association": "same_pcba_candidate"}
                                for r in by_pcba.get(pcba, [])
                            ]
                    summary = dict(result.get("summary") or {})
                    summary["3012_rows"] = payload.get("records_count", 0)
                    summary["3012_cache_covered"] = (payload.get("cache") or {}).get("covered", 0)
                    summary["3012_ranges_queried"] = (payload.get("cache") or {}).get("queried", 0)
                    result["summary"] = summary
                except Exception as exc:
                    warnings.append(f"3012 ainda não validada neste posto: {type(exc).__name__}: {exc}")
            result["warnings"] = warnings
            a._persist_job(a._job_update(job_id, status="done", stage="done", progress=100, finished_at=a.utc_now(), message=f"Consulta individual concluída · {sn}", result=result))
            a.STORE.record_audit(
                "SN_LOOKUP",
                workstation=a.WORKSTATION,
                details={"sn": sn, "detected_type": result.get("detected_type"), "summary": result.get("summary"), "warnings": warnings, "3012": bool(result.get("trace_3012"))},
            )
        except Exception as exc:
            a._persist_job(a._job_update(job_id, status="error", stage="error", finished_at=a.utc_now(), message=str(exc), error=f"{type(exc).__name__}: {exc}"))

    def start_sn(cfg):
        sn = str(cfg.get("sn") or "").strip()
        if not sn:
            raise RuntimeError("Informe ou bipe uma SN")
        return a._launch_mes_job(
            "sn_lookup",
            {"sn": sn, "include_3022": bool(cfg.get("include_3022", True)), "include_3012": bool(cfg.get("include_3012", True)), "request_id": cfg.get("request_id")},
            run_sn_lookup,
        )

    def run_query(job_id, cfg):
        a._persist_job(a._job_update(job_id, status="running", stage="3012", progress=5, started_at=a.utc_now(), message="Preparando consulta histórica 3012"))
        try:
            exact_targets = list(dict.fromkeys(str(x or "").strip() for x in (cfg.get("sns") or ([cfg.get("sn")] if cfg.get("sn") else [])) if str(x or "").strip()))
            exact_start, exact_end = exact_sn_history_window()
            start = parse_mes_time(cfg.get("start_at")) or (exact_start if exact_targets else datetime.now() - timedelta(days=90))
            end = parse_mes_time(cfg.get("end_at")) or (exact_end if exact_targets else datetime.now())
            if end < start:
                raise RuntimeError("Periodo 3012 invalido")
            if exact_targets:
                payload = collect_cached_exact(exact_targets, start, end)
                persisted = payload.get("persistence") or {"records": 0, "inserted": 0, "updated": 0}
            else:
                digest = canonical.digest({**cfg, "start_at": start.isoformat(), "end_at": end.isoformat()})[:16]
                payload = collect_3012(
                    cdp_url=str(a.CONFIG.get("chrome_cdp") or "http://127.0.0.1:9222"),
                    ames_host=str(a.CONFIG.get("ames_host") or "172.29.185.215"),
                    sns=[],
                    start_at=start,
                    end_at=end,
                    line=cfg.get("line") or "",
                    model=cfg.get("model") or "",
                    defect_code=cfg.get("defect_code") or "",
                    repair_code=cfg.get("repair_code") or "",
                    defect_type=cfg.get("defect_type") or "",
                    chunk_days=max(1, int(cfg.get("chunk_days") or 31)),
                    checkpoint_path=a.DATA_DIR / "checkpoints" / "3012" / f"3012_BROAD_{digest}.json",
                )
                persisted = repair_3012.ingest(a.STORE, payload, workstation=a.WORKSTATION)
            result = {
                "source": payload.get("source"),
                "query": payload.get("query"),
                "records_count": payload.get("records_count"),
                "chunks": payload.get("chunks") or payload.get("ranges"),
                "cache": payload.get("cache"),
                "persistence": persisted,
                "sample": (payload.get("rows") or [])[:200],
            }
            a._persist_job(a._job_update(job_id, status="done", stage="done", progress=100, finished_at=a.utc_now(), message=f"3012 concluída · {payload.get('records_count', 0)} registro(s)", result=result))
        except Exception as exc:
            a._persist_job(a._job_update(job_id, status="error", stage="error", finished_at=a.utc_now(), message=str(exc), error=f"{type(exc).__name__}: {exc}"))

    def start_query(cfg):
        return a._launch_mes_job("repair_3012", dict(cfg), run_query)

    class Handler(BaseHandler):
        def do_GET(self):
            u = urlparse(self.path)
            if u.path == "/api/v1/3012/status":
                try:
                    self._send({"ok": True, "implemented": True, "factory_validated": False, "ames_start_date": configured_start_date().date().isoformat(), "local": repair_3012.stats(a.STORE)})
                except Exception as exc:
                    self._send({"error": type(exc).__name__, "message": str(exc)}, 500)
                return
            if u.path == "/api/v1/3012/history":
                try:
                    q = parse_qs(u.query); one = lambda name, default="": (q.get(name) or [default])[0]
                    rows = repair_3012.history(
                        a.STORE,
                        sn=one("sn"), start_at=one("start_at"), end_at=one("end_at"), line=one("line"),
                        defect_code=one("defect_code"), repair_user=one("repair_user"), limit=int(one("limit", 5000)),
                    )
                    self._send({"ok": True, "rows": rows, "count": len(rows), "source": "LOCAL_SQLITE_3012"})
                except Exception as exc:
                    self._send({"error": type(exc).__name__, "message": str(exc)}, 500)
                return
            if u.path == "/api/v1/3012/coverage":
                try:
                    q = parse_qs(u.query); sn = (q.get("sn") or [""])[0]
                    self._send({"ok": True, "sn": sn, "intervals": repair_3012.coverage(a.STORE, sn)})
                except Exception as exc:
                    self._send({"error": type(exc).__name__, "message": str(exc)}, 500)
                return
            if u.path == "/api/v1/local/sn":
                try:
                    q = parse_qs(u.query); sn = (q.get("sn") or [""])[0]; limit = int((q.get("limit") or [5000])[0])
                    self._send(local_sn.lookup(a.STORE, sn, limit=limit))
                except Exception as exc:
                    self._send({"error": type(exc).__name__, "message": str(exc)}, 500)
                return
            return super().do_GET()

        def do_POST(self):
            u = urlparse(self.path)
            if u.path == "/api/v1/sn-lookup":
                try:
                    body = self._body()
                    self._send(start_sn({"sn": body.get("sn"), "include_3022": body.get("include_3022", True), "include_3012": body.get("include_3012", True), "request_id": body.get("request_id")}), 202)
                except Exception as exc:
                    self._send({"error": type(exc).__name__, "message": str(exc)}, 500)
                return
            if u.path == "/api/v1/3012/query":
                try:
                    self._send(start_query(self._body()), 202)
                except Exception as exc:
                    self._send({"error": type(exc).__name__, "message": str(exc)}, 500)
                return
            if u.path == "/api/v1/diagnostics/3012/map":
                try:
                    # Same serialized MES lease as collectors: mapping cannot race
                    # another job that changes the dedicated A-MES view.
                    with a.MES.job():
                        report = map_3012.map_3012_structure(
                            cdp_url=str(a.CONFIG.get("chrome_cdp") or "http://127.0.0.1:9222"),
                            ames_host=str(a.CONFIG.get("ames_host") or "172.29.185.215"),
                        )
                    a.STORE.record_audit("MAP_3012_HOME", workstation=a.WORKSTATION, details={
                        "surface": report.get("surface"),
                        "field_count": len((report.get("structure") or {}).get("fields") or []),
                        "grid_count": len((report.get("structure") or {}).get("grids") or []),
                    })
                    self._send(report)
                except Exception as exc:
                    self._send({"error": type(exc).__name__, "message": str(exc)}, 500)
                return
            return super().do_POST()

    original_get = Handler.do_GET
    def do_get_with_capability(self):
        u = urlparse(self.path)
        if u.path == "/api/v1/3012/capability":
            self._send({
                "implemented": True,
                "factory_validated": False,
                "source": "AWIP3012_DIRECT_EXTJS",
                "ames_start_date": configured_start_date().date().isoformat(),
                "local": repair_3012.stats(a.STORE),
                "offline_sn": True,
                "exact_sn_cache": True,
                "adaptive_full_first": True,
            })
            return
        return original_get(self)
    Handler.do_GET = do_get_with_capability
    return Handler
