from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
live=ROOT/'ames/agent/ames_3012_live.py'
text=live.read_text(encoding='utf-8')
query=(ROOT/'scripts/fixtures/ames-3012-query-v2.js').read_text(encoding='utf-8').rstrip()
start=text.index('QUERY_3012_JS = r"""')
end=text.index('\n"""\n\n\ndef _clean',start)
text=text[:start]+'QUERY_3012_JS = r"""\n'+query+'\n"""'+text[end+4:]

anchor='OPC_SURFACE = "/asymes/opc"\n'
insert='OPC_SURFACE = "/asymes/opc"\nQUERY_CONTRACT = "3012-home-mapped-v2"\nSOURCE_3012 = "AWIP3012_HOME_DIRECT_EXTJS_MAPPED_V2"\nCHECKPOINT_CONTRACT = QUERY_CONTRACT\n'
if anchor not in text: raise SystemExit('3012 constants anchor missing')
text=text.replace(anchor,insert,1)

old='''    checkpoint_path=Path(checkpoint_path) if checkpoint_path else None\n    checkpoint={"done":[],"rows":[]}\n    if checkpoint_path and checkpoint_path.exists():\n        try:checkpoint=json.loads(checkpoint_path.read_text(encoding="utf-8"))\n        except Exception:checkpoint={"done":[],"rows":[]}\n    done=set(checkpoint.get("done") or []);records=[dict(x) for x in checkpoint.get("rows") or []]\n'''
new='''    checkpoint_path=Path(checkpoint_path) if checkpoint_path else None\n    checkpoint={"contract":CHECKPOINT_CONTRACT,"done":[],"rows":[]}\n    if checkpoint_path and checkpoint_path.exists():\n        try:\n            loaded=json.loads(checkpoint_path.read_text(encoding="utf-8"))\n            # Pre-V2 checkpoints may contain false zero-row successes produced by\n            # the old fuzzy field/store resolver. Never let them suppress a real\n            # mapped V2 MES query.\n            if loaded.get("contract")==CHECKPOINT_CONTRACT:\n                checkpoint=loaded\n        except Exception:\n            checkpoint={"contract":CHECKPOINT_CONTRACT,"done":[],"rows":[]}\n    done=set(checkpoint.get("done") or []);records=[dict(x) for x in checkpoint.get("rows") or []]\n'''
if old not in text: raise SystemExit('3012 checkpoint load anchor missing')
text=text.replace(old,new,1)

old='''                diagnostics.append({"sn":sn,"from":cfg["dateFrom"]+" "+cfg["timeFrom"],"to":cfg["dateTo"]+" "+cfg["timeTo"],"rows":len(normalized),\n                                    "total":raw.get("total"),"pages":raw.get("pages"),"store_score":raw.get("storeScore"),"fields":raw.get("storeFields"),"applied":raw.get("applied"),"surface":"home","view_action":raw.get("viewAction")})\n'''
new='''                proof=dict(raw.get("queryProof") or {})\n                if proof.get("contract")!=QUERY_CONTRACT or not proof.get("freshness"):\n                    raise RuntimeError("3012 respondeu sem prova do contrato mapeado V2")\n                diagnostics.append({"sn":sn,"from":cfg["dateFrom"]+" "+cfg["timeFrom"],"to":cfg["dateTo"]+" "+cfg["timeTo"],"rows":len(normalized),\n                                    "total":raw.get("total"),"pages":raw.get("pages"),"fields":raw.get("storeFields"),"applied":raw.get("applied"),"surface":"home",\n                                    "view_action":raw.get("viewAction"),"query_proof":proof,"proxy_params":raw.get("proxyParams")})\n'''
if old not in text: raise SystemExit('3012 diagnostics anchor missing')
text=text.replace(old,new,1)

old='''                    checkpoint_path.write_text(json.dumps({"done":sorted(done),"rows":records,"updated_at":datetime.now().isoformat(timespec="seconds")},ensure_ascii=False,indent=2,default=str),encoding="utf-8")\n'''
new='''                    checkpoint_path.write_text(json.dumps({"contract":CHECKPOINT_CONTRACT,"done":sorted(done),"rows":records,"updated_at":datetime.now().isoformat(timespec="seconds")},ensure_ascii=False,indent=2,default=str),encoding="utf-8")\n'''
if old not in text: raise SystemExit('3012 checkpoint write anchor missing')
text=text.replace(old,new,1)

old='''    return {"source":"AWIP3012_HOME_DIRECT_EXTJS","surface":"home","view":ROUTE_3012,"generated_at":datetime.now().isoformat(timespec="seconds"),\n'''
new='''    return {"source":SOURCE_3012,"contract":QUERY_CONTRACT,"surface":"home","view":ROUTE_3012,"generated_at":datetime.now().isoformat(timespec="seconds"),\n'''
if old not in text: raise SystemExit('3012 source return anchor missing')
text=text.replace(old,new,1)
live.write_text(text,encoding='utf-8')

repair=ROOT/'ames/agent/repair_3012.py'
r=repair.read_text(encoding='utf-8')
anchor='from store import stable_json, utc_now\n\n'
insert='from store import stable_json, utc_now\n\nTRUSTED_COVERAGE_SOURCE = "AWIP3012_HOME_DIRECT_EXTJS_MAPPED_V2"\n\n'
if anchor not in r: raise SystemExit('repair constant anchor missing')
r=r.replace(anchor,insert,1)
old='''    for row in coverage(store, sn):\n        start = _parse_dt(row.get("start_at")); end = _parse_dt(row.get("end_at"))\n'''
new='''    for row in coverage(store, sn):\n        # Old 3012 collectors could mark an exact-SN interval complete after a\n        # wrongly resolved field/store returned zero rows. Only mapped V2 proof\n        # is trusted to suppress a future MES query.\n        if str(row.get("source") or "") != TRUSTED_COVERAGE_SOURCE:\n            continue\n        start = _parse_dt(row.get("start_at")); end = _parse_dt(row.get("end_at"))\n'''
if old not in r: raise SystemExit('repair missing windows anchor missing')
r=r.replace(old,new,1)
old='''        details={"records": len(rows), "inserted": inserted, "updated": updated, "coverage": covered, "query": meta, "source": "AWIP3012_DIRECT_EXTJS"},\n'''
new='''        details={"records": len(rows), "inserted": inserted, "updated": updated, "coverage": covered, "query": meta, "source": str((payload or {}).get("source") or "")},\n'''
if old not in r: raise SystemExit('repair audit anchor missing')
r=r.replace(old,new,1)
repair.write_text(r,encoding='utf-8')

patch=ROOT/'ames/agent/agent_3012_patch.py'
a=patch.read_text(encoding='utf-8')
old='''        # Broad/background queries keep the existing compatibility fallback.\n        return (datetime.now() - timedelta(days=180)).replace(hour=0, minute=0, second=0, microsecond=0)\n'''
new='''        # The factory baseline for 3012 exact-history work is canonical when the\n        # workstation has not explicitly configured an earlier/later start.\n        return EXACT_SN_HISTORY_START\n'''
if old not in a: raise SystemExit('3012 baseline anchor missing')
a=a.replace(old,new,1)
a=a.replace('"source": "AWIP3012_DIRECT_EXTJS",','"source": ames_3012_live.SOURCE_3012,',1)
patch.write_text(a,encoding='utf-8')

contract=ROOT/'scripts/ames-3012-physical-contract.test.mjs'
c=contract.read_text(encoding='utf-8')
start=c.index("test('3012 never injects")
end=c.index("test('3012 exact SN window",start)
new_test='''test('3012 uses the exact mapped composite date/time controls and versioned runtime proof',()=>{\n  assert.doesNotMatch(collector,/new Date\\(2008\\s*,/);\n  for(const id of ['txtSnImei','dteFromDate__Date','dteFromDate__Time','dteFromDate__Data','dteToDate__Date','dteToDate__Time','dteToDate__Data','btnView','grdDefectRepair']) assert.match(collector,new RegExp(id));\n  assert.match(collector,/3012-home-mapped-v2/);\n  assert.match(collector,/AWIP3012_HOME_DIRECT_EXTJS_MAPPED_V2/);\n  assert.match(collector,/3012_VIEW_NOT_EXECUTED/);\n  assert.match(collector,/STORE_REBOUND_AFTER_VIEW/);\n});\n\n'''
c=c[:start]+new_test+c[end:]
start=c.index("test('3012 View uses")
end=c.index("test('3012 normalization",start)
new_test='''test('3012 View proves execution before accepting a response and follows store lifecycle',()=>{\n  assert.match(collector,/physical_dom_click/);\n  assert.match(collector,/ext_click_event/);\n  assert.match(collector,/handler_fallback/);\n  assert.match(collector,/beforeload/);\n  assert.match(collector,/STORE_LOAD_CONFIRMED/);\n  assert.match(collector,/STORE_DATASET_EVENT/);\n  assert.match(collector,/STORE_REBOUND_AFTER_VIEW/);\n});\n\n'''
c=c[:start]+new_test+c[end:]
contract.write_text(c,encoding='utf-8')
