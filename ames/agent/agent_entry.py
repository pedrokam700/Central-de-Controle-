"""Canonical entrypoint with the proven R11 3022 batch contract enabled.

This file deliberately wraps agent.py instead of rewriting the validated 3028
collector/scheduler. R12 factory validation remains mandatory before promotion.
"""
from __future__ import annotations

import argparse
import json
import source_capture
import time
from urllib.parse import urlparse

import agent as a
import canonical
import process_r11
import preflight
import network_watch

process_r11.patch_store(a.STORE)

NETWORK_GUARDIAN = network_watch.NetworkGuardian(
    host=a.CONFIG.get("ames_host", "172.29.185.215"),
    port=int(a.CONFIG.get("ames_port", 80)),
    expected_ssid=a.CONFIG.get("ames_wifi_profile", "TAXXX_5G"),
    log_path=a.DATA_DIR / "network_health.jsonl",
)


def _process_support():
    return process_r11.engine_support(a.ENGINE_DIR or a.discover_engine(a.CONFIG,a.BASE_DIR))


def _source_stage(value):
    raw=str(value or "").strip().lower()
    if raw in {"complete","completed","done","ok","collected"}:return "done"
    if raw in {"partial","partially_complete"}:return "partial"
    if raw in {"error","failed","unavailable"}:return "error"
    if raw in {"not_run","pending",""}:return "not_run"
    return raw

def _aggregate_stage(results, source):
    states=[]
    for item in (results or {}).values():
        if item.get("skipped"):continue
        payload=item.get(source) or {}
        if source=="2114":raw=payload.get("source_status") or payload.get("status")
        else:raw=payload.get("status")
        state=_source_stage(raw)
        if state!="not_run":states.append(state)
    if not states:return "not_run"
    if all(x=="error" for x in states):return "error"
    if any(x in {"error","partial"} for x in states):return "partial"
    return "done"


def _trace_snapshot_ids(cfg, require_current=False):
    """Resolve only explicit local revisions, before admission and again in queue.

    Never replace a requested period with the newest snapshot of a line. The
    original export already exists in mes_revisions and remains immutable.
    """
    lines=cfg.get('lines');targets=cfg.get('snapshot_targets')
    if not isinstance(lines,list) or not lines or any(line not in canonical.LINES for line in lines):
        raise ValueError('Explicit trace lines required')
    if not isinstance(targets,dict) or set(targets)!=set(lines):
        raise ValueError('Exact snapshot targets required; refresh Central/agent')
    ids={}
    with a.STORE.connect() as con:
        con.execute('BEGIN')
        source=con.execute("SELECT value FROM schema_meta WHERE key='ames_source_id'").fetchone()[0]
        for line in lines:
            t=targets[line]
            if not isinstance(t,dict) or t.get('source_id')!=source:
                raise ValueError('Trace source mismatch')
            sid=t.get('snapshot_id');revision=t.get('snapshot_revision')
            if not str(sid).isdigit() or int(sid)<1 or type(revision) is not int or revision<1:
                raise ValueError('Invalid trace snapshot/revision')
            row=con.execute('SELECT * FROM mes_revisions WHERE snapshot_id=? AND line=? AND revision=?',(int(sid),line,revision)).fetchone()
            if not row:raise ValueError('Trace revision unavailable')
            payload=json.loads(row['payload']);period=payload.get('summary',{}).get('period',{})
            if not period.get('start_at') or not period.get('end_at') or period!=t.get('period') or payload['content_hash']!=t.get('content_hash'):
                raise ValueError('Trace period/content mismatch')
            current=con.execute('''SELECT s.status,COALESCE(c.epoch,0) AS epoch FROM snapshots s
                LEFT JOIN mes_source_clock c ON c.snapshot_id=s.id WHERE s.id=? AND
                (EXISTS(SELECT 1 FROM line_metrics m WHERE m.snapshot_id=s.id AND m.line=?) OR
                 EXISTS(SELECT 1 FROM defect_observations d WHERE d.snapshot_id=s.id AND d.line=?))''',(int(sid),line,line)).fetchone()
            if not current or current['status']!='complete':raise ValueError('Trace snapshot/line unavailable')
            if require_current:
                latest=con.execute('SELECT MAX(revision) FROM mes_revisions WHERE snapshot_id=? AND line=?',(int(sid),line)).fetchone()[0]
                if latest!=revision or current['epoch']!=row['epoch']:
                    raise ValueError('Trace revision changed; reload the selected period')
            ids[line]=int(sid)
    return ids


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
        ids=_trace_snapshot_ids(cfg,require_current=True)
        engine=a.ENGINE_DIR or a.discover_engine(a.CONFIG,a.BASE_DIR)
        if not engine:raise RuntimeError("Motor V0.16 nao encontrado")
        lines=a.normalize_lines(cfg.get("lines") or a.CONFIG.get("configured_lines") or [])
        codes=[str(x).strip() for x in (cfg.get("defect_codes") or []) if str(x).strip()]
        max_failures=max(0,int(cfg.get("max_failures") or 0));max_pcbas=max(0,int(cfg.get("max_pcbas") or 0))
        performance=str(cfg.get("performance") or a.CONFIG.get("performance") or "balanced").lower()
        active=[ln for ln in lines if ids.get(ln)];results={};shared_query_memo={};total=max(1,len(active))
        for idx,line in enumerate(active,1):
            sid=ids[line]
            records=a.STORE.base_rows(sid,line=line,limit=100000)
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
                if stage=="3022":
                    cur=int((ev or {}).get("current") or 0);count=max(0,int((ev or {}).get("total") or 0))
                    pct=round(cur*100/count,1) if count else 0.0
                    sp=dict(job.get("stage_progress") or {})
                    phase=str((ev or {}).get("phase") or "mes")
                    qms=(ev or {}).get("query_ms")
                    detail=str((ev or {}).get("pcba") or "")
                    if qms is not None:detail += f" · {qms} ms"
                    sp["3022"]={"current":cur,"total":count,"percent":pct,"line_percent":pct,"line":_line,"line_index":_idx,"line_total":total,"detail":detail,"status":(ev or {}).get("status"),"phase":phase,"query_ms":qms}
                    job=a._job_update(job_id,stage="3022",stage_progress=sp,message=f"{_line}: 3022 · {phase} · {cur}/{count}")
                if did_ingest:job=a._job_update(job_id,partial_refresh=int(job.get("partial_refresh") or 0)+1)
                now=time.monotonic()
                if did_ingest or now-last_persist[0]>=1.0:a._persist_job(job);last_persist[0]=now
            def text(message,_line=line):
                nonlocal job
                msg=str(message)
                stage="2114" if msg.startswith("2114") else ("3022" if msg.startswith("3022") else "3074")
                job=a._job_update(job_id,stage=stage,message=f"{_line}: {msg}");a._persist_job(job)

            if mode in {"full","reuse_only"}:
                base_progress=6+int((idx-1)*72/total)
                job=a._job_update(job_id,stage="3074",progress=base_progress,message=f"{line}: 3074/2114 · {unique} PCBAs / {len(records)} ocorrencias")
                a._persist_job(job)
                # One trace execution owns the shared A-MES session across the
                # complete 3074→2114 interaction. Other MES jobs queue instead of
                # navigating another view while 2114 is still active.
                with a.MES.critical():
                    payload=a.run_deep_v016_records(engine,records,source_key=f"snapshot_{sid}_{line}",work_dir=a.DATA_DIR/"checkpoints",
                                                    line_callback=text,event_callback=event,max_pcbas=max_pcbas,
                                                    shared_query_memo=shared_query_memo,performance=performance)
                enrich=a.enrich_snapshot_from_integrated(sid,payload)
                # Persist each source separately, even if a later stage fails.
                # This is a local-only raw journal tied to the ORIGINAL selected
                # snapshot/revision/period; jobs for other days cannot replace it.
                for source in ('3074','2114'):
                    raw=payload.get('trace_'+source)
                    if raw is not None:
                        source_capture.capture_source(a.STORE,target=cfg['snapshot_targets'][line],
                            line=line,job_id=job_id,view=source,result=raw,
                            status=_source_stage(raw))
                line_result.update({"enrichment":enrich,"3074":payload.get("trace_3074",{}),"2114":payload.get("trace_2114",{})})
                job=a._job_update(job_id,partial_refresh=int(job.get("partial_refresh") or 0)+1);a._persist_job(job)

            if mode in {"full","process_only"}:
                job=a._job_update(job_id,stage="3022",progress=82+int((idx-1)*12/total),message=f"{line}: 3022 · {unique} PCBAs")
                a._persist_job(job)
                p=process_r11.collect_and_persist(a.STORE,engine,records,snapshot_id=sid,line=line,max_pcbas=max_pcbas,
                                                  performance=performance,line_callback=lambda msg:text("3022 "+msg),event_callback=event)
                line_result["3022"]=p
                if p is not None:
                    source_capture.capture_source(a.STORE,target=cfg['snapshot_targets'][line],
                        line=line,job_id=job_id,view='3022',result=p,status=_source_stage(p))
                job=a._job_update(job_id,partial_refresh=int(job.get("partial_refresh") or 0)+1);a._persist_job(job)
            results[line]=line_result

        stages={"3028":"preserved",
                "3074":_aggregate_stage(results,"3074") if mode in {"full","reuse_only"} else "not_run",
                "2114":_aggregate_stage(results,"2114") if mode in {"full","reuse_only"} else "not_run",
                "3022":_aggregate_stage(results,"3022") if mode in {"full","process_only"} else "not_run"}
        base_message={"full":"Rastreabilidade 3074/2114/3022 concluída","process_only":"Processo 3022 concluído","reuse_only":"Reuso 3074/2114 concluído"}[mode]
        degraded=[name for name in ("3074","2114","3022") if stages.get(name) in {"partial","error"}]
        message=base_message+(" · fontes com cobertura parcial/erro: "+", ".join(degraded) if degraded else "")
        job=a._job_update(job_id,status="done",stage="done",progress=100,finished_at=a.utc_now(),
                          message=message,
                          result={"snapshot_ids":ids,"lines":active,"deep_trace":results,"scope":{"trace_mode":mode,"defect_codes":codes,"max_failures":max_failures,"max_pcbas":max_pcbas,"performance":performance},"stages":stages})
        a._persist_job(job)
    except Exception as exc:
        a._persist_job(a._job_update(job_id,status="error",stage="error",finished_at=a.utc_now(),message=str(exc),error=f"{type(exc).__name__}: {exc}"))


def start_deep_trace_job(cfg):
    _trace_snapshot_ids(cfg)
    return a._launch_mes_job("deep_trace",cfg,_run_deep_trace_job)


def _network_snapshot():
    """Expensive/fresh workstation network diagnostics for explicit requests only."""
    return network_watch.snapshot(
        a.CONFIG.get("ames_host", "172.29.185.215"),
        int(a.CONFIG.get("ames_port", 80)),
        a.CONFIG.get("ames_wifi_profile", "TAXXX_5G"),
    )


def _health_network_snapshot():
    """Bounded network state for /health; never runs netsh/PowerShell synchronously.

    The network guardian owns full Wi-Fi/route diagnostics in the background. Health
    refreshes only the cheap TCP reachability bit and reuses the guardian's last
    detailed snapshot when one exists. Startup/local UI therefore stay usable even
    while A-MES Wi-Fi or Windows network commands are unavailable/slow.
    """
    host=a.CONFIG.get("ames_host", "172.29.185.215")
    port=int(a.CONFIG.get("ames_port", 80))
    expected=a.CONFIG.get("ames_wifi_profile", "TAXXX_5G")
    guardian=NETWORK_GUARDIAN.state()
    cached=guardian.get("last") if isinstance(guardian,dict) else None
    reachable=network_watch.tcp_probe(host,port,timeout=.8)
    if isinstance(cached,dict):
        network=dict(cached)
        network["host"]=str(host);network["port"]=port;network["reachable"]=reachable
        network["detail_source"]="guardian_cache";network["details_cached"]=True
    else:
        network={"at":None,"host":str(host),"port":port,"reachable":reachable,
                 "expected_ssid":expected,"wifi":None,"wifi_expected":None,
                 "interface":None,"route":None,"elevated":None,
                 "detail_source":"pending_guardian","details_cached":False}
    return network,guardian


class Handler(a.Handler):
    def do_GET(self):
        u=urlparse(self.path)
        if u.path=="/api/v1/v2/capabilities":
            try:
                support=_process_support()
                self._send({"schema":canonical.SCHEMA,"candidate_version":a.CANDIDATE_VERSION,"source_id":canonical.source_id(a.STORE),
                            "package_root":str(a.BASE_DIR.parent.resolve()),"scheduler":a.MES.snapshot(),"process_timeline":bool(support.get("ready")),
                            "process_contract":"R11_DERIVED_R12_FACTORY_GATE","process_support":support,"cursor":True,"revision":True,
                            "durable_local_ids":True,"native_console":True,"network_guardian":True,"exact_trace_targets":True})
            except Exception as exc:self._send({"error":type(exc).__name__,"message":str(exc)},500)
            return
        if u.path=="/api/v1/health":
            try:
                engine=a.ENGINE_DIR or a.discover_engine(a.CONFIG,a.BASE_DIR);support=process_r11.engine_support(engine)
                network,guardian=_health_network_snapshot();chrome_ready=a._tcp_probe("127.0.0.1",9222,timeout=.5)
                self._send({"ok":True,"preflight":preflight.check(a.DB_PATH),"agent_version":a.AGENT_VERSION,"candidate_version":a.CANDIDATE_VERSION,"agent_build":"CANONICAL-R11-BATCH",
                            "package_root":str(a.BASE_DIR.parent.resolve()),"mes_scheduler":a.MES.snapshot(),"db":str(a.DB_PATH),
                            "engine_found":bool(engine),"engine_dir":str(engine) if engine else None,
                            "chrome_cdp":a.CONFIG.get("chrome_cdp"),"chrome_cdp_reachable":chrome_ready,
                            "ames_host":a.CONFIG.get("ames_host","172.29.185.215"),"ames_port":int(a.CONFIG.get("ames_port",80)),
                            "ames_reachable":bool(network.get("reachable")),"network":network,"network_guardian":guardian,
                            "auto_3028_ready":bool((a.CONFIG.get("auto_3028") or {}).get("ready")),"auto_3022_ready":bool(support.get("ready")),
                            "process_contract":"R11_DERIVED_R12_FACTORY_GATE","latest_snapshot_id":a.STORE.latest_snapshot_id(),
                            "configured_lines":a.CONFIG.get("configured_lines") or [],"day_start":a.CONFIG.get("day_start","07:00"),
                            "monitor_interval_minutes":int(a.CONFIG.get("monitor_interval_minutes",30)),"setup_complete":bool(a.CONFIG.get("setup_complete")),
                            "latest_backup":a.STORE.latest_backup_info(a.BACKUP_DIR),"workstation":a.WORKSTATION,
                            "readiness":{"agent":True,"engine":bool(engine),"chrome":chrome_ready,
                                         "ames_network":bool(network.get("reachable")),"ames_wifi_expected":network.get("wifi_expected"),
                                         "auto_3028":bool((a.CONFIG.get("auto_3028") or {}).get("ready")),"auto_3022":bool(support.get("ready"))}})
            except Exception as exc:self._send({"error":type(exc).__name__,"message":str(exc)},500)
            return
        if u.path=="/api/v1/network/status":
            try:self._send({"ok":True,"network":_network_snapshot(),"guardian":NETWORK_GUARDIAN.state()})
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
                                                 "snapshot_targets":body.get("snapshot_targets"),
                                                 "defect_codes":body.get("defect_codes") or [],"max_failures":body.get("max_failures") or 0,
                                                 "max_pcbas":body.get("max_pcbas") or 0,"performance":body.get("performance") or a.CONFIG.get("performance") or "balanced",
                                                 "trace_mode":mode}),202)
            except Exception as exc:self._send({"error":type(exc).__name__,"message":str(exc)},500)
            return
        if u.path=="/api/v1/network/repair":
            try:
                result=network_watch.repair(
                    a.CONFIG.get("ames_host", "172.29.185.215"),
                    int(a.CONFIG.get("ames_port", 80)),
                    a.CONFIG.get("ames_wifi_profile", "TAXXX_5G"),
                )
                a.STORE.record_audit("NETWORK_REPAIR",workstation=a.WORKSTATION,details=result)
                self._send(result,200 if result.get("ok") else 503)
            except Exception as exc:self._send({"error":type(exc).__name__,"message":str(exc)},500)
            return
        return super().do_POST()


def main():
    try:a.maybe_backup_on_start()
    except Exception as exc:print(f"[BACKUP] aviso: {exc}")
    a.STORE.record_audit("AGENT_START",workstation=a.WORKSTATION,details={"agent_version":a.AGENT_VERSION,"entry":"agent_entry.py","process_contract":"R11_DERIVED_R12_FACTORY_GATE","package_root":str(a.BASE_DIR.parent.resolve())})
    ap=argparse.ArgumentParser(description="A-MES Local Agent - Central V2")
    ap.add_argument("--host",default=a.CONFIG.get("host","127.0.0.1"));ap.add_argument("--port",type=int,default=int(a.CONFIG.get("port",8765)));args=ap.parse_args()
    server=a.ThreadingHTTPServer((args.host,args.port),Handler);a.recover_jobs();a.ensure_monitor_thread();NETWORK_GUARDIAN.start()
    print(f"A-MES Canonical Agent {a.CANDIDATE_VERSION} · 3022 R11-derived / R12 gate")
    print(f"Package root: {a.BASE_DIR.parent.resolve()}")
    print(f"API: http://{args.host}:{args.port}/api/v1/health")
    print("Network guardian: ativo · apenas Wi-Fi A-MES + rota host /32")
    try:server.serve_forever(poll_interval=.4)
    except KeyboardInterrupt:pass
    finally:NETWORK_GUARDIAN.stop();a.MONITOR_STOP.set();server.server_close()

if __name__=="__main__":main()
