"""Canonical entrypoint with the proven R11 3022 batch contract enabled.

This file deliberately wraps agent.py instead of rewriting the validated 3028
collector/scheduler. R12 factory validation remains mandatory before promotion.
"""
from __future__ import annotations

import argparse
import time
from urllib.parse import urlparse

import agent as a
import canonical
import process_r11

process_r11.patch_store(a.STORE)


def _process_support():
    return process_r11.engine_support(a.ENGINE_DIR or a.discover_engine(a.CONFIG,a.BASE_DIR))


def _run_deep_trace_job(job_id, cfg):
    mode=str(cfg.get("trace_mode") or "full").strip().lower()
    if mode not in {"full","process_only","reuse_only"}:
        raise ValueError("trace_mode invalido")
    support=_process_support()
    if mode in {"full","process_only"} and not support.get("ready"):
        raise RuntimeError("3022 em lote indisponivel neste motor: "+str(support))
    job=a._job_update(job_id,status="running",stage="3022" if mode=="process_only" else "3074",progress=4,started_at=a.utc_now(),
                      message="Preparando coleta seletiva",stage_progress={},live_events=[],partial_refresh=0,
                      scope={"trace_mode":mode})
    a._persist_job(job)
    try:
        engine=a.ENGINE_DIR or a.discover_engine(a.CONFIG,a.BASE_DIR)
        if not engine:raise RuntimeError("Motor V0.16 nao encontrado")
        lines=a.normalize_lines(cfg.get("lines") or a.CONFIG.get("configured_lines") or [])
        codes=[str(x).strip() for x in (cfg.get("defect_codes") or []) if str(x).strip()]
        max_failures=max(0,int(cfg.get("max_failures") or 0));max_pcbas=max(0,int(cfg.get("max_pcbas") or 0))
        performance=str(cfg.get("performance") or a.CONFIG.get("performance") or "balanced").lower()
        ids=a.STORE.latest_snapshot_ids_by_line(lines)
        if not ids:raise RuntimeError("Nenhum snapshot 3028 atual encontrado para rastrear")
        active=[ln for ln in lines if ids.get(ln)];results={};shared_query_memo={};total=max(1,len(active))
        for idx,line in enumerate(active,1):
            sid=ids[line]
            records=a.STORE.base_rows(sid,limit=100000)
            records=a._select_trace_records(records,defect_codes=codes,max_failures=max_failures,max_pcbas=max_pcbas)
            if not records:
                results[line]={"snapshot_id":sid,"skipped":True,"reason":"Nenhuma falha no escopo selecionado"};continue
            unique=len({str(r.get("pcba_sn") or "").strip() for r in records if str(r.get("pcba_sn") or "").strip()})
            line_result={"snapshot_id":sid,"scope":{"records":len(records),"unique_pcbas":unique,"defect_codes":codes,"max_failures":max_failures,"max_pcbas":max_pcbas,"trace_mode":mode}}
            last_persist=[0.0]
            def event(ev,_line=line,_idx=idx,_sid=sid):
                nonlocal job
                did_ingest=False;stage=str((ev or {}).get("stage") or "");kind=str((ev or {}).get("kind") or "")
                if stage=="3074" and kind=="pcba_result" and (ev or {}).get("item"):
                    try:a.STORE.ingest_material_reuse(_sid,{"items":[(ev or {}).get("item")]});did_ingest=True
                    except Exception:pass
                if stage=="3074" and kind=="result" and (ev or {}).get("result"):
                    try:a.STORE.ingest_material_reuse(_sid,(ev or {}).get("result") or {});did_ingest=True
                    except Exception:pass
                if stage=="2114" and kind=="pcba" and str((ev or {}).get("status"))=="COMPLETE":
                    state=(ev or {}).get("state") or {}
                    if state.get("result"):
                        try:a._attach_2114_to_current(_sid,{"pcbas":[{"pcba_sn":(ev or {}).get("pcba"),"status":"COMPLETE","result":state.get("result"),"error":None}]});did_ingest=True
                        except Exception:pass
                job=a._job_live_event(job_id,ev,_line,_idx,total,_sid)
                if did_ingest:job=a._job_update(job_id,partial_refresh=int(job.get("partial_refresh") or 0)+1)
                now=time.monotonic()
                if did_ingest or now-last_persist[0]>=1.0:a._persist_job(job);last_persist[0]=now
            def text(message,_line=line):
                nonlocal job
                stage="2114" if str(message).startswith("2114") else "3074"
                job=a._job_update(job_id,stage=stage,message=f"{_line}: {message}");a._persist_job(job)

            if mode in {"full","reuse_only"}:
                base_progress=6+int((idx-1)*72/total)
                job=a._job_update(job_id,stage="3074",progress=base_progress,message=f"{line}: 3074/2114 · {unique} PCBAs / {len(records)} ocorrencias")
                a._persist_job(job)
                payload=a.run_deep_v016_records(engine,records,source_key=f"snapshot_{sid}_{line}",work_dir=a.DATA_DIR/"checkpoints",
                                                line_callback=text,event_callback=event,max_pcbas=max_pcbas,
                                                shared_query_memo=shared_query_memo,performance=performance)
                enrich=a.enrich_snapshot_from_integrated(sid,payload)
                line_result.update({"enrichment":enrich,"3074":payload.get("trace_3074",{}),"2114":payload.get("trace_2114",{})})
                job=a._job_update(job_id,partial_refresh=int(job.get("partial_refresh") or 0)+1);a._persist_job(job)

            if mode in {"full","process_only"}:
                job=a._job_update(job_id,stage="3022",progress=82+int((idx-1)*12/total),message=f"{line}: 3022 · {unique} PCBAs")
                a._persist_job(job)
                p=process_r11.collect_and_persist(a.STORE,engine,records,snapshot_id=sid,line=line,max_pcbas=max_pcbas,
                                                  performance=performance,line_callback=lambda msg:text("3022 "+msg),event_callback=event)
                line_result["3022"]=p
                job=a._job_update(job_id,partial_refresh=int(job.get("partial_refresh") or 0)+1);a._persist_job(job)
            results[line]=line_result

        stages={"3028":"preserved","3074":"done" if mode in {"full","reuse_only"} else "not_run",
                "2114":"done" if mode in {"full","reuse_only"} else "not_run","3022":"done" if mode in {"full","process_only"} else "not_run"}
        job=a._job_update(job_id,status="done",stage="done",progress=100,finished_at=a.utc_now(),
                          message={"full":"Rastreabilidade 3074/2114/3022 concluida","process_only":"Processo 3022 concluido","reuse_only":"Reuso 3074/2114 concluido"}[mode],
                          result={"snapshot_ids":ids,"lines":active,"deep_trace":results,"scope":{"trace_mode":mode,"defect_codes":codes,"max_failures":max_failures,"max_pcbas":max_pcbas,"performance":performance},"stages":stages})
        a._persist_job(job)
    except Exception as exc:
        a._persist_job(a._job_update(job_id,status="error",stage="error",finished_at=a.utc_now(),message=str(exc),error=f"{type(exc).__name__}: {exc}"))


def start_deep_trace_job(cfg):
    return a._launch_mes_job("deep_trace",cfg,_run_deep_trace_job)


class Handler(a.Handler):
    def do_GET(self):
        u=urlparse(self.path)
        if u.path=="/api/v1/v2/capabilities":
            try:
                support=_process_support()
                self._send({"schema":canonical.SCHEMA,"candidate_version":a.CANDIDATE_VERSION,"source_id":canonical.source_id(a.STORE),
                            "scheduler":a.MES.snapshot(),"process_timeline":bool(support.get("ready")),"process_contract":"R11_DERIVED_R12_FACTORY_GATE",
                            "process_support":support,"cursor":True,"revision":True,"durable_local_ids":True,"native_console":True})
            except Exception as exc:self._send({"error":type(exc).__name__,"message":str(exc)},500)
            return
        if u.path=="/api/v1/health":
            try:
                engine=a.ENGINE_DIR or a.discover_engine(a.CONFIG,a.BASE_DIR);support=process_r11.engine_support(engine)
                self._send({"ok":True,"agent_version":a.AGENT_VERSION,"candidate_version":a.CANDIDATE_VERSION,"agent_build":"CANONICAL-R11-BATCH",
                            "mes_scheduler":a.MES.snapshot(),"db":str(a.DB_PATH),"engine_found":bool(engine),"engine_dir":str(engine) if engine else None,
                            "chrome_cdp":a.CONFIG.get("chrome_cdp"),"chrome_cdp_reachable":a._tcp_probe("127.0.0.1",9222,timeout=.5),
                            "ames_host":a.CONFIG.get("ames_host","172.29.185.215"),"ames_port":int(a.CONFIG.get("ames_port",80)),
                            "ames_reachable":a._tcp_probe(a.CONFIG.get("ames_host","172.29.185.215"),int(a.CONFIG.get("ames_port",80)),timeout=1.0),
                            "auto_3028_ready":bool((a.CONFIG.get("auto_3028") or {}).get("ready")),"auto_3022_ready":bool(support.get("ready")),
                            "process_contract":"R11_DERIVED_R12_FACTORY_GATE","latest_snapshot_id":a.STORE.latest_snapshot_id(),
                            "configured_lines":a.CONFIG.get("configured_lines") or [],"day_start":a.CONFIG.get("day_start","07:00"),
                            "monitor_interval_minutes":int(a.CONFIG.get("monitor_interval_minutes",30)),"setup_complete":bool(a.CONFIG.get("setup_complete")),
                            "latest_backup":a.STORE.latest_backup_info(a.BACKUP_DIR),"workstation":a.WORKSTATION,
                            "readiness":{"agent":True,"engine":bool(engine),"chrome":a._tcp_probe("127.0.0.1",9222,timeout=.5),
                                         "ames_network":a._tcp_probe(a.CONFIG.get("ames_host","172.29.185.215"),int(a.CONFIG.get("ames_port",80)),timeout=1.0),
                                         "auto_3028":bool((a.CONFIG.get("auto_3028") or {}).get("ready")),"auto_3022":bool(support.get("ready"))}})
            except Exception as exc:self._send({"error":type(exc).__name__,"message":str(exc)},500)
            return
        return super().do_GET()

    def do_POST(self):
        u=urlparse(self.path)
        if u.path=="/api/v1/deep-trace":
            try:
                body=self._body();mode=str(body.get("trace_mode") or "full")
                if mode not in {"full","process_only","reuse_only"}:raise ValueError("trace_mode invalido")
                self._send(start_deep_trace_job({"request_id":body.get("request_id"),"lines":body.get("lines") or a.CONFIG.get("configured_lines") or [],
                                                 "defect_codes":body.get("defect_codes") or [],"max_failures":body.get("max_failures") or 0,
                                                 "max_pcbas":body.get("max_pcbas") or 0,"performance":body.get("performance") or a.CONFIG.get("performance") or "balanced",
                                                 "trace_mode":mode}),202)
            except Exception as exc:self._send({"error":type(exc).__name__,"message":str(exc)},500)
            return
        return super().do_POST()


def main():
    try:a.maybe_backup_on_start()
    except Exception as exc:print(f"[BACKUP] aviso: {exc}")
    a.STORE.record_audit("AGENT_START",workstation=a.WORKSTATION,details={"agent_version":a.AGENT_VERSION,"entry":"agent_entry.py","process_contract":"R11_DERIVED_R12_FACTORY_GATE"})
    ap=argparse.ArgumentParser(description="A-MES Local Agent - Central V2")
    ap.add_argument("--host",default=a.CONFIG.get("host","127.0.0.1"));ap.add_argument("--port",type=int,default=int(a.CONFIG.get("port",8765)));args=ap.parse_args()
    server=a.ThreadingHTTPServer((args.host,args.port),Handler);a.recover_jobs();a.ensure_monitor_thread()
    print(f"A-MES Canonical Agent {a.CANDIDATE_VERSION} · 3022 R11-derived / R12 gate")
    print(f"API: http://{args.host}:{args.port}/api/v1/health")
    try:server.serve_forever(poll_interval=.4)
    except KeyboardInterrupt:pass
    finally:a.MONITOR_STOP.set();server.server_close()

if __name__=="__main__":main()
