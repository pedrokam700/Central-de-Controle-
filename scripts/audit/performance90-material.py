"""Full stored 3074 material projection; all SQLite is disposable."""
import argparse
import hashlib
import json
from pathlib import Path
import resource
import sys
import tempfile
import time
parser=argparse.ArgumentParser();parser.add_argument('--root',default='.');parser.add_argument('--sizes',default='100,200,400,800,1600');opts=parser.parse_args()
root=Path(opts.root).resolve();sys.path[:0]=[str(root/'ames/agent'),str(root/'ames/factory-engine')]
from store import Store
import canonical
for size in map(int,opts.sizes.split(',')):
    records=[{'line':'TAN10101','pcba_sn':f'P{i}','defect_code':'D','defect_desc':'Camera impurity',
              'defect_time':'2026-11-03 09:00:00','product_model':'CPH2859'} for i in range(size)]
    items=[{'pcba_sn':r['pcba_sn'],'status':'COMPLETE','defect_traces':[{'defect':r,'defect_key':f'LEGACY{i}',
        'trace_3074':{'results':[{'item_sn':f'M{i}','item_type':'Camera','previous_pcba_count':1,
          'current_pcba_confirmed':True,'previous_pcbas':[f'OLD{i}'],'status':'Y' if i%2 else 'N',
          'bind_time_utc':'2026-11-03T10:00:00Z','total_pcba_count_known_now':2}]}}]} for i,r in enumerate(records)]
    with tempfile.TemporaryDirectory() as directory:
        store=Store(Path(directory)/'synthetic.sqlite');store.initialize()
        with store.connect() as con:con.execute("UPDATE schema_meta SET value='11111111-1111-4111-8111-111111111111' WHERE key='ames_source_id'")
        sid=store.create_snapshot(window_id=None,source_kind='synthetic')
        with store.connect() as con:con.execute("UPDATE snapshots SET collected_at='2026-11-17T10:00:00Z' WHERE id=?",(sid,))
        store.ingest_defects(sid,records);payload={'trace_3074':{'items':items}}
        store.save_snapshot_payload(sid,'integrated_v016',payload)
        wall,cpu=time.perf_counter(),time.process_time();count=store.ingest_material_reuse(sid,payload['trace_3074'])
        print(json.dumps({'kind':'material_ingest','size':size,'count':count,'wall_ms':round((time.perf_counter()-wall)*1000,3),
            'cpu_ms':round((time.process_time()-cpu)*1000,3),'max_rss_kib':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss}),flush=True)
        wall,cpu=time.perf_counter(),time.process_time();out=canonical.export_revision(store,sid,'TAN10101')
        print(json.dumps({'kind':'material_canonical','size':size,'count':len(out['datasets']['material_reuse']),
            'wall_ms':round((time.perf_counter()-wall)*1000,3),'cpu_ms':round((time.process_time()-cpu)*1000,3),
            'sha256':hashlib.sha256(json.dumps(out,sort_keys=True).encode()).hexdigest(),
            'max_rss_kib':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss}),flush=True)
