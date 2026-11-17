"""Synthetic timings/CPU/RSS and equivalence hashes, disposable SQLite only."""
import argparse
from contextlib import contextmanager
import hashlib
import json
from pathlib import Path
import resource
import sys
import tempfile
import time

args=argparse.ArgumentParser()
args.add_argument('--root', default='.')
args.add_argument('--sizes', default='100,200,400,800,1600')
opts=args.parse_args()
root=Path(opts.root).resolve()
sys.path[:0]=[str(root/'ames/agent'),str(root/'ames/factory-engine')]
import production_shift as shift
import canonical
import process_r11
from store import Store
from core.uso_pcba import reconstruir_usos_pcba

def measure(kind,size,call):
    start,cpu=time.perf_counter(),time.process_time()
    value=call()
    result={'kind':kind,'size':size,'wall_ms':round((time.perf_counter()-start)*1000,3),
        'cpu_ms':round((time.process_time()-cpu)*1000,3),'max_rss_kib':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
        'sha256':hashlib.sha256(json.dumps(value,sort_keys=True,default=str).encode()).hexdigest(),
        'count':len(value) if isinstance(value,list) else None}
    print(json.dumps(result),flush=True)
    return value

for size in map(int,opts.sizes.split(',')):
    rows=[{'pcba_sn':f'P{i}','line':'TAN10101','defect_code':'D','defect_time':'2026-11-03T12:00:00Z','defect_key':f'K{i}'} for i in range(size)]
    contexts=[{**r,'source':'3022','reference_station_code':'A5162','reference_event_time':'2026-11-03T11:00:00Z'} for r in rows]
    measure('project_contexts',size,lambda:shift.project_contexts(contexts,rows))
    bindings=[{'Barcode':'P','Aut Cmf1':'PCBA','Sn Type':'PCBA','Aut Cmf7':str(i),'Bind Time':f'2026-10-{i%28+1:02}T10:00:00Z','Iss Status':'Y' if i==size-1 else 'N'} for i in range(size)]
    measure('3074_physical',size,lambda:reconstruir_usos_pcba(bindings,'P','2026-11-03 09:00:00'))
    with tempfile.TemporaryDirectory() as folder:
        store=Store(Path(folder)/'synthetic.sqlite');store.initialize();process_r11.patch_store(store)
        with store.connect() as con:
            con.execute("UPDATE schema_meta SET value='11111111-1111-4111-8111-111111111111' WHERE key='ames_source_id'")
        sid=store.create_snapshot(window_id=None,source_kind='synthetic')
        with store.connect() as con:
            con.execute("UPDATE snapshots SET collected_at='2026-11-17T10:00:00Z' WHERE id=?", (sid,))
        store.ingest_defects(sid,rows);process_r11._persist_contexts(store,sid,contexts)
        # Instrument only this temporary store: report reservation duration.
        original=store.connect;locks=[]
        @contextmanager
        def measured_connect():
            with original() as con:
                begin=[None]
                con.set_trace_callback(lambda sql:begin.__setitem__(0,time.perf_counter()) if sql.upper().startswith('BEGIN IMMEDIATE') else None)
                try:yield con
                finally:
                    if begin[0] is not None:locks.append(round((time.perf_counter()-begin[0])*1000,3))
        store.connect=measured_connect
        payload=measure('canonical_export',size,lambda:canonical.export_revision(store,sid,'TAN10101'))
        print(json.dumps({'kind':'write_reservation','size':size,'milliseconds':locks}),flush=True)
        # Eight immutable older exports of the same synthetic evidence, with
        # old projection version. Do not write a migration or change the schema.
        with original() as con:
            con.execute('DELETE FROM mes_revisions WHERE snapshot_id=?',(sid,))
            for revision in range(1,9):
                old={**payload,'projection_version':13,'snapshot_revision':revision,'content_hash':str(revision)*64}
                con.execute('INSERT INTO mes_revisions VALUES(?,?,?,?,?,?)',
                    (sid,'TAN10101',revision,-1,str(revision)*64,json.dumps(old)))
        locks.clear()
        measure('canonical_reproject_8_revisions',size,lambda:canonical.export_revision(store,sid,'TAN10101'))
        print(json.dumps({'kind':'revision_write_reservation','size':size,'milliseconds':locks}),flush=True)
        measure('history_index_9_revisions',size,lambda:canonical.history_index(store,'TAN10101'))
